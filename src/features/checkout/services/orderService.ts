import { supabase } from "../../../lib/supabase";
import type { CheckoutDraft } from "../types";

type RpcPaymentMethod = "cash" | "card_on_delivery" | "card_online";

type CartItem = {
  productId: string;
  qty: number;
  basePrice?: number;
  extras?: Array<{
    ingredientId?: string;
    name?: string;
    price?: number;
  }>;
  selectedModifiers?: Array<{
    groupId?: string;
    groupName?: string;
    options?: Array<{
      optionId?: string;
      name?: string;
      price?: number;
    }>;
  }>;
};

type CreateOrderParams = {
  draft: CheckoutDraft;
  cart: CartItem[];
  cartTotal: number;
  clientOrderKey: string;
  restaurantId: string;
  couponCode?: string;
  discountAmount?: number;
  checkoutSummary?: {
    subtotal?: number;
    deliveryFee?: number;
    total?: number;
  };
};

type CreateOrderResult = {
  orderId: string;
  warningMessage?: string;
};

type RestaurantFeeSettings = {
  delivery_fee_mode?: string | null;
  delivery_fee_fixed?: number | null;
  delivery_fee_per_km?: number | null;
};

type DeliveryAddressPayload = {
  street: string;
  number: string;
  floor?: string;
  door?: string;
  portal?: string;
  block?: string;
  staircase?: string;
  notes?: string;
  city?: string;
  postcode?: string;
  lat?: number;
  lng?: number;
  distance_km?: number;
};

type CreateOrderRpcPayload = {
  restaurant_id: string;
  restaurantId: string;
  client_order_key: string;
  customer_name: string;
  customer_phone: string;
  customer: {
    name: string;
    phone: string;
  };
  order_type: CheckoutDraft["orderType"];
  orderType: CheckoutDraft["orderType"];
  payment_method: RpcPaymentMethod;
  paymentMethod: RpcPaymentMethod;
  total: number;
  subtotal: number;
  delivery_fee: number;
  cash_given: number | null;
  address_line: string | null;
  address_lat: number | null;
  address_lng: number | null;
  is_building: boolean;
  portal: string | null;
  floor: string | null;
  door: string | null;
  block: string | null;
  stair: string | null;
  instructions: string | null;
  distance_km: number | null;
  delivery_address?: DeliveryAddressPayload | null;
  notes: ReturnType<typeof buildCheckoutNotes>;
  items: Array<{
    product_id: string;
    qty: number;
  }>;
};

function buildCheckoutNotes(draft: CheckoutDraft) {
  return {
    customer: {
      name: draft.customer.name,
      phone: draft.customer.phone,
    },
    orderType: draft.orderType,
    delivery:
      draft.orderType === "delivery" && draft.delivery
        ? {
            addressText: draft.delivery.addressText,
            street: draft.delivery.street ?? null,
            number: draft.delivery.number ?? null,
            city: draft.delivery.city ?? null,
            postcode: draft.delivery.postcode ?? draft.delivery.postalCode ?? null,
            postalCode: draft.delivery.postalCode ?? null,
            notes: draft.delivery.notes ?? null,
            isBuilding: draft.delivery.isBuilding ?? false,
            portal: draft.delivery.portal ?? null,
            floor: draft.delivery.floor ?? null,
            door: draft.delivery.door ?? null,
            block: draft.delivery.block ?? null,
            staircase: draft.delivery.staircase ?? draft.delivery.stair ?? null,
            stair: draft.delivery.stair ?? null,
            instructions: draft.delivery.instructions ?? null,
            lat: draft.delivery.lat ?? null,
            lng: draft.delivery.lng ?? null,
            distanceKm: draft.delivery.distanceKm ?? null,
          }
        : null,
    payment:
      draft.payment.method === "cash"
        ? { method: "cash", cashGiven: draft.payment.cashGiven }
        : { method: draft.payment.method, cashGiven: null },
  };
}

function isMissingClientOrderKeyColumn(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const message = String((error as { message?: unknown }).message ?? "").toLowerCase();
  return message.includes("client_order_key") && message.includes("column");
}

function isTotalMismatchError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const message = String((error as { message?: unknown }).message ?? "").toUpperCase();
  const code = String((error as { code?: unknown }).code ?? "").toUpperCase();
  return message.includes("TOTAL_MISMATCH") || code.includes("TOTAL_MISMATCH");
}

