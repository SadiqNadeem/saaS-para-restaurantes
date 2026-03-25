import Stripe from "https://esm.sh/stripe@14.25.0?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import {
  getStripeEnvConfig,
  missingStripeEnv,
  stripeNotConfiguredResponse,
} from "../_shared/stripeConfig.ts";
import { corsHeaders, jsonResponse } from "../_shared/http.ts";

type RestaurantRow = {
  subscription_plan_id: string | null;
  subscription_status: string;
  stripe_billing_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_current_period_end: string | null;
  trial_ends_at: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  const env = getStripeEnvConfig();
  const missing = missingStripeEnv(env, ["secretKey"]);
  if (missing.length > 0) return stripeNotConfiguredResponse(missing);

  // 1. Autenticar llamante
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return jsonResponse(401, { error: "Missing authorization header" });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return jsonResponse(401, { error: "Invalid or expired token" });

  // 2. Parámetros
  const body = (await req.json().catch(() => ({}))) as { restaurant_id?: string };
  const restaurantId = String(body.restaurant_id ?? "").trim();
  if (!restaurantId) return jsonResponse(400, { error: "restaurant_id is required" });

  // 3. Verificar membresía owner/admin
  const { data: membership } = await supabase
    .from("restaurant_members")
    .select("access_role")
    .eq("restaurant_id", restaurantId)
    .eq("user_id", user.id)
    .in("access_role", ["owner", "admin"])
    .maybeSingle();

  if (!membership) return jsonResponse(403, { error: "Sin permisos" });

  // 4. Leer datos de suscripción del restaurante
  const { data: restaurant, error: restErr } = await supabase
    .from("restaurants")
    .select(
      "subscription_plan_id, subscription_status, stripe_billing_customer_id, " +
      "stripe_subscription_id, subscription_current_period_end, trial_ends_at"
    )
    .eq("id", restaurantId)
    .maybeSingle<RestaurantRow>();

  if (restErr || !restaurant) return jsonResponse(404, { error: "Restaurante no encontrado" });

  // 5. Sin suscripción Stripe → devolver estado local (trialing, etc.)
  if (!restaurant.stripe_subscription_id) {
    return jsonResponse(200, {
      subscription_status: restaurant.subscription_status,
      subscription_plan_id: restaurant.subscription_plan_id,
      trial_ends_at: restaurant.trial_ends_at,
      subscription_current_period_end: null,
      synced_from_stripe: false,
    });
  }

  // 6. Consultar Stripe para obtener el estado real y sincronizar
  const stripe = new Stripe(env.secretKey, { apiVersion: "2024-06-20" });
  let sub: Stripe.Subscription;

  try {
    sub = await stripe.subscriptions.retrieve(restaurant.stripe_subscription_id);
  } catch (err) {
    console.error("[get-subscription-status] Error consultando Stripe:", String(err));
    // Devolver lo que tenemos en BD sin sincronizar — no bloqueamos al usuario
    return jsonResponse(200, {
      subscription_status: restaurant.subscription_status,
      subscription_plan_id: restaurant.subscription_plan_id,
      trial_ends_at: restaurant.trial_ends_at,
      subscription_current_period_end: restaurant.subscription_current_period_end,
      synced_from_stripe: false,
      stripe_error: "subscription_not_found_in_stripe",
    });
  }

  // 7. Mapear estado de Stripe a nuestros valores
  //    Stripe: active | past_due | canceled | unpaid | trialing | incomplete | incomplete_expired
  const stripeStatus = sub.status;
  const ourStatus = ((): string => {
    if (stripeStatus === "active" || stripeStatus === "trialing") return "active";
    if (stripeStatus === "past_due") return "past_due";
    if (stripeStatus === "canceled") return "canceled";
    if (stripeStatus === "unpaid") return "unpaid";
    return "past_due"; // incomplete / incomplete_expired → pasamos a past_due
  })();

  const periodEnd = new Date(sub.current_period_end * 1000).toISOString();

  // 8. Persistir estado sincronizado en BD
  const { error: updateErr } = await supabase
    .from("restaurants")
    .update({
      subscription_status: ourStatus,
      subscription_current_period_end: periodEnd,
    })
    .eq("id", restaurantId);

  if (updateErr) {
    console.error("[get-subscription-status] Error actualizando BD:", updateErr);
  }

  return jsonResponse(200, {
    subscription_status: ourStatus,
    subscription_plan_id: restaurant.subscription_plan_id,
    trial_ends_at: restaurant.trial_ends_at,
    subscription_current_period_end: periodEnd,
    synced_from_stripe: true,
    stripe_status: stripeStatus,
  });
});
