import { supabase } from "../../../lib/supabase";

type RestaurantSettings = {
  baseLat: number;
  baseLng: number;
  radiusKm: number;
};

const FALLBACK_SETTINGS: RestaurantSettings = {
  baseLat: 38.39706887411827,
  baseLng: -0.5234438654338988,
  radiusKm: 5,
};

export async function getRestaurantSettings(): Promise<RestaurantSettings> {
  try {
    const { data, error } = await supabase
      .from("restaurant_settings")
      .select("base_lat, base_lng, delivery_radius_km")
      .order("id", { ascending: true })
      .limit(1)
      .single();

    if (error || !data) {
      return FALLBACK_SETTINGS;
    }

    const baseLat = Number(data.base_lat);
    const baseLng = Number(data.base_lng);
    const radiusKm = Number(data.delivery_radius_km);

    if (!Number.isFinite(baseLat) || !Number.isFinite(baseLng) || !Number.isFinite(radiusKm)) {
      return FALLBACK_SETTINGS;
    }

    return { baseLat, baseLng, radiusKm };
  } catch {
    return FALLBACK_SETTINGS;
  }
}
