import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";

import { useAdminMembership } from "../components/AdminMembershipContext";
import { buildTicketHtml, type TicketMode } from "../../features/printing/ticketTemplates";
import { supabase } from "../../lib/supabase";
import { printOrder } from "../../lib/printing/printOrder";
import { ALL_ORDER_STATUSES, isOrderStatus, type OrderStatus } from "../../constants/orderStatus";
import { useRestaurant } from "../../restaurant/RestaurantContext";

type OrderRow = Record<string, unknown> & {
  id: string;
  created_at?: string;
  total?: number;
  print_count?: number | null;
  printed_at?: string | null;
  last_print_error?: string | null;
  status?: OrderStatus;
  order_type?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  street?: string | null;
  number?: string | null;
  address_line?: string | null;
  address_text?: string | null;
  is_building?: boolean | null;
  portal?: string | null;
  floor?: string | null;
  door?: string | null;
  block?: string | null;
  stair?: string | null;
  instructions?: string | null;
  payment_method?: string | null;
  cash_given?: number | null;
  change_due?: number | null;
  address_notes?: unknown;
};

type OrderItemRow = {
  id: string;
  qty: number;
  unit_price: number;
  base_price: number;
  product_id: string;
  notes?: string | null;
};

type ProductRow = {
  id: string;
  name: string;
  price?: number | null;
};

type ItemIngredientLink = {
  order_item_id: string;
  ingredient_id: string;
};

type IngredientRow = {
  id: string;
  name: string;
  price?: number | null;
};

type ItemModifierOptionRow = {
  order_item_id: string;
  option_name: string | null;
  price: number | null;
};

const STATUS_OPTIONS: OrderStatus[] = [...ALL_ORDER_STATUSES];

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  accepted: "Aceptado",
  preparing: "Preparando",
  ready: "Listo",
  out_for_delivery: "En reparto",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

const currency = (value: number | null | undefined) =>
  `${Number(value ?? 0).toFixed(2)} EUR`;

const currencyOrDash = (value: number | null | undefined) =>
  value === null || value === undefined ? "-" : currency(value);

function toStatusLabel(status: OrderStatus) {
  return STATUS_LABELS[status] ?? status;
}

function toPaymentMethodLabel(method: string | null | undefined) {
  if (method === "cash") return "Efectivo";
  if (method === "card_on_delivery") return "Tarjeta";
  if (method === "card_online") return "Tarjeta online";
  if (method === "card") return "Tarjeta";
  if (method === "online" || method === "stripe") return "Online";
  return method ?? "No definido";
}

