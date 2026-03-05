import { supabase } from "../supabase";
import { logEvent } from "../logging/logEvent";
import { printHtml58mm } from "./printHtml58mm";
import {
  renderTicketHtml,
  type PrintMode,
  type TicketOrder,
  type TicketSettings,
} from "./renderTicket";

type OrderRow = Record<string, unknown> & {
  id: string;
  created_at?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  order_type?: string | null;
  address_line?: string | null;
  address_text?: string | null;
  instructions?: string | null;
  address_notes?: string | null;
  payment_method?: string | null;
  cash_given?: number | null;
  change_due?: number | null;
  total?: number | null;
  delivery_fee?: number | null;
  print_count?: number | null;
};

type OrderItemRow = {
  id: string;
  qty: number | null;
  unit_price: number | null;
  base_price: number | null;
  product_id: string;
};

type ProductRow = {
  id: string;
  name: string | null;
};

type ItemIngredientRow = {
  order_item_id: string;
  ingredient_id: string;
};

type IngredientRow = {
  id: string;
  name: string | null;
  price: number | null;
};

type ModifierOptionRow = {
  order_item_id: string;
  option_name: string | null;
  price: number | null;
};

type RestaurantSettingsRow = {
  receipt_header?: string | null;
  receipt_footer?: string | null;
  logo_url?: string | null;
  business_phone?: string | null;
};

type RestaurantRow = {
  name: string | null;
};

type PrintOrderOptions = {
  orderId: string;
  restaurantId: string;
  mode?: PrintMode;
  retryCount?: number;
};

type PrintOrderResult = {
  ok: boolean;
  errorMessage?: string;
};

const settingsCache = new Map<string, TicketSettings>();

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function loadRestaurantSettings(restaurantId: string): Promise<TicketSettings> {
  const cached = settingsCache.get(restaurantId);
  if (cached) {
    return cached;
  }

  const settingsByRestaurant = await supabase
    .from("restaurant_settings")
    .select("receipt_header, receipt_footer, logo_url, business_phone")
    .eq("restaurant_id", restaurantId)
    .limit(1)
    .maybeSingle();

  let settings: RestaurantSettingsRow | null = null;
  if (!settingsByRestaurant.error && settingsByRestaurant.data) {
    settings = settingsByRestaurant.data as RestaurantSettingsRow;
  } else {
    const fallback = await supabase
      .from("restaurant_settings")
      .select("receipt_header, receipt_footer, logo_url, business_phone")
      .limit(1)
      .maybeSingle();

    if (!fallback.error && fallback.data) {
      settings = fallback.data as RestaurantSettingsRow;
    }
  }

  const restaurantQuery = await supabase
    .from("restaurants")
    .select("name")
    .eq("id", restaurantId)
    .maybeSingle();
  const restaurant = restaurantQuery.data as RestaurantRow | null;

  const nextSettings = {
    restaurantName: restaurant?.name ?? "Restaurante",
    receiptHeader: settings?.receipt_header ?? null,
    receiptFooter: settings?.receipt_footer ?? null,
    logoUrl: settings?.logo_url ?? null,
    businessPhone: settings?.business_phone ?? null,
  };
  settingsCache.set(restaurantId, nextSettings);
  return nextSettings;
}

