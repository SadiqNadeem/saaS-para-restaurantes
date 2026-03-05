import { supabase } from "../../../lib/supabase";
import type { CartItem } from "../types";

const CART_SESSION_KEY = "checkout_cart_session_id";

function safeUUID(): string {
  const cryptoApi = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function getOrCreateCartSessionId(): string {
  if (typeof window === "undefined") return safeUUID();
  try {
    const existing = window.sessionStorage.getItem(CART_SESSION_KEY);
    if (existing && existing.trim().length > 0) return existing;
    const fresh = safeUUID();
    window.sessionStorage.setItem(CART_SESSION_KEY, fresh);
    return fresh;
  } catch {
    return safeUUID();
  }
}

type SaveAbandonedCartParams = {
  restaurantId: string;
  sessionId: string;
  customerName?: string;
  customerPhone?: string;
  cart: CartItem[];
  cartTotal: number;
  orderType?: string;
};

let currentCartId: string | null = null;

export async function saveAbandonedCart(params: SaveAbandonedCartParams): Promise<void> {
  const { restaurantId, sessionId, customerName, customerPhone, cart, cartTotal, orderType } = params;

  if (cart.length === 0) return;

  const cartItemsPayload = cart.map((item) => ({
    productId: item.productId,
    name: item.name,
    qty: item.qty,
    basePrice: item.basePrice,
    unitPrice: item.unitPrice,
    selectedModifiers: item.selectedModifiers ?? [],
    extras: item.extras ?? [],
  }));

  if (currentCartId) {
    // Update existing record
    await supabase
      .from("abandoned_carts")
      .update({
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        cart_items: cartItemsPayload,
        cart_total: cartTotal,
        order_type: orderType || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", currentCartId)
      .eq("restaurant_id", restaurantId);
    return;
  }

  // Try to find existing record for this session
  const { data: existing } = await supabase
    .from("abandoned_carts")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("session_id", sessionId)
    .eq("recovered", false)
    .maybeSingle();

  if (existing && (existing as { id: string }).id) {
    currentCartId = (existing as { id: string }).id;
    await supabase
      .from("abandoned_carts")
      .update({
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        cart_items: cartItemsPayload,
        cart_total: cartTotal,
        order_type: orderType || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", currentCartId)
      .eq("restaurant_id", restaurantId);
    return;
  }

  // Insert new record
  const { data: inserted } = await supabase
    .from("abandoned_carts")
    .insert({
      restaurant_id: restaurantId,
      session_id: sessionId,
      customer_name: customerName || null,
      customer_phone: customerPhone || null,
      cart_items: cartItemsPayload,
      cart_total: cartTotal,
      order_type: orderType || null,
    })
    .select("id")
    .maybeSingle();

  if (inserted && (inserted as { id: string }).id) {
    currentCartId = (inserted as { id: string }).id;
  }
}

export async function markCartRecovered(restaurantId: string, sessionId: string): Promise<void> {
  const idToMark = currentCartId;
  if (idToMark) {
    await supabase
      .from("abandoned_carts")
      .update({ recovered: true, recovered_at: new Date().toISOString() })
      .eq("id", idToMark)
      .eq("restaurant_id", restaurantId);
    currentCartId = null;
    return;
  }

  await supabase
    .from("abandoned_carts")
    .update({ recovered: true, recovered_at: new Date().toISOString() })
    .eq("restaurant_id", restaurantId)
    .eq("session_id", sessionId)
    .eq("recovered", false);
}

export function resetCartSession(): void {
  currentCartId = null;
  try {
    window.sessionStorage.removeItem(CART_SESSION_KEY);
  } catch {
    // ignore
  }
}
