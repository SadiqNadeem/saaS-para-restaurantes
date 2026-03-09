import { createContext, useContext } from "react";
import type { ReactNode } from "react";

export type RestaurantRole = "owner" | "admin" | "staff";
export type JobRole = "manager" | "camarero" | "repartidor" | "cocina" | "cajero";

type AdminMembershipContextValue = {
  // Backward-compat
  role: RestaurantRole;
  canManage: boolean;

  // Extended role fields
  accessRole: RestaurantRole;
  jobRole: JobRole | null;
  isActive: boolean;
  displayName: string | null;

  // Permission flags
  isOwner: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  canManageMenu: boolean;
  canManageOrders: boolean;
  canAccessPOS: boolean;
  canManageTeam: boolean;
  canViewMetrics: boolean;
  canViewSettings: boolean;
};

const AdminMembershipContext = createContext<AdminMembershipContextValue | null>(null);

export function AdminMembershipProvider({
  role,
  accessRole,
  jobRole = null,
  isActive = true,
  displayName = null,
  children,
}: {
  role: RestaurantRole;
  accessRole: RestaurantRole;
  jobRole?: JobRole | null;
  isActive?: boolean;
  displayName?: string | null;
  children: ReactNode;
}) {
  const isOwner = accessRole === "owner";
  const isAdmin = accessRole === "owner" || accessRole === "admin";
  const isStaff = accessRole === "staff";

  const value: AdminMembershipContextValue = {
    // Backward-compat
    role,
    canManage: isAdmin,

    // Extended
    accessRole,
    jobRole,
    isActive,
    displayName,

    // Permissions
    isOwner,
    isAdmin,
    isStaff,
    canManageMenu: isAdmin,
    canManageOrders: true,
    canAccessPOS: true,
    canManageTeam: isOwner,
    canViewMetrics: isAdmin,
    canViewSettings: isAdmin,
  };

  return <AdminMembershipContext.Provider value={value}>{children}</AdminMembershipContext.Provider>;
}

export function useAdminMembership() {
  const value = useContext(AdminMembershipContext);
  if (!value) {
    throw new Error("useAdminMembership debe usarse dentro de AdminMembershipProvider");
  }
  return value;
}
