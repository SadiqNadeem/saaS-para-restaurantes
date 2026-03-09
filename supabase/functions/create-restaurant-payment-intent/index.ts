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
  const missing = missingStripeEnv(env, ["secretKey"]);
  if (missing.length > 0) {
    return stripeNotConfiguredResponse(missing);
  }

  const body = (await req.json().catch(() => ({}))) as {
    order_id?: string;
    restaurant_id?: string;
    amount?: number;
    currency?: string;
  };

  const orderId = String(body.order_id ?? "").trim();
  if (!orderId) {
    return jsonResponse(400, { error: "order_id is required" });
  }

  return jsonResponse(501, {
    error: "PaymentIntent por restaurante pendiente de implementacion",
    code: "STRIPE_PAYMENT_INTENT_NOT_READY",
    order_id: orderId,
  });
});
