import { jsonResponse } from "./http.ts";

export type StripeEnvConfig = {
  secretKey: string;
  clientId: string;
  webhookSecret: string;
};

function read(name: string): string {
  return String(Deno.env.get(name) ?? "").trim();
}

export function getStripeEnvConfig(): StripeEnvConfig {
  return {
    secretKey: read("STRIPE_SECRET_KEY"),
    clientId: read("STRIPE_CLIENT_ID"),
    webhookSecret: read("STRIPE_WEBHOOK_SECRET"),
  };
}

export function missingStripeEnv(config: StripeEnvConfig, required: Array<keyof StripeEnvConfig>): string[] {
  return required.filter((key) => !config[key]).map((key) => {
    if (key === "secretKey") return "STRIPE_SECRET_KEY";
    if (key === "clientId") return "STRIPE_CLIENT_ID";
    return "STRIPE_WEBHOOK_SECRET";
  });
}

export function stripeNotConfiguredResponse(missing: string[]): Response {
  return jsonResponse(503, {
    error: "Stripe no configurado",
    code: "STRIPE_NOT_CONFIGURED",
    missing,
  });
}
