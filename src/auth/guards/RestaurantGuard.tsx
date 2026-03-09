import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAdminRestaurantStore } from "../../admin/context/AdminRestaurantContext";
import { useAuth } from "../AuthContext";

const Spinner = () => (
  <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#6b7280" }}>
    Cargando...
  </div>
);

/**
 * RestaurantGuard — wraps admin and POS routes.
 * - No session → redirect to /login
 * - Session but no restaurant membership → redirect to /register
 * - Session with membership (or superadmin) → render children
 *
 * AdminGate/PosGate handle the deeper per-restaurant access check.
 */
export default function RestaurantGuard({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const { isSuperadmin, restaurants, loading: storeLoading } = useAdminRestaurantStore();
  const location = useLocation();

  if (authLoading || storeLoading) return <Spinner />;

  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  if (!isSuperadmin && restaurants.length === 0) {
    return <Navigate to="/register" replace />;
  }

  return <>{children}</>;
}
