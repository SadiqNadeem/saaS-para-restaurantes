import { supabase } from "../../lib/supabase";

export const FEATURE_KEYS = [
  "pos",
  "online_ordering",
  "tables",
  "table_qr",
  "staff_roles",
  "website_customization",
  "seo_tools",
  "coupons",
  "loyalty",
  "whatsapp_chatbot",
  "stripe_online_payments",
  "printer_auto",
  "metrics",
  "logs",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export type RestaurantFeatureMap = Record<FeatureKey, boolean>;

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  pos: "TPV",
  online_ordering: "Pedidos online",
  tables: "Mesas",
  table_qr: "QR mesas",
  staff_roles: "Equipo y roles",
  website_customization: "Personalizacion web",
  seo_tools: "Herramientas SEO",
  coupons: "Cupones",
  loyalty: "Fidelizacion",
  whatsapp_chatbot: "Chatbot WhatsApp",
  stripe_online_payments: "Pagos online Stripe",
  printer_auto: "Impresion automatica",
  metrics: "Metricas",
  logs: "Logs",
};

type FeatureRow = {
  feature_key: string;
  enabled: boolean | null;
};

export function createDefaultFeatureMap(value = true): RestaurantFeatureMap {
  return FEATURE_KEYS.reduce((acc, key) => {
    acc[key] = value;
    return acc;
  }, {} as RestaurantFeatureMap);
}

export function mergeFeatureRows(rows: FeatureRow[]): RestaurantFeatureMap {
  const base = createDefaultFeatureMap(true);
  for (const row of rows) {
    if ((FEATURE_KEYS as readonly string[]).includes(row.feature_key)) {
      const key = row.feature_key as FeatureKey;
      base[key] = row.enabled !== false;
    }
  }
  return base;
}

export async function hasFeature(restaurantId: string, featureKey: FeatureKey): Promise<boolean> {
  const id = String(restaurantId ?? "").trim();
  if (!id) return false;

  const { data, error } = await supabase
    .from("restaurant_features")
    .select("enabled")
    .eq("restaurant_id", id)
    .eq("feature_key", featureKey)
    .maybeSingle<{ enabled: boolean | null }>();

  if (error) return false;
  return data?.enabled !== false;
}