function round2(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function extractOrderIdFromRpcData(data: unknown): string {
  if (typeof data === "string" && data.trim()) {
    return data.trim();
  }

  if (Array.isArray(data) && data.length > 0) {
    return extractOrderIdFromRpcData(data[0]);
  }

  if (typeof data === "object" && data !== null) {
    const objectData = data as {
      orderId?: unknown;
      order_id?: unknown;
      id?: unknown;
      orderid?: unknown;
    };

    const candidate =
      objectData.orderId ?? objectData.order_id ?? objectData.id ?? objectData.orderid ?? "";
    const asString = String(candidate ?? "").trim();
    return asString;
  }

  return "";
}

async function getRestaurantFeeSettings(restaurantId: string): Promise<RestaurantFeeSettings | null> {
  const { data, error } = await supabase
    .from("restaurant_settings")
    .select("delivery_fee_mode, delivery_fee_fixed, delivery_fee_per_km")
    .eq("restaurant_id", restaurantId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(String(error.message ?? "No se pudo cargar configuracion de entrega"));
  }

  return (data as RestaurantFeeSettings | null) ?? null;
}

function computeDeliveryFee(params: {
  orderType: CheckoutDraft["orderType"];
  distanceKm: number;
  settings: RestaurantFeeSettings | null;
}): number {
  if (params.orderType !== "delivery") {
    return 0;
  }

  const mode = String(params.settings?.delivery_fee_mode ?? "fixed");
  if (mode === "distance") {
    const perKm = Number(params.settings?.delivery_fee_per_km ?? 0);
    return Math.max(0, perKm * Math.max(0, params.distanceKm));
  }

  return Math.max(0, Number(params.settings?.delivery_fee_fixed ?? 0));
}

async function findOrderByClientKey(clientOrderKey: string, restaurantId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("orders")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("client_order_key", clientOrderKey)
    .maybeSingle();

  if (error) {
    if (isMissingClientOrderKeyColumn(error)) {
      throw new Error("Falta la columna client_order_key en orders. Ejecuta la migracion correspondiente.");
    }
    throw error;
  }

  return data?.id ? String(data.id) : null;
}

export async function createOrderFromCheckout(params: CreateOrderParams): Promise<CreateOrderResult> {
  const { draft, cart, cartTotal, clientOrderKey, restaurantId, checkoutSummary, couponCode, discountAmount } = params;
  if (!cart || cart.length === 0) {
    throw new Error("Tu carrito esta vacio. Anade productos antes de finalizar.");
  }

  const existingOrderId = await findOrderByClientKey(clientOrderKey, restaurantId);
  if (existingOrderId) {
    return { orderId: existingOrderId };
  }

  const subtotalRounded = round2(
    Number.isFinite(Number(checkoutSummary?.subtotal))
      ? Number(checkoutSummary?.subtotal)
      : Number(cartTotal)
  );
  const rawPaymentMethod = (draft.payment as { method?: string } | null | undefined)?.method;
  const paymentMethod: RpcPaymentMethod =
    rawPaymentMethod === "card_on_delivery"
      ? "card_on_delivery"
      : rawPaymentMethod === "card_online" || rawPaymentMethod === "stripe_online"
        ? "card_online"
        : "cash";
  const orderType: CheckoutDraft["orderType"] =
    draft.orderType === "delivery" ? "delivery" : "pickup";
  const deliveryAddressText =
    orderType === "delivery" ? draft.delivery?.addressText?.trim() ?? "" : "";

  const deliveryAddress: DeliveryAddressPayload | null =
    orderType === "delivery" && draft.delivery
      ? {
          street: draft.delivery.street?.trim() ?? "",
          number: draft.delivery.number?.trim() ?? "",
          floor: draft.delivery.floor?.trim() || undefined,
          door: draft.delivery.door?.trim() || undefined,
          portal: draft.delivery.portal?.trim() || undefined,
          block: draft.delivery.block?.trim() || undefined,
          staircase: draft.delivery.staircase?.trim() || draft.delivery.stair?.trim() || undefined,
          notes:
            draft.delivery.instructions?.trim() ||
            draft.delivery.notes?.trim() ||
            undefined,
          city: draft.delivery.city?.trim() || undefined,
          postcode: draft.delivery.postcode?.trim() || draft.delivery.postalCode?.trim() || undefined,
          lat: typeof draft.delivery.lat === "number" ? draft.delivery.lat : undefined,
          lng: typeof draft.delivery.lng === "number" ? draft.delivery.lng : undefined,
          distance_km:
            typeof draft.delivery.distanceKm === "number" ? draft.delivery.distanceKm : undefined,
        }
      : null;

  if (orderType === "delivery" && !deliveryAddressText) {
    throw new Error("Introduce una direccion de entrega valida");
  }
  if (
    orderType === "delivery" &&
    (typeof deliveryAddress?.lat !== "number" || typeof deliveryAddress?.lng !== "number")
  ) {
    throw new Error("Selecciona una direccion valida");
  }

  const feeSettings = await getRestaurantFeeSettings(restaurantId);
  const distanceKm = typeof deliveryAddress?.distance_km === "number" ? deliveryAddress.distance_km : 0;
  const deliveryFeeRounded = round2(
    computeDeliveryFee({
      orderType,
      distanceKm,
      settings: feeSettings,
    })
  );
  const totalRounded = round2(subtotalRounded + deliveryFeeRounded);
  const parsedCashGiven = parseFloat(
    String(paymentMethod === "cash" && draft.payment.method === "cash" ? draft.payment.cashGiven : 0)
  );
  const cashGivenValue = Number.isFinite(parsedCashGiven) ? parsedCashGiven : 0;

  if (paymentMethod === "cash" && totalRounded > 0 && cashGivenValue <= 0) {
    throw new Error("CASH_GIVEN_REQUIRED");
  }

  const payload: CreateOrderRpcPayload = {
    restaurant_id: restaurantId,
    restaurantId: restaurantId,
    client_order_key: clientOrderKey,
    customer_name: draft.customer.name,
    customer_phone: draft.customer.phone,
    customer: {
      name: draft.customer.name,
      phone: draft.customer.phone,
    },
    order_type: orderType,
    orderType,
    payment_method: paymentMethod,
    paymentMethod,
    total: totalRounded,
    subtotal: subtotalRounded,
    delivery_fee: orderType === "pickup" ? 0 : deliveryFeeRounded,
    cash_given: paymentMethod === "cash" ? cashGivenValue : null,
    address_line: orderType === "delivery" ? deliveryAddressText : null,
    address_lat: orderType === "delivery" ? draft.delivery?.lat ?? null : null,
    address_lng: orderType === "delivery" ? draft.delivery?.lng ?? null : null,
    is_building: orderType === "delivery" ? Boolean(draft.delivery?.isBuilding) : false,
    portal: orderType === "delivery" ? draft.delivery?.portal ?? null : null,
    floor: orderType === "delivery" ? draft.delivery?.floor ?? null : null,
    door: orderType === "delivery" ? draft.delivery?.door ?? null : null,
    block: orderType === "delivery" ? draft.delivery?.block ?? null : null,
    stair: orderType === "delivery" ? draft.delivery?.stair ?? null : null,
    instructions:
      orderType === "delivery"
        ? draft.delivery?.instructions ?? draft.delivery?.notes ?? null
        : null,
    distance_km: orderType === "delivery" ? draft.delivery?.distanceKm ?? null : null,
    delivery_address: orderType === "delivery" ? deliveryAddress : null,
    notes: buildCheckoutNotes(draft),
    items: cart.map((item) => ({
      product_id: item.productId,
      qty: Math.max(1, Math.trunc(Number(item.qty) || 1)),
    })),
  };

  const cartItems = cart.map((item) => ({
    product_id: item.productId,
    qty: Math.max(1, Math.trunc(Number(item.qty) || 1)),
    options: (item.selectedModifiers ?? [])
      .flatMap((group) =>
        (group.options ?? []).map((option) => ({
          option_id: option.optionId,
          qty: 1,
        }))
      )
      .filter((option) => Boolean(option.option_id)),
    ingredients: (item.extras ?? [])
      .map((extra) => ({ ingredient_id: extra.ingredientId }))
      .filter((ingredient) => Boolean(ingredient.ingredient_id)),
  }));

  const rpcDeliveryFee = parseFloat(String(orderType === "pickup" ? 0 : payload.delivery_fee));
  const safeDeliveryFee = Number.isFinite(rpcDeliveryFee) ? rpcDeliveryFee : 0;
  const rpcCashGiven =
    payload.payment_method === "cash"
      ? (() => {
          const parsed = parseFloat(String(payload.cash_given ?? 0));
          return Number.isFinite(parsed) ? parsed : 0;
        })()
      : null;

  const rpcPayload = {
    p_restaurant_id: restaurantId,
    p_client_order_key: clientOrderKey,
    p_payment_method: payload.payment_method,
    p_order_type: orderType,
    p_delivery_fee: safeDeliveryFee,
    p_customer_name: payload.customer_name,
    p_customer_phone: payload.customer_phone,
    p_delivery_address: payload.address_line,
    p_cash_given: rpcCashGiven,
    p_notes: JSON.stringify(payload.notes ?? {}),
    p_tip_amount: Math.max(0, Number(draft.tipAmount ?? 0)),
    p_items: cartItems.map((i) => ({
      product_id: i.product_id,
      qty: Math.max(1, Math.trunc(Number(i.qty) || 1)),
      options: (i.options ?? []).map((o) => ({
        option_id: o.option_id,
        qty: Math.max(1, Math.trunc(Number(o.qty) || 1)),
      })),
      ingredients: (i.ingredients ?? []).map((g) => ({ ingredient_id: g.ingredient_id })),
    })),
  };

  console.log("[checkout] create_order_safe_v2 rpcPayload", JSON.stringify(rpcPayload, null, 2));
  const { data, error } = await supabase.rpc("create_order_safe_v2", rpcPayload);

  if (error) {
    console.error("[checkout] RPC error", error);
    console.error("[checkout] RPC error json", JSON.stringify(error, null, 2));
    console.error("[checkout] RPC data on error", data);
    if (isTotalMismatchError(error)) {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("checkout:refresh-required", { detail: { reason: "TOTAL_MISMATCH" } }));
      }
    }
    throw new Error(
      String(
        (error as { message?: unknown; details?: unknown; hint?: unknown } | null | undefined)?.message ??
          (error as { message?: unknown; details?: unknown; hint?: unknown } | null | undefined)?.details ??
          (error as { message?: unknown; details?: unknown; hint?: unknown } | null | undefined)?.hint ??
          "RPC_ERROR"
      )
    );
  }
  console.log("[checkout] RPC success data", data);
  console.log("[checkout] RPC success data json", JSON.stringify(data, null, 2));

  const orderId = extractOrderIdFromRpcData(data);
  const resolvedOrderId = orderId || (await findOrderByClientKey(clientOrderKey, restaurantId));

  if (!resolvedOrderId) {
    throw new Error(`RPC_EMPTY_ORDER_ID: ${JSON.stringify(data ?? null)}`);
  }

  if (orderId) {
    console.log("[checkout] RPC success data", data);
  } else {
    console.log("[checkout] order recovered by client_order_key", resolvedOrderId);
  }

  // Track loyalty points
  try {
    const { data: loyaltySettings } = await supabase
      .from("restaurant_settings")
      .select("loyalty_enabled, loyalty_points_per_eur")
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    const ls = loyaltySettings as { loyalty_enabled?: boolean | null; loyalty_points_per_eur?: number | null } | null;
    if (ls?.loyalty_enabled && ls.loyalty_points_per_eur && draft.customer.phone) {
      const earnedPts = Math.round(totalRounded * Number(ls.loyalty_points_per_eur));
      if (earnedPts > 0) {
        const phone = draft.customer.phone.trim();
        const { data: existing } = await supabase
          .from("customer_loyalty")
          .select("total_points, total_earned")
          .eq("restaurant_id", restaurantId)
          .eq("customer_phone", phone)
          .maybeSingle();
        const prev = existing as { total_points?: number; total_earned?: number } | null;
        await Promise.all([
          supabase.from("customer_loyalty").upsert(
            {
              restaurant_id: restaurantId,
              customer_phone: phone,
              total_points: (prev?.total_points ?? 0) + earnedPts,
              total_earned: (prev?.total_earned ?? 0) + earnedPts,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "restaurant_id,customer_phone" }
          ),
          supabase.from("loyalty_transactions").insert({
            restaurant_id: restaurantId,
            customer_phone: phone,
            order_id: resolvedOrderId,
            type: "earn",
            points: earnedPts,
          }),
        ]);
      }
    }
  } catch {
    // Loyalty tracking is non-critical; silently ignore errors
  }

  // Apply coupon: write coupon_code + discount_amount to order, increment uses_count
  if (couponCode && discountAmount && discountAmount > 0) {
    const safeDiscount = round2(discountAmount);

    await supabase
      .from("orders")
      .update({ coupon_code: couponCode, discount_amount: safeDiscount })
      .eq("id", resolvedOrderId);

    const { data: couponRow } = await supabase
      .from("coupons")
      .select("uses_count")
      .eq("restaurant_id", restaurantId)
      .eq("code", couponCode)
      .maybeSingle();

    if (couponRow) {
      await supabase
        .from("coupons")
        .update({ uses_count: (couponRow as { uses_count: number }).uses_count + 1 })
        .eq("restaurant_id", restaurantId)
        .eq("code", couponCode);
    }
  }

  return { orderId: resolvedOrderId };
}
