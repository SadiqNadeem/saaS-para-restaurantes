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
 * GuestGuard — wraps login/register pages.
 * If the user IS already logged in, redirect them to their dashboard.
 * If NOT logged in, render children normally.
 */
export default function GuestGuard({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const { isSuperadmin, restaurants, loading: storeLoading } = useAdminRestaurantStore();

  if (authLoading || storeLoading) return <Spinner />;

  if (session) {
    if (isSuperadmin) return <Navigate to="/superadmin" replace />;
    const first = restaurants[0];
    if (first) return <Navigate to="/admin" replace />;
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
