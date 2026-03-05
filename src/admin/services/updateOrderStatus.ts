import { supabase } from "../../lib/supabase";

export type OrderStatus =
  | "pending"
  | "accepted"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "delivered"
  | "cancelled";

type UpdateOrderStatusResult = {
  success: boolean;
  error?: string;
};

export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
  _cancelReason?: string
): Promise<UpdateOrderStatusResult> {
  const trimmedOrderId = String(orderId ?? "").trim();
  if (!trimmedOrderId) {
    return { success: false, error: "orderId es obligatorio" };
  }

  const { error } = await supabase.rpc("set_order_status_safe", {
    p_order_id: trimmedOrderId,
    p_status: newStatus,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
