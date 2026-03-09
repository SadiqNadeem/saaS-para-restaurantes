import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../AuthContext";

const Spinner = () => (
  <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#6b7280" }}>
    Cargando...
  </div>
);

/**
 * AuthGuard — wraps routes that require a logged-in user.
 * Redirects to /login with ?next= if not authenticated.
 */
export default function AuthGuard({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner />;

  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return <>{children}</>;
}
