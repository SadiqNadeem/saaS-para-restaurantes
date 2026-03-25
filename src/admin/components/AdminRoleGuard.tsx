import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { useRestaurant } from "../../restaurant/RestaurantContext";
import { useAdminMembership } from "./AdminMembershipContext";

type RequiredRole = "admin" | "owner";

/**
 * AdminRoleGuard — guard de rol para rutas individuales del admin.
 * Debe usarse dentro de AdminGate (que ya establece AdminMembershipProvider).
 *
 * - required="admin"  → solo owner y admin (excluye staff)
 * - required="owner"  → solo owner
 *
 * Si el rol es insuficiente → redirige al dashboard del admin.
 */
export default function AdminRoleGuard({
  required,
  children,
}: {
  required: RequiredRole;
  children: ReactNode;
}) {
  const { adminPath } = useRestaurant();
  const { isOwner, isAdmin } = useAdminMembership();

  const hasAccess = required === "owner" ? isOwner : isAdmin;

  if (!hasAccess) {
    return <Navigate to={adminPath} replace />;
  }

  return <>{children}</>;
}
