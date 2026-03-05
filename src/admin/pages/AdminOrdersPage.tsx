import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

import type { OrderStatus } from "../../constants/orderStatus";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../../restaurant/RestaurantContext";
import { AdminEmptyState } from "../components/AdminEmptyState";
import { CardSkeleton } from "../components/AdminSkeleton";

// ─── Types ────────────────────────────────────────────────────────────────────

type AdminOrderRow = Record<string, unknown> & {
  id: string;
  created_at: string | null;
  status: OrderStatus | null;
  order_type: string | null;
  total: number | null;
  customer_name: string | null;
  cancel_reason?: string | null;
  canceled_at?: string | null;
  order_items?: Array<{
    id: string;
    qty: number;
    snapshot_name: string | null;
    final_unit_price: number | null;
    unit_price: number | null;
    line_total: number | null;
    snapshot_extras: unknown;
    notes: string | null;
  }>;
};

type OrderItem = {
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  options: Array<{ name: string; price: number }>;
  ingredients: Array<{ name: string; price: number }>;
};

type Toast = { id: number; message: string };

type StatusFilter = OrderStatus | "all";

type NextAction = {
  label: string;
  value: "accepted" | "preparing" | "ready" | "out_for_delivery" | "delivered";
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseJsonIfNeeded(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function formatMoney(value: number | null | undefined): string {
  return `${asNumber(value ?? 0).toFixed(2)} €`;
}

function formatHour(value: string | null | undefined): string {
  if (!value) return "--:--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--:--";
  return new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(d);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return asString(value) || "-";
  return new Intl.DateTimeFormat("es-ES", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function formatElapsed(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}

function parseNamedPriceArray(value: unknown): Array<{ name: string; price: number }> {
  const parsed = parseJsonIfNeeded(value);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((e) => {
      const r = (e ?? {}) as Record<string, unknown>;
      const name =
        asString(r.name) || asString(r.option_name) || asString(r.ingredient_name) || "Extra";
      return { name, price: asNumber(r.price) };
    })
    .filter((e) => e.name.trim().length > 0);
}

function parseOrderItems(row: AdminOrderRow): OrderItem[] {
  // Prefer the joined order_items array from the DB query
  const rawSource = Array.isArray((row as Record<string, unknown>).order_items)
    ? (row as Record<string, unknown>).order_items
    : (parseJsonIfNeeded((row as Record<string, unknown>).items) ??
       parseJsonIfNeeded((row as Record<string, unknown>).items_json) ??
       parseJsonIfNeeded((row as Record<string, unknown>).lines));

  if (!Array.isArray(rawSource)) return [];

  return rawSource.map((entry) => {
    const item = (entry ?? {}) as Record<string, unknown>;
    const qty = Math.max(1, Math.trunc(asNumber(item.qty ?? item.quantity ?? 1)));
    const unitPrice = asNumber(
      item.final_unit_price ?? item.unit_price ?? item.price ?? item.base_price ?? 0
    );
    const lineTotalRaw = item.line_total ?? item.total;
    const lineTotal = lineTotalRaw == null ? qty * unitPrice : asNumber(lineTotalRaw);

    return {
      // snapshot_name is the real item name stored at order time
      name: asString(
        item.snapshot_name || item.product_name || item.name || item.product_id || "Producto"
      ),
      qty,
      unitPrice,
      lineTotal,
      options: parseNamedPriceArray(item.snapshot_extras ?? item.options),
      ingredients: parseNamedPriceArray(item.ingredients),
    };
  });
}

function buildItemsSummary(items: OrderItem[]): string {
  if (items.length === 0) return "Sin artículos";
  const visible = items
    .slice(0, 3)
    .map((i) => `${i.qty}x ${i.name}`)
    .join(", ");
  return items.length > 3 ? `${visible} +${items.length - 3}` : visible;
}

function normalizeStatus(status: OrderStatus | null | undefined): OrderStatus {
  return status ?? "pending";
}

function isActionAllowed(
  current: OrderStatus | null | undefined,
  target: OrderStatus
): boolean {
  const transitions: Record<OrderStatus, OrderStatus[]> = {
    pending: ["accepted", "cancelled"],
    accepted: ["preparing", "cancelled"],
    preparing: ["ready", "cancelled"],
    ready: ["out_for_delivery", "cancelled"],
    out_for_delivery: ["delivered", "cancelled"],
    delivered: [],
    cancelled: [],
  };
  return (transitions[normalizeStatus(current)] ?? []).includes(target);
}

function statusLabel(status: OrderStatus | null | undefined): string {
  const map: Record<OrderStatus, string> = {
    pending: "Pendiente",
    accepted: "Aceptado",
    preparing: "Preparando",
    ready: "Listo",
    out_for_delivery: "En reparto",
    delivered: "Entregado",
    cancelled: "Cancelado",
  };
  return map[normalizeStatus(status)] ?? asString(status);
}

function statusColors(
  status: OrderStatus | null | undefined
): { bg: string; border: string; text: string } {
  const palette: Record<OrderStatus, { bg: string; border: string; text: string }> = {
    pending:          { bg: "#fffbeb", border: "#f59e0b", text: "#92400e" },
    accepted:         { bg: "#eff6ff", border: "#3b82f6", text: "#1e40af" },
    preparing:        { bg: "#fff7ed", border: "#f97316", text: "#c2410c" },
    ready:            { bg: "#f0fdf4", border: "#22c55e", text: "#15803d" },
    out_for_delivery: { bg: "#faf5ff", border: "#a855f7", text: "#7e22ce" },
    delivered:        { bg: "#f0fdf4", border: "#16a34a", text: "#14532d" },
    cancelled:        { bg: "#fef2f2", border: "#ef4444", text: "#b91c1c" },
  };
  return palette[normalizeStatus(status)] ?? palette.pending;
}

function statusStyle(status: OrderStatus | null | undefined): CSSProperties {
  const { bg, border, text } = statusColors(status);
  return {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    border: `1px solid ${border}`,
    background: bg,
    color: text,
    padding: "3px 9px",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    whiteSpace: "nowrap",
  };
}

function getAddressText(order: AdminOrderRow): string {
  const direct = asString(
    (order as Record<string, unknown>).delivery_address ||
    (order as Record<string, unknown>).address_line ||
    (order as Record<string, unknown>).address_text
  ).trim();
  if (direct) return direct;

  const parts = [
    asString((order as Record<string, unknown>).street).trim(),
    asString((order as Record<string, unknown>).number).trim(),
    asString((order as Record<string, unknown>).city).trim(),
    asString(
      (order as Record<string, unknown>).postcode ||
      (order as Record<string, unknown>).postal_code
    ).trim(),
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : "No disponible";
}

function getNotesText(order: AdminOrderRow): string {
  const inline = asString(
    (order as Record<string, unknown>).instructions ||
    (order as Record<string, unknown>).notes ||
    (order as Record<string, unknown>).address_notes
  ).trim();
  if (inline) return inline;

  const notes = parseJsonIfNeeded((order as Record<string, unknown>).notes);
  if (notes && typeof notes === "object") return JSON.stringify(notes, null, 2);
  return "Sin notas";
}

function toOrderId(value: unknown): string {
  return String(value ?? "").trim();
}

function getNextAction(status: OrderStatus | null | undefined): NextAction | null {
  switch (normalizeStatus(status)) {
    case "pending":          return { label: "Aceptar",    value: "accepted" };
    case "accepted":         return { label: "Preparando", value: "preparing" };
    case "preparing":        return { label: "Listo",      value: "ready" };
    case "ready":            return { label: "Entregar",   value: "out_for_delivery" };
    case "out_for_delivery": return { label: "Entregado",  value: "delivered" };
    default:                 return null;
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all",              label: "Todos" },
  { value: "pending",          label: "Pendiente" },
  { value: "accepted",         label: "Aceptado" },
  { value: "preparing",        label: "Preparando" },
  { value: "ready",            label: "Listo" },
  { value: "out_for_delivery", label: "En reparto" },
  { value: "delivered",        label: "Entregado" },
  { value: "cancelled",        label: "Cancelado" },
];

const PANEL_ACTION_STATUSES = [
  "accepted",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
] as const;

const PANEL_ACTION_LABELS: Record<string, string> = {
  accepted:         "Aceptar",
  preparing:        "En preparación",
  ready:            "Marcar listo",
  out_for_delivery: "En reparto",
  delivered:        "Marcar entregado",
};

// ─── Component ────────────────────────────────────────────────────────────────

// ─── CSV Export ───────────────────────────────────────────────────────────────

function escapeCsvCell(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function exportOrdersToCsv(
  orders: Array<{ order: AdminOrderRow; items: OrderItem[]; summary: string }>,
  restaurantName: string
): void {
  const header = ["fecha", "cliente", "telefono", "tipo", "items", "total", "estado", "metodo_pago"];
  const lines = orders.map(({ order, summary }) => {
    const fecha = order.created_at ? new Date(asString(order.created_at)).toISOString() : "";
    const cliente = asString(order.customer_name);
    const telefono = asString((order as Record<string, unknown>).customer_phone);
    const tipo = asString(order.order_type);
    const items = summary;
    const total = asNumber(order.total).toFixed(2);
    const estado = statusLabel(order.status);
    const pago = asString((order as Record<string, unknown>).payment_method);
    return [fecha, cliente, telefono, tipo, items, total, estado, pago]
      .map(escapeCsvCell)
      .join(",");
  });

  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `pedidos-${restaurantName.toLowerCase().replace(/\s+/g, "-")}-${date}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminOrdersPage() {
  const { restaurantId, name: restaurantName } = useRestaurant();

  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [updatingAction, setUpdatingAction] = useState<string | null>(null);
  const [cardUpdating, setCardUpdating] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const toastSeqRef = useRef(0);

  // ── Sound alert system (useOrderRinger – kept intact) ─────────────────────
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ringIntervalRef = useRef<number | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isRinging, setIsRinging] = useState(false);

  const pushToast = useCallback((message: string) => {
    toastSeqRef.current += 1;
    const nextId = toastSeqRef.current;
    setToasts((prev) => [...prev, { id: nextId, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== nextId));
    }, 3500);
  }, []);

  const stopRinging = useCallback(() => {
    if (ringIntervalRef.current) {
      window.clearInterval(ringIntervalRef.current);
      ringIntervalRef.current = null;
    }
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } catch {
        // ignore
      }
    }
    setIsRinging(false);
  }, []);

  const startRinging = useCallback(async () => {
    if (isMuted || ringIntervalRef.current) return;

    if (!audioRef.current) {
      audioRef.current = new Audio("/new-order.mp3");
      audioRef.current.volume = 1;
    }

    const playOnce = async () => {
      try {
        if (!audioRef.current) return;
        audioRef.current.currentTime = 0;
        await audioRef.current.play();
      } catch {
        pushToast("Nuevo pedido recibido (activa el audio del navegador).");
        stopRinging();
      }
    };

    setIsRinging(true);
    await playOnce();
    ringIntervalRef.current = window.setInterval(() => {
      void playOnce();
    }, 3000);
  }, [isMuted, pushToast, stopRinging]);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Query orders with joined order_items so snapshot_name / qty are available inline
    const { data, error: qErr } = await supabase
      .from("orders")
      .select(
        "*, order_items(id, qty, snapshot_name, final_unit_price, unit_price, line_total, snapshot_extras, notes)"
      )
      .eq("restaurant_id", restaurantId)
      .eq("archived", false)
      .order("created_at", { ascending: false })
      .limit(50);

    if (qErr) {
      // Fallback to the admin view if direct table access is restricted
      const { data: fallback, error: fErr } = await supabase
        .from("v_orders_admin")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .eq("archived", false)
        .order("created_at", { ascending: false })
        .limit(50);

      if (fErr) {
        setError(fErr.message || "No se pudieron cargar los pedidos");
        setOrders([]);
      } else {
        setOrders(Array.isArray(fallback) ? (fallback as AdminOrderRow[]) : []);
      }
    } else {
      setOrders(Array.isArray(data) ? (data as AdminOrderRow[]) : []);
    }

    setLoading(false);
  }, [restaurantId]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  // ── Realtime subscription ─────────────────────────────────────────────────

  useEffect(() => {
    const channel = supabase
      .channel(`admin-orders-${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => {
          pushToast("Nuevo pedido recibido.");
          void loadOrders();
          void startRinging();
        }
      )
      .subscribe((status) => {
        setRealtimeConnected(status === "SUBSCRIBED");
      });

    return () => {
      void supabase.removeChannel(channel);
      setRealtimeConnected(false);
    };
  }, [loadOrders, pushToast, restaurantId, startRinging]);

  // Ring while any pending order exists
  useEffect(() => {
    const hasPending = orders.some((o) => normalizeStatus(o.status) === "pending");
    if (hasPending) void startRinging();
    else stopRinging();
  }, [orders, startRinging, stopRinging]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const enrichedOrders = useMemo(
    () =>
      orders.map((order) => {
        const items = parseOrderItems(order);
        return { order, items, summary: buildItemsSummary(items) };
      }),
    [orders]
  );

  const filteredOrders = useMemo(() => {
    let result = enrichedOrders;

    if (statusFilter !== "all") {
      result = result.filter(
        ({ order }) => normalizeStatus(order.status) === statusFilter
      );
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        ({ order }) =>
          asString(order.customer_name).toLowerCase().includes(q) ||
          asString(order.id).toLowerCase().includes(q)
      );
    }

    return result;
  }, [enrichedOrders, statusFilter, search]);

  const selectedOrder = useMemo(
    () =>
      enrichedOrders.find(
        ({ order }) => toOrderId(order.id) === toOrderId(selectedOrderId)
      ) ?? null,
    [enrichedOrders, selectedOrderId]
  );

  useEffect(() => {
    setActionError(null);
  }, [selectedOrderId]);

  // ESC closes detail panel
  useEffect(() => {
    if (!selectedOrderId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedOrderId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedOrderId]);

  // Lock body scroll while panel is open
  useEffect(() => {
    if (!selectedOrder) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [selectedOrder]);

  // ── Actions ───────────────────────────────────────────────────────────────

  // Quick single-step action from card buttons
  const quickUpdateStatus = useCallback(
    async (orderId: string, newStatus: NextAction["value"]) => {
      const prev = orders.find((r) => r.id === orderId);
      if (!prev || !isActionAllowed(prev.status, newStatus)) return;

      setCardUpdating(orderId);
      setOrders((list) =>
        list.map((r) =>
          r.id === orderId ? ({ ...r, status: newStatus } as AdminOrderRow) : r
        )
      );

      const { error: rpcErr } = await supabase.rpc("set_order_status_safe", {
        p_order_id: orderId,
        p_status: newStatus,
      });

      if (rpcErr) {
        setOrders((list) => list.map((r) => (r.id === orderId ? prev : r)));
        pushToast(`Error: ${rpcErr.message || "No se pudo actualizar"}`);
      } else {
        pushToast(`Estado: ${statusLabel(newStatus)}`);
        void loadOrders();
      }

      setCardUpdating(null);
    },
    [loadOrders, orders, pushToast]
  );

  // Full multi-step status update from detail panel
  const updateOrderStatus = useCallback(
    async (
      newStatus: "accepted" | "preparing" | "ready" | "out_for_delivery" | "delivered"
    ) => {
      if (!selectedOrderId) return;
      const previousOrder = orders.find((r) => r.id === selectedOrderId);
      if (!previousOrder) return;

      const currentStatus = normalizeStatus(previousOrder.status);
      if (!isActionAllowed(currentStatus, newStatus)) {
        setActionError("Transición de estado no permitida.");
        return;
      }

      const applyOptimistic = (status: AdminOrderRow["status"]) => {
        setOrders((prev) =>
          prev.map((r) =>
            r.id === selectedOrderId ? ({ ...r, status } as AdminOrderRow) : r
          )
        );
      };

      const runRpc = async (status: OrderStatus) =>
        supabase.rpc("set_order_status_safe", {
          p_order_id: selectedOrderId,
          p_status: status,
        });

      setUpdatingAction(newStatus);
      setActionError(null);
      let rpcErr: { message?: string } | null = null;

      if (
        newStatus === "ready" &&
        (currentStatus === "pending" || currentStatus === "accepted")
      ) {
        applyOptimistic("preparing");
        const r1 = await runRpc("preparing");
        if (r1.error) {
          rpcErr = r1.error;
        } else {
          applyOptimistic("ready");
          const r2 = await runRpc("ready");
          if (r2.error) rpcErr = r2.error;
        }
      } else if (newStatus === "delivered" && currentStatus !== "out_for_delivery") {
        applyOptimistic("out_for_delivery");
        const r1 = await runRpc("out_for_delivery");
        if (r1.error) {
          rpcErr = r1.error;
        } else {
          applyOptimistic("delivered");
          const r2 = await runRpc("delivered");
          if (r2.error) rpcErr = r2.error;
        }
      } else {
        applyOptimistic(newStatus);
        const r1 = await runRpc(newStatus);
        if (r1.error) rpcErr = r1.error;
      }

      if (rpcErr) {
        setOrders((prev) =>
          prev.map((r) => (r.id === selectedOrderId ? previousOrder : r))
        );
        setActionError(rpcErr.message || "No se pudo actualizar el estado.");
      } else {
        pushToast(`Estado actualizado: ${statusLabel(newStatus)}`);
        await loadOrders();
      }

      setUpdatingAction(null);
    },
    [loadOrders, orders, pushToast, selectedOrderId]
  );

  const cancelSelectedOrder = useCallback(async () => {
    const order = selectedOrder?.order;
    if (!order) return;
    if (!window.confirm("¿Cancelar este pedido?")) return;

    const orderId = toOrderId(order.id);
    const previousOrder = orders.find((r) => r.id === orderId);
    if (!previousOrder) return;

    setUpdatingAction("cancelled");
    setActionError(null);

    const canceledAt = new Date().toISOString();
    setOrders((prev) =>
      prev.map((r) =>
        r.id === orderId
          ? ({ ...r, status: "cancelled", canceled_at: canceledAt } as AdminOrderRow)
          : r
      )
    );

    const { error: cancelErr } = await supabase.rpc("set_order_status_safe", {
      p_order_id: order.id,
      p_status: "cancelled",
    });

    if (cancelErr) {
      setOrders((prev) => prev.map((r) => (r.id === orderId ? previousOrder : r)));
      setActionError(cancelErr.message || "No se pudo cancelar.");
      pushToast(`No se pudo cancelar: ${cancelErr.message || "Error desconocido"}`);
    } else {
      pushToast("Pedido cancelado.");
      await loadOrders();
    }

    setUpdatingAction(null);
  }, [loadOrders, orders, pushToast, selectedOrder]);

  const archiveSelectedOrder = useCallback(async () => {
    if (!selectedOrderId) return;
    if (!window.confirm("¿Archivar pedido?")) return;

    setUpdatingAction("archive");
    setActionError(null);

    const { error: archiveErr } = await supabase.rpc("admin_archive_order", {
      p_restaurant_id: restaurantId,
      p_order_id: selectedOrderId,
      p_archived: true,
    });

    if (archiveErr) {
      setActionError(archiveErr.message || "No se pudo archivar.");
    } else {
      pushToast("Pedido archivado.");
      setSelectedOrderId(null);
      await loadOrders();
    }

    setUpdatingAction(null);
  }, [loadOrders, pushToast, restaurantId, selectedOrderId]);

  const deleteSelectedOrder = useCallback(async () => {
    if (!selectedOrderId) return;
    if (!window.confirm("Eliminar pedido definitivamente? Esto no se puede deshacer.")) return;
    if (window.prompt("Escribe ELIMINAR para confirmar") !== "ELIMINAR") return;

    setUpdatingAction("delete");
    setActionError(null);

    const { error: deleteErr } = await supabase.rpc("admin_delete_order", {
      p_restaurant_id: restaurantId,
      p_order_id: selectedOrderId,
    });

    if (deleteErr) {
      setActionError(deleteErr.message || "No se pudo eliminar.");
    } else {
      pushToast("Pedido eliminado.");
      setSelectedOrderId(null);
      await loadOrders();
    }

    setUpdatingAction(null);
  }, [loadOrders, pushToast, restaurantId, selectedOrderId]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <section style={{ display: "grid", gap: 16 }}>
      {/* Pulse animation for realtime dot */}
      <style>{`
        @keyframes aop-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.6; transform: scale(1.3); }
        }
      `}</style>

      {/* ── Header ── */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div>
            <h2 style={{ margin: 0 }}>Pedidos</h2>
            <p style={{ margin: "2px 0 0", color: "#6b7280", fontSize: 13 }}>
              Últimos 50 pedidos activos
            </p>
          </div>

          {/* Realtime indicator dot */}
          <span
            title={realtimeConnected ? "Tiempo real conectado" : "Reconectando..."}
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              borderRadius: "50%",
              flexShrink: 0,
              background: realtimeConnected ? "#22c55e" : "#f59e0b",
              boxShadow: realtimeConnected
                ? "0 0 0 3px rgba(34,197,94,0.25)"
                : "0 0 0 3px rgba(245,158,11,0.25)",
              animation: realtimeConnected ? "aop-pulse 2s ease-in-out infinite" : "none",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => void loadOrders()}
            disabled={loading}
            style={{
              borderRadius: 8,
              border: "1px solid #d1d5db",
              background: "#fff",
              padding: "7px 12px",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
              fontSize: 13,
            }}
          >
            {loading ? "Cargando..." : "↺ Recargar"}
          </button>

          <button
            type="button"
            onClick={() => exportOrdersToCsv(filteredOrders, restaurantName || "restaurante")}
            disabled={filteredOrders.length === 0}
            style={{
              borderRadius: 8,
              border: "1px solid #d1d5db",
              background: "#fff",
              padding: "7px 12px",
              cursor: filteredOrders.length === 0 ? "not-allowed" : "pointer",
              opacity: filteredOrders.length === 0 ? 0.5 : 1,
              fontSize: 13,
            }}
          >
            ↓ CSV
          </button>

          <button
            type="button"
            onClick={() => {
              setIsMuted((prev) => {
                const next = !prev;
                if (next) stopRinging();
                return next;
              });
            }}
            style={{
              borderRadius: 8,
              border: "1px solid #d1d5db",
              background: isMuted ? "#111827" : "#fff",
              color: isMuted ? "#fff" : "#111827",
              padding: "7px 12px",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {isMuted ? "Silenciado" : isRinging ? "Silenciar" : "Sonido"}
          </button>
        </div>
      </header>

      {/* ── Search + Filter pills ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input
          type="search"
          placeholder="Buscar por cliente o ID de pedido..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            border: "1px solid #d1d5db",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 14,
            outline: "none",
            width: "100%",
            boxSizing: "border-box",
            background: "#fff",
          }}
        />

        <div className="admin-filter-pills" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {STATUS_FILTERS.map(({ value, label }) => {
            const active = statusFilter === value;
            const count =
              value === "all"
                ? null
                : enrichedOrders.filter(
                    ({ order }) => normalizeStatus(order.status) === value
                  ).length;

            return (
              <button
                key={value}
                type="button"
                onClick={() => setStatusFilter(value)}
                style={{
                  borderRadius: 999,
                  border: active ? "1px solid #16a34a" : "1px solid #d1d5db",
                  background: active ? "#f0fdf4" : "#fff",
                  color: active ? "#15803d" : "#374151",
                  padding: "5px 14px",
                  fontSize: 13,
                  fontWeight: active ? 700 : 400,
                  cursor: "pointer",
                }}
              >
                {label}
                {count !== null ? (
                  <span style={{ marginLeft: 5, fontSize: 11, opacity: 0.65 }}>
                    ({count})
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Error banner ── */}
      {error ? (
        <div className="admin-error-banner" role="alert">
          <span>No se pudieron cargar los pedidos. Inténtalo de nuevo.</span>
          <button
            type="button"
            className="admin-btn-secondary"
            style={{ padding: "6px 12px", fontSize: 13 }}
            onClick={() => void loadOrders()}
          >
            Reintentar
          </button>
        </div>
      ) : null}

      {/* ── Loading placeholder ── */}
      {loading && orders.length === 0 ? (
        <CardSkeleton count={4} />
      ) : null}

      {/* ── Empty state ── */}
      {!loading && !error && filteredOrders.length === 0 ? (
        <div className="admin-card">
          {statusFilter !== "all" || search.trim() ? (
            <AdminEmptyState
              icon="🔍"
              title="No hay pedidos con estos filtros"
              description="Prueba cambiando el estado o la búsqueda."
              actionLabel="Ver todos los pedidos"
              onAction={() => { setStatusFilter("all"); setSearch(""); }}
            />
          ) : (
            <AdminEmptyState
              icon="🛒"
              title="Aún no hay pedidos"
              description="Los nuevos pedidos aparecerán aquí en tiempo real."
            />
          )}
        </div>
      ) : null}

      {/* ── Order cards grid ── */}
      {filteredOrders.length > 0 ? (
        <div
          className="admin-orders-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
            gap: 12,
          }}
        >
          {filteredOrders.map(({ order, summary }, index) => {
            const status = normalizeStatus(order.status);
            const nextAction = getNextAction(order.status);
            const phone = asString(
              (order as Record<string, unknown>).customer_phone
            );
            const isDelivery = asString(order.order_type) === "delivery";
            const orderId = toOrderId(order.id);
            const isCardBusy = cardUpdating === orderId;
            const isPending = status === "pending";

            return (
              <article
                key={`${orderId || "order"}-${asString(order.created_at) || "na"}-${index}`}
                style={{
                  border: isPending
                    ? "2px solid #f59e0b"
                    : "1px solid #e5e7eb",
                  borderRadius: 12,
                  background: isPending ? "#fffdf5" : "#fff",
                  padding: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  boxShadow: isPending
                    ? "0 2px 12px rgba(245,158,11,0.15)"
                    : "0 1px 4px rgba(0,0,0,0.05)",
                }}
              >
                {/* Time + elapsed + type badge + status */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 6,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>
                      {formatHour(order.created_at)}
                    </span>
                    <span style={{ fontSize: 12, color: "#9ca3af" }}>
                      {formatElapsed(order.created_at)}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 5,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 700,
                        background: isDelivery ? "#dbeafe" : "#d1fae5",
                        color: isDelivery ? "#1e40af" : "#065f46",
                        border: `1px solid ${isDelivery ? "#93c5fd" : "#6ee7b7"}`,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                      }}
                    >
                      {isDelivery ? "DELIVERY" : "RECOGER"}
                    </span>
                    <span style={statusStyle(order.status)}>
                      {statusLabel(order.status)}
                    </span>
                  </div>
                </div>

                {/* Customer name + phone */}
                <div>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "#111827" }}>
                    {asString(order.customer_name) || "Sin nombre"}
                  </span>
                  {phone ? (
                    <span style={{ fontSize: 13, color: "#6b7280", marginLeft: 8 }}>
                      {phone}
                    </span>
                  ) : null}
                </div>

                {/* Items summary */}
                <div style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.5 }}>
                  {summary}
                </div>

                {/* Total + action buttons */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    marginTop: "auto",
                    paddingTop: 8,
                    borderTop: "1px solid #f3f4f6",
                  }}
                >
                  <span
                    style={{
                      fontSize: 22,
                      fontWeight: 800,
                      color: "#111827",
                      letterSpacing: -0.5,
                    }}
                  >
                    {formatMoney(asNumber(order.total))}
                  </span>

                  <div style={{ display: "flex", gap: 6 }}>
                    {nextAction ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void quickUpdateStatus(orderId, nextAction.value);
                        }}
                        disabled={isCardBusy}
                        style={{
                          background: "var(--brand-primary)",
                          color: "#fff",
                          border: "none",
                          borderRadius: 7,
                          padding: "7px 14px",
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: isCardBusy ? "not-allowed" : "pointer",
                          opacity: isCardBusy ? 0.7 : 1,
                        }}
                      >
                        {isCardBusy ? "..." : nextAction.label}
                      </button>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => setSelectedOrderId(orderId)}
                      style={{
                        background: "transparent",
                        color: "#6b7280",
                        border: "1px solid #e5e7eb",
                        borderRadius: 7,
                        padding: "7px 10px",
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      Ver
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      {/* ── Detail slide-over panel ── */}
      {selectedOrder ? (
        <div
          role="presentation"
          onMouseDown={(e) => {
            e.preventDefault();
            if (e.target === e.currentTarget) setSelectedOrderId(null);
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(17, 24, 39, 0.45)",
            display: "flex",
            justifyContent: "flex-end",
            zIndex: 9999,
          }}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={`Detalle pedido ${selectedOrder.order.id}`}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              width: "min(640px, 100vw)",
              height: "100%",
              background: "#fff",
              padding: 20,
              overflowY: "auto",
              boxShadow: "-10px 0 24px rgba(0,0,0,0.2)",
              display: "grid",
              gap: 18,
              alignContent: "start",
            }}
          >
            {/* Close × */}
            <button
              type="button"
              aria-label="Cerrar panel"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSelectedOrderId(null);
              }}
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                zIndex: 10,
                width: 32,
                height: 32,
                borderRadius: 999,
                border: "1px solid #d1d5db",
                background: "#fff",
                cursor: "pointer",
                lineHeight: 1,
                fontSize: 20,
                padding: 0,
              }}
            >
              ×
            </button>

            {/* Panel header */}
            <header
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                paddingRight: 40,
              }}
            >
              <div>
                <h3 style={{ margin: 0 }}>
                  Pedido #{asString(selectedOrder.order.id).slice(0, 8).toUpperCase() || "N/A"}
                </h3>
                <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 13 }}>
                  {formatDateTime(selectedOrder.order.created_at)}
                  {" · "}
                  {formatElapsed(selectedOrder.order.created_at)}
                </p>
              </div>
              <span style={statusStyle(selectedOrder.order.status)}>
                {statusLabel(selectedOrder.order.status)}
              </span>
            </header>

            {/* Resumen */}
            <section style={{ display: "grid", gap: 10 }}>
              <h4 style={{ margin: 0 }}>Resumen</h4>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "140px 1fr",
                  gap: 8,
                  fontSize: 14,
                  color: "#111827",
                }}
              >
                <strong>Tipo</strong>
                <span>{asString(selectedOrder.order.order_type) || "-"}</span>

                <strong>Total</strong>
                <span style={{ fontWeight: 700, fontSize: 16 }}>
                  {formatMoney(asNumber(selectedOrder.order.total))}
                </span>

                <strong>Cliente</strong>
                <span>{asString(selectedOrder.order.customer_name) || "Sin nombre"}</span>

                <strong>Teléfono</strong>
                <span>
                  {asString(
                    (selectedOrder.order as Record<string, unknown>).customer_phone
                  ) || "-"}
                </span>

                <strong>Pago</strong>
                <span>
                  {asString(
                    (selectedOrder.order as Record<string, unknown>).payment_method
                  ) || "-"}
                </span>

                <strong>Gastos envío</strong>
                <span>
                  {formatMoney(
                    asNumber(
                      (selectedOrder.order as Record<string, unknown>).delivery_fee
                    )
                  )}
                </span>

                {asString(
                  (selectedOrder.order as Record<string, unknown>).payment_method
                ) === "cash" ? (
                  <>
                    <strong>Efectivo</strong>
                    <span>
                      {formatMoney(
                        asNumber(
                          (selectedOrder.order as Record<string, unknown>).cash_given
                        )
                      )}
                    </span>
                    <strong>Cambio</strong>
                    <span>
                      {formatMoney(
                        asNumber(
                          (selectedOrder.order as Record<string, unknown>).change_due
                        )
                      )}
                    </span>
                  </>
                ) : null}
              </div>
            </section>

            {/* Acciones */}
            <section style={{ display: "grid", gap: 10 }}>
              <h4 style={{ margin: 0 }}>Acciones</h4>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {PANEL_ACTION_STATUSES.map((st) => {
                  const allowed = isActionAllowed(
                    normalizeStatus(selectedOrder.order.status),
                    st
                  );
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => void updateOrderStatus(st)}
                      disabled={updatingAction !== null || !allowed}
                      style={{
                        border: "1px solid var(--brand-primary-border)",
                        background: "var(--brand-primary-soft)",
                        color: "var(--brand-hover)",
                        borderRadius: 8,
                        padding: "8px 12px",
                        fontSize: 13,
                        cursor: updatingAction || !allowed ? "not-allowed" : "pointer",
                        opacity: updatingAction !== null || !allowed ? 0.5 : 1,
                      }}
                    >
                      {updatingAction === st
                        ? "Guardando..."
                        : PANEL_ACTION_LABELS[st]}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => void cancelSelectedOrder()}
                  disabled={
                    updatingAction !== null ||
                    !isActionAllowed(
                      normalizeStatus(selectedOrder.order.status),
                      "cancelled"
                    )
                  }
                  style={{
                    border: "1px solid #fecaca",
                    background: "#fef2f2",
                    color: "#b91c1c",
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 13,
                    cursor: updatingAction ? "not-allowed" : "pointer",
                    opacity:
                      updatingAction !== null ||
                      !isActionAllowed(
                        normalizeStatus(selectedOrder.order.status),
                        "cancelled"
                      )
                        ? 0.5
                        : 1,
                  }}
                >
                  {updatingAction === "cancelled" ? "Cancelando..." : "Cancelar"}
                </button>

                <button
                  type="button"
                  onClick={() => void archiveSelectedOrder()}
                  disabled={updatingAction !== null}
                  style={{
                    border: "1px solid #d1d5db",
                    background: "#f3f4f6",
                    color: "#374151",
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 13,
                    cursor: updatingAction ? "not-allowed" : "pointer",
                    opacity: updatingAction !== null ? 0.5 : 1,
                  }}
                >
                  {updatingAction === "archive" ? "Guardando..." : "Archivar"}
                </button>

                <button
                  type="button"
                  onClick={() => void deleteSelectedOrder()}
                  disabled={updatingAction !== null}
                  style={{
                    border: "1px solid #ef4444",
                    background: "#ef4444",
                    color: "#fff",
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 13,
                    cursor: updatingAction ? "not-allowed" : "pointer",
                    opacity: updatingAction !== null ? 0.5 : 1,
                  }}
                >
                  {updatingAction === "delete" ? "Eliminando..." : "Eliminar pedido"}
                </button>
              </div>

              {actionError ? (
                <div
                  role="alert"
                  style={{
                    border: "1px solid #fecaca",
                    background: "#fef2f2",
                    color: "#991b1b",
                    borderRadius: 8,
                    padding: "8px 10px",
                    fontSize: 13,
                  }}
                >
                  {actionError}
                </div>
              ) : null}
            </section>

            {/* Items */}
            <section style={{ display: "grid", gap: 10 }}>
              <h4 style={{ margin: 0 }}>Items</h4>
              {selectedOrder.items.length === 0 ? (
                <div style={{ color: "#6b7280", fontSize: 14 }}>
                  No hay items en este pedido.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {selectedOrder.items.map((item, idx) => (
                    <article
                      key={`${item.name}-${item.qty}-${item.unitPrice}-${item.lineTotal}-${idx}`}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 10,
                        padding: 12,
                        display: "grid",
                        gap: 6,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                        }}
                      >
                        <strong style={{ fontSize: 14 }}>
                          {item.qty}x {item.name}
                        </strong>
                        <strong style={{ fontSize: 14 }}>
                          {formatMoney(item.lineTotal)}
                        </strong>
                      </div>
                      <div style={{ color: "#6b7280", fontSize: 13 }}>
                        Unitario: {formatMoney(item.unitPrice)}
                      </div>
                      {item.options.length > 0 ? (
                        <div style={{ fontSize: 13, color: "#374151" }}>
                          Opciones:{" "}
                          {item.options
                            .map((o) => `${o.name} (${formatMoney(o.price)})`)
                            .join(", ")}
                        </div>
                      ) : null}
                      {item.ingredients.length > 0 ? (
                        <div style={{ fontSize: 13, color: "#374151" }}>
                          Extras:{" "}
                          {item.ingredients
                            .map((i) => `${i.name} (${formatMoney(i.price)})`)
                            .join(", ")}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </section>

            {/* Dirección */}
            <section style={{ display: "grid", gap: 6 }}>
              <h4 style={{ margin: 0 }}>Dirección</h4>
              <div style={{ color: "#374151", fontSize: 14 }}>
                {getAddressText(selectedOrder.order)}
              </div>
            </section>

            {/* Notas */}
            <section style={{ display: "grid", gap: 6 }}>
              <h4 style={{ margin: 0 }}>Notas</h4>
              <pre
                style={{
                  margin: 0,
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  background: "#f9fafb",
                  padding: 10,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  fontSize: 13,
                  color: "#374151",
                }}
              >
                {getNotesText(selectedOrder.order)}
              </pre>
            </section>
          </aside>
        </div>
      ) : null}

      {/* ── Toast stack ── */}
      <div
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          display: "grid",
          gap: 8,
          zIndex: 60,
        }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            style={{
              border: "1px solid var(--brand-primary-border)",
              background: "var(--brand-primary-soft)",
              color: "var(--brand-hover)",
              borderRadius: 10,
              padding: "10px 14px",
              minWidth: 220,
              maxWidth: 320,
              boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
              fontSize: 14,
            }}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </section>
  );
}
