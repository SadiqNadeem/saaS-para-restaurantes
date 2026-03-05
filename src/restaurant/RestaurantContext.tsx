import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { useAdminRestaurantStore } from "../admin/context/AdminRestaurantContext";
import { supabase } from "../lib/supabase";
import { getRestaurantSlug } from "./getRestaurantSlug";
import { useSEO } from "../hooks/useSEO";

type RestaurantRow = {
  id: string;
  name: string;
  slug: string;
  meta_title?: string | null;
  meta_description?: string | null;
  og_image_url?: string | null;
};

type RestaurantContextValue = {
  restaurantId: string;
  slug: string;
  name: string;
  usesSubdomain: boolean;
  menuPath: string;
  adminPath: string;
  isSuperadmin: boolean;
  availableRestaurants: RestaurantRow[];
  setCurrentRestaurantId: (restaurantId: string) => void;
};

const RestaurantContext = createContext<RestaurantContextValue | null>(null);

function isAdminPath(pathname: string): boolean {
  return pathname.includes("/admin") || pathname.includes("/pos");
}

export function RestaurantProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { slug: routeSlug = "" } = useParams<{ slug: string }>();
  const { session, loading: authLoading } = useAuth();
  const {
    restaurantId: adminRestaurantId,
    setRestaurantId: setAdminRestaurantId,
    isSuperadmin,
    restaurants: adminRestaurants,
    loading: adminRestaurantLoading,
  } = useAdminRestaurantStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restaurant, setRestaurant] = useState<RestaurantRow | null>(null);

  const resolvedSlug = useMemo(
    () =>
      getRestaurantSlug({
        hostname: typeof window !== "undefined" ? window.location.hostname : "",
        pathname: location.pathname,
        routeSlug,
      }),
    [location.pathname, routeSlug]
  );

  const adminMode = useMemo(() => isAdminPath(location.pathname), [location.pathname]);

  useEffect(() => {
    let alive = true;

    const loadStorefrontRestaurant = async () => {
      if (!resolvedSlug.slug) {
        if (!alive) return;
        setError("Slug de restaurante no valido.");
        setRestaurant(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const { data, error: queryError } = await supabase
        .from("restaurants")
        .select("id,name,slug,meta_title,meta_description,og_image_url")
        .eq("slug", resolvedSlug.slug)
        .maybeSingle();

      if (!alive) return;

      if (queryError) {
        setError(queryError.message);
        setRestaurant(null);
        setLoading(false);
        return;
      }

      if (!data) {
        setError(`Restaurante no encontrado para slug "${resolvedSlug.slug}".`);
        setRestaurant(null);
        setLoading(false);
        return;
      }

      const next = data as RestaurantRow;
      setRestaurant(next);
      setLoading(false);
    };

    if (!adminMode) {
      void loadStorefrontRestaurant();
      return () => {
        alive = false;
      };
    }

    if (authLoading || adminRestaurantLoading) {
      setLoading(true);
      return () => {
        alive = false;
      };
    }

    setError(null);

    if (!session) {
      const fallback = { id: "", name: "Admin", slug: resolvedSlug.slug || "default" };
      setRestaurant(fallback);
      setLoading(false);
      return () => {
        alive = false;
      };
    }

    if (!adminRestaurantId) {
      setRestaurant(null);
      setLoading(false);
      return () => {
        alive = false;
      };
    }

    const selected = adminRestaurants.find((row) => row.id === adminRestaurantId) ?? null;

    if (!selected) {
      setRestaurant(null);
      setLoading(false);
      return () => {
        alive = false;
      };
    }

    setRestaurant(selected);
    setLoading(false);

    return () => {
      alive = false;
    };
  }, [adminMode, adminRestaurantId, adminRestaurantLoading, adminRestaurants, authLoading, resolvedSlug.slug, session]);

  const value = useMemo<RestaurantContextValue | null>(() => {
    if (!restaurant) return null;

    const effectiveSlug = restaurant.slug || resolvedSlug.slug || "default";

    return {
      restaurantId: restaurant.id,
      slug: effectiveSlug,
      name: restaurant.name,
      usesSubdomain: resolvedSlug.usesSubdomain,
      menuPath: resolvedSlug.usesSubdomain ? "/" : `/r/${effectiveSlug}`,
      adminPath: resolvedSlug.usesSubdomain ? "/admin" : `/r/${effectiveSlug}/admin`,
      isSuperadmin: adminMode ? isSuperadmin : false,
      availableRestaurants: adminMode && isSuperadmin ? adminRestaurants : [],
      setCurrentRestaurantId: (id: string) => {
        if (adminMode) {
          setAdminRestaurantId(id);
        }
      },
    };
  }, [adminMode, adminRestaurants, isSuperadmin, resolvedSlug.slug, resolvedSlug.usesSubdomain, restaurant, setAdminRestaurantId]);

  useSEO({
    title: restaurant?.meta_title ?? restaurant?.name ?? null,
    description: restaurant?.meta_description ?? (restaurant?.name ? `Pide online en ${restaurant.name}` : null),
    image: restaurant?.og_image_url ?? null,
  });

  if (loading) {
    return <div style={{ padding: 20 }}>Cargando restaurante...</div>;
  }

  if (adminMode && session && !isSuperadmin && !adminRestaurantId) {
    return (
      <div style={{ padding: 20, display: "grid", gap: 8 }}>
        <h1>Sin restaurante</h1>
        <p>No tienes restaurante asignado. Contacta con el propietario para que te agregue en restaurant_members.</p>
      </div>
    );
  }

  if (error || !value) {
    return (
      <div style={{ padding: 20, display: "grid", gap: 8 }}>
        <h1>404</h1>
        <p>{error ?? "Restaurante no encontrado."}</p>
        <Link to="/">Ir al inicio</Link>
      </div>
    );
  }

  return <RestaurantContext.Provider value={value}>{children}</RestaurantContext.Provider>;
}

export function useRestaurant() {
  const value = useContext(RestaurantContext);
  if (!value) {
    throw new Error("useRestaurant debe usarse dentro de RestaurantProvider");
  }
  return value;
}
