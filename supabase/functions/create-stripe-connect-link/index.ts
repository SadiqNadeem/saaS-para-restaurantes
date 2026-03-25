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
  stripe_account_id: string | null;
};

type ProfileRow = {
  email: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  // Express Connect solo requiere secretKey — no necesita STRIPE_CLIENT_ID
  const env = getStripeEnvConfig();
  const missing = missingStripeEnv(env, ["secretKey"]);
  if (missing.length > 0) return stripeNotConfiguredResponse(missing);

  // 1. Autenticar llamante con JWT de Supabase
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return jsonResponse(401, { error: "Missing authorization header" });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return jsonResponse(401, { error: "Invalid or expired token" });

  // 2. Leer parámetros del body
  const body = (await req.json().catch(() => ({}))) as {
    restaurant_id?: string;
    return_url?: string;
    refresh_url?: string;
  };
  const restaurantId = String(body.restaurant_id ?? "").trim();
  if (!restaurantId) return jsonResponse(400, { error: "restaurant_id is required" });

  // 3. Verificar que el usuario es owner/admin del restaurante
  const { data: membership, error: memberErr } = await supabase
    .from("restaurant_members")
    .select("access_role")
    .eq("restaurant_id", restaurantId)
    .eq("user_id", user.id)
    .in("access_role", ["owner", "admin"])
    .maybeSingle();

  if (memberErr) return jsonResponse(500, { error: memberErr.message });
  if (!membership) {
    return jsonResponse(403, {
      error: "No tienes permisos para conectar Stripe en este restaurante",
    });
  }

  // 4. Leer restaurante — necesitamos stripe_account_id actual
  const { data: restaurant, error: restErr } = await supabase
    .from("restaurants")
    .select("id, stripe_account_id")
    .eq("id", restaurantId)
    .maybeSingle<RestaurantRow>();

  if (restErr || !restaurant) {
    return jsonResponse(404, { error: "Restaurante no encontrado" });
  }

  const stripe = new Stripe(env.secretKey, { apiVersion: "2024-06-20" });

  // 5. Si no tiene cuenta Express aún, crearla ahora
  let stripeAccountId = restaurant.stripe_account_id;
  if (!stripeAccountId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .maybeSingle<ProfileRow>();

    const account = await stripe.accounts.create({
      type: "express",
      country: "ES",
      ...(profile?.email ? { email: profile.email } : {}),
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_profile: {
        mcc: "5812", // Eating places and restaurants
      },
    });

    stripeAccountId = account.id;

    // Guardar antes de crear el link — si el link falla, la cuenta no se pierde
    const { error: saveErr } = await supabase
      .from("restaurants")
      .update({
        stripe_account_id: stripeAccountId,
        stripe_connected: false,
        stripe_connect_status: "onboarding_pending",
        stripe_last_sync_at: new Date().toISOString(),
      })
      .eq("id", restaurantId);

    if (saveErr) {
      console.error("[stripe-connect-link] Error guardando account_id:", saveErr);
      return jsonResponse(500, { error: "Error guardando cuenta Stripe en la base de datos" });
    }
  }

  // 6. Construir URLs — el frontend las pasa con el slug ya resuelto
  const siteUrl = Deno.env.get("SITE_URL") ?? req.headers.get("origin") ?? "http://localhost:5173";
  const returnUrl = String(body.return_url ?? `${siteUrl}/admin/settings`).trim();
  const refreshUrl = String(body.refresh_url ?? returnUrl).trim();

  // 7. Crear account link de onboarding (o re-onboarding si ya tiene cuenta)
  const accountLink = await stripe.accountLinks.create({
    account: stripeAccountId,
    type: "account_onboarding",
    return_url: returnUrl,
    refresh_url: refreshUrl,
  });

  return jsonResponse(200, { url: accountLink.url, account_id: stripeAccountId });
});
