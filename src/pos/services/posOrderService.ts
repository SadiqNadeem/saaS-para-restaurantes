import { supabase } from "../../lib/supabase";
import type { SelectedModifier } from "../components/PosModifierModal";

export type PosOrderType = "counter" | "pickup" | "delivery";
export type PosPaymentMethod = "cash" | "card" | "fiado";

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
