/**
 * Tests para la lógica de permisos por rol.
 *
 * El sistema tiene 3 roles:
 *   owner  → canManage = true, puede gestionar equipo
 *   admin  → canManage = true, no puede gestionar equipo
 *   staff  → canManage = false, solo lectura
 *   superadmin → acceso total (tratado como owner en AdminGate)
 */
import { describe, it, expect } from "vitest";

type RestaurantRole = "owner" | "admin" | "staff";
type SidebarItemRole = "owner" | "admin" | null;

function canManage(role: RestaurantRole): boolean {
  return role === "owner" || role === "admin";
}

function canAccessSidebarItem(
  userRole: RestaurantRole,
  requiredRole: SidebarItemRole
): boolean {
  if (requiredRole === null) return true;
  if (requiredRole === "admin") return canManage(userRole);
  if (requiredRole === "owner") return userRole === "owner";
  return false;
}

describe("canManage", () => {
  it("owner can manage", () => {
    expect(canManage("owner")).toBe(true);
  });

  it("admin can manage", () => {
    expect(canManage("admin")).toBe(true);
  });

  it("staff cannot manage", () => {
    expect(canManage("staff")).toBe(false);
  });
});

describe("canAccessSidebarItem", () => {
  // Items sin restricción
  it("any role accesses items with no requiredRole", () => {
    expect(canAccessSidebarItem("staff", null)).toBe(true);
    expect(canAccessSidebarItem("admin", null)).toBe(true);
    expect(canAccessSidebarItem("owner", null)).toBe(true);
  });

  // Items con requiredRole = "admin" (admin + owner)
  it("admin can access admin-required items", () => {
    expect(canAccessSidebarItem("admin", "admin")).toBe(true);
  });

  it("owner can access admin-required items", () => {
    expect(canAccessSidebarItem("owner", "admin")).toBe(true);
  });

  it("staff cannot access admin-required items", () => {
    expect(canAccessSidebarItem("staff", "admin")).toBe(false);
  });

  // Items con requiredRole = "owner" (solo owner)
  it("owner can access owner-required items (Usuarios y roles)", () => {
    expect(canAccessSidebarItem("owner", "owner")).toBe(true);
  });

  it("admin cannot access owner-required items", () => {
    expect(canAccessSidebarItem("admin", "owner")).toBe(false);
  });

  it("staff cannot access owner-required items", () => {
    expect(canAccessSidebarItem("staff", "owner")).toBe(false);
  });
});
