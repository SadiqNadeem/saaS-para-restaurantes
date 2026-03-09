import { corsHeaders, jsonResponse } from "../_shared/http.ts";
import {
  getStripeEnvConfig,
  missingStripeEnv,
  stripeNotConfiguredResponse,
} from "../_shared/stripeConfig.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const env = getStripeEnvConfig();
  const missing = missingStripeEnv(env, ["secretKey", "clientId"]);
  if (missing.length > 0) {
    return stripeNotConfiguredResponse(missing);
  }

  const url = new URL(req.url);
  const restaurantId = url.searchParams.get("restaurant_id") ?? null;

  // Placeholder callback handler to be completed once Stripe Connect is enabled.
  return jsonResponse(501, {
    error: "Callback de Stripe Connect pendiente de implementacion",
    code: "STRIPE_CONNECT_CALLBACK_NOT_READY",
    restaurant_id: restaurantId,
  });
});
