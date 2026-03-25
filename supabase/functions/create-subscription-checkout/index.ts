import Stripe from "https://esm.sh/stripe@14.25.0?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import {
  getStripeEnvConfig,
  missingStripeEnv,
  stripeNotConfiguredResponse,
} from "../_shared/stripeConfig.ts";
import { corsHeaders, jsonResponse } from "../_shared/http.ts";

type RestaurantRow = {
  id: string;
  stripe_billing_customer_id: string | null;
  subscription_status: string;
};

type PlanRow = {
  id: string;
  name: string;
  stripe_price_id: string | null;
};

type ProfileRow = {
  email: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  const env = getStripeEnvConfig();
  const missing = missingStripeEnv(env, ["secretKey"]);
  if (missing.length > 0) return stripeNotConfiguredResponse(missing);

  // 1. Autenticar llamante con JWT de Supabase
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return jsonResponse(401, { error: "Missing authorization header" });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return jsonResponse(401, { error: "Invalid or expired token" });

  // 2. Parámetros del body
  const body = (await req.json().catch(() => ({}))) as {
    restaurant_id?: string;
    plan_id?: string;
    success_url?: string;
    cancel_url?: string;
  };
  const restaurantId = String(body.restaurant_id ?? "").trim();
  const planId = String(body.plan_id ?? "").trim();
  if (!restaurantId) return jsonResponse(400, { error: "restaurant_id is required" });
  if (!planId) return jsonResponse(400, { error: "plan_id is required" });

  // 3. Verificar membresía owner/admin
  const { data: membership } = await supabase
    .from("restaurant_members")
    .select("access_role")
    .eq("restaurant_id", restaurantId)
    .eq("user_id", user.id)
    .in("access_role", ["owner", "admin"])
    .maybeSingle();

  if (!membership) {
    return jsonResponse(403, { error: "Sin permisos para gestionar la suscripción" });
  }

  // 4. Leer plan y verificar que tiene stripe_price_id configurado
  const { data: plan } = await supabase
    .from("subscription_plans")
    .select("id, name, stripe_price_id")
    .eq("id", planId)
    .eq("is_active", true)
    .maybeSingle<PlanRow>();

  if (!plan) return jsonResponse(404, { error: "Plan no encontrado" });
  if (!plan.stripe_price_id) {
    return jsonResponse(503, {
      error: "Plan no configurado en Stripe todavía",
      code: "STRIPE_PRICE_NOT_CONFIGURED",
      plan_id: planId,
    });
  }

  // 5. Leer datos del restaurante
  const { data: restaurant, error: restErr } = await supabase
    .from("restaurants")
    .select("id, stripe_billing_customer_id, subscription_status")
    .eq("id", restaurantId)
    .maybeSingle<RestaurantRow>();

  if (restErr || !restaurant) return jsonResponse(404, { error: "Restaurante no encontrado" });

  const stripe = new Stripe(env.secretKey, { apiVersion: "2024-06-20" });

  // 6. Crear Customer de Stripe Billing si no existe aún
  //    (distinto de stripe_account_id que es de Stripe Connect)
  let customerId = restaurant.stripe_billing_customer_id;
  if (!customerId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .maybeSingle<ProfileRow>();

    const customer = await stripe.customers.create({
      email: profile?.email ?? user.email ?? undefined,
      metadata: { restaurant_id: restaurantId },
    });
    customerId = customer.id;

    const { error: saveErr } = await supabase
      .from("restaurants")
      .update({ stripe_billing_customer_id: customerId })
      .eq("id", restaurantId);

    if (saveErr) {
      console.error("[create-subscription-checkout] Error guardando customer_id:", saveErr);
      return jsonResponse(500, { error: "Error guardando customer en la base de datos" });
    }
  }

  // 7. Construir URLs de retorno
  const siteUrl = Deno.env.get("SITE_URL") ?? req.headers.get("origin") ?? "http://localhost:5173";
  const successUrl = String(
    body.success_url ?? `${siteUrl}/admin/settings?subscription_success=1`
  ).trim();
  const cancelUrl = String(body.cancel_url ?? `${siteUrl}/admin/billing`).trim();

  // 8. Crear sesión de Stripe Checkout en modo suscripción
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    // metadata en la sesión Y en la suscripción para que el webhook los tenga
    metadata: { restaurant_id: restaurantId, plan_id: planId },
    subscription_data: {
      metadata: { restaurant_id: restaurantId, plan_id: planId },
    },
  });

  console.log(
    `[create-subscription-checkout] Sesión creada: ${session.id} ` +
    `restaurante=${restaurantId} plan=${planId}`
  );
  return jsonResponse(200, { url: session.url, session_id: session.id });
});
