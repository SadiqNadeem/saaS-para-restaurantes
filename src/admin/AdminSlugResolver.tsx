import { Navigate, useLocation } from "react-router-dom";

import { useAdminRestaurantStore } from "./context/AdminRestaurantContext";
import { useAuth } from "../auth/AuthContext";

const Spinner = () => (
  <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#6b7280" }}>
    Cargando...
  </div>
);

/**
 * AdminSlugResolver — handles /admin and /admin/* shortcut URLs.
 *
 * Reads the user's first restaurant membership, then redirects to:
 * /r/:slug/admin (if visiting /admin)
 * /r/:slug/admin/orders (if visiting /admin/orders)
 *
 * This lets users bookmark or type /admin without knowing their slug.
 */
export default function AdminSlugResolver() {
  const { session, loading: authLoading } = useAuth();
  const { restaurants, loading: storeLoading } = useAdminRestaurantStore();
  const location = useLocation();

  if (authLoading || storeLoading) return <Spinner />;

  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  const first = restaurants[0];
  if (!first) {
    return <Navigate to="/register" replace />;
  }

  // Preserve sub-path: /admin/orders → /r/:slug/admin/orders
  const subPath = location.pathname.replace(/^\/admin\/?/, "");
  const target = subPath
    ? `/r/${first.slug}/admin/${subPath}`
    : `/r/${first.slug}/admin`;

  return <Navigate to={target + location.search} replace />;
}
