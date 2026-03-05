import { createContext, useContext } from "react";
import type { ReactNode } from "react";

export type RestaurantRole = "owner" | "admin" | "staff";

type AdminMembershipContextValue = {
  role: RestaurantRole;
  canManage: boolean;
};

const AdminMembershipContext = createContext<AdminMembershipContextValue | null>(null);

export function AdminMembershipProvider({
  role,
  children,
}: {
  role: RestaurantRole;
  children: ReactNode;
}) {
  const value: AdminMembershipContextValue = {
    role,
    canManage: role === "owner" || role === "admin",
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
