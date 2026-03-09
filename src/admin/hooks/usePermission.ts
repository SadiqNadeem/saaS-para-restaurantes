import { useRestaurantRole } from "./useRestaurantRole";

type Permission =
  | "canManage"
  | "canManageMenu"
  | "canManageOrders"
  | "canAccessPOS"
  | "canManageTeam"
  | "canViewMetrics"
  | "canViewSettings";

/**
 * Returns true/false for a named permission.
 * Must be used inside AdminMembershipProvider (inside AdminGate).
 */
export function usePermission(permission: Permission): boolean {
  const role = useRestaurantRole();
  return role[permission];
}
