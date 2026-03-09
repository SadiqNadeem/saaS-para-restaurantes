import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useOrderRinger } from "../../admin/hooks/useOrderRinger";
import type { OrderStatus } from "../../constants/orderStatus";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../../restaurant/RestaurantContext";
import { usePosRealtimeCtx } from "../PosRealtimeContext";
import type { PosRealtimeOrder } from "../PosRealtimeContext";
import { usePosRole } from "../hooks/usePosRole";
import { printKitchenTicket, printPosTicket } from "../services/posPrintService";
import type { PosTicketData } from "../services/posPrintService";

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type PosOrderItem = PosRealtimeOrder["order_items"][number];
type PosOrder = PosRealtimeOrder;

type StatusFilter = OrderStatus | "all";
type SourceFilter = "all" | "pos" | "web" | "qr_table";

type CollectModal = {
  orderId: string;
  total: number;
};

type OrderDetailItemModifier = {
  option_name: string | null;
  price: number | null;
};

type OrderDetailItem = {
  id: string;
  product_id: string | null;
  qty: number;
  snapshot_name: string | null;
  unit_price: number | null;
  line_total: number | null;
  notes: string | null;
  order_item_modifier_options?: OrderDetailItemModifier[] | null;
};

type OrderDetail = {
  id: string;
  created_at: string | null;
  status: OrderStatus | null;
  order_type: string | null;
  source: string | null;
  total: number | null;
  subtotal: number | null;
  tip_amount: number | null;
  delivery_fee: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  payment_method: string | null;
  payment_status: string | null;
  notes: string | null;
  table_id: string | null;
  table_name: string | null;
  order_items: OrderDetailItem[];
};

type PickerCategory = {
  id: string;
  name: string;
  sort_order: number | null;
};

type PickerProduct = {
  id: string;
  name: string;
  price: number;
  category_id: string;
};

const PANEL_WIDTH = 380;

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const STATUS_TABS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "pending", label: "Pendiente" },
  { value: "accepted", label: "Aceptado" },
  { value: "preparing", label: "Preparando" },
  { value: "ready", label: "Listo" },
  { value: "out_for_delivery", label: "Reparto" },
  { value: "delivered", label: "Entregado" },
  { value: "cancelled", label: "Cancelado" },
];

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pendiente",
  accepted: "Aceptado",
  preparing: "Preparando",
  ready: "Listo",
  out_for_delivery: "En reparto",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

const STATUS_CHIP: Record<OrderStatus, { bg: string; color: string }> = {
  pending: { bg: "rgba(251,191,36,0.15)", color: "#fbbf24" },
  accepted: { bg: "rgba(59,130,246,0.15)", color: "#60a5fa" },
  preparing: { bg: "rgba(168,85,247,0.15)", color: "#c084fc" },
  ready: { bg: "rgba(74,222,128,0.15)", color: "#4ade80" },
  out_for_delivery: { bg: "rgba(251,146,60,0.15)", color: "#fb923c" },
  delivered: { bg: "rgba(100,116,139,0.12)", color: "#94a3b8" },
  cancelled: { bg: "rgba(248,113,113,0.12)", color: "#f87171" },
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  dine_in: "MOSTRADOR",
  counter: "MOSTRADOR",
  pickup: "RECOGER",
  delivery: "DELIVERY",
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Efectivo",
  card_on_delivery: "Tarjeta",
  card_online: "Online",
  card: "Tarjeta",
};

const STATUS_ACTIONS: Array<{ value: OrderStatus; label: string }> = [
  { value: "pending", label: "Pendiente" },
  { value: "accepted", label: "Aceptado" },
  { value: "preparing", label: "Preparando" },
  { value: "ready", label: "Listo" },
  { value: "out_for_delivery", label: "Reparto" },
  { value: "delivered", label: "Entregado" },
  { value: "cancelled", label: "Cancelado" },
];

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function fmtEur(n: number | null | undefined): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(n ?? 0);
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDate(): string {
  return new Date().toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function fmtElapsedSince(iso: string | null | undefined): string {
  if (!iso) return "hace -- min";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return `hace ${hours}h ${rem} min`;
}

function normalizePhone(phone: string | null | undefined): string {
  return String(phone ?? "").replace(/[^\d+]/g, "");
}

function getDisplayOrderType(order: Pick<OrderDetail, "order_type" | "source" | "table_name">): string {
  if (order.table_name) return order.table_name;
  if (order.source === "qr_table") return "MESA QR";
  if (order.source === "pos" && (order.order_type ?? "").toLowerCase() === "dine_in") return "MOSTRADOR";
  return ORDER_TYPE_LABELS[order.order_type ?? ""] ?? (order.order_type?.toUpperCase() ?? "WEB");
}

function extractOrderNote(raw: string | null | undefined): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  if (!text.startsWith("{")) return text;
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const candidates = [
      parsed.customer_note,
      parsed.note,
      parsed.notes,
      parsed.instructions,
    ];
    const first = candidates.find((value) => typeof value === "string" && value.trim());
    return typeof first === "string" ? first.trim() : null;
  } catch {
    return text;
  }
}

function getNextStatus(status: OrderStatus | null): OrderStatus | null {
  switch (status) {
    case "pending":          return "accepted";
    case "accepted":         return "preparing";
    case "preparing":        return "ready";
    case "ready":            return "delivered";
    case "out_for_delivery": return "delivered";
    default:                 return null;
  }
}

function getNextLabel(status: OrderStatus | null): string {
  switch (status) {
    case "pending":          return "Aceptar";
    case "accepted":         return "Preparando";
    case "preparing":        return "Listo";
    case "ready":            return "Entregar";
    case "out_for_delivery": return "Entregado";
    default:                 return "";
  }
}

function isValidStatusFilter(v: string | null): v is StatusFilter {
  return (
    v === "all" || v === "pending" || v === "accepted" || v === "preparing" ||
    v === "ready" || v === "out_for_delivery" || v === "delivered" || v === "cancelled"
  );
}

function isValidSourceFilter(v: string | null): v is SourceFilter {
  return v === "all" || v === "pos" || v === "web" || v === "qr_table";
}

