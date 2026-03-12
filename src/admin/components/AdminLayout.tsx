/**
 * NOTE: This file is not currently imported by the app.
 * The active admin layout is src/admin/AdminLayout.tsx.
 * This component is kept aligned for potential future use.
 */
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../../restaurant/RestaurantContext";

const NAV_ITEMS = [
  { to: "dashboard", label: "Dashboard", end: true },
  { to: "orders", label: "Pedidos" },
  { to: "metrics", label: "Métricas" },
  { to: "categories", label: "Categorías" },
  { to: "products", label: "Productos" },
  { to: "modifiers", label: "Modificadores" },
  { to: "pos", label: "Caja" },
  { to: "settings", label: "Ajustes" },
  { to: "logs", label: "Logs" },
] as const;

const linkStyle = ({ isActive }: { isActive: boolean }) => ({
  display: "block",
  padding: "8px 12px",
  borderRadius: 8,
  textDecoration: "none",
  fontWeight: 600,
  fontSize: 14,
  color: isActive ? "#fff" : "rgba(255,255,255,0.82)",
  background: isActive ? "rgba(255,255,255,0.18)" : "transparent",
  transition: "background 0.15s ease, color 0.15s ease",
});

export default function AdminLayout() {
  const { adminPath, menuPath, name } = useRestaurant();
  const navigate = useNavigate();
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const handleSignOut = async () => {
    setSignOutError(null);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setSignOutError(error.message);
      return;
    }
    navigate(menuPath);
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f8fafc" }}>
      {/* Sidebar */}
      <aside
        style={{
          width: 220,
          flexShrink: 0,
          background: "var(--brand-primary)",
          display: "flex",
          flexDirection: "column",
          padding: "16px 10px",
          gap: 6,
        }}
      >
        {/* Restaurant name */}
        <div style={{ padding: "4px 12px 14px", borderBottom: "1px solid rgba(255,255,255,0.15)", marginBottom: 6 }}>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {name || "Restaurante"}
          </div>
          <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 11, marginTop: 2 }}>Panel Admin</div>
        </div>

        {/* Nav */}
        <nav style={{ display: "grid", gap: 2, flex: 1 }}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={`${adminPath}/${item.to}`}
              style={linkStyle}
              end={"end" in item ? item.end : undefined}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Ver menú público */}
        <a
          href={menuPath}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "block",
            padding: "8px 12px",
            borderRadius: 8,
            textDecoration: "none",
            fontSize: 13,
            color: "rgba(255,255,255,0.7)",
            borderTop: "1px solid rgba(255,255,255,0.15)",
            paddingTop: 12,
            marginTop: 4,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "#fff"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
        >
           Ver menú público
        </a>

        {/* Logout */}
        {signOutError ? (
          <div style={{ fontSize: 11, color: "#fecaca", padding: "4px 8px" }}>{signOutError}</div>
        ) : null}
        <button
          type="button"
          onClick={() => void handleSignOut()}
          style={{
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.25)",
            background: "rgba(255,255,255,0.1)",
            color: "#fff",
            padding: "8px 12px",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 13,
            textAlign: "left",
          }}
        >
          Cerrar sesión
        </button>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, padding: 20, minWidth: 0 }}>
        <Outlet />
      </main>
    </div>
  );
}
