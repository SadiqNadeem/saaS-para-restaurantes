import { useEffect, useState } from "react";

import { useAuth } from "../../auth/AuthContext";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../../restaurant/RestaurantContext";

export type PosRole = "owner" | "admin" | "staff" | "superadmin" | null;

export function usePosRole(): { role: PosRole; loading: boolean } {
  const { session } = useAuth();
  const { restaurantId, isSuperadmin } = useRestaurant();
  const [role, setRole] = useState<PosRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isSuperadmin) {
      setRole("superadmin");
      setLoading(false);
      return;
    }

    const userId = session?.user?.id;
    if (!userId || !restaurantId) {
      setRole(null);
      setLoading(false);
      return;
    }

    let alive = true;

    void supabase
      .from("restaurant_members")
      .select("role")
      .eq("user_id", userId)
      .eq("restaurant_id", restaurantId)
      .maybeSingle<{ role: string }>()
      .then(({ data }) => {
        if (!alive) return;
        setRole((data?.role ?? null) as PosRole);
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [isSuperadmin, restaurantId, session?.user?.id]);

  return { role, loading };
}