function toOrderTypeLabel(value: string | null | undefined): string {
  const raw = String(value ?? "").toLowerCase();
  if (!raw) return "Sin tipo";
  if (raw === "delivery" || raw === "domicilio") return "Domicilio";
  if (raw === "pickup" || raw === "takeaway" || raw === "recoger") return "Recoger";
  if (raw === "dine_in" || raw === "table" || raw === "mesa") return "Mesa";
  if (raw === "counter") return "Mostrador";
  return String(value);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function shortOrderId(value: string): string {
  return String(value ?? "").trim().slice(0, 8).toUpperCase() || "N/A";
}

function statusBadgeStyle(status: OrderStatus | null | undefined): CSSProperties {
  const palette: Record<OrderStatus, { bg: string; border: string; text: string }> = {
    pending: { bg: "#fff7ed", border: "#fdba74", text: "#9a3412" },
    accepted: { bg: "#eff6ff", border: "#93c5fd", text: "#1d4ed8" },
    preparing: { bg: "#fff7ed", border: "#fdba74", text: "#c2410c" },
    ready: { bg: "#ecfdf3", border: "#86efac", text: "#15803d" },
    out_for_delivery: { bg: "#f5f3ff", border: "#c4b5fd", text: "#6d28d9" },
    delivered: { bg: "#f0fdf4", border: "#86efac", text: "#166534" },
    cancelled: { bg: "#fef2f2", border: "#fca5a5", text: "#b91c1c" },
  };
  const resolved = palette[(status ?? "pending") as OrderStatus] ?? palette.pending;
  return {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    border: `1px solid ${resolved.border}`,
    background: resolved.bg,
    color: resolved.text,
    fontWeight: 700,
    fontSize: 12,
    padding: "5px 10px",
    lineHeight: 1.1,
    whiteSpace: "nowrap",
  };
}

function parseJsonIfNeeded(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function extractNotesList(order: OrderRow): string[] {
  const lines: string[] = [];
  const add = (input: unknown) => {
    const text = String(input ?? "").trim();
    if (text) lines.push(text);
  };

  add(order.instructions);

  const addressNotes = parseJsonIfNeeded(order.address_notes);
  if (typeof addressNotes === "string") add(addressNotes);
  if (addressNotes && typeof addressNotes === "object" && !Array.isArray(addressNotes)) {
    const record = addressNotes as Record<string, unknown>;
    add(record.customer_note);
    add(record.note);
    add(record.notes);
    add(record.instructions);
    if (record.delivery && typeof record.delivery === "object") {
      const delivery = record.delivery as Record<string, unknown>;
      add(delivery.instructions);
      add(delivery.notes);
    }
  }

  const genericNotes = parseJsonIfNeeded((order as Record<string, unknown>).notes);
  if (typeof genericNotes === "string") add(genericNotes);
  if (genericNotes && typeof genericNotes === "object" && !Array.isArray(genericNotes)) {
    const record = genericNotes as Record<string, unknown>;
    add(record.customer_note);
    add(record.note);
    add(record.notes);
    add(record.instructions);
  }

  return Array.from(new Set(lines));
}

type DeliverySnapshot = {
  isBuilding?: boolean | null;
  portal?: string | null;
  floor?: string | null;
  door?: string | null;
  block?: string | null;
  stair?: string | null;
  instructions?: string | null;
};

function getDeliverySnapshot(notes: unknown): DeliverySnapshot | null {
  if (!notes || typeof notes !== "object") {
    return null;
  }

  const maybeDelivery = (notes as { delivery?: unknown }).delivery;
  if (!maybeDelivery || typeof maybeDelivery !== "object") {
    return null;
  }

  return maybeDelivery as DeliverySnapshot;
}

export default function AdminOrderDetailPage() {
  const { canManage } = useAdminMembership();
  const { restaurantId, adminPath } = useRestaurant();
  const { id } = useParams<{ id: string }>();

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [items, setItems] = useState<OrderItemRow[]>([]);
  const [productsById, setProductsById] = useState<Record<string, ProductRow>>(
    {}
  );
  const [ingredientsById, setIngredientsById] = useState<
    Record<string, IngredientRow>
  >({});
  const [ingredientIdsByItemId, setIngredientIdsByItemId] = useState<
    Record<string, string[]>
  >({});
  const [modifiersByItemId, setModifiersByItemId] = useState<
    Record<string, { option_name: string; price: number }[]>
  >({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusDraft, setStatusDraft] = useState<OrderStatus | "">("");
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [ticketPreviewMode, setTicketPreviewMode] = useState<TicketMode | null>(null);
  const [printingMode, setPrintingMode] = useState<TicketMode | null>(null);
  const [printNotice, setPrintNotice] = useState<string | null>(null);

  // Evita que el polling te pise el select mientras cambias estado
  const lastServerStatusRef = useRef<OrderStatus | "">("");

  const loadOrderData = useCallback(async () => {
    if (!id) {
      setError("Pedido no encontrado");
      setLoading(false);
      return;
    }

    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", id)
      .eq("restaurant_id", restaurantId)
      .single();

    if (orderError || !orderData) {
      setError(orderError?.message ?? "No se pudo cargar el pedido");
      setLoading(false);
      return;
    }

    const typedOrder = orderData as OrderRow;

    const { data: orderItemsData, error: itemsError } = await supabase
      .from("order_items")
      .select("id, qty, unit_price, base_price, product_id, notes")
      .eq("order_id", id)
      .eq("restaurant_id", restaurantId);

    if (itemsError) {
      setError(itemsError.message);
      setLoading(false);
      return;
    }

    const typedItems = (orderItemsData ?? []) as OrderItemRow[];

    const productIds = Array.from(
      new Set(typedItems.map((item) => item.product_id))
    ).filter(Boolean);

    let productsMap: Record<string, ProductRow> = {};

    if (productIds.length > 0) {
      const { data: productRows, error: productsError } = await supabase
        .from("products")
        .select("id, name, price")
        .eq("restaurant_id", restaurantId)
        .in("id", productIds);

      if (productsError) {
        setError(productsError.message);
        setLoading(false);
        return;
      }

      for (const product of (productRows ?? []) as ProductRow[]) {
        productsMap[product.id] = product;
      }
    }

    const itemIds = typedItems.map((item) => item.id);
    let links: ItemIngredientLink[] = [];
    let modifierRows: ItemModifierOptionRow[] = [];

    if (itemIds.length > 0) {
      const { data: linksData, error: linksError } = await supabase
        .from("order_item_ingredients")
        .select("order_item_id, ingredient_id")
        .in("order_item_id", itemIds);

      if (linksError) {
        setError(linksError.message);
        setLoading(false);
        return;
      }

      links = (linksData ?? []) as ItemIngredientLink[];

      const { data: modifiersData, error: modifiersError } = await supabase
        .from("order_item_modifier_options")
        .select("order_item_id, option_name, price")
        .eq("restaurant_id", restaurantId)
        .in("order_item_id", itemIds)
        .order("created_at", { ascending: true });

      if (modifiersError) {
        setError(modifiersError.message);
        setLoading(false);
        return;
      }

      modifierRows = (modifiersData ?? []) as ItemModifierOptionRow[];
    }

    const ingredientIds = Array.from(
      new Set(links.map((link) => link.ingredient_id))
    ).filter(Boolean);

    let ingredientsMap: Record<string, IngredientRow> = {};

    if (ingredientIds.length > 0) {
      const { data: ingredientRows, error: ingredientsError } = await supabase
        .from("ingredients")
        .select("id, name, price")
        .in("id", ingredientIds);

      if (ingredientsError) {
        setError(ingredientsError.message);
        setLoading(false);
        return;
      }

      for (const ingredient of (ingredientRows ?? []) as IngredientRow[]) {
        ingredientsMap[ingredient.id] = ingredient;
      }
    }

    const groupedIngredientIds: Record<string, string[]> = {};
    for (const link of links) {
      if (!groupedIngredientIds[link.order_item_id]) {
        groupedIngredientIds[link.order_item_id] = [];
      }
      groupedIngredientIds[link.order_item_id].push(link.ingredient_id);
    }

    const groupedModifiers: Record<string, { option_name: string; price: number }[]> = {};
    for (const modifier of modifierRows) {
      if (!groupedModifiers[modifier.order_item_id]) {
        groupedModifiers[modifier.order_item_id] = [];
      }

      groupedModifiers[modifier.order_item_id].push({
        option_name: modifier.option_name ?? "Opcion",
        price: Number(modifier.price ?? 0),
      });
    }

    // Solo setear statusDraft cuando:
    // - aun no hay statusDraft (primera carga), o
    // - el usuario NO esta editando (statusDraft coincide con el ultimo server status)
    const serverStatus = typedOrder.status ?? "";
    const lastServerStatus = lastServerStatusRef.current;
    const shouldSyncDraft =
      !statusDraft || statusDraft === lastServerStatus || statusDraft === serverStatus;

    lastServerStatusRef.current = serverStatus;

    setOrder(typedOrder);
    setItems(typedItems);
    setProductsById(productsMap);
    setIngredientsById(ingredientsMap);
    setIngredientIdsByItemId(groupedIngredientIds);
    setModifiersByItemId(groupedModifiers);

    if (shouldSyncDraft) {
      setStatusDraft(serverStatus);
    }

    setError(null);
    setLoading(false);
  }, [id, restaurantId, statusDraft]);

  useEffect(() => {
    setLoading(true);
    loadOrderData();
  }, [loadOrderData]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      loadOrderData();
    }, 10000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadOrderData]);

  const availableStatuses = useMemo<OrderStatus[]>(() => {
    const current = order?.status ?? "";
    if (!current) return STATUS_OPTIONS;
    if (STATUS_OPTIONS.includes(current)) return STATUS_OPTIONS;
    return isOrderStatus(current) ? [current, ...STATUS_OPTIONS] : STATUS_OPTIONS;
  }, [order?.status]);

  const ticketOrder = useMemo(() => {
    if (!order) {
      return null;
    }

    const deliverySnapshot = getDeliverySnapshot(order.notes);
    const itemRows = items.map((item) => {
      const product = productsById[item.product_id];
      const extras = (ingredientIdsByItemId[item.id] ?? []).map((ingredientId) => {
        const ingredient = ingredientsById[ingredientId];
        return {
          name: ingredient?.name ?? ingredientId,
          price: Number(ingredient?.price ?? 0),
        };
      });
      const modifiers = (modifiersByItemId[item.id] ?? []).map((modifier) => ({
        name: modifier.option_name,
        price: modifier.price,
      }));

      return {
        quantity: Number(item.qty ?? 1),
        name: product?.name ?? item.product_id,
        unitPrice: Number(item.unit_price ?? 0),
        extras,
        modifiers,
      };
    });

    const instructions =
      order.instructions ??
      deliverySnapshot?.instructions ??
      (typeof order.address_notes === "string" ? order.address_notes : null);

    return {
      id: order.id,
      createdAt: order.created_at ?? null,
      orderType: order.order_type ?? null,
      customerName: order.customer_name ?? null,
      customerPhone: order.customer_phone ?? null,
      address: {
        line: order.address_line ?? order.address_text ?? null,
        street: order.street ?? null,
        number: order.number ?? null,
        portal: order.portal ?? deliverySnapshot?.portal ?? null,
        floor: order.floor ?? deliverySnapshot?.floor ?? null,
        door: order.door ?? deliverySnapshot?.door ?? null,
        block: order.block ?? deliverySnapshot?.block ?? null,
        stair: order.stair ?? deliverySnapshot?.stair ?? null,
        notes: instructions,
      },
      items: itemRows,
      total: Number(order.total ?? 0),
    };
  }, [ingredientsById, ingredientIdsByItemId, items, modifiersByItemId, order, productsById]);

  const ticketPreviewHtml = useMemo(() => {
    if (!ticketOrder || !ticketPreviewMode) {
      return "";
    }

    return buildTicketHtml(ticketOrder, ticketPreviewMode);
  }, [ticketOrder, ticketPreviewMode]);

  const updateStatus = async () => {
    if (!canManage || !order || !statusDraft || updatingStatus) return;

    setUpdatingStatus(true);
    setError(null);

    const { error: updateError } = await supabase.rpc("set_order_status_safe", {
      p_order_id: order.id,
      p_status: statusDraft,
    });

    if (updateError) {
      setError(updateError.message);
    } else {
      setOrder({ ...order, status: statusDraft });
      lastServerStatusRef.current = statusDraft;
      await loadOrderData();
    }

    setUpdatingStatus(false);
  };

  const printTicket = async (mode: TicketMode) => {
    if (!order || printingMode) return;

    if (order.printed_at) {
      const ok = window.confirm("Ya se imprimio. Reimprimir?");
      if (!ok) return;
    }

    setPrintingMode(mode);
    setPrintNotice(null);

    const result = await printOrder({
      orderId: order.id,
      restaurantId,
      mode,
      retryCount: 1,
    });

    if (!result.ok) {
      setPrintNotice(`Error al imprimir: ${result.errorMessage ?? "Error desconocido"}`);
    } else {
      setPrintNotice("Impreso OK");
    }

    await loadOrderData();
    setPrintingMode(null);
  };

  const KeyValueRow = ({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "160px 1fr",
        gap: 10,
        alignItems: "start",
        padding: "4px 0",
        fontSize: 14,
      }}
    >
      <span style={{ color: "#64748b", fontWeight: 600 }}>{label}</span>
      <span style={{ color: "#0f172a", fontWeight: strong ? 800 : 500, wordBreak: "break-word" }}>{value}</span>
    </div>
  );

  const cardStyle: CSSProperties = {
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    background: "#fff",
    padding: 14,
    display: "grid",
    gap: 10,
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
  };

  const cardTitleStyle: CSSProperties = {
    margin: 0,
    fontSize: 14,
    fontWeight: 800,
    color: "#0f172a",
    letterSpacing: 0.1,
  };

  const kvWrapStyle: CSSProperties = {
    display: "grid",
    gap: 2,
  };

  const secondaryButtonStyle: CSSProperties = {
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#0f172a",
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  };

  const primaryButtonStyle: CSSProperties = {
    border: "1px solid #0f172a",
    background: "#0f172a",
    color: "#fff",
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  };

  const ghostButtonStyle: CSSProperties = {
    border: "1px solid #dbe2ea",
    background: "#f8fafc",
    color: "#334155",
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  };

  const emptyStateStyle: CSSProperties = {
    border: "1px dashed #cbd5e1",
    background: "#f8fafc",
    color: "#64748b",
    borderRadius: 10,
    padding: "12px 14px",
    fontSize: 13,
  };

  const itemCardStyle: CSSProperties = {
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    background: "#fff",
    padding: 12,
    display: "grid",
    gap: 8,
  };

  const detailLineStyle: CSSProperties = {
    color: "#334155",
    fontSize: 13,
    lineHeight: 1.45,
  };

  if (loading) {
    return <p style={{ padding: 20 }}>Cargando pedido...</p>;
  }

  if (error) {
    return (
      <section style={{ padding: 20 }}>
        <Link to={`${adminPath}/orders`}>Volver</Link>
        <p style={{ color: "crimson" }}>{error}</p>
      </section>
    );
  }

  if (!order) {
    return (
      <section style={{ padding: 20 }}>
        <Link to={`${adminPath}/orders`}>Volver</Link>
        <p>Pedido no encontrado.</p>
      </section>
    );
  }

  const deliverySnapshot = getDeliverySnapshot(order.notes);
  const deliveryFee = Number((order as Record<string, unknown>).delivery_fee ?? 0);
  const subtotalFromItems = items.reduce((sum, item) => sum + Number(item.unit_price ?? 0) * Number(item.qty ?? 0), 0);
  const orderTotal = Number(order.total ?? 0);
  const paymentStatus = String((order as Record<string, unknown>).payment_status ?? "").trim();
  const source = String((order as Record<string, unknown>).source ?? "").trim().toLowerCase();
  const channel = source === "pos" ? "TPV" : source === "qr_table" ? "Mesa QR" : source === "web" ? "Web" : "No definido";
  const customerName = String(order.customer_name ?? "").trim() || "Cliente sin nombre";
  const customerPhone = String(order.customer_phone ?? "").trim() || "No indicado";
  const orderType = toOrderTypeLabel(order.order_type);
  const fullAddress = String(order.address_line ?? order.address_text ?? "").trim() || [order.street, order.number].filter(Boolean).join(" ").trim() || "No disponible";
  const buildingDetails = [order.portal ?? deliverySnapshot?.portal ?? null, order.floor ?? deliverySnapshot?.floor ?? null, order.door ?? deliverySnapshot?.door ?? null].every(Boolean)
    ? `Portal ${order.portal ?? deliverySnapshot?.portal}, Piso ${order.floor ?? deliverySnapshot?.floor}, Puerta ${order.door ?? deliverySnapshot?.door}${order.block ?? deliverySnapshot?.block ? `, Bloque ${order.block ?? deliverySnapshot?.block}` : ""}${order.stair ?? deliverySnapshot?.stair ? `, Escalera ${order.stair ?? deliverySnapshot?.stair}` : ""}`
    : null;
  const noteLines = extractNotesList(order);

  return (
    <section style={{ padding: 16, display: "grid", gap: 14 }}>
      <style>{`
        .order-detail-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .order-detail-top-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        @media (max-width: 960px) {
          .order-detail-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 6 }}>
          <Link to={`${adminPath}/orders`} style={{ color: "#334155", fontSize: 13, textDecoration: "none", fontWeight: 600 }}>
            Volver a pedidos
          </Link>
          <h1 style={{ margin: 0, fontSize: 24, color: "#0f172a", letterSpacing: -0.3 }}>
            Pedido #{shortOrderId(order.id)}
          </h1>
          <div style={{ fontSize: 13, color: "#64748b" }}>
            {formatDateTime(order.created_at)}
          </div>
        </div>
        <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
          <span style={statusBadgeStyle(order.status ?? "pending")}>
            {toStatusLabel((order.status ?? "pending") as OrderStatus)}
          </span>
          <div className="order-detail-top-actions">
            <label htmlFor="status" style={{ fontSize: 12, color: "#475569", fontWeight: 600 }}>Estado</label>
            <select
              id="status"
              value={statusDraft}
              onChange={(event) => {
                const value = event.target.value;
                setStatusDraft(isOrderStatus(value) ? value : "");
              }}
              style={{
                border: "1px solid #cbd5e1",
                borderRadius: 8,
                background: "#fff",
                color: "#0f172a",
                fontSize: 13,
                padding: "7px 10px",
                minWidth: 140,
              }}
            >
              {availableStatuses.map((status) => (
                <option key={status} value={status}>
                  {toStatusLabel(status)}
                </option>
              ))}
            </select>
            <button onClick={updateStatus} disabled={!canManage || updatingStatus || !statusDraft} style={primaryButtonStyle}>
              {updatingStatus ? "Guardando..." : "Actualizar"}
            </button>
          </div>
        </div>
      </div>

      <div className="order-detail-top-actions">
        <button onClick={() => void printTicket("customer")} disabled={Boolean(printingMode)} style={secondaryButtonStyle}>
          {printingMode === "customer" ? "Imprimiendo..." : "Imprimir cliente"}
        </button>
        <button onClick={() => void printTicket("kitchen")} disabled={Boolean(printingMode)} style={secondaryButtonStyle}>
          {printingMode === "kitchen" ? "Imprimiendo..." : "Imprimir cocina"}
        </button>
        <button onClick={() => setTicketPreviewMode("customer")} style={ghostButtonStyle}>Ticket cliente</button>
        <button onClick={() => setTicketPreviewMode("kitchen")} style={ghostButtonStyle}>Ticket cocina</button>
      </div>

      {printNotice ? (
        <div
          style={{
            border: printNotice.includes("Error") ? "1px solid #fecaca" : "1px solid #bfdbfe",
            background: printNotice.includes("Error") ? "#fef2f2" : "#eff6ff",
            color: printNotice.includes("Error") ? "#991b1b" : "#1e3a8a",
            borderRadius: 10,
            padding: "9px 11px",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {printNotice}
        </div>
      ) : null}

      <div className="order-detail-grid">
        <section style={cardStyle}>
          <h3 style={cardTitleStyle}>Resumen pedido</h3>
          <div style={kvWrapStyle}>
            <KeyValueRow label="Cliente" value={customerName} />
            <KeyValueRow label="Telefono" value={customerPhone} />
            <KeyValueRow label="Canal" value={channel} />
            <KeyValueRow label="Tipo" value={orderType} />
          </div>
        </section>

        <section style={cardStyle}>
          <h3 style={cardTitleStyle}>Entrega</h3>
          <div style={kvWrapStyle}>
            <KeyValueRow label="Direccion" value={fullAddress} />
            <KeyValueRow label="Detalle edificio" value={buildingDetails ?? "No indicado"} />
          </div>
        </section>

        <section style={cardStyle}>
          <h3 style={cardTitleStyle}>Pago</h3>
          <div style={kvWrapStyle}>
            <KeyValueRow label="Metodo" value={toPaymentMethodLabel(order.payment_method ?? null)} />
            <KeyValueRow label="Estado" value={paymentStatus || "No definido"} />
            <KeyValueRow label="Efectivo recibido" value={currencyOrDash(order.cash_given)} />
            <KeyValueRow label="Cambio" value={currencyOrDash(order.change_due)} />
          </div>
        </section>

        <section style={cardStyle}>
          <h3 style={cardTitleStyle}>Totales</h3>
          <div style={kvWrapStyle}>
            <KeyValueRow label="Subtotal" value={currency(subtotalFromItems)} />
            <KeyValueRow label="Gastos de envio" value={currency(deliveryFee)} />
            <KeyValueRow label="Total" value={currency(orderTotal)} strong />
          </div>
        </section>
      </div>

      <section style={cardStyle}>
        <h3 style={cardTitleStyle}>Items</h3>
        {items.length === 0 ? (
          <div style={emptyStateStyle}>Este pedido no tiene items cargados.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {items.map((item) => {
              const product = productsById[item.product_id];
              const productName = product?.name ?? item.product_id;
              const lineTotal = Number(item.unit_price ?? 0) * Number(item.qty ?? 0);
              const ingredientNames = (ingredientIdsByItemId[item.id] ?? []).map((ingredientId) => ingredientsById[ingredientId]?.name ?? ingredientId);
              const modifierOptions = modifiersByItemId[item.id] ?? [];
              const itemNotes = String(item.notes ?? "").trim();

              return (
                <article key={item.id} style={itemCardStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ display: "grid", gap: 2 }}>
                      <strong style={{ fontSize: 15, color: "#0f172a" }}>{item.qty} x {productName}</strong>
                      <span style={{ fontSize: 12, color: "#64748b" }}>Unitario: {currency(item.unit_price)}</span>
                    </div>
                    <strong style={{ fontSize: 15, color: "#0f172a" }}>{currency(lineTotal)}</strong>
                  </div>

                  {modifierOptions.length > 0 ? (
                    <div style={detailLineStyle}>
                      <strong>Modificadores:</strong>{" "}
                      {modifierOptions.map((modifier) => `${modifier.option_name}${modifier.price > 0 ? ` (+${currency(modifier.price)})` : ""}`).join(", ")}
                    </div>
                  ) : null}

                  {ingredientNames.length > 0 ? (
                    <div style={detailLineStyle}><strong>Extras:</strong> {ingredientNames.join(", ")}</div>
                  ) : null}

                  {itemNotes ? (
                    <div style={detailLineStyle}><strong>Notas:</strong> {itemNotes}</div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section style={cardStyle}>
        <h3 style={cardTitleStyle}>Notas</h3>
        {noteLines.length === 0 ? (
          <div style={emptyStateStyle}>Sin notas del cliente ni de entrega.</div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, color: "#334155", display: "grid", gap: 4, fontSize: 14 }}>
            {noteLines.map((line, index) => (
              <li key={`${line}-${index}`}>{line}</li>
            ))}
          </ul>
        )}
      </section>

      <section style={cardStyle}>
        <h3 style={cardTitleStyle}>Impresion</h3>
        <div style={kvWrapStyle}>
          <KeyValueRow label="Veces impreso" value={String(Number(order.print_count ?? 0))} />
          <KeyValueRow label="Ultima impresion" value={formatDateTime(order.printed_at)} />
          {order.last_print_error ? (
            <div style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#991b1b", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}>
              {order.last_print_error}
            </div>
          ) : null}
        </div>
      </section>

      {ticketPreviewMode && ticketOrder ? (
        <section style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <strong style={{ color: "#0f172a", fontSize: 14 }}>
              Ticket {ticketPreviewMode === "kitchen" ? "cocina" : "cliente"}
            </strong>
            <button onClick={() => setTicketPreviewMode(null)} style={ghostButtonStyle}>Cerrar</button>
          </div>
          <div
            style={{
              padding: 12,
              border: "1px solid #dbe2ea",
              borderRadius: 10,
              background: "#fff",
              color: "#111",
              overflowX: "auto",
            }}
            dangerouslySetInnerHTML={{ __html: ticketPreviewHtml }}
          />
        </section>
      ) : null}
    </section>
  );
}
