import { useEffect, useMemo, useState } from "react";

import { supabase } from "../../lib/supabase";
import { createDefaultFeatureMap, type FeatureKey, mergeFeatureRows, type RestaurantFeatureMap } from "./restaurantFeatures";

type FeatureRow = {
  feature_key: string;
  enabled: boolean | null;
};

export function useRestaurantFeatures(restaurantId: string) {
  const [features, setFeatures] = useState<RestaurantFeatureMap>(() => createDefaultFeatureMap(true));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      const id = String(restaurantId ?? "").trim();
      if (!id) {
        setFeatures(createDefaultFeatureMap(true));
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      const { data, error: queryError } = await supabase
        .from("restaurant_features")
        .select("feature_key,enabled")
        .eq("restaurant_id", id);

      if (!alive) return;

      if (queryError) {
        setError(queryError.message);
        setFeatures(createDefaultFeatureMap(true));
        setLoading(false);
        return;
      }

      const rows = Array.isArray(data) ? (data as FeatureRow[]) : [];
      setFeatures(mergeFeatureRows(rows));
      setLoading(false);
    };

    void load();

    return () => {
      alive = false;
    };
  }, [restaurantId]);

  const isEnabled = useMemo(
    () => (featureKey: FeatureKey) => features[featureKey] !== false,
    [features]
  );

  return {
    loading,
    error,
    features,
    isEnabled,
  };
}
