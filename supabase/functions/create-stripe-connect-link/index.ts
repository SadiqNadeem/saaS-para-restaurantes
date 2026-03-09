import { corsHeaders, jsonResponse } from "../_shared/http.ts";
import {
  getStripeEnvConfig,
  missingStripeEnv,
  stripeNotConfiguredResponse,
} from "../_shared/stripeConfig.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const env = getStripeEnvConfig();
  const missing = missingStripeEnv(env, ["secretKey", "clientId"]);
  if (missing.length > 0) {
    return stripeNotConfiguredResponse(missing);
  }

  const body = (await req.json().catch(() => ({}))) as {
    restaurant_id?: string;
    refresh_url?: string;
    return_url?: string;
  };

  const restaurantId = String(body.restaurant_id ?? "").trim();
  if (!restaurantId) {
    return jsonResponse(400, { error: "restaurant_id is required" });
  }

  // Placeholder until Stripe Connect onboarding is wired with real credentials.
  return jsonResponse(501, {
    error: "Stripe Connect aun no activado en este entorno",
    code: "STRIPE_CONNECT_NOT_READY",
    restaurant_id: restaurantId,
    expected_next_step: "Create account link with stripe.accountLinks.create",
  });
});
