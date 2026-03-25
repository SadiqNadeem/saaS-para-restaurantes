import Stripe from "https://esm.sh/stripe@14.25.0?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import {
  getStripeEnvConfig,
  missingStripeEnv,
  stripeNotConfiguredResponse,
} from "../_shared/stripeConfig.ts";
import { corsHeaders, jsonResponse } from "../_shared/http.ts";

type RestaurantStripeRow = {
  stripe_account_id: string | null;
};

/**
 * Consulta Stripe para obtener el estado real de la cuenta Express del restaurante
 * y actualiza las columnas stripe_* en la BD.
 *
 * Llamada desde:
 *   - AdminSettingsPage al montar la sección de pagos (si hay stripe_account_id)
 *   - handle-stripe-webhook al recibir account.updated
 */
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

  // 4. Leer stripe_account_id
  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("stripe_account_id")
    .eq("id", restaurantId)
    .maybeSingle<RestaurantStripeRow>();

  if (!restaurant?.stripe_account_id) {
    return jsonResponse(200, { connected: false, reason: "no_account_id" });
  }

  // 5. Consultar Stripe API
  const stripe = new Stripe(env.secretKey, { apiVersion: "2024-06-20" });
  let account: Stripe.Account;

  try {
    account = await stripe.accounts.retrieve(restaurant.stripe_account_id);
  } catch (err) {
    // La cuenta fue eliminada o el ID ya no es válido en Stripe
    console.error("[get-stripe-status] Cuenta no encontrada en Stripe:", String(err));
    await supabase
      .from("restaurants")
      .update({
        stripe_connected: false,
        stripe_charges_enabled: false,
        stripe_payouts_enabled: false,
        stripe_connect_status: "invalid_account",
        stripe_last_sync_at: new Date().toISOString(),
      })
      .eq("id", restaurantId);

    return jsonResponse(200, {
      connected: false,
      reason: "account_not_found_in_stripe",
    });
  }

  // 6. Calcular estado consolidado
  const chargesEnabled = account.charges_enabled === true;
  const payoutsEnabled = account.payouts_enabled === true;
  const detailsSubmitted = account.details_submitted === true;

  const status: string = (() => {
    if (chargesEnabled && payoutsEnabled) return "active";
    if (detailsSubmitted) return "connected_not_chargeable";
    return "onboarding_pending";
  })();

  // 7. Persistir en BD
  const { error: updateErr } = await supabase
    .from("restaurants")
    .update({
      stripe_connected: true,
      stripe_charges_enabled: chargesEnabled,
      stripe_payouts_enabled: payoutsEnabled,
      stripe_onboarding_completed: detailsSubmitted,
      stripe_connect_status: status,
      stripe_last_sync_at: new Date().toISOString(),
    })
    .eq("id", restaurantId);

  if (updateErr) {
    console.error("[get-stripe-status] Error actualizando BD:", updateErr);
  }

  return jsonResponse(200, {
    connected: true,
    charges_enabled: chargesEnabled,
    payouts_enabled: payoutsEnabled,
    details_submitted: detailsSubmitted,
    status,
  });
});
