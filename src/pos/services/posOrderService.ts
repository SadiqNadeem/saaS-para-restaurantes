import { supabase } from "../../lib/supabase";
import type { SelectedModifier } from "../components/PosModifierModal";

export type PosOrderType = "counter" | "pickup" | "delivery";
export type PosPaymentMethod = "cash" | "card" | "fiado";

// ─── Table types ──────────────────────────────────────────────────────────────

export type TableStatus = "free" | "occupied" | "closing" | "reserved";

export type RestaurantTable = {
  id: string;
  restaurant_id: string;
  name: string;
  zone: string;
  capacity: number | null;
  status: TableStatus;
  current_order_id: string | null;
  is_active: boolean;
  position: number;
  created_at: string;
  // QR & visual floor plan fields
  qr_token: string | null;
  shape: "square" | "rectangle" | "circle";
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  merged_with: string[] | null;
  is_merged_child: boolean;
  merged_parent_id: string | null;
};

// ─── Table order functions ────────────────────────────────────────────────────

export async function openTableOrder(
  restaurantId: string,
  tableId: string,
  customerName?: string
): Promise<{ orderId: string }> {
  // Create a dine_in order linked to the table
  const { data, error } = await supabase.rpc("create_order_safe_v2", {
    p_restaurant_id: restaurantId,
    p_client_order_key: crypto.randomUUID(),
    p_payment_method: "cash",
    p_order_type: "dine_in",
    p_delivery_fee: 0,
    p_cash_given: null,
    p_customer_name: customerName || "Mesa",
    p_customer_phone: "",
    p_delivery_address: "",
    p_notes: JSON.stringify({ pos: true, dine_in: true }),
    p_items: [],
    p_source: "pos",
    p_tip_amount: 0,
    p_table_id: tableId,
  });

  if (error) throw new Error(String(error.message ?? "Error al abrir mesa"));

  // RPC returns TABLE(order_id uuid, total numeric) — data is an array
  type RpcRow = { order_id?: string; id?: string };
  const row = Array.isArray(data) ? (data[0] as RpcRow) : (data as RpcRow);
  const orderId = String(row?.order_id ?? row?.id ?? "").trim();

  if (!orderId) throw new Error("No se recibió el ID del pedido");

  // Mark table as occupied (table_id is already set by the RPC)
  await supabase
    .from("restaurant_tables")
    .update({ status: "occupied", current_order_id: orderId })
    .eq("id", tableId);

  return { orderId };
}

export async function addItemToTableOrder(
  orderId: string,
  restaurantId: string,
  item: {
    product_id: string;
    name: string;
    base_price: number;
    qty: number;
    modifiers: SelectedModifier[];
    notes: string;
  }
): Promise<void> {
  const extrasTotal = item.modifiers.reduce((s, m) => s + m.price, 0);
  const unitPrice = item.base_price + extrasTotal;
  const lineTotal = unitPrice * item.qty;

  const { data: itemRow, error: itemErr } = await supabase
    .from("order_items")
    .insert({
      order_id: orderId,
      restaurant_id: restaurantId,
      product_id: item.product_id,
      qty: item.qty,
      base_price: item.base_price,
      extras_total: extrasTotal,
      final_unit_price: unitPrice,
      line_total: lineTotal,
      snapshot_name: item.name,
      notes: item.notes || null,
      sent_to_kitchen: false,
    })
    .select("id")
    .single();

  if (itemErr) throw new Error(itemErr.message);
  const orderItemId = (itemRow as { id: string }).id;

  // Insert modifier options
  if (item.modifiers.length > 0) {
    await supabase.from("order_item_modifier_options").insert(
      item.modifiers.map((m) => ({
        order_item_id: orderItemId,
        option_id: m.option_id,
        option_name: m.option_name,
        price: m.price,
      }))
    );
  }

  // Recalculate order totals
  const { data: allItems } = await supabase
    .from("order_items")
    .select("line_total")
    .eq("order_id", orderId);

  const subtotal = (allItems ?? []).reduce(
    (s, r) => s + Number((r as { line_total: number }).line_total),
    0
  );

  await supabase
    .from("orders")
    .update({ subtotal, total: subtotal })
    .eq("id", orderId);
}

export async function closeTableOrder(
  orderId: string,
  tableId: string,
  payment: PosPaymentMethod,
  cashGiven: number
): Promise<void> {
  const paymentMethod = payment === "card" ? "card_on_delivery" : "cash";

  const updates: Record<string, unknown> = {
    status: "delivered",
    payment_method: paymentMethod,
  };
  if (payment === "cash" && cashGiven > 0) {
    updates.cash_given = cashGiven;
  }
  if (payment === "fiado") {
    updates.payment_status = "pending";
  }

  await Promise.all([
    supabase.from("orders").update(updates).eq("id", orderId),
    supabase
      .from("restaurant_tables")
      .update({ status: "free", current_order_id: null })
      .eq("id", tableId),
  ]);
}

