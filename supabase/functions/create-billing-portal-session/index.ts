import Stripe from "https://esm.sh/stripe@14.25.0?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import {
  getStripeEnvConfig,
  missingStripeEnv,
  stripeNotConfiguredResponse,
} from "../_shared/stripeConfig.ts";
import { corsHeaders, jsonResponse } from "../_shared/http.ts";

type RestaurantRow = {
  stripe_billing_customer_id: string | null;
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
  const body = (await req.json().catch(() => ({}))) as {
    restaurant_id?: string;
    return_url?: string;
  };
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

  if (!membership) {
    return jsonResponse(403, { error: "Sin permisos para gestionar la facturación" });
  }

  // 4. Leer stripe_billing_customer_id — necesario para abrir el portal
  const { data: restaurant, error: restErr } = await supabase
    .from("restaurants")
    .select("stripe_billing_customer_id")
    .eq("id", restaurantId)
    .maybeSingle<RestaurantRow>();

  if (restErr || !restaurant) return jsonResponse(404, { error: "Restaurante no encontrado" });

  if (!restaurant.stripe_billing_customer_id) {
    return jsonResponse(400, {
      error: "Este restaurante no tiene una suscripción activa en Stripe",
      code: "NO_STRIPE_CUSTOMER",
    });
  }

  // 5. Construir URL de retorno
  const siteUrl = Deno.env.get("SITE_URL") ?? req.headers.get("origin") ?? "http://localhost:5173";
  const returnUrl = String(body.return_url ?? `${siteUrl}/admin/billing`).trim();

  // 6. Crear sesión del Customer Portal de Stripe
  //    Permite: cambiar plan, cancelar, actualizar tarjeta, ver facturas
  const stripe = new Stripe(env.secretKey, { apiVersion: "2024-06-20" });
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: restaurant.stripe_billing_customer_id,
    return_url: returnUrl,
  });

  console.log(
    `[create-billing-portal-session] Portal creado para restaurante=${restaurantId} ` +
    `customer=${restaurant.stripe_billing_customer_id}`
  );
  return jsonResponse(200, { url: portalSession.url });
});