// â”€â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function PosOrdersPage() {
  const { restaurantId, name, menuPath } = useRestaurant();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { role } = usePosRole();
  const isStaff = role === "staff";
  const posBase = menuPath === "/" ? "/pos" : `${menuPath}/pos`;

  const {
    orders,
    loading,
    realtimeConnected,
    newWebOrderIds,
    patchOrder,
  } = usePosRealtimeCtx();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => {
    const p = searchParams.get("status");
    return isValidStatusFilter(p) ? p : "all";
  });
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>(() => {
    const p = searchParams.get("source");
    return isValidSourceFilter(p) ? p : "all";
  });
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showCierreCaja, setShowCierreCaja] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<OrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [showAddProducts, setShowAddProducts] = useState(false);
  const [addingProductId, setAddingProductId] = useState<string | null>(null);
  const [windowWidth, setWindowWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280
  );

  // FIX 3: Collect payment modal state
  const [collectModal, setCollectModal] = useState<CollectModal | null>(null);

  const { soundEnabled, isRinging, pendingCount, enableSound, muteCycle } =
    useOrderRinger({ restaurantId: restaurantId ?? "", orders });

  const updateOrderStatus = useCallback(
    async (order: PosOrder, newStatus: OrderStatus) => {
      setUpdatingId(order.id);
      setErrorMsg(null);

      const prevStatus = order.status;
      patchOrder(order.id, { status: newStatus });

      const { error } = await supabase.rpc("set_order_status_safe", {
        p_order_id: order.id,
        p_status: newStatus,
      });

      if (error) {
        console.error("[pos-orders] status update error", error);
        patchOrder(order.id, { status: prevStatus });
        setErrorMsg(String(error.message ?? "Error al actualizar estado"));
      }

      setUpdatingId(null);
    },
    [patchOrder]
  );

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const isMobile = windowWidth < 900;
  const panelOpen = Boolean(selectedOrderId);

  const loadOrderDetail = useCallback(
    async (orderId: string) => {
      setDetailLoading(true);
      setDetailError(null);

      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, created_at, status, order_type, source, total, subtotal, tip_amount, delivery_fee, customer_name, customer_phone, delivery_address, payment_method, payment_status, notes, table_id, order_items(id, product_id, qty, snapshot_name, unit_price, line_total, notes, order_item_modifier_options(option_name, price))"
        )
        .eq("id", orderId)
        .eq("restaurant_id", restaurantId)
        .maybeSingle();

      if (error || !data) {
        setSelectedDetail(null);
        setDetailError(error?.message ?? "No se pudo cargar el pedido.");
        setDetailLoading(false);
        return;
      }

      const row = data as unknown as Omit<OrderDetail, "table_name">;
      let tableName: string | null = null;
      if (row.table_id) {
        const tableRes = await supabase
          .from("restaurant_tables")
          .select("name")
          .eq("id", row.table_id)
          .maybeSingle();
        if (tableRes.data?.name) {
          tableName = String((tableRes.data as { name: string }).name);
        }
      }

      setSelectedDetail({
        ...row,
        table_name: tableName,
        order_items: Array.isArray(row.order_items) ? row.order_items : [],
      });
      setDetailLoading(false);
    },
    [restaurantId]
  );

  useEffect(() => {
    if (!selectedOrderId) {
      setSelectedDetail(null);
      setDetailError(null);
      return;
    }
    void loadOrderDetail(selectedOrderId);
  }, [loadOrderDetail, selectedOrderId]);

  useEffect(() => {
    if (!selectedOrderId) return;
    const fromList = orders.find((order) => order.id === selectedOrderId);
    if (!fromList) return;
    setSelectedDetail((prev) => (prev ? { ...prev, status: fromList.status } : prev));
  }, [orders, selectedOrderId]);

  const handleReprint = useCallback(
    async (order: PosOrder) => {
      try {
        type CashRow = {
          cash_given?: number | null;
          change_due?: number | null;
          delivery_fee?: number | null;
          subtotal?: number | null;
        };
        const { data } = await supabase
          .from("orders")
          .select("cash_given, change_due, delivery_fee, subtotal")
          .eq("id", order.id)
          .maybeSingle();
        const extra = data as CashRow | null;

        const ticketData: PosTicketData = {
          orderId: order.id,
          createdAt: order.created_at,
          restaurantName: name ?? "Restaurante",
          orderType: order.order_type,
          customerName: order.customer_name,
          paymentMethod: order.payment_method,
          cashGiven: extra?.cash_given ?? null,
          changeDue: extra?.change_due ?? null,
          subtotal: extra?.subtotal ?? order.total ?? 0,
          deliveryFee: extra?.delivery_fee ?? 0,
          total: order.total ?? 0,
          items: order.order_items.map((item) => ({
            qty: item.qty,
            name: item.snapshot_name ?? "Producto",
            unitPrice: item.unit_price ?? 0,
          })),
        };

        await printPosTicket(ticketData);
      } catch (err) {
        setErrorMsg(
          String((err as { message?: unknown })?.message ?? "Error al imprimir")
        );
      }
    },
    [name]
  );

  const handleReprintKitchen = useCallback(
    async (order: PosOrder) => {
      try {
        const ticketData: PosTicketData = {
          orderId: order.id,
          createdAt: order.created_at,
          restaurantName: name ?? "Restaurante",
          orderType: order.order_type,
          customerName: order.customer_name,
          paymentMethod: order.payment_method,
          cashGiven: null,
          changeDue: null,
          subtotal: order.total ?? 0,
          deliveryFee: 0,
          total: order.total ?? 0,
          items: order.order_items.map((item) => ({
            qty: item.qty,
            name: item.snapshot_name ?? "Producto",
            unitPrice: item.unit_price ?? 0,
          })),
        };
        await printKitchenTicket(ticketData);
      } catch (err) {
        setErrorMsg(
          String((err as { message?: unknown })?.message ?? "Error al imprimir cocina")
        );
      }
    },
    [name]
  );

  // FIX 3: Collect payment handler
  const handleCollectPayment = useCallback(
    async (orderId: string, method: "cash" | "card") => {
      const paymentMethod = method === "card" ? "card_on_delivery" : "cash";

      const { error } = await supabase
        .from("orders")
        .update({ payment_status: "paid", payment_method: paymentMethod })
        .eq("id", orderId)
        .eq("restaurant_id", restaurantId);

      if (error) {
        setErrorMsg(String(error.message ?? "Error al registrar el cobro"));
        return;
      }

      patchOrder(orderId, { payment_status: "paid", payment_method: paymentMethod });
      setCollectModal(null);
    },
    [restaurantId, patchOrder]
  );

  const handleAddProductToOrder = useCallback(
    async (product: PickerProduct) => {
      if (!selectedOrderId || !restaurantId || !selectedDetail) return;
      setAddingProductId(product.id);
      setErrorMsg(null);

      const { data: inserted, error: insertErr } = await supabase
        .from("order_items")
        .insert({
          order_id: selectedOrderId,
          restaurant_id: restaurantId,
          product_id: product.id,
          qty: 1,
          base_price: product.price,
          extras_total: 0,
          final_unit_price: product.price,
          unit_price: product.price,
          line_total: product.price,
          snapshot_name: product.name,
          notes: null,
          sent_to_kitchen: false,
        })
        .select("id, product_id, qty, snapshot_name, unit_price, line_total, notes")
        .single();

      if (insertErr || !inserted) {
        setErrorMsg(String(insertErr?.message ?? "No se pudo aÃ±adir el producto."));
        setAddingProductId(null);
        return;
      }

      const { data: totalsRows } = await supabase
        .from("order_items")
        .select("line_total")
        .eq("order_id", selectedOrderId);
      const subtotal = (totalsRows ?? []).reduce(
        (sum, row) => sum + Number((row as { line_total?: number | null }).line_total ?? 0),
        0
      );
      const total = subtotal + (selectedDetail.tip_amount ?? 0) + (selectedDetail.delivery_fee ?? 0);

      const { error: updateErr } = await supabase
        .from("orders")
        .update({ subtotal, total })
        .eq("id", selectedOrderId)
        .eq("restaurant_id", restaurantId);

      if (updateErr) {
        setErrorMsg(String(updateErr.message ?? "No se pudo recalcular total."));
        setAddingProductId(null);
        return;
      }

      const detailItem: OrderDetailItem = {
        id: String((inserted as { id: string }).id),
        product_id: String((inserted as { product_id: string | null }).product_id ?? ""),
        qty: Number((inserted as { qty: number }).qty),
        snapshot_name: String((inserted as { snapshot_name: string | null }).snapshot_name ?? "Producto"),
        unit_price: Number((inserted as { unit_price: number | null }).unit_price ?? product.price),
        line_total: Number((inserted as { line_total: number | null }).line_total ?? product.price),
        notes: null,
        order_item_modifier_options: [],
      };

      setSelectedDetail((prev) =>
        prev
          ? {
              ...prev,
              subtotal,
              total,
              order_items: [...prev.order_items, detailItem],
            }
          : prev
      );

      const liveOrder = orders.find((order) => order.id === selectedOrderId);
      patchOrder(selectedOrderId, {
        total,
        order_items: [
          ...(liveOrder?.order_items ?? []),
          {
            id: detailItem.id,
            qty: detailItem.qty,
            snapshot_name: detailItem.snapshot_name,
            unit_price: detailItem.unit_price,
            line_total: detailItem.line_total,
          },
        ],
      });

      setAddingProductId(null);
      setShowAddProducts(false);
    },
    [orders, patchOrder, restaurantId, selectedDetail, selectedOrderId]
  );

  const filteredOrders = useMemo(() => {
    let list = orders;
    if (statusFilter !== "all") {
      list = list.filter((o) => o.status === statusFilter);
    }
    if (sourceFilter === "pos") {
      list = list.filter((o) => o.source === "pos");
    } else if (sourceFilter === "qr_table") {
      list = list.filter((o) => o.source === "qr_table");
    } else if (sourceFilter === "web") {
      list = list.filter((o) => o.source !== "pos" && o.source !== "qr_table");
    }
    return list;
  }, [orders, statusFilter, sourceFilter]);

  const deliveredOrders = useMemo(
    () => orders.filter((o) => o.status === "delivered"),
    [orders]
  );
  const todayRevenue = useMemo(
    () => deliveredOrders.reduce((sum, o) => sum + (o.total ?? 0), 0),
    [deliveredOrders]
  );
  const activeOrders = useMemo(
    () => orders.filter((o) => o.status !== "cancelled"),
    [orders]
  );
  const avgTicket = useMemo(
    () =>
      activeOrders.length === 0
        ? 0
        : activeOrders.reduce((sum, o) => sum + (o.total ?? 0), 0) /
          activeOrders.length,
    [activeOrders]
  );

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <div style={s.root}>

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• HEADER â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <h1 style={s.headerTitle}>Pedidos de hoy</h1>
          <span style={s.headerDate}>{fmtDate()}</span>
        </div>
        <div style={s.headerRight}>
          <div style={s.statPill}>
            <span style={s.statVal}>{orders.length}</span>
            <span style={s.statLbl}>pedidos</span>
          </div>
          {/* FIX 4: hide revenue stats for staff */}
          {!isStaff && (
            <>
              <div style={s.statPill}>
                <span style={s.statVal}>{fmtEur(todayRevenue)}</span>
                <span style={s.statLbl}>entregados</span>
              </div>
              <div style={s.statPill}>
                <span style={s.statVal}>{fmtEur(avgTicket)}</span>
                <span style={s.statLbl}>ticket medio</span>
              </div>
            </>
          )}
          <div style={s.rtBadge} title={realtimeConnected ? "Tiempo real activo" : "Reconectando..."}>
            <span style={realtimeConnected ? s.rtDotOn : s.rtDotOff} />
            <span style={s.rtLabel}>{realtimeConnected ? "En vivo" : "..."}</span>
          </div>
          <button
            type="button"
            style={s.cierreBtn}
            onClick={() => setShowCierreCaja(true)}
          >
            Cerrar caja
          </button>
        </div>
      </div>

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• FILTER BAR â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <div style={s.filterBar}>
        <div style={s.tabRow}>
          {STATUS_TABS.map((tab) => {
            const count =
              tab.value === "all"
                ? orders.length
                : orders.filter((o) => o.status === tab.value).length;
            return (
              <button
                key={tab.value}
                type="button"
                style={statusFilter === tab.value ? s.tabActive : s.tab}
                onClick={() => setStatusFilter(tab.value)}
              >
                {tab.label}
                <span style={statusFilter === tab.value ? s.tabCountActive : s.tabCount}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div style={s.pillRow}>
          <div style={s.pillGroup}>
            {(["all", "pos", "qr_table", "web"] as const).map((src) => (
              <button
                key={src}
                type="button"
                style={sourceFilter === src ? s.pillActive : s.pill}
                onClick={() => setSourceFilter(src)}
              >
                {src === "all" ? "Todos" : src === "qr_table" ? "Mesa QR" : src.toUpperCase()}
              </button>
            ))}
          </div>

          <div style={s.soundArea}>
            {!soundEnabled ? (
              <button type="button" style={s.soundBtn} onClick={() => void enableSound()}>
                ðŸ”” Activar alertas
              </button>
            ) : isRinging ? (
              <button type="button" style={s.muteBtn} onClick={muteCycle}>
                ðŸ”” Silenciar Â· {pendingCount} pendiente{pendingCount !== 1 ? "s" : ""}
              </button>
            ) : (
              <span style={s.soundOn}>ðŸ”” Alertas activas</span>
            )}
          </div>
        </div>
      </div>

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• ERROR BANNER â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {errorMsg && (
        <div style={s.errorBar}>
          <span>{errorMsg}</span>
          <button
            type="button"
            style={s.errorClose}
            onClick={() => setErrorMsg(null)}
          >
            Ã—
          </button>
        </div>
      )}

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• ORDERS â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <div style={s.content}>
        <div style={{ ...s.ordersPane, paddingRight: !isMobile && panelOpen ? PANEL_WIDTH + 16 : 0 }}>
          {loading ? (
            <div style={s.centered}>Cargando pedidos...</div>
          ) : filteredOrders.length === 0 ? (
            <div style={s.centered}>
              {orders.length === 0
                ? "No hay pedidos hoy todavÃ­a"
                : "No hay pedidos con estos filtros"}
            </div>
          ) : (
            <div style={s.grid}>
              {filteredOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  isNew={newWebOrderIds.has(order.id)}
                  isUpdating={updatingId === order.id}
                  onAdvance={(ns) => void updateOrderStatus(order, ns)}
                  onReprint={() => void handleReprint(order)}
                  onReprintKitchen={() => void handleReprintKitchen(order)}
                  onCollect={() => setCollectModal({ orderId: order.id, total: order.total ?? 0 })}
                  onOpenDetail={() => setSelectedOrderId(order.id)}
                />
              ))}
            </div>
          )}
        </div>

        {panelOpen && (
          <div
            style={isMobile ? s.mobilePanelBackdrop : s.panelBackdrop}
            onClick={() => {
              setSelectedOrderId(null);
              setShowAddProducts(false);
            }}
          />
        )}

        <aside
          style={{
            ...(isMobile ? s.mobilePanel : s.detailPanel),
            transform: panelOpen ? "translateX(0)" : "translateX(100%)",
          }}
        >
          <OrderDetailPanel
            detail={selectedDetail}
            loading={detailLoading}
            error={detailError}
            updatingId={updatingId}
            onClose={() => {
              setSelectedOrderId(null);
              setShowAddProducts(false);
            }}
            onStatusChange={(status) => {
              if (!selectedDetail) return;
              const sourceOrder = orders.find((item) => item.id === selectedDetail.id);
              if (!sourceOrder) return;
              void updateOrderStatus(sourceOrder, status);
            }}
            onReprint={() => {
              if (!selectedDetail) return;
              const sourceOrder = orders.find((item) => item.id === selectedDetail.id);
              if (!sourceOrder) return;
              void handleReprint(sourceOrder);
            }}
            onKitchen={() => {
              if (!selectedDetail) return;
              const sourceOrder = orders.find((item) => item.id === selectedDetail.id);
              if (!sourceOrder) return;
              void handleReprintKitchen(sourceOrder);
            }}
            onGoTable={() => {
              if (!selectedDetail?.table_id) return;
              navigate(`${posBase}/tables/${selectedDetail.table_id}`);
            }}
            onAcceptNow={() => {
              if (!selectedDetail) return;
              const sourceOrder = orders.find((item) => item.id === selectedDetail.id);
              if (!sourceOrder) return;
              void updateOrderStatus(sourceOrder, "accepted");
            }}
            onOpenAddProducts={() => setShowAddProducts(true)}
          />
        </aside>
      </div>
      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• CERRAR CAJA MODAL â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {showCierreCaja && (
        <CierreCajaModal
          orders={orders}
          restaurantId={restaurantId ?? ""}
          onClose={() => setShowCierreCaja(false)}
        />
      )}

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• FIX 3: COBRAR AHORA MODAL â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {collectModal && (
        <CollectPaymentModal
          orderId={collectModal.orderId}
          total={collectModal.total}
          onConfirm={handleCollectPayment}
          onClose={() => setCollectModal(null)}
        />
      )}
      {showAddProducts && selectedDetail && selectedDetail.status !== "delivered" && selectedDetail.status !== "cancelled" && (
        <AddProductsModal
          restaurantId={restaurantId ?? ""}
          addingProductId={addingProductId}
          onAdd={handleAddProductToOrder}
          onClose={() => setShowAddProducts(false)}
        />
      )}
    </div>
  );
}


