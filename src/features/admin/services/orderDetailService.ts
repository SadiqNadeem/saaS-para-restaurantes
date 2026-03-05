import { supabase } from "../../../lib/supabase";
import { isOrderStatus, type OrderStatus } from "../../../constants/orderStatus";

export type AdminOrderDetailItem = {
  id: string;
  qty: number;
  name: string;
  itemNotes: string | null;
  snapshotExtras: any[] | null;
  basePrice: number;
  extrasTotal: number;
  lineTotal: number;
};

export type AdminOrderDetail = {
  id: string;
  customerName: string | null;
  customerPhone: string | null;
  orderType: string | null;
  status: OrderStatus | null;
  createdAt: string | null;
  address: string | null;
  notes: string | null;
  paymentMethod: string | null;
  total: number;
  shipping: number;
  tipAmount: number;
  cashGiven: number | null;
  changeDue: number | null;
  couponCode: string | null;
  discountAmount: number;
  items: AdminOrderDetailItem[];
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function asNullableString(value: unknown): string | null {
  const parsed = asString(value).trim();
  return parsed.length > 0 ? parsed : null;
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toItems(value: unknown): AdminOrderDetailItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry, index) => {
    const row = asRecord(entry);
    const extrasRaw = row.snapshot_extras ?? row.extras ?? null;
    const snapshotExtras = Array.isArray(extrasRaw) ? (extrasRaw as any[]) : null;

    return {
      id: asString(row.id).trim() || `item-${index}`,
      qty: Math.max(1, Math.trunc(asNumber(row.qty ?? row.quantity ?? 1))),
      name:
        asString(row.name ?? row.product_name ?? row.item_name ?? row.product_id).trim() ||
        "Producto",
      itemNotes: asNullableString(row.item_notes ?? row.notes),
      snapshotExtras,
      basePrice: asNumber(row.base_price ?? row.unit_price ?? row.price),
      extrasTotal: asNumber(row.extras_total),
      lineTotal: asNumber(row.line_total ?? row.total),
    };
  });
}

function normalizeOrderDetail(data: unknown): AdminOrderDetail {
  const rows = Array.isArray(data) ? data : [];

  // Handle nested { order: {...}, items: [...] } structure returned by get_order_detail RPC
  const isNested =
    data !== null &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    "order" in (data as object);

  const orderData = isNested ? (data as Record<string, unknown>).order : data;
  const root = asRecord(Array.isArray(orderData) ? (orderData as unknown[])[0] : orderData);

  const itemsCandidate = isNested
    ? ((data as Record<string, unknown>).items as unknown[])
    : (root.items ??
      root.order_items ??
      root.lines ??
      (Array.isArray(data) && rows.every((entry) => typeof entry === "object") ? rows : []));

  return {
    id: asString(root.id ?? root.order_id).trim(),
    customerName: asNullableString(root.customer_name ?? root.client_name),
    customerPhone: asNullableString(root.customer_phone ?? root.phone),
    orderType: asNullableString(root.order_type),
    status: isOrderStatus(root.status) ? root.status : null,
    createdAt: asNullableString(root.created_at),
    address: asNullableString(root.address_line ?? root.address_text ?? root.delivery_address),
    notes: asNullableString(root.instructions ?? root.notes ?? root.address_notes),
    paymentMethod: asNullableString(root.payment_method),
    total: asNumber(root.total),
    shipping: asNumber(root.delivery_fee ?? root.shipping),
    tipAmount: asNumber(root.tip_amount),
    cashGiven: asNullableNumber(root.cash_given),
    changeDue: asNullableNumber(root.change_due),
    couponCode: asNullableString(root.coupon_code),
    discountAmount: asNumber(root.discount_amount),
    items: toItems(itemsCandidate),
  };
}

export async function getOrderDetail(orderId: string): Promise<AdminOrderDetail> {
  const trimmedOrderId = orderId.trim();
  if (!trimmedOrderId) {
    throw new Error("Pedido no encontrado");
  }

  const { data, error } = await supabase.rpc("get_order_detail", {
    p_order_id: trimmedOrderId,
  });

  if (error) {
    throw new Error(error.message || "No se pudo cargar el detalle del pedido");
  }

  const detail = normalizeOrderDetail(data);
  if (!detail.id) {
    throw new Error("Detalle de pedido no disponible");
  }

  return detail;
}