async function loadOrderForTicket(orderId: string, restaurantId: string): Promise<{
  order: OrderRow;
  ticket: TicketOrder;
  settings: TicketSettings;
}> {
  const orderQuery = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .single();

  if (orderQuery.error || !orderQuery.data) {
    throw new Error(orderQuery.error?.message ?? "No se pudo cargar el pedido.");
  }

  const order = orderQuery.data as OrderRow;

  const itemsQuery = await supabase
    .from("order_items")
    .select("id, qty, unit_price, base_price, product_id")
    .eq("order_id", orderId)
    .eq("restaurant_id", restaurantId);

  if (itemsQuery.error) {
    throw new Error(itemsQuery.error.message);
  }

  const items = (itemsQuery.data ?? []) as OrderItemRow[];
  const productIds = Array.from(new Set(items.map((item) => item.product_id))).filter(Boolean);
  const itemIds = items.map((item) => item.id);

  const productsById: Record<string, ProductRow> = {};
  if (productIds.length > 0) {
    const productQuery = await supabase
      .from("products")
      .select("id, name")
      .eq("restaurant_id", restaurantId)
      .in("id", productIds);

    if (productQuery.error) {
      throw new Error(productQuery.error.message);
    }

    for (const product of (productQuery.data ?? []) as ProductRow[]) {
      productsById[product.id] = product;
    }
  }

  const extrasByItem: Record<string, Array<{ name: string; price: number }>> = {};
  const modifiersByItem: Record<string, Array<{ name: string; price: number }>> = {};
  if (itemIds.length > 0) {
    const linkQuery = await supabase
      .from("order_item_ingredients")
      .select("order_item_id, ingredient_id")
      .in("order_item_id", itemIds);

    if (!linkQuery.error) {
      const links = (linkQuery.data ?? []) as ItemIngredientRow[];
      const ingredientIds = Array.from(new Set(links.map((row) => row.ingredient_id))).filter(Boolean);
      const ingredientsById: Record<string, IngredientRow> = {};

      if (ingredientIds.length > 0) {
        const ingredientQuery = await supabase
          .from("ingredients")
          .select("id, name, price")
          .in("id", ingredientIds);
        if (!ingredientQuery.error) {
          for (const ingredient of (ingredientQuery.data ?? []) as IngredientRow[]) {
            ingredientsById[ingredient.id] = ingredient;
          }
        }
      }

      for (const link of links) {
        if (!extrasByItem[link.order_item_id]) {
          extrasByItem[link.order_item_id] = [];
        }
        const ingredient = ingredientsById[link.ingredient_id];
        extrasByItem[link.order_item_id].push({
          name: ingredient?.name ?? "Extra",
          price: toNumber(ingredient?.price, 0),
        });
      }
    }

    const modifiersQuery = await supabase
      .from("order_item_modifier_options")
      .select("order_item_id, option_name, price")
      .eq("restaurant_id", restaurantId)
      .in("order_item_id", itemIds);

    if (!modifiersQuery.error) {
      for (const row of (modifiersQuery.data ?? []) as ModifierOptionRow[]) {
        if (!modifiersByItem[row.order_item_id]) {
          modifiersByItem[row.order_item_id] = [];
        }
        modifiersByItem[row.order_item_id].push({
          name: row.option_name ?? "Modificador",
          price: toNumber(row.price, 0),
        });
      }
    }
  }

  const subtotal = items.reduce(
    (sum, item) => sum + toNumber(item.qty, 1) * toNumber(item.unit_price, toNumber(item.base_price, 0)),
    0
  );
  const deliveryFee = toNumber(order.delivery_fee, 0);
  const total = toNumber(order.total, subtotal + deliveryFee);

  const ticket: TicketOrder = {
    id: order.id,
    createdAt: order.created_at ?? null,
    customerName: order.customer_name ?? null,
    customerPhone: order.customer_phone ?? null,
    orderType: order.order_type ?? null,
    addressLine: order.address_line ?? order.address_text ?? null,
    notes: String(order.instructions ?? order.address_notes ?? "").trim() || null,
    paymentMethod: order.payment_method ?? null,
    cashGiven: order.cash_given ?? null,
    changeDue: order.change_due ?? null,
    subtotal,
    deliveryFee,
    total,
    items: items.map((item) => ({
      quantity: toNumber(item.qty, 1),
      name: productsById[item.product_id]?.name ?? item.product_id,
      unitPrice: toNumber(item.unit_price, toNumber(item.base_price, 0)),
      extras: extrasByItem[item.id] ?? [],
      modifiers: modifiersByItem[item.id] ?? [],
    })),
  };

  const settings = await loadRestaurantSettings(restaurantId);

  return { order, ticket, settings };
}

export async function printOrder(options: PrintOrderOptions): Promise<PrintOrderResult> {
  const { orderId, restaurantId, mode = "customer", retryCount = 1 } = options;

  try {
    const { order, ticket, settings } = await loadOrderForTicket(orderId, restaurantId);
    const html = renderTicketHtml(ticket, mode, settings);

    let lastError: unknown = null;
    let printedOk = false;
    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      try {
        await printHtml58mm(html);
        printedOk = true;
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (printedOk) {
      const { error: trackError } = await supabase
        .from("orders")
        .update({
          printed_at: new Date().toISOString(),
          print_count: toNumber(order.print_count, 0) + 1,
          last_print_error: null,
        })
        .eq("id", orderId)
        .eq("restaurant_id", restaurantId);

      if (trackError) {
        await logEvent("error", "admin_print", "print_tracking_update_error", {
          restaurantId,
          orderId,
          mode,
          error: trackError.message,
        });
        return { ok: false, errorMessage: String(trackError.message ?? "Error guardando tracking") };
      }

      return { ok: true };
    }

    const errorMessage = String((lastError as { message?: unknown })?.message ?? "Error al imprimir")
      .slice(0, 240);
    await supabase
      .from("orders")
      .update({
        print_count: toNumber(order.print_count, 0) + 1,
        last_print_error: errorMessage,
      })
      .eq("id", orderId)
      .eq("restaurant_id", restaurantId);
    await logEvent("error", "admin_print", "print_failed", {
      restaurantId,
      orderId,
      mode,
      error: errorMessage,
    });

    return { ok: false, errorMessage };
  } catch (error) {
    const errorMessage = String((error as { message?: unknown })?.message ?? "Error al imprimir")
      .slice(0, 240);
    try {
      const countQuery = await supabase
        .from("orders")
        .select("print_count")
        .eq("id", orderId)
        .eq("restaurant_id", restaurantId)
        .maybeSingle();
      const currentCount = toNumber((countQuery.data as { print_count?: unknown } | null)?.print_count, 0);

      await supabase
        .from("orders")
        .update({
          print_count: currentCount + 1,
          last_print_error: errorMessage,
        })
        .eq("id", orderId)
        .eq("restaurant_id", restaurantId);
    } catch {
      // no-op
    }
    await logEvent("error", "admin_print", "print_unhandled_error", {
      restaurantId,
      orderId,
      mode,
      error: errorMessage,
    });
    return { ok: false, errorMessage };
  }
}

export type { PrintOrderResult, PrintOrderOptions };