type OrderDetailPanelProps = {
  detail: OrderDetail | null;
  loading: boolean;
  error: string | null;
  updatingId: string | null;
  onClose: () => void;
  onStatusChange: (status: OrderStatus) => void;
  onReprint: () => void;
  onKitchen: () => void;
  onGoTable: () => void;
  onAcceptNow: () => void;
  onOpenAddProducts: () => void;
};

function OrderDetailPanel({
  detail,
  loading,
  error,
  updatingId,
  onClose,
  onStatusChange,
  onReprint,
  onKitchen,
  onGoTable,
  onAcceptNow,
  onOpenAddProducts,
}: OrderDetailPanelProps) {
  const [elapsedLabel, setElapsedLabel] = useState("hace -- min");

  useEffect(() => {
    if (!detail?.created_at) return;
    const update = () => setElapsedLabel(fmtElapsedSince(detail.created_at));
    update();
    const id = window.setInterval(update, 60_000);
    return () => window.clearInterval(id);
  }, [detail?.created_at]);

  if (loading) {
    return <div style={dp.loading}>Cargando detalle...</div>;
  }
  if (error) {
    return <div style={dp.error}>{error}</div>;
  }
  if (!detail) {
    return <div style={dp.empty}>Selecciona un pedido</div>;
  }

  const phone = normalizePhone(detail.customer_phone);
  const isPending = detail.status === "pending";
  const isClosed = detail.status === "delivered" || detail.status === "cancelled";
  const note = extractOrderNote(detail.notes);
  const subtotal =
    detail.subtotal ??
    detail.order_items.reduce((sum, item) => sum + (item.line_total ?? (item.unit_price ?? 0) * item.qty), 0);
  const tip = detail.tip_amount ?? 0;
  const deliveryFee = detail.delivery_fee ?? 0;
  const total = detail.total ?? subtotal + tip + deliveryFee;
  const canGoTable = Boolean(detail.table_id);
  const typeBadge = getDisplayOrderType(detail);
  const sourceBadge =
    detail.source === "pos" ? "POS" : detail.source === "qr_table" ? "QR" : "WEB";
  const sourceBadgeStyle =
    detail.source === "pos"
      ? dp.sourcePos
      : detail.source === "qr_table"
        ? dp.sourceQr
        : dp.sourceWeb;

  return (
    <div style={dp.root}>
      <div style={dp.head}>
        <div style={{ minWidth: 0 }}>
          <div style={dp.orderNumber}>#{detail.id.slice(-6).toUpperCase()}</div>
          <div style={dp.badges}>
            <span style={dp.typeBadge}>{typeBadge}</span>
            <span style={sourceBadgeStyle}>{sourceBadge}</span>
          </div>
          <div style={dp.elapsed}>{elapsedLabel}</div>
        </div>
        <button type="button" style={dp.close} onClick={onClose}>
          X
        </button>
      </div>

      <div style={dp.body}>
        <section style={dp.section}>
          <div style={dp.sectionTitle}>Estado</div>
          <div style={dp.statusGrid}>
            {STATUS_ACTIONS.map((entry) => {
              const active = detail.status === entry.value;
              const disabled = updatingId === detail.id;
              return (
                <button
                  key={entry.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => onStatusChange(entry.value)}
                  style={{
                    ...dp.statusBtn,
                    ...(active ? dp.statusBtnActive : {}),
                    ...(disabled ? dp.statusBtnDisabled : {}),
                  }}
                >
                  {entry.label}
                </button>
              );
            })}
          </div>
        </section>

        <section style={dp.section}>
          <div style={dp.sectionTitle}>Productos</div>
          <div style={dp.itemsList}>
            {detail.order_items.map((item) => {
              const lineTotal = item.line_total ?? (item.unit_price ?? 0) * item.qty;
              return (
                <div key={item.id} style={dp.itemCard}>
                  <div style={dp.itemTop}>
                    <span style={dp.itemName}>
                      {item.qty}x {item.snapshot_name ?? "Producto"}
                    </span>
                    <span style={dp.itemTotal}>{fmtEur(lineTotal)}</span>
                  </div>
                  <div style={dp.itemSub}>
                    <span>{fmtEur(item.unit_price ?? 0)} / ud</span>
                  </div>
                  {item.order_item_modifier_options && item.order_item_modifier_options.length > 0 && (
                    <div style={dp.itemMods}>
                      {item.order_item_modifier_options
                        .map((mod) => mod.option_name)
                        .filter(Boolean)
                        .join(", ")}
                    </div>
                  )}
                  {item.notes ? <div style={dp.itemMods}>Nota: {item.notes}</div> : null}
                </div>
              );
            })}
          </div>
          <div style={dp.totals}>
            <div style={dp.totalRow}><span>Subtotal</span><strong>{fmtEur(subtotal)}</strong></div>
            {tip > 0 && <div style={dp.totalRow}><span>Propina</span><strong>{fmtEur(tip)}</strong></div>}
            {deliveryFee > 0 && <div style={dp.totalRow}><span>Entrega</span><strong>{fmtEur(deliveryFee)}</strong></div>}
            <div style={dp.totalRowMain}><span>TOTAL</span><strong>{fmtEur(total)}</strong></div>
          </div>
        </section>

        <section style={dp.section}>
          <div style={dp.sectionTitle}>Cliente</div>
          <div style={dp.infoRow}><span>Nombre</span><strong>{detail.customer_name || "Sin nombre"}</strong></div>
          <div style={dp.infoRow}>
            <span>Teléfono</span>
            {phone ? (
              <div style={{ display: "flex", gap: 8 }}>
                <a href={`tel:${phone}`} style={dp.infoLink}>{phone}</a>
                <a href={`https://wa.me/${phone.replace(/^\+/, "")}`} target="_blank" rel="noreferrer" style={dp.infoLink}>WhatsApp</a>
              </div>
            ) : (
              <strong>-</strong>
            )}
          </div>
          <div style={dp.infoRow}><span>Tipo</span><strong>{getDisplayOrderType(detail)}</strong></div>
          {detail.order_type === "delivery" ? (
            <div style={dp.infoRow}><span>Dirección</span><strong>{detail.delivery_address || "-"}</strong></div>
          ) : null}
          <div style={dp.infoRow}>
            <span>Pago</span>
            <strong>
              {PAYMENT_LABELS[detail.payment_method ?? ""] ?? detail.payment_method ?? "-"} · {detail.payment_status ?? "pendiente"}
            </strong>
          </div>
          {note ? <div style={dp.note}>{note}</div> : null}
        </section>
      </div>

      <div style={dp.footer}>
        {!isClosed && (
          <button type="button" style={dp.addProductsBtn} onClick={onOpenAddProducts}>
            + Añadir productos
          </button>
        )}
        <button type="button" style={dp.actionBtn} onClick={onReprint}>
          Reimprimir ticket
        </button>
        <button type="button" style={dp.actionBtn} onClick={onKitchen}>
          Ticket cocina
        </button>
        {canGoTable && (
          <button type="button" style={dp.actionBtn} onClick={onGoTable}>
            Ir a mesa {"->"}
          </button>
        )}
        {isPending && (
          <button type="button" style={dp.acceptBtn} disabled={updatingId === detail.id} onClick={onAcceptNow}>
            Aceptar pedido
          </button>
        )}
      </div>
    </div>
  );
}

