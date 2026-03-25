import Stripe from "https://esm.sh/stripe@14.25.0?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { checkRateLimit, getClientIp, RATE_LIMITS, rateLimitedResponse } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type OrderRow = {
  id: string;
  total: number | null;
  restaurant_id: string | null;
};

type RestaurantRow = {
  id: string;
  slug: string;
  stripe_account_id: string | null;
  stripe_charges_enabled: boolean | null;
  online_payment_enabled: boolean | null;
};

function json(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  // Rate limit: 30 requests/min por IP
  const ip = getClientIp(req);
  const rl = await checkRateLimit(`orders:ip:${ip}`, RATE_LIMITS.orders);
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfter);

  try {
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const siteUrl =
      Deno.env.get("SITE_URL") ??
      req.headers.get("origin") ??
      "http://localhost:5173";

    if (!stripeSecretKey || !supabaseUrl || !supabaseServiceRoleKey) {
      return json(503, {
        error: "Stripe no configurado",
        code: "STRIPE_NOT_CONFIGURED",
        missing: [
          !stripeSecretKey ? "STRIPE_SECRET_KEY" : null,
          !supabaseUrl ? "SUPABASE_URL" : null,
          !supabaseServiceRoleKey ? "SUPABASE_SERVICE_ROLE_KEY" : null,
        ].filter(Boolean),
      });
    }

    const body = (await req.json().catch(() => ({}))) as {
      order_id?: string;
      slug?: string;
    };
    const orderId = String(body.order_id ?? "").trim();
    const slug = String(body.slug ?? "default").trim() || "default";

    if (!orderId) {
      return json(400, { error: "order_id is required" });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Leer pedido
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("id,total,restaurant_id")
      .eq("id", orderId)
      .maybeSingle<OrderRow>();

    if (orderError) return json(400, { error: orderError.message });
    if (!order) return json(404, { error: "Order not found" });

    const total = Number(order.total ?? 0);
    if (!(total > 0)) {
      return json(400, { error: "Order total must be greater than 0" });
    }
    if (!order.restaurant_id) {
      return json(400, { error: "Order restaurant_id is missing" });
    }

    // 2. Leer restaurante con columnas Stripe Connect
    const { data: restaurant, error: restaurantError } = await supabaseAdmin
      .from("restaurants")
      .select(
        "id, slug, stripe_account_id, stripe_charges_enabled, online_payment_enabled"
      )
      .eq("slug", slug)
      .maybeSingle<RestaurantRow>();

    if (restaurantError) return json(400, { error: restaurantError.message });
    if (!restaurant) return json(404, { error: "Restaurant slug not found" });

    if (restaurant.id !== order.restaurant_id) {
      return json(403, { error: "Order does not belong to this restaurant" });
    }

    // 3. Verificar que el restaurante tiene Stripe Connect activo
    //    Si no tiene cuenta o charges no están habilitados, devolver error claro.
    const stripeAccountId = restaurant.stripe_account_id ?? null;
    const chargesEnabled = restaurant.stripe_charges_enabled === true;

    if (!stripeAccountId || !chargesEnabled) {
      return json(422, {
        error: "El restaurante no tiene Stripe configurado para cobros online",
        code: "STRIPE_ACCOUNT_NOT_READY",
        details: !stripeAccountId
          ? "stripe_account_id no configurado"
          : "stripe_charges_enabled = false",
      });
    }

    // 4. Crear sesión de Checkout enrutada a la cuenta Express del restaurante
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" });

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        success_url: `${siteUrl}/r/${encodeURIComponent(slug)}/checkout/success?order_id=${encodeURIComponent(orderId)}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl}/r/${encodeURIComponent(slug)}/checkout/cancel?order_id=${encodeURIComponent(orderId)}`,
        currency: "eur",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "eur",
              unit_amount: Math.round(total * 100),
              product_data: {
                name: `Pedido #${orderId.slice(0, 8).toUpperCase()}`,
              },
            },
          },
        ],
        metadata: {
          order_id: orderId,
          restaurant_id: restaurant.id,
        },
        // application_fee_amount omitido intencionalmente (0% comisión por ahora)
      },
      // Stripe Connect: el cargo va directamente a la cuenta del restaurante
      { stripeAccount: stripeAccountId }
    );

    if (!session.url) {
      return json(500, { error: "Stripe session URL not available" });
    }

    return json(200, { url: session.url });
  } catch (error) {
    const message = String(
      (error as { message?: unknown })?.message ?? "Unexpected error"
    );
    console.error("[create-stripe-session]", message);
    return json(500, { error: message });
  }
});
