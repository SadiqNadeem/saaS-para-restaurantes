import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

import type { OrderStatus } from "../../constants/orderStatus";
import { buildAdminNotificationMessage, buildWhatsAppLink } from "../../lib/whatsapp/whatsappService";
import { supabase } from "../../lib/supabase";
import { usePrintSettings } from "../../lib/printing/usePrintSettings";
import type { TicketData } from "../../lib/printing/ticketService";
import { useRestaurant } from "../../restaurant/RestaurantContext";
import { AdminEmptyState } from "../components/AdminEmptyState";
import { CardSkeleton } from "../components/AdminSkeleton";

// ������ Types ����������������������������������������������������������������������������������������������������������������������������������������

type AdminOrderRow = Record<string, unknown> & {
  id: string;
  created_at: string | null;
  status: OrderStatus | null;
  order_type: string | null;
  total: number | null;
  customer_name: string | null;
  source?: string | null;
  table_id?: string | null;
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

type KanbanColumn = {
  id: "pending" | "in_progress" | "ready" | "delivery" | "done";
  label: string;
  statuses: OrderStatus[];
};

// ������ Helpers ������������������������������������������������������������������������������������������������������������������������������������

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

const ADMIN_ACTIVE_STATUSES: Set<string> = new Set(["pending", "accepted", "preparing", "ready", "out_for_delivery"]);

function OrderElapsedTimer({ since, status }: { since: string | null | undefined; status: string | null | undefined }) {
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (!since || !status || !ADMIN_ACTIVE_STATUSES.has(status)) return;
    const calc = () => {
      const s = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 1000));
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      setLabel(h > 0
        ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
        : `${m}:${String(sec).padStart(2, "0")}`);
    };
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [since, status]);

  // For terminal orders fall back to static label
  if (!label) {
    const staticLabel = formatElapsed(since);
    return staticLabel ? <span>{staticLabel}</span> : null;
  }

  const mins = since ? Math.floor((Date.now() - new Date(since).getTime()) / 60000) : 0;
  const color = mins >= 15 ? "#dc2626" : mins >= 5 ? "#d97706" : "#64748b";

  return (
    <span style={{ color, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
      ⏱ {label}
    </span>
  );
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
    pending:          { bg: "#fff7ed", border: "#fdba74", text: "#9a3412" },
    accepted:         { bg: "#eff6ff", border: "#93c5fd", text: "#1d4ed8" },
    preparing:        { bg: "#fff7ed", border: "#fdba74", text: "#c2410c" },
    ready:            { bg: "#ecfdf3", border: "#86efac", text: "#15803d" },
    out_for_delivery: { bg: "#f5f3ff", border: "#c4b5fd", text: "#6d28d9" },
    delivered:        { bg: "#f0fdf4", border: "#86efac", text: "#166534" },
    cancelled:        { bg: "#fef2f2", border: "#fca5a5", text: "#b91c1c" },
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
    padding: "4px 10px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.2,
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

function shortOrderId(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!normalized) return "N/A";
  return normalized.slice(0, 8);
}

function orderTypeLabel(value: string | null | undefined): string {
  const raw = asString(value).toLowerCase();
  if (raw === "delivery" || raw === "domicilio") return "Domicilio";
  if (raw === "pickup" || raw === "takeaway" || raw === "recoger") return "Recoger";
  if (raw === "dine_in" || raw === "table" || raw === "mesa") return "Mesa";
  return raw ? asString(value) : "Sin tipo";
}

function orderTypeStyle(value: string | null | undefined): CSSProperties {
  const raw = asString(value).toLowerCase();
  if (raw === "delivery" || raw === "domicilio") {
    return { background: "#dbeafe", border: "#93c5fd", color: "#1e3a8a" };
  }
  if (raw === "dine_in" || raw === "table" || raw === "mesa") {
    return { background: "#ede9fe", border: "#c4b5fd", color: "#5b21b6" };
  }
  return { background: "#dcfce7", border: "#86efac", color: "#166534" };
}

function paymentMethodLabel(value: unknown): string {
  const raw = asString(value).toLowerCase();
  if (!raw) return "Sin pago";
  if (raw === "cash" || raw === "efectivo") return "Efectivo";
  if (raw === "card" || raw === "tarjeta") return "Tarjeta";
  if (raw === "online" || raw === "stripe") return "Online";
  if (raw === "pending" || raw === "pending_cash") return "Pendiente";
  return asString(value);
}

function isSameLocalDate(dateValue: string | null | undefined, now: Date): boolean {
  if (!dateValue) return false;
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function toOrderId(value: unknown): string {
  return String(value ?? "").trim();
}

function orderToTicketData(
  order: AdminOrderRow,
  items: OrderItem[],
  restaurantName: string
): TicketData {
  return {
    orderId: order.id,
    createdAt: order.created_at,
    restaurantName,
    orderType: order.order_type,
    customerName: order.customer_name,
    customerPhone: asString((order as Record<string, unknown>).customer_phone) || null,
    addressLine: asString(
      (order as Record<string, unknown>).delivery_address ||
        (order as Record<string, unknown>).address_line
    ) || null,
    notes:
      asString(
        (order as Record<string, unknown>).notes ||
          (order as Record<string, unknown>).instructions
      ) || null,
    paymentMethod: asString((order as Record<string, unknown>).payment_method) || null,
    cashGiven: (order as Record<string, unknown>).cash_given as number | null ?? null,
    changeDue: (order as Record<string, unknown>).change_due as number | null ?? null,
    deliveryFee: asNumber((order as Record<string, unknown>).delivery_fee) || null,
    total: asNumber(order.total) || null,
    items: items.map((item) => ({
      quantity: item.qty,
      name: item.name,
      unitPrice: item.unitPrice,
      modifiers: item.options.map((o) => ({ name: o.name, price: o.price })),
      extras: item.ingredients.map((i) => ({ name: i.name, price: i.price })),
    })),
  };
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

// ������ Constants ��������������������������������������������������������������������������������������������������������������������������������

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

const KANBAN_COLUMNS: KanbanColumn[] = [
  { id: "pending", label: "Pendiente", statuses: ["pending"] },
  { id: "in_progress", label: "Aceptado / Preparando", statuses: ["accepted", "preparing"] },
  { id: "ready", label: "Listo", statuses: ["ready"] },
  { id: "delivery", label: "En reparto", statuses: ["out_for_delivery"] },
  { id: "done", label: "Finalizados", statuses: ["delivered", "cancelled"] },
];

const PANEL_ACTION_LABELS: Record<string, string> = {
  accepted:         "Aceptar",
  preparing:        "En preparación",
  ready:            "Marcar listo",
  out_for_delivery: "En reparto",
  delivered:        "Marcar entregado",
};

// ������ Component ��������������������������������������������������������������������������������������������������������������������������������

// ������ CSV Export ������������������������������������������������������������������������������������������������������������������������������

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

// ������ Component ��������������������������������������������������������������������������������������������������������������������������������

export default function AdminOrdersPage() {
  const { restaurantId, name: restaurantName } = useRestaurant();
  const { settings: printSettings, printOrder } = usePrintSettings(restaurantId);

  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | "web" | "pos" | "qr_table">("all");
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [hoveredFilter, setHoveredFilter] = useState<StatusFilter | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [updatingAction, setUpdatingAction] = useState<string | null>(null);
  const [cardUpdating, setCardUpdating] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const toastSeqRef = useRef(0);

  // ���� Sound alert system (useOrderRinger � kept intact) ������������������������������������������
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

  const startRinging = useCallback(() => {
    if (isMuted || ringIntervalRef.current) return;

    if (!audioRef.current) {
      audioRef.current = new Audio("/new-order.mp3");
      audioRef.current.volume = 1;
    }

    const playOnce = () => {
      if (!audioRef.current) return;
      audioRef.current.currentTime = 0;
      void audioRef.current.play().catch(() => {
        pushToast("Nuevo pedido recibido (activa el audio del navegador).");
        stopRinging();
      });
    };

    setIsRinging(true);
    playOnce();
    ringIntervalRef.current = window.setInterval(playOnce, 3000);
  }, [isMuted, pushToast, stopRinging]);

  // ���� Data loading ��������������������������������������������������������������������������������������������������������������������

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

  // ���� Realtime subscription ��������������������������������������������������������������������������������������������������

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
          startRinging();
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

  // Ring while any pending order exists; stop immediately when muted or no pending orders
  useEffect(() => {
    const hasPending = orders.some((o) => o.status === "pending");
    if (hasPending && !isMuted) {
      startRinging();
    } else {
      stopRinging();
    }
    return () => {
      stopRinging();
    };
  }, [isMuted, orders, startRinging, stopRinging]);

  // ���� Derived state ������������������������������������������������������������������������������������������������������������������

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

    if (sourceFilter !== "all") {
      result = result.filter(
        ({ order }) => asString(order.source) === sourceFilter
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
  }, [enrichedOrders, statusFilter, sourceFilter, search]);

  const statusCounts = useMemo(() => {
    return enrichedOrders.reduce<Record<string, number>>((acc, { order }) => {
      const key = normalizeStatus(order.status);
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
  }, [enrichedOrders]);

  const kpis = useMemo(() => {
    const now = new Date();
    const today = enrichedOrders.filter(({ order }) => isSameLocalDate(order.created_at, now));
    const pending = today.filter(({ order }) => normalizeStatus(order.status) === "pending").length;
    const inPrep = today.filter(({ order }) => {
      const status = normalizeStatus(order.status);
      return status === "accepted" || status === "preparing";
    }).length;
    const sales = today
      .filter(({ order }) => normalizeStatus(order.status) !== "cancelled")
      .reduce((sum, { order }) => sum + asNumber(order.total), 0);

    return {
      ordersToday: today.length,
      pending,
      inPrep,
      sales,
    };
  }, [enrichedOrders]);

  const kanbanColumns = useMemo(() => {
    return KANBAN_COLUMNS.map((column) => ({
      ...column,
      orders: filteredOrders.filter(({ order }) =>
        column.statuses.includes(normalizeStatus(order.status))
      ),
    }));
  }, [filteredOrders]);

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

  // ���� Actions ������������������������������������������������������������������������������������������������������������������������������

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
        if (newStatus === "accepted" && printSettings.printOnAccept) {
          const orderItems =
            enrichedOrders.find((e) => e.order.id === orderId)?.items ?? [];
          void printOrder(
            orderToTicketData(prev, orderItems, restaurantName ?? ""),
            "customer"
          );
        }
        void loadOrders();
      }

      setCardUpdating(null);
    },
    [enrichedOrders, loadOrders, orders, printOrder, printSettings, pushToast, restaurantName]
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

  // ���� Render ��������������������������������������������������������������������������������������������������������������������������������

  return (
    <section style={{ display: "grid", gap: 18, width: "100%" }}>
      {/* Pulse animation for realtime dot */}
      <style>{`
        @keyframes aop-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.6; transform: scale(1.3); }
        }
        @keyframes aop-new-glow {
          0%, 100% { box-shadow: 0 6px 18px rgba(251, 146, 60, 0.14); }
          50% { box-shadow: 0 10px 24px rgba(251, 146, 60, 0.22); }
        }
        .aop-order-action {
          transition: all 140ms ease;
        }
        .aop-order-action:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 16px rgba(15, 23, 42, 0.14);
          border-color: #94a3b8 !important;
          color: #0f172a !important;
          background: #f8fafc !important;
        }
        .aop-order-action:disabled {
          transform: none;
          box-shadow: none;
        }
        .aop-order-primary:hover {
          filter: brightness(0.95);
          transform: translateY(-1px);
          box-shadow: 0 10px 18px rgba(15, 23, 42, 0.2);
        }
      `}</style>

      {/* ���� Header ���� */}
      <header
        style={{
          display: "grid",
          gap: 12,
          border: "1px solid #d9e2ec",
          borderRadius: 18,
          padding: 16,
          background: "linear-gradient(120deg, #f8fafc 0%, #ffffff 70%)",
          boxShadow: "0 6px 18px rgba(15, 23, 42, 0.06)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: "clamp(1.4rem, 2vw, 1.9rem)", lineHeight: 1.15, color: "#0f172a" }}>Pedidos TPV</h2>
            <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 14, lineHeight: 1.4 }}>
              Vista operativa en tiempo real. Ultimos 50 pedidos activos.
            </p>
          </div>

          <div
            title={realtimeConnected ? "Tiempo real conectado" : "Reconectando..."}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              borderRadius: 999,
              border: `1px solid ${realtimeConnected ? "#86efac" : "#fcd34d"}`,
              background: realtimeConnected ? "#f0fdf4" : "#fffbeb",
              color: realtimeConnected ? "#166534" : "#92400e",
              padding: "8px 12px",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 9,
                height: 9,
                borderRadius: "50%",
                flexShrink: 0,
                background: realtimeConnected ? "#22c55e" : "#f59e0b",
                boxShadow: realtimeConnected
                  ? "0 0 0 3px rgba(34,197,94,0.22)"
                  : "0 0 0 3px rgba(245,158,11,0.22)",
                animation: realtimeConnected ? "aop-pulse 2s ease-in-out infinite" : "none",
              }}
            />
            {realtimeConnected ? "En vivo" : "Reconectando"}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => void loadOrders()}
            disabled={loading}
            style={{
              borderRadius: 11,
              border: "1px solid #d1d5db",
              background: "#fff",
              color: "#000",
              padding: "9px 13px",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {loading ? "Cargando..." : "Recargar"}
          </button>

          <button
            type="button"
            onClick={() => exportOrdersToCsv(filteredOrders, restaurantName || "restaurante")}
            disabled={filteredOrders.length === 0}
            style={{
              borderRadius: 11,
              border: "1px solid #d1d5db",
              background: "#fff",
              color: "#000",
              padding: "9px 13px",
              cursor: filteredOrders.length === 0 ? "not-allowed" : "pointer",
              opacity: filteredOrders.length === 0 ? 0.5 : 1,
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            Exportar CSV
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
              borderRadius: 11,
              border: "1px solid #d1d5db",
              background: isMuted ? "#0f172a" : "#fff",
              color: isMuted ? "#fff" : "#0f172a",
              padding: "9px 13px",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 700,
              boxShadow: isMuted ? "0 8px 18px rgba(15, 23, 42, 0.18)" : "none",
            }}
          >
            {isMuted ? "Silenciado" : isRinging ? "Silenciar" : "Sonido"}
          </button>
        </div>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
        }}
      >
        {[
          { label: "Pedidos hoy", value: String(kpis.ordersToday) },
          { label: "Pendientes", value: String(kpis.pending) },
          { label: "En preparacion", value: String(kpis.inPrep) },
          { label: "Ventas hoy", value: formatMoney(kpis.sales) },
        ].map((kpi) => (
          <article
            key={kpi.label}
            style={{
              border: "1px solid #dbe4ee",
              borderRadius: 14,
              padding: "12px 14px",
              background: "#fff",
              boxShadow: "0 2px 8px rgba(15, 23, 42, 0.05)",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.3 }}>
              {kpi.label}
            </div>
            <div style={{ marginTop: 6, fontSize: 28, fontWeight: 800, color: "#0f172a", lineHeight: 1.1 }}>
              {kpi.value}
            </div>
          </article>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gap: 12,
          border: "1px solid #dbe4ee",
          borderRadius: 14,
          padding: 14,
          background: "#ffffff",
          boxShadow: "0 1px 2px rgba(15, 23, 42, 0.05)",
        }}
      >
        <div style={{ position: "relative", width: "100%", maxWidth: 620 }}>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            style={{
              width: 16,
              height: 16,
              position: "absolute",
              left: 14,
              top: "50%",
              transform: "translateY(-50%)",
              color: "#64748b",
              pointerEvents: "none",
            }}
          >
            <path
              d="M11 4a7 7 0 1 0 4.4 12.4l4.1 4.1a1 1 0 0 0 1.4-1.4l-4.1-4.1A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z"
              fill="currentColor"
            />
          </svg>
          <input
            type="search"
            placeholder="Buscar por cliente o ID de pedido..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            style={{
              border: searchFocused ? "1px solid #0f172a" : "1px solid #cbd5e1",
              borderRadius: 12,
              padding: "11px 14px 11px 40px",
              fontSize: 14,
              outline: "none",
              width: "100%",
              boxSizing: "border-box",
              background: "#fff",
              minHeight: 44,
              boxShadow: searchFocused
                ? "0 0 0 3px rgba(15, 23, 42, 0.14)"
                : "0 1px 2px rgba(15, 23, 42, 0.06)",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {STATUS_FILTERS.map(({ value, label }) => {
            const active = statusFilter === value;
            const hovered = hoveredFilter === value;
            const count = value === "all"
              ? enrichedOrders.length
              : statusCounts[value] ?? 0;

            return (
              <button
                key={value}
                type="button"
                onClick={() => setStatusFilter(value)}
                onMouseEnter={() => setHoveredFilter(value)}
                onMouseLeave={() => setHoveredFilter(null)}
                style={{
                  borderRadius: 999,
                  border: active ? "1px solid #0f172a" : hovered ? "1px solid #94a3b8" : "1px solid #cbd5e1",
                  background: active ? "#0f172a" : hovered ? "#f8fafc" : "#fff",
                  color: active ? "#fff" : "#334155",
                  padding: "9px 14px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  minHeight: 40,
                  transition: "all 120ms ease",
                  boxShadow: active ? "0 6px 16px rgba(15, 23, 42, 0.18)" : "none",
                }}
              >
                {label}
                <span style={{ marginLeft: 8, fontSize: 12, opacity: active ? 0.96 : 0.72 }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Source filter */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {([
            { value: "all", label: "Todos los orígenes" },
            { value: "web", label: "Web" },
            { value: "pos", label: "TPV" },
            { value: "qr_table", label: "Mesa QR" },
          ] as Array<{ value: "all" | "web" | "pos" | "qr_table"; label: string }>).map(({ value, label }) => {
            const active = sourceFilter === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setSourceFilter(value)}
                style={{
                  borderRadius: 999,
                  border: active ? "1px solid var(--brand-primary)" : "1px solid #cbd5e1",
                  background: active ? "rgba(78,197,128,0.12)" : "#fff",
                  color: active ? "#15803d" : "#64748b",
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: active ? 700 : 500,
                  cursor: "pointer",
                  minHeight: 34,
                  transition: "all 120ms ease",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {error ? (
        <div className="admin-error-banner" role="alert">
          <span>No se pudieron cargar los pedidos. Intentalo de nuevo.</span>
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

      {loading && orders.length === 0 ? <CardSkeleton count={4} /> : null}

      {!loading && !error && filteredOrders.length === 0 ? (
        <div className="admin-card">
          {statusFilter !== "all" || search.trim() ? (
            <AdminEmptyState
              icon="?"
              title="No hay pedidos con estos filtros"
              description="Prueba cambiando el estado o la busqueda."
              actionLabel="Ver todos los pedidos"
              onAction={() => { setStatusFilter("all"); setSearch(""); }}
            />
          ) : (
            <AdminEmptyState
              icon="O"
              title="Aun no hay pedidos"
              description="Los nuevos pedidos apareceran aqui en tiempo real."
            />
          )}
        </div>
      ) : null}

      {filteredOrders.length > 0 ? (
        <div
          style={{
            border: "1px solid #dbe4ee",
            borderRadius: 16,
            padding: 12,
            background: "#f8fafc",
            overflowX: "auto",
          }}
        >
          <div
            style={{
              display: "grid",
              gridAutoFlow: "column",
              gridAutoColumns: "minmax(320px, 1fr)",
              gap: 12,
              alignItems: "start",
              minWidth: "fit-content",
            }}
          >
            {kanbanColumns.map((column) => (
              <section
                key={column.id}
                style={{
                  display: "grid",
                  gap: 10,
                  minHeight: 220,
                  border: "1px solid #d7e1ea",
                  borderRadius: 14,
                  background: "#eef4f8",
                  padding: 10,
                }}
              >
                <header
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    padding: "2px 2px 6px",
                  }}
                >
                  <strong style={{ fontSize: 13, color: "#1e293b" }}>{column.label}</strong>
                  <span
                    style={{
                      borderRadius: 999,
                      border: "1px solid #c4d2e1",
                      background: "#fff",
                      color: "#334155",
                      fontSize: 12,
                      fontWeight: 700,
                      padding: "3px 8px",
                    }}
                  >
                    {column.orders.length}
                  </span>
                </header>

                {column.orders.length === 0 ? (
                  <div
                    style={{
                      borderRadius: 10,
                      border: "1px dashed #c7d4e0",
                      color: "#64748b",
                      fontSize: 13,
                      padding: "12px 10px",
                      background: "#f8fbfd",
                    }}
                  >
                    Sin pedidos
                  </div>
                ) : (
                  column.orders.map(({ order, summary }, index) => {
                    const status = normalizeStatus(order.status);
                    const nextAction = getNextAction(order.status);
                    const orderId = toOrderId(order.id);
                    const isCardBusy = cardUpdating === orderId;
                    const phone = asString((order as Record<string, unknown>).customer_phone);
                    const paymentMethod = paymentMethodLabel((order as Record<string, unknown>).payment_method);
                    const typeStyle = orderTypeStyle(order.order_type);

                    return (
                      <article
                        key={`${orderId || "order"}-${asString(order.created_at) || "na"}-${index}`}
                        onClick={() => setSelectedOrderId(orderId)}
                        style={{
                          border: status === "pending" ? "1.5px solid #fdba74" : "1px solid #dbe4ee",
                          borderRadius: 14,
                          background: "#fff",
                          padding: 12,
                          display: "grid",
                          gap: 10,
                          boxShadow: status === "pending"
                            ? "0 8px 18px rgba(251, 146, 60, 0.16)"
                            : "0 3px 10px rgba(15, 23, 42, 0.06)",
                          animation: status === "pending" ? "aop-new-glow 2.2s ease-in-out infinite" : "none",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                          <div style={{ display: "grid", gap: 2 }}>
                            <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>
                              #{shortOrderId(orderId)}
                            </div>
                            <div style={{ fontSize: 12, color: "#64748b" }}>
                              {formatHour(order.created_at)} | <OrderElapsedTimer since={order.created_at} status={order.status} />
                            </div>
                          </div>
                          <span style={statusStyle(order.status)}>{statusLabel(order.status)}</span>
                        </div>

                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              borderRadius: 999,
                              border: `1px solid ${typeStyle.border}`,
                              background: typeStyle.background,
                              color: typeStyle.color,
                              padding: "3px 9px",
                              fontSize: 11,
                              fontWeight: 700,
                              textTransform: "uppercase",
                              letterSpacing: 0.3,
                            }}
                          >
                            {orderTypeLabel(order.order_type)}
                          </span>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              borderRadius: 999,
                              border: "1px solid #cbd5e1",
                              background: "#f8fafc",
                              color: "#334155",
                              padding: "3px 9px",
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            {paymentMethod}
                          </span>
                          {order.source === "qr_table" && (
                            <span style={{ display: "inline-flex", alignItems: "center", borderRadius: 999, border: "1px solid rgba(96,165,250,0.4)", background: "rgba(96,165,250,0.1)", color: "#2563eb", padding: "3px 9px", fontSize: 11, fontWeight: 700 }}>
                              Mesa QR
                            </span>
                          )}
                        </div>

                        <div style={{ display: "grid", gap: 3 }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                            {asString(order.customer_name) || "Sin nombre"}
                          </div>
                          <div style={{ fontSize: 13, color: "#64748b" }}>
                            {phone || "Telefono no disponible"}
                          </div>
                        </div>

                        <div
                          style={{
                            fontSize: 13,
                            color: "#475569",
                            lineHeight: 1.4,
                            borderRadius: 10,
                            padding: "8px 10px",
                            background: "#f8fafc",
                            border: "1px solid #e2e8f0",
                          }}
                        >
                          {summary}
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <strong style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", letterSpacing: -0.4 }}>
                            {formatMoney(asNumber(order.total))}
                          </strong>
                          {nextAction ? (
                            <button
                              className="aop-order-primary"
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void quickUpdateStatus(orderId, nextAction.value);
                              }}
                              disabled={isCardBusy}
                              style={{
                                background: "#0f172a",
                                color: "#fff",
                                border: "none",
                                borderRadius: 10,
                                padding: "10px 13px",
                                fontSize: 13,
                                fontWeight: 700,
                                cursor: isCardBusy ? "not-allowed" : "pointer",
                                opacity: isCardBusy ? 0.7 : 1,
                                transition: "all 140ms ease",
                                minHeight: 38,
                              }}
                            >
                              {isCardBusy ? "..." : nextAction.label}
                            </button>
                          ) : null}
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                          <button
                            className="aop-order-action"
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedOrderId(orderId);
                            }}
                            style={{
                              background: "#ffffff",
                              color: "#334155",
                              border: "1px solid #dbe2ea",
                              borderRadius: 10,
                              padding: "9px 8px",
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: "pointer",
                              minHeight: 36,
                            }}
                          >
                            Ver
                          </button>
                          <button
                            className="aop-order-action"
                            type="button"
                            title="Imprimir ticket cliente"
                            onClick={(e) => {
                              e.stopPropagation();
                              const enriched = enrichedOrders.find((en) => en.order.id === orderId);
                              void printOrder(
                                orderToTicketData(order, enriched?.items ?? [], restaurantName ?? ""),
                                "customer"
                              );
                            }}
                            style={{
                              background: "#ffffff",
                              color: "#475569",
                              border: "1px solid #dbe2ea",
                              borderRadius: 10,
                              padding: "9px 8px",
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: "pointer",
                              minHeight: 36,
                            }}
                          >
                            Ticket
                          </button>
                          <button
                            className="aop-order-action"
                            type="button"
                            title="Imprimir comanda cocina"
                            onClick={(e) => {
                              e.stopPropagation();
                              const enriched = enrichedOrders.find((en) => en.order.id === orderId);
                              void printOrder(
                                orderToTicketData(order, enriched?.items ?? [], restaurantName ?? ""),
                                "kitchen"
                              );
                            }}
                            style={{
                              background: "#ffffff",
                              color: "#475569",
                              border: "1px solid #dbe2ea",
                              borderRadius: 10,
                              padding: "9px 8px",
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: "pointer",
                              minHeight: 36,
                            }}
                          >
                            Cocina
                          </button>
                        </div>

                        {/* WhatsApp — contact customer (only if phone available) */}
                        {phone ? (
                          <button
                            type="button"
                            title="Contactar cliente por WhatsApp"
                            onClick={(e) => {
                              e.stopPropagation();
                              const enriched = enrichedOrders.find((en) => en.order.id === orderId);
                              const waItems =
                                enriched?.items.map((i) => ({ name: i.name, quantity: i.qty })) ?? [];
                              const msg = buildAdminNotificationMessage(
                                {
                                  id: orderId,
                                  customer_name: asString(order.customer_name),
                                  customer_phone: phone,
                                  total: asNumber(order.total),
                                  order_type: asString(order.order_type),
                                  items: waItems,
                                },
                                restaurantName ?? ""
                              );
                              window.open(
                                buildWhatsAppLink(phone, msg),
                                "_blank",
                                "noopener,noreferrer"
                              );
                            }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 6,
                              width: "100%",
                              background: "#f0fdf4",
                              color: "#166534",
                              border: "1px solid #86efac",
                              borderRadius: 10,
                              padding: "7px 8px",
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: "pointer",
                              minHeight: 34,
                              transition: "all 140ms ease",
                            }}
                          >
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                            </svg>
                            WhatsApp cliente
                          </button>
                        ) : null}
                      </article>
                    );
                  })
                )}
              </section>
            ))}
          </div>
        </div>
      ) : null}

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
            {/* Close */}
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
              x
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
                  <OrderElapsedTimer since={selectedOrder.order.created_at} status={selectedOrder.order.status} />
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

      {/* ���� Toast stack ���� */}
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