export async function cancelTableOrder(
  orderId: string,
  tableId: string
): Promise<void> {
  await Promise.all([
    supabase
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", orderId),
    supabase
      .from("restaurant_tables")
      .update({ status: "free", current_order_id: null })
      .eq("id", tableId),
  ]);
}

export async function changeOrderTable(
  orderId: string,
  oldTableId: string,
  newTableId: string
): Promise<void> {
  await Promise.all([
    supabase.from("orders").update({ table_id: newTableId }).eq("id", orderId),
    supabase
      .from("restaurant_tables")
      .update({ status: "free", current_order_id: null })
      .eq("id", oldTableId),
    supabase
      .from("restaurant_tables")
      .update({ status: "occupied", current_order_id: orderId })
      .eq("id", newTableId),
  ]);
}

type PosCartItem = {
  product_id: string;
  qty: number;
  modifiers: SelectedModifier[];
};

type CreatePosOrderParams = {
  restaurantId: string;
  orderType: PosOrderType;
  payment: PosPaymentMethod;
  cashGiven: number;
  customerName: string;
  items: PosCartItem[];
};

export type CreatePosOrderResult = {
  orderId: string;
};

const ORDER_TYPE_MAP: Record<PosOrderType, string> = {
  counter: "dine_in",
  pickup: "pickup",
  delivery: "delivery",
};

export async function createPosOrder(
  params: CreatePosOrderParams
): Promise<CreatePosOrderResult> {
  const { restaurantId, orderType, payment, cashGiven, customerName, items } = params;

  const rpcItems = items.map((item) => ({
    product_id: item.product_id,
    qty: item.qty,
    options: item.modifiers.map((mod) => ({ option_id: mod.option_id, qty: 1 })),
    ingredients: [],
  }));

  // fiado → cash payment method in DB, then update payment_status to pending
  const paymentMethod = payment === "card" ? "card_on_delivery" : "cash";
  const posNotes = JSON.stringify({ pos: true });

  const { data, error } = await supabase.rpc("create_order_safe_v2", {
    p_restaurant_id: restaurantId,
    p_client_order_key: crypto.randomUUID(),
    p_payment_method: paymentMethod,
    p_order_type: ORDER_TYPE_MAP[orderType],
    p_delivery_fee: 0,
    p_cash_given: payment === "cash" ? cashGiven : null,
    p_customer_name: customerName || "Cliente mostrador",
    p_customer_phone: "",
    p_delivery_address: "",
    p_notes: posNotes,
    p_items: rpcItems,
    p_source: "pos",
  });

  if (error) {
    console.error("[pos] create_order_safe_v2 error", error);
    throw new Error(String(error.message ?? "Error al crear el pedido"));
  }

  let orderId = "";
  if (typeof data === "string") {
    orderId = data.trim();
  } else if (typeof data === "object" && data !== null) {
    const d = data as { order_id?: unknown; id?: unknown; orderId?: unknown };
    orderId = String(d.order_id ?? d.id ?? d.orderId ?? "").trim();
  }

  if (!orderId) {
    throw new Error("No se recibió el ID del pedido creado");
  }

  // Fiado: mark payment as pending
  if (payment === "fiado") {
    void supabase
      .from("orders")
      .update({ payment_status: "pending" })
      .eq("id", orderId);
  }

  // FIX 5: Decrement stock for tracked products (best-effort, non-blocking)
  void decrementStock(items);

  return { orderId };
}

async function decrementStock(items: PosCartItem[]): Promise<void> {
  if (items.length === 0) return;

  const productIds = items.map((i) => i.product_id);

  const { data: stockData } = await supabase
    .from("products")
    .select("id, stock_quantity")
    .in("id", productIds)
    .eq("track_stock", true);

  if (!stockData || stockData.length === 0) return;

  type StockRow = { id: string; stock_quantity: number };
  const stockMap = new Map(
    (stockData as StockRow[]).map((p) => [p.id, p.stock_quantity])
  );

  await Promise.all(
    items
      .filter((item) => stockMap.has(item.product_id))
      .map((item) =>
        supabase
          .from("products")
          .update({
            stock_quantity: Math.max(
              0,
              (stockMap.get(item.product_id) ?? 0) - item.qty
            ),
          })
          .eq("id", item.product_id)
          .eq("track_stock", true)
      )
  );
}
