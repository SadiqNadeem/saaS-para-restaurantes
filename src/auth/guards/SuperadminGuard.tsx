import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { useAdminRestaurantStore } from "../../admin/context/AdminRestaurantContext";
import { useAuth } from "../AuthContext";

const Spinner = () => (
  <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#6b7280" }}>
    Cargando...
  </div>
);

/**
 * SuperadminGuard — wraps /superadmin routes.
 * Redirects to /login if not authenticated or not a superadmin.
 */
export default function SuperadminGuard({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const { isSuperadmin, loading: storeLoading } = useAdminRestaurantStore();

  if (authLoading || storeLoading) return <Spinner />;

  if (!session || !isSuperadmin) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
