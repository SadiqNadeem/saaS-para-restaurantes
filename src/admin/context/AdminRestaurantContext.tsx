import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { useAuth } from "../../auth/AuthContext";
import { supabase } from "../../lib/supabase";

export type AdminRestaurantRow = {
  id: string;
  name: string;
  slug: string;
};

type AdminRestaurantContextValue = {
  restaurantId: string | null;
  setRestaurantId: (id: string) => void;
  refresh: () => void;
  isSuperadmin: boolean;
  restaurants: AdminRestaurantRow[];
  loading: boolean;
};

const AdminRestaurantContext = createContext<AdminRestaurantContextValue | null>(null);
const STORAGE_KEY = "admin_active_restaurant_id";

function normalizeMemberRestaurant(row: Record<string, unknown>): AdminRestaurantRow | null {
  const restaurantId = String(row.restaurant_id ?? "").trim();
  const nestedRaw = row.restaurants;
  const nested = Array.isArray(nestedRaw) ? (nestedRaw[0] as Record<string, unknown> | undefined) : (nestedRaw as Record<string, unknown> | null);

  const id = String(nested?.id ?? restaurantId).trim();
  const name = String(nested?.name ?? "Restaurante").trim() || "Restaurante";
  const slug = String(nested?.slug ?? "").trim();

  if (!id || !slug) return null;
  return { id, name, slug };
}

async function detectIsSuperadmin(userId: string): Promise<boolean> {
  const rpcResult = await supabase.rpc("is_superadmin");

  if (!rpcResult.error) {
    const value = rpcResult.data;

    if (typeof value === "boolean") {
      return value;
    }

    if (Array.isArray(value) && typeof value[0] === "boolean") {
      return value[0];
    }

    if (value && typeof value === "object") {
      const maybeFlag = (value as Record<string, unknown>).is_superadmin;
      if (typeof maybeFlag === "boolean") {
        return maybeFlag;
      }
    }
  }

  const directProfile = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle<{ role: string }>();

  let profileResult = directProfile;

  if (profileResult.error || !profileResult.data) {
    const byUserId = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle<{ role: string }>();
    profileResult = byUserId;
  }

  const role = String(profileResult.data?.role ?? "").toLowerCase();
  return role === "superadmin";
}

export function AdminRestaurantProvider({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const [restaurantId, setRestaurantIdState] = useState<string | null>(null);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [restaurants, setRestaurants] = useState<AdminRestaurantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      if (authLoading) {
        setLoading(true);
        return;
      }

      const userId = session?.user?.id ?? null;

      if (!userId) {
        setIsSuperadmin(false);
        setRestaurants([]);
        setRestaurantIdState(null);
        setLoading(false);
        return;
      }

      setLoading(true);

      const superadmin = await detectIsSuperadmin(userId);

      if (!alive) return;

      setIsSuperadmin(superadmin);

      if (superadmin) {
        const { data, error } = await supabase
          .from("restaurants")
          .select("id,name,slug")
          .order("created_at", { ascending: true });

        if (!alive) return;

        if (error) {
          setRestaurants([]);
          setRestaurantIdState(null);
          setLoading(false);
          return;
        }

        const rows = (Array.isArray(data) ? data : []).filter((row): row is AdminRestaurantRow => Boolean(row?.id && row?.slug));
        const persistedId = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) ?? "" : "";
        const fallbackId = rows[0]?.id ?? null;
        const nextId = rows.some((row) => row.id === persistedId) ? persistedId : fallbackId;

        if (nextId && typeof window !== "undefined") {
          window.localStorage.setItem(STORAGE_KEY, nextId);
        }

        setRestaurants(rows);
        setRestaurantIdState(nextId);
        setLoading(false);
        return;
      }

      const { data: memberRows, error } = await supabase
        .from("restaurant_members")
        .select("restaurant_id, restaurants(id,name,slug)")
        .eq("user_id", userId)
        .limit(1);

      if (!alive) return;

      if (error) {
        setRestaurants([]);
        setRestaurantIdState(null);
        setLoading(false);
        return;
      }

      const memberEntry = Array.isArray(memberRows) ? memberRows[0] : null;
      const selected = memberEntry ? normalizeMemberRestaurant((memberEntry ?? {}) as Record<string, unknown>) : null;

      if (!selected) {
        setRestaurants([]);
        setRestaurantIdState(null);
        setLoading(false);
        return;
      }

      setRestaurants([selected]);
      setRestaurantIdState(selected.id);
      setLoading(false);
    };

    void load();

    return () => {
      alive = false;
    };
  }, [authLoading, reloadTick, session?.user?.id]);

  const refresh = useCallback(() => {
    setReloadTick((prev) => prev + 1);
  }, []);

  const setRestaurantId = useCallback(
    (id: string) => {
      if (!isSuperadmin) return;
      const nextId = String(id || "").trim();
      if (!nextId) return;
      if (!restaurants.some((row) => row.id === nextId)) return;

      setRestaurantIdState(nextId);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, nextId);
      }
    },
    [isSuperadmin, restaurants]
  );

  const value = useMemo<AdminRestaurantContextValue>(
    () => ({
      restaurantId,
      setRestaurantId,
      refresh,
      isSuperadmin,
      restaurants,
      loading,
    }),
    [isSuperadmin, loading, refresh, restaurantId, restaurants, setRestaurantId]
  );

  return <AdminRestaurantContext.Provider value={value}>{children}</AdminRestaurantContext.Provider>;
}

export function useAdminRestaurantStore() {
  const value = useContext(AdminRestaurantContext);
  if (!value) {
    throw new Error("useAdminRestaurantStore debe usarse dentro de AdminRestaurantProvider");
  }
  return value;
}
