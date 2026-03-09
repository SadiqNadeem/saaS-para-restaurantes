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
  const missing = missingStripeEnv(env, ["secretKey", "webhookSecret"]);
  if (missing.length > 0) {
    return stripeNotConfiguredResponse(missing);
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return jsonResponse(400, { error: "Missing stripe-signature header" });
  }

  const payload = await req.text();
  if (!payload) {
    return jsonResponse(400, { error: "Empty webhook body" });
  }

  return jsonResponse(501, {
    error: "Webhook Stripe pendiente de implementacion",
    code: "STRIPE_WEBHOOK_NOT_READY",
  });
});
