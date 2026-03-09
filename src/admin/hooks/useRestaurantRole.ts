import { useAdminMembership } from "../components/AdminMembershipContext";

/**
 * Returns the current user's role and computed permissions for the active restaurant.
 * Source of truth is restaurant_members.access_role (set by AdminGate).
 */
export function useRestaurantRole() {
  const membership = useAdminMembership();
  return {
    ...membership,
    isLoading: false,
  };
}