type AddProductsModalProps = {
  restaurantId: string;
  addingProductId: string | null;
  onAdd: (product: PickerProduct) => Promise<void>;
  onClose: () => void;
};

function AddProductsModal({ restaurantId, addingProductId, onAdd, onClose }: AddProductsModalProps) {
  const [categories, setCategories] = useState<PickerCategory[]>([]);
  const [products, setProducts] = useState<PickerProduct[]>([]);
  const [activeCat, setActiveCat] = useState<string | "all">("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      const [cats, prods] = await Promise.all([
        supabase
          .from("categories")
          .select("id, name, sort_order")
          .eq("restaurant_id", restaurantId)
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        supabase
          .from("products")
          .select("id, name, price, category_id")
          .eq("restaurant_id", restaurantId)
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
      ]);
      if (!alive) return;
      setCategories((cats.data ?? []) as PickerCategory[]);
      setProducts(
        ((prods.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
          id: String(row.id ?? ""),
          name: String(row.name ?? "Producto"),
          price: Number(row.price ?? 0),
          category_id: String(row.category_id ?? ""),
        }))
      );
      setLoading(false);
    };
    void load();
    return () => {
      alive = false;
    };
  }, [restaurantId]);

  const visible = useMemo(
    () => (activeCat === "all" ? products : products.filter((product) => product.category_id === activeCat)),
    [activeCat, products]
  );

  return (
    <div style={apm.overlay} onClick={onClose}>
      <div style={apm.modal} onClick={(event) => event.stopPropagation()}>
        <div style={apm.head}>
          <h3 style={apm.title}>Añadir productos</h3>
          <button type="button" style={apm.close} onClick={onClose}>X</button>
        </div>
        <div style={apm.catRow}>
          <button type="button" style={activeCat === "all" ? apm.catActive : apm.cat} onClick={() => setActiveCat("all")}>
            Todos
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              style={activeCat === cat.id ? apm.catActive : apm.cat}
              onClick={() => setActiveCat(cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </div>
        <div style={apm.grid}>
          {loading ? (
            <div style={apm.centered}>Cargando...</div>
          ) : visible.length === 0 ? (
            <div style={apm.centered}>No hay productos</div>
          ) : (
            visible.map((product) => (
              <button
                key={product.id}
                type="button"
                disabled={addingProductId === product.id}
                style={apm.productBtn}
                onClick={() => void onAdd(product)}
              >
                <span style={apm.productName}>{product.name}</span>
                <span style={apm.productPrice}>
                  {addingProductId === product.id ? "Añadiendo..." : fmtEur(product.price)}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
// â”€â”€â”€ FIX 3: Collect Payment Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type CollectPaymentModalProps = {
  orderId: string;
  total: number;
  onConfirm: (orderId: string, method: "cash" | "card") => Promise<void>;
  onClose: () => void;
};

function CollectPaymentModal({ orderId, total, onConfirm, onClose }: CollectPaymentModalProps) {
  const [method, setMethod] = useState<"cash" | "card">("cash");
  const [cashGiven, setCashGiven] = useState("");
  const [saving, setSaving] = useState(false);

  const cashNum = parseFloat(cashGiven);
  const change =
    method === "cash" && Number.isFinite(cashNum) && cashNum >= total && cashNum > 0
      ? cashNum - total
      : null;

  const handleConfirm = async () => {
    setSaving(true);
    await onConfirm(orderId, method);
    setSaving(false);
  };

  const shortId = orderId.slice(-6).toUpperCase();

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 3000,
        background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 16,
          padding: "24px 28px", minWidth: 320, maxWidth: 420,
          boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
          display: "flex", flexDirection: "column", gap: 16,
          color: TEXT, fontFamily: "system-ui, -apple-system, sans-serif",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>
            ðŸ’° Cobrar pedido #{shortId}
          </h2>
          <button type="button" onClick={onClose}
            style={{ border: "none", background: "transparent", color: MUTED, fontSize: 22, cursor: "pointer" }}>
            Ã—
          </button>
        </div>

        <div style={{ fontSize: 22, fontWeight: 800, color: G, textAlign: "center" }}>
          {fmtEur(total)}
        </div>

        {/* Payment method */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setMethod("cash")}
            style={{
              flex: 1, padding: "12px", borderRadius: 8, cursor: "pointer",
              border: method === "cash" ? `1px solid ${G}` : `1px solid ${BORDER}`,
              background: method === "cash" ? "rgba(74,222,128,0.10)" : BG,
              color: method === "cash" ? G : SEC,
              fontWeight: 700, fontSize: 13,
            }}
          >
            Efectivo
          </button>
          <button
            type="button"
            onClick={() => setMethod("card")}
            style={{
              flex: 1, padding: "12px", borderRadius: 8, cursor: "pointer",
              border: method === "card" ? `1px solid ${G}` : `1px solid ${BORDER}`,
              background: method === "card" ? "rgba(74,222,128,0.10)" : BG,
              color: method === "card" ? G : SEC,
              fontWeight: 700, fontSize: 13,
            }}
          >
            Tarjeta
          </button>
        </div>

        {method === "cash" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.07em" }}>
              Entrega cliente
            </div>
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder="0.00 â‚¬"
              value={cashGiven}
              onChange={(e) => setCashGiven(e.target.value)}
              style={{
                padding: "10px 12px", borderRadius: 8,
                border: `1px solid ${BORDER}`, background: BG, color: TEXT,
                fontSize: 16, fontWeight: 600, width: "100%", boxSizing: "border-box",
              }}
              autoFocus
            />
            {change !== null && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 700 }}>
                <span style={{ color: SEC }}>Cambio</span>
                <span style={{ color: G }}>{fmtEur(change)}</span>
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={saving}
            style={{
              flex: 1, padding: "14px", borderRadius: 10, border: "none",
              background: saving ? "#1a2540" : G,
              color: saving ? BORDER : "#052e16",
              fontSize: 15, fontWeight: 800, cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Guardando..." : "Confirmar cobro"}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "14px 18px", borderRadius: 10,
              border: `1px solid ${BORDER}`, background: "transparent",
              color: SEC, fontSize: 14, fontWeight: 600, cursor: "pointer",
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ Cerrar Caja Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type CierreCajaModalProps = {
  orders: PosOrder[];
  restaurantId: string;
  onClose: () => void;
};

function CierreCajaModal({ orders, restaurantId, onClose }: CierreCajaModalProps) {
  const nonCancelled = orders.filter((o) => o.status !== "cancelled");
  const posOrders = nonCancelled.filter((o) => o.source === "pos");
  const webOrders = nonCancelled.filter((o) => o.source !== "pos");

  const revenueByPayment: Record<string, number> = {};
  for (const o of nonCancelled) {
    const pm = o.payment_method ?? "unknown";
    revenueByPayment[pm] = (revenueByPayment[pm] ?? 0) + (o.total ?? 0);
  }

  const countByStatus: Partial<Record<OrderStatus, number>> = {};
  for (const o of orders) {
    if (o.status) {
      countByStatus[o.status] = (countByStatus[o.status] ?? 0) + 1;
    }
  }

  const totalRevenue = nonCancelled.reduce((s, o) => s + (o.total ?? 0), 0);

  const PAYMENT_LABEL_MAP: Record<string, string> = {
    cash: "Efectivo",
    card_on_delivery: "Tarjeta (entrega)",
    card_online: "Tarjeta (online)",
    card: "Tarjeta",
  };

  const [countedCash, setCountedCash] = useState("");
  const [countedCard, setCountedCard] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSaveCierre = async () => {
    setSaving(true);
    setSaveError(null);
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.rpc("admin_close_cash", {
      p_restaurant_id: restaurantId,
      p_day: today,
      p_counted_cash: countedCash !== "" ? Number(countedCash) : 0,
      p_counted_card: countedCard !== "" ? Number(countedCard) : 0,
      p_notes: notes || null,
    });
    setSaving(false);
    if (error) {
      const msg = error.message.includes("ALREADY_CLOSED")
        ? "Ya existe un cierre para hoy."
        : `Error: ${error.message}`;
      setSaveError(msg);
    } else {
      setSavedOk(true);
    }
  };

  const inputSt: React.CSSProperties = {
    background: "rgba(241,245,249,0.06)",
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 14,
    color: TEXT,
    width: "100%",
    boxSizing: "border-box",
    outline: "none",
  };

  const handlePrint = () => {
    const rows = (Object.entries(revenueByPayment) as [string, number][])
      .map(([pm, amt]) =>
        `<tr><td>${PAYMENT_LABEL_MAP[pm] ?? pm}</td><td style="text-align:right">${amt.toFixed(2)}â‚¬</td></tr>`
      )
      .join("");

    const statusRows = (Object.entries(countByStatus) as [string, number][])
      .map(([st, n]) => `<tr><td>${st}</td><td style="text-align:right">${n}</td></tr>`)
      .join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cierre de caja</title>
      <style>body{font-family:monospace;font-size:13px;padding:16px}h2{margin:0 0 12px}table{width:100%;border-collapse:collapse}td{padding:4px 0}hr{border:1px dashed #000;margin:8px 0}</style>
      </head><body>
      <h2>Cierre de caja â€” ${new Date().toLocaleDateString("es-ES")}</h2>
      <hr><b>Pedidos por origen</b><table>
      <tr><td>TPV</td><td style="text-align:right">${posOrders.length}</td></tr>
      <tr><td>Web</td><td style="text-align:right">${webOrders.length}</td></tr>
      </table><hr><b>Ingresos por mÃ©todo de pago</b><table>${rows}</table>
      <hr><b>Total: ${totalRevenue.toFixed(2)}â‚¬</b>
      <hr><b>Pedidos por estado</b><table>${statusRows}</table>
      </body></html>`;

    const popup = window.open("", "_blank", "width=400,height=600");
    if (!popup) return;
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    popup.onload = () => { popup.focus(); popup.print(); };
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 2000,
        background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 16,
          padding: "24px 28px", minWidth: 340, maxWidth: 460,
          boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
          display: "flex", flexDirection: "column", gap: 18,
          color: TEXT, fontFamily: "system-ui, -apple-system, sans-serif",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Cierre de caja</h2>
          <button type="button" onClick={onClose}
            style={{ border: "none", background: "transparent", color: MUTED, fontSize: 22, cursor: "pointer", lineHeight: 1 }}>
            Ã—
          </button>
        </div>

        <Section title="Pedidos por origen">
          <Row label="TPV" value={String(posOrders.length)} />
          <Row label="Web" value={String(webOrders.length)} />
          <Row label="Total (sin cancelados)" value={String(nonCancelled.length)} bold />
        </Section>

        <Section title="Ingresos por pago">
          {Object.entries(revenueByPayment).map(([pm, amt]) => (
            <Row key={pm} label={PAYMENT_LABEL_MAP[pm] ?? pm} value={fmtEur(amt)} />
          ))}
          <Row label="Total" value={fmtEur(totalRevenue)} bold />
        </Section>

        <Section title="Pedidos por estado">
          {(Object.entries(countByStatus) as [OrderStatus, number][]).map(([st, n]) => (
            <Row key={st} label={STATUS_LABELS[st]} value={String(n)} />
          ))}
        </Section>

        <Section title="Arqueo de caja">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>Efectivo contado (â‚¬)</div>
              <input type="number" min="0" step="0.01" value={countedCash}
                onChange={(e) => { setCountedCash(e.target.value); }}
                placeholder="0.00" style={inputSt} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>Tarjeta contada (â‚¬)</div>
              <input type="number" min="0" step="0.01" value={countedCard}
                onChange={(e) => { setCountedCard(e.target.value); }}
                placeholder="0.00" style={inputSt} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>Notas</div>
            <input type="text" value={notes}
              onChange={(e) => { setNotes(e.target.value); }}
              placeholder="Observaciones opcionales..." style={inputSt} />
          </div>
          {saveError && <div style={{ fontSize: 12, color: "#f87171" }}>{saveError}</div>}
          {savedOk && <div style={{ fontSize: 12, color: G }}>Cierre guardado correctamente.</div>}
        </Section>

        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button type="button" onClick={() => { void handleSaveCierre(); }}
            disabled={saving || savedOk}
            style={{
              flex: 1, padding: "12px", borderRadius: 10, border: "none",
              background: saving || savedOk ? "#1a2540" : G,
              color: saving || savedOk ? BORDER : "#052e16",
              fontSize: 14, fontWeight: 800, cursor: saving || savedOk ? "not-allowed" : "pointer",
            }}>
            {savedOk ? "Guardado" : saving ? "Guardando..." : "Guardar cierre"}
          </button>
          <button type="button" onClick={handlePrint}
            style={{
              flex: 1, padding: "12px", borderRadius: 10,
              border: `1px solid ${BORDER}`, background: "transparent",
              color: SEC, fontSize: 14, fontWeight: 700, cursor: "pointer",
            }}>
            Imprimir
          </button>
          <button type="button" onClick={onClose}
            style={{
              flex: "0 0 auto", padding: "12px 18px", borderRadius: 10,
              border: `1px solid ${BORDER}`, background: "transparent",
              color: SEC, fontSize: 14, fontWeight: 600, cursor: "pointer",
            }}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: MUTED, marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: bold ? 700 : 400, color: bold ? TEXT : SEC }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

// â”€â”€â”€ Elapsed timer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const ACTIVE_STATUSES: Set<string> = new Set(["pending", "accepted", "preparing", "ready", "out_for_delivery"]);

function ElapsedTimer({ since, status }: { since: string | null | undefined; status: string | null | undefined }) {
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (!since || !status || !ACTIVE_STATUSES.has(status)) return;
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

  if (!label) return null;

  const mins = since ? Math.floor((Date.now() - new Date(since).getTime()) / 60000) : 0;
  const color = mins >= 15 ? "#f87171" : mins >= 5 ? "#fb923c" : "#94a3b8";

  return (
    <span style={{ fontSize: 12, fontWeight: 700, color, letterSpacing: "0.01em", fontVariantNumeric: "tabular-nums" }}>
      â± {label}
    </span>
  );
}

// â”€â”€â”€ Order Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type OrderCardProps = {
  order: PosOrder;
  isNew: boolean;
  isUpdating: boolean;
  onAdvance: (newStatus: OrderStatus) => void;
  onReprint: () => void;
  onReprintKitchen: () => void;
  onCollect: () => void;
  onOpenDetail: () => void;
};

function OrderCard({ order, isNew, isUpdating, onAdvance, onReprint, onReprintKitchen, onCollect, onOpenDetail }: OrderCardProps) {
  const status = order.status;
  const chip = status ? STATUS_CHIP[status] : { bg: "rgba(100,116,139,0.12)", color: "#94a3b8" };
  const nextStatus = getNextStatus(status);
  const nextLabel = nextStatus ? getNextLabel(status) : null;

  const orderTypeLabel =
    ORDER_TYPE_LABELS[order.order_type ?? ""] ??
    (order.order_type?.toUpperCase() ?? "â€”");

  const isPos = order.source === "pos";
  const isQrTable = order.source === "qr_table";
  const paymentLabel =
    PAYMENT_LABELS[order.payment_method ?? ""] ?? order.payment_method ?? "â€”";

  // FIX 3: fiado = payment_status is 'pending' and order is not cancelled
  const isFiado = order.payment_status === "pending" && order.status !== "cancelled";

  const cardStyle: CSSProperties = {
    ...c.card,
    opacity: isUpdating ? 0.55 : 1,
    ...(isNew
      ? {
          animation: "pos-card-flash 3s ease-out",
          borderColor: "#f97316",
        }
      : {}),
  };

  return (
    <div
      role="button"
      tabIndex={0}
      style={cardStyle}
      onClick={onOpenDetail}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenDetail();
        }
      }}
    >

      {/* Top row: time, badges, total */}
      <div style={c.topRow}>
        <div style={c.badges}>
          <span style={c.time}>{fmtTime(order.created_at)}</span>
          <ElapsedTimer since={order.created_at} status={status} />
          <span style={isPos ? c.badgePos : isQrTable ? c.badgeQr : c.badgeWeb}>
            {isPos ? "POS" : isQrTable ? "QR" : "WEB"}
          </span>
          <span style={c.badgeType}>{orderTypeLabel}</span>
          {isNew && <span style={c.badgeNew}>NUEVO</span>}
          {/* FIX 3: Fiado badge */}
          {isFiado && <span style={c.badgeFiado}>ðŸ’° FIADO</span>}
        </div>
        <span style={c.total}>{fmtEur(order.total)}</span>
      </div>

      {/* Customer name */}
      <div style={c.customerName}>
        {order.customer_name || "Sin nombre"}
      </div>

      {/* Items */}
      <div style={c.itemsList}>
        {order.order_items.length === 0 ? (
          <span style={c.noItems}>Sin artÃ­culos</span>
        ) : (
          order.order_items.map((item: PosOrderItem) => (
            <div key={item.id} style={c.itemRow}>
              <span style={c.itemQty}>{item.qty}Ã—</span>
              <span style={c.itemName}>{item.snapshot_name ?? "Producto"}</span>
            </div>
          ))
        )}
      </div>

      {/* Footer: payment + status */}
      <div style={c.footer}>
        <span style={c.paymentLabel}>{paymentLabel}</span>
        <span
          style={{
            ...c.statusChip,
            background: chip.bg,
            color: chip.color,
          }}
        >
          {status ? STATUS_LABELS[status] : "â€”"}
        </span>
      </div>

      {/* Actions */}
      <div style={c.actions}>
        {nextLabel && nextStatus ? (
          <button
            type="button"
            disabled={isUpdating}
            style={isUpdating ? c.advanceBtnDisabled : c.advanceBtn}
            onClick={() => onAdvance(nextStatus)}
          >
            {isUpdating ? "..." : nextLabel}
          </button>
        ) : (
          <div style={c.noAction} />
        )}
        {/* FIX 3: Cobrar ahora button for fiado orders */}
        {isFiado && (
          <button
            type="button"
            style={c.cobrarBtn}
            onClick={onCollect}
          >
            Cobrar
          </button>
        )}
        <button
          type="button"
          style={c.reprintBtn}
          onClick={(event) => {
            event.stopPropagation();
            onReprint();
          }}
        >
          Reimprimir
        </button>
        <button
          type="button"
          title="Comanda cocina"
          style={c.reprintBtn}
          onClick={(event) => {
            event.stopPropagation();
            onReprintKitchen();
          }}
        >
          Cocina
        </button>
      </div>
    </div>
  );
}

// â”€â”€â”€ Design tokens â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const G = "#4ade80";
const BG = "#0f172a";
const PANEL = "#1e293b";
const BORDER = "#334155";
const MUTED = "#64748b";
const SEC = "#94a3b8";
const TEXT = "#f1f5f9";

// â”€â”€â”€ Page styles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const s: Record<string, CSSProperties> = {
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100dvh",
    overflow: "hidden",
    background: BG,
    color: TEXT,
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: 14,
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 20px 12px",
    borderBottom: `1px solid ${BORDER}`,
    background: PANEL,
    flexShrink: 0,
    gap: 12,
    flexWrap: "wrap",
  },
  headerLeft: { display: "flex", flexDirection: "column", gap: 2 },
  headerTitle: { margin: 0, fontSize: 20, fontWeight: 800, color: TEXT, letterSpacing: "-0.01em" },
  headerDate: { fontSize: 12, color: MUTED, textTransform: "capitalize" },
  headerRight: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  statPill: {
    display: "flex", flexDirection: "column", alignItems: "flex-end",
    padding: "6px 12px", borderRadius: 10,
    background: "rgba(241,245,249,0.05)", border: `1px solid ${BORDER}`,
  },
  statVal: { fontSize: 16, fontWeight: 800, color: TEXT, lineHeight: 1.1 },
  statLbl: { fontSize: 10, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.07em" },

  cierreBtn: {
    padding: "6px 14px", borderRadius: 8, border: `1px solid ${BORDER}`,
    background: "rgba(241,245,249,0.06)", color: SEC,
    fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
  } as CSSProperties,

  rtBadge: {
    display: "flex", alignItems: "center", gap: 6,
    padding: "6px 10px", borderRadius: 8,
    background: "rgba(241,245,249,0.04)", border: `1px solid ${BORDER}`, cursor: "default",
  },
  rtDotOn: {
    width: 8, height: 8, borderRadius: "50%", background: G,
    display: "inline-block", animation: "pos-rt-pulse 1.8s ease-in-out infinite",
  },
  rtDotOff: { width: 8, height: 8, borderRadius: "50%", background: MUTED, display: "inline-block" },
  rtLabel: { fontSize: 11, fontWeight: 600, color: MUTED },

  filterBar: {
    background: PANEL, borderBottom: `1px solid ${BORDER}`,
    flexShrink: 0, display: "flex", flexDirection: "column", gap: 0,
  },
  tabRow: { display: "flex", overflowX: "auto", borderBottom: `1px solid ${BORDER}`, scrollbarWidth: "none" },
  tab: {
    display: "flex", alignItems: "center", gap: 6,
    padding: "11px 14px", border: "none", borderBottom: "2px solid transparent",
    background: "transparent", color: MUTED, fontSize: 13, fontWeight: 600,
    cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
  },
  tabActive: {
    display: "flex", alignItems: "center", gap: 6,
    padding: "11px 14px", border: "none", borderBottom: `2px solid ${G}`,
    background: "transparent", color: G, fontSize: 13, fontWeight: 700,
    cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
  },
  tabCount: {
    fontSize: 11, fontWeight: 700, padding: "1px 6px", borderRadius: 10,
    background: "rgba(100,116,139,0.2)", color: MUTED, minWidth: 18, textAlign: "center",
  },
  tabCountActive: {
    fontSize: 11, fontWeight: 700, padding: "1px 6px", borderRadius: 10,
    background: "rgba(74,222,128,0.15)", color: G, minWidth: 18, textAlign: "center",
  },

  pillRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "8px 14px", gap: 12, flexWrap: "wrap",
  },
  pillGroup: { display: "flex", gap: 6 },
  pill: {
    padding: "5px 12px", borderRadius: 20, border: `1px solid ${BORDER}`,
    background: "transparent", color: SEC, fontSize: 12, fontWeight: 700,
    cursor: "pointer", letterSpacing: "0.04em",
  },
  pillActive: {
    padding: "5px 12px", borderRadius: 20, border: `1px solid ${G}`,
    background: "rgba(74,222,128,0.10)", color: G, fontSize: 12, fontWeight: 700,
    cursor: "pointer", letterSpacing: "0.04em",
  },

  soundArea: { display: "flex", alignItems: "center" },
  soundBtn: {
    padding: "5px 12px", borderRadius: 8, border: `1px solid ${BORDER}`,
    background: "transparent", color: SEC, fontSize: 12, fontWeight: 600, cursor: "pointer",
  },
  muteBtn: {
    padding: "5px 12px", borderRadius: 8, border: "1px solid rgba(251,191,36,0.4)",
    background: "rgba(251,191,36,0.08)", color: "#fbbf24", fontSize: 12, fontWeight: 600, cursor: "pointer",
  },
  soundOn: { fontSize: 12, color: MUTED, fontWeight: 600 },

  errorBar: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "10px 20px", background: "rgba(248,113,113,0.10)",
    borderBottom: "1px solid rgba(248,113,113,0.30)", color: "#f87171",
    fontSize: 13, fontWeight: 500, flexShrink: 0,
  },
  errorClose: {
    border: "none", background: "transparent", color: "#f87171",
    cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "0 4px", fontWeight: 700,
  },

  content: { flex: 1, overflowY: "auto", padding: 16, position: "relative" },
  ordersPane: { transition: "padding-right 0.22s ease", minHeight: "100%" },
  centered: { display: "flex", alignItems: "center", justifyContent: "center", height: "40vh", color: MUTED, fontSize: 15 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14, alignContent: "start" },
  panelBackdrop: {
    position: "absolute",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    zIndex: 20,
  },
  mobilePanelBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    zIndex: 1150,
  },
  detailPanel: {
    position: "absolute",
    top: 0,
    right: 0,
    width: PANEL_WIDTH,
    maxWidth: "100%",
    height: "100%",
    background: "#1e293b",
    borderLeft: `1px solid ${BORDER}`,
    zIndex: 30,
    transition: "transform 0.22s ease",
    display: "flex",
    flexDirection: "column",
  },
  mobilePanel: {
    position: "fixed",
    inset: 0,
    background: "#1e293b",
    zIndex: 1200,
    transition: "transform 0.22s ease",
    display: "flex",
    flexDirection: "column",
  },
};

const dp: Record<string, CSSProperties> = {
  root: { display: "flex", flexDirection: "column", height: "100%", color: TEXT },
  loading: { padding: 20, color: MUTED },
  error: { padding: 20, color: "#f87171" },
  empty: { padding: 20, color: MUTED },
  head: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
    padding: "14px 14px 10px",
    borderBottom: `1px solid ${BORDER}`,
    background: "rgba(15,23,42,0.45)",
  },
  orderNumber: { fontSize: 19, fontWeight: 800, lineHeight: 1.1 },
  badges: { display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" },
  typeBadge: {
    fontSize: 11,
    fontWeight: 700,
    borderRadius: 999,
    padding: "4px 10px",
    background: "rgba(100,116,139,0.2)",
    color: SEC,
  },
  sourcePos: {
    fontSize: 11,
    fontWeight: 800,
    borderRadius: 999,
    padding: "4px 10px",
    background: "rgba(59,130,246,0.15)",
    color: "#60a5fa",
  },
  sourceWeb: {
    fontSize: 11,
    fontWeight: 800,
    borderRadius: 999,
    padding: "4px 10px",
    background: "rgba(168,85,247,0.15)",
    color: "#c084fc",
  },
  sourceQr: {
    fontSize: 11,
    fontWeight: 800,
    borderRadius: 999,
    padding: "4px 10px",
    background: "rgba(14,165,233,0.15)",
    color: "#38bdf8",
  },
  elapsed: { marginTop: 8, fontSize: 12, color: SEC, fontWeight: 700 },
  close: {
    border: "none",
    background: "transparent",
    color: SEC,
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    lineHeight: 1,
    padding: 6,
  },
  body: { flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 12 },
  section: { background: "rgba(15,23,42,0.5)", border: `1px solid ${BORDER}`, borderRadius: 12, padding: 10, display: "grid", gap: 10 },
  sectionTitle: { fontSize: 11, color: MUTED, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" },
  statusGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 },
  statusBtn: { padding: "10px 8px", borderRadius: 8, border: `1px solid ${BORDER}`, background: "transparent", color: SEC, fontSize: 12, fontWeight: 700, cursor: "pointer" },
  statusBtnActive: { borderColor: G, background: "rgba(74,222,128,0.15)", color: G },
  statusBtnDisabled: { opacity: 0.5, cursor: "not-allowed" },
  itemsList: { display: "grid", gap: 8 },
  itemCard: { border: `1px solid rgba(51,65,85,0.6)`, borderRadius: 10, padding: "8px 9px", display: "grid", gap: 4, background: "rgba(30,41,59,0.6)" },
  itemTop: { display: "flex", justifyContent: "space-between", gap: 8 },
  itemName: { fontSize: 13, fontWeight: 700, color: TEXT, lineHeight: 1.3 },
  itemTotal: { fontSize: 13, fontWeight: 800, color: G, whiteSpace: "nowrap" },
  itemSub: { fontSize: 12, color: MUTED },
  itemMods: { fontSize: 12, color: SEC, lineHeight: 1.35 },
  totals: { borderTop: `1px solid ${BORDER}`, paddingTop: 8, display: "grid", gap: 4 },
  totalRow: { display: "flex", justifyContent: "space-between", fontSize: 13, color: SEC },
  totalRowMain: { display: "flex", justifyContent: "space-between", fontSize: 15, color: TEXT, fontWeight: 800, marginTop: 4 },
  infoRow: { display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, color: SEC, alignItems: "center" },
  infoLink: { color: "#93c5fd", textDecoration: "none", fontWeight: 700, fontSize: 12 },
  note: { fontSize: 12, color: SEC, border: `1px dashed ${BORDER}`, borderRadius: 8, padding: "6px 8px", lineHeight: 1.4 },
  footer: { borderTop: `1px solid ${BORDER}`, padding: 12, display: "grid", gap: 8, background: "rgba(15,23,42,0.45)" },
  addProductsBtn: { padding: "9px 10px", borderRadius: 8, border: `1px dashed ${G}`, background: "rgba(74,222,128,0.06)", color: G, fontSize: 12, fontWeight: 700, cursor: "pointer" },
  actionBtn: { width: "100%", padding: "11px 10px", borderRadius: 8, border: `1px solid ${BORDER}`, background: "transparent", color: TEXT, fontSize: 13, fontWeight: 700, cursor: "pointer", textAlign: "left" },
  acceptBtn: { width: "100%", padding: "12px 10px", borderRadius: 10, border: "none", background: G, color: "#052e16", fontSize: 14, fontWeight: 800, cursor: "pointer" },
};

const apm: Record<string, CSSProperties> = {
  overlay: { position: "fixed", inset: 0, zIndex: 1300, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
  modal: { width: "min(740px, 96vw)", maxHeight: "86vh", background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 14, display: "flex", flexDirection: "column", overflow: "hidden" },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: `1px solid ${BORDER}` },
  title: { margin: 0, fontSize: 18, fontWeight: 800, color: TEXT },
  close: { border: "none", background: "transparent", color: SEC, fontSize: 14, fontWeight: 700, cursor: "pointer" },
  catRow: { display: "flex", gap: 7, overflowX: "auto", padding: "10px 14px", borderBottom: `1px solid ${BORDER}` },
  cat: { border: `1px solid ${BORDER}`, background: "transparent", color: SEC, borderRadius: 999, padding: "5px 11px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" },
  catActive: { border: `1px solid ${G}`, background: "rgba(74,222,128,0.12)", color: G, borderRadius: 999, padding: "5px 11px", fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" },
  grid: { overflowY: "auto", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, padding: 14, alignContent: "start" },
  centered: { minHeight: 120, display: "flex", alignItems: "center", justifyContent: "center", color: MUTED },
  productBtn: { textAlign: "left", border: `1px solid ${BORDER}`, background: "rgba(15,23,42,0.7)", color: TEXT, borderRadius: 10, padding: "11px 10px", cursor: "pointer", display: "grid", gap: 6 },
  productName: { fontSize: 13, fontWeight: 700, lineHeight: 1.3 },
  productPrice: { fontSize: 14, fontWeight: 800, color: G },
};

// â”€â”€â”€ Card styles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const c: Record<string, CSSProperties> = {
  card: {
    background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 12,
    padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10,
    transition: "opacity 0.15s, border-color 0.5s",
  },

  topRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  badges: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  time: { fontSize: 18, fontWeight: 800, color: TEXT, letterSpacing: "-0.01em", marginRight: 2 },
  badgePos: { fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 6, background: "rgba(59,130,246,0.15)", color: "#60a5fa", letterSpacing: "0.05em" },
  badgeWeb: { fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 6, background: "rgba(168,85,247,0.15)", color: "#c084fc", letterSpacing: "0.05em" },
  badgeQr: { fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 6, background: "rgba(14,165,233,0.15)", color: "#38bdf8", letterSpacing: "0.05em" },
  badgeType: { fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: "rgba(100,116,139,0.15)", color: SEC, letterSpacing: "0.05em" },
  badgeNew: { fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 6, background: "rgba(249,115,22,0.20)", color: "#f97316", letterSpacing: "0.05em", animation: "pos-new-badge 1s ease-in-out infinite alternate" },
  // FIX 3: fiado badge style
  badgeFiado: { fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 6, background: "rgba(251,191,36,0.18)", color: "#fbbf24", letterSpacing: "0.05em" },
  total: { fontSize: 16, fontWeight: 800, color: G, flexShrink: 0 },

  customerName: { fontSize: 14, fontWeight: 600, color: TEXT, borderTop: `1px solid rgba(51,65,85,0.6)`, paddingTop: 8 },

  itemsList: { display: "flex", flexDirection: "column", gap: 3, minHeight: 20 },
  noItems: { fontSize: 12, color: MUTED, fontStyle: "italic" },
  itemRow: { display: "flex", alignItems: "baseline", gap: 6 },
  itemQty: { fontSize: 12, fontWeight: 700, color: MUTED, minWidth: 22, flexShrink: 0 },
  itemName: { fontSize: 13, color: SEC, lineHeight: 1.3 },

  footer: { display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid rgba(51,65,85,0.6)`, paddingTop: 8 },
  paymentLabel: { fontSize: 12, color: MUTED, fontWeight: 600 },
  statusChip: { fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 20, letterSpacing: "0.04em", textTransform: "uppercase" },

  actions: { display: "flex", gap: 8, borderTop: `1px solid rgba(51,65,85,0.6)`, paddingTop: 8 },
  advanceBtn: { flex: 1, padding: "10px 8px", borderRadius: 8, border: "none", background: G, color: "#052e16", fontSize: 13, fontWeight: 800, cursor: "pointer", minHeight: 40 },
  advanceBtnDisabled: { flex: 1, padding: "10px 8px", borderRadius: 8, border: "none", background: "#1a2540", color: BORDER, fontSize: 13, fontWeight: 800, cursor: "not-allowed", minHeight: 40 },
  noAction: { flex: 1 },
  // FIX 3: cobrar button
  cobrarBtn: { padding: "10px 10px", borderRadius: 8, border: "1px solid rgba(251,191,36,0.4)", background: "rgba(251,191,36,0.10)", color: "#fbbf24", fontSize: 12, fontWeight: 700, cursor: "pointer", minHeight: 40, flexShrink: 0 },
  reprintBtn: { padding: "10px 10px", borderRadius: 8, border: `1px solid ${BORDER}`, background: "transparent", color: SEC, fontSize: 12, fontWeight: 600, cursor: "pointer", minHeight: 40, flexShrink: 0 },
};

// â”€â”€â”€ Inject keyframes once â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

if (typeof document !== "undefined") {
  const styleId = "pos-orders-keyframes";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      @keyframes pos-rt-pulse {
        0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(74,222,128,0.5); }
        50% { opacity: 0.7; box-shadow: 0 0 0 4px rgba(74,222,128,0); }
      }
      @keyframes pos-card-flash {
        0%   { border-color: #f97316; box-shadow: 0 0 0 3px rgba(249,115,22,0.35); }
        60%  { border-color: #f97316; box-shadow: 0 0 0 3px rgba(249,115,22,0.10); }
        100% { border-color: #334155; box-shadow: none; }
      }
      @keyframes pos-new-badge {
        0%   { opacity: 1; }
        100% { opacity: 0.5; }
      }
    `;
    document.head.appendChild(style);
  }
}



