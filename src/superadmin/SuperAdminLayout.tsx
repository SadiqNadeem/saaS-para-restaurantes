import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { BarChart2, LogOut, ScrollText, Store, Users, LifeBuoy } from "lucide-react";

import { useAuth } from "../auth/AuthContext";
import { supabase } from "../lib/supabase";

type NavItem = {
  to: string;
  label: string;
  icon: React.ReactNode;
  end?: boolean;
};

const DESKTOP_SIDEBAR_WIDTH = 252;

export default function SuperAdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { session } = useAuth();

  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 960;
  });
  const [drawerOpen, setDrawerOpen] = useState(false);

  const navItems = useMemo<NavItem[]>(
    () => [
      { to: "/superadmin/restaurants", label: "Restaurantes", icon: <Store size={16} />, end: true },
      { to: "/superadmin/members", label: "Usuarios", icon: <Users size={16} /> },
      { to: "/superadmin/metrics", label: "Metricas", icon: <BarChart2 size={16} /> },
      { to: "/superadmin/logs", label: "Logs", icon: <ScrollText size={16} /> },
      { to: "/superadmin/support", label: "Soporte", icon: <LifeBuoy size={16} /> },
    ],
    []
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 960);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const linkStyle = ({ isActive }: { isActive: boolean }) => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    borderRadius: 10,
    textDecoration: "none",
    padding: "10px 12px",
    color: isActive ? "#fff" : "rgba(255,255,255,0.82)",
    background: isActive ? "rgba(255,255,255,0.15)" : "transparent",
    fontWeight: isActive ? 700 : 600,
    transition: "background 0.15s ease, color 0.15s ease",
  });

  const sidebarContent = (
    <div style={{ display: "grid", height: "100%", gridTemplateRows: "auto 1fr", gap: 14 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 20, color: "var(--brand-white)" }}>Superadmin</h1>
        <p style={{ margin: "6px 0 0", fontSize: 12, color: "rgba(255,255,255,0.86)" }}>Control global</p>
      </div>

      <nav style={{ display: "grid", gap: 6, alignContent: "start" }}>
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} className="ui-nav-item" style={linkStyle} end={item.end}>
            <span
              aria-hidden
              style={{
                width: 18,
                height: 18,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {item.icon}
            </span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );

  return (
    <div className="superadmin-shell" style={{ minHeight: "100vh", background: "#f8fafc", position: "relative" }}>
      {!isMobile ? (
        <aside
          style={{
            position: "fixed",
            top: 16,
            left: 16,
            bottom: 16,
            width: DESKTOP_SIDEBAR_WIDTH,
            background: "var(--brand-primary)",
            borderRadius: 14,
            border: "1px solid var(--brand-hover)",
            padding: 14,
            overflowY: "auto",
          }}
        >
          {sidebarContent}
        </aside>
      ) : null}

      {isMobile && drawerOpen ? (
        <div
          role="presentation"
          onClick={() => setDrawerOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(17, 24, 39, 0.4)", zIndex: 1200 }}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Menu superadmin"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 260,
              maxWidth: "85vw",
              height: "100%",
              background: "var(--brand-primary)",
              padding: 14,
              borderRight: "1px solid var(--brand-hover)",
            }}
          >
            {sidebarContent}
          </aside>
        </div>
      ) : null}

      <main
        style={{
          marginLeft: isMobile ? 0 : DESKTOP_SIDEBAR_WIDTH + 32,
          padding: isMobile ? "12px 12px 16px" : "16px 16px 20px",
          minWidth: 0,
        }}
      >
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 900,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "10px 12px",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            background: "#ffffff",
            marginBottom: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            {isMobile ? (
              <button
                type="button"
                aria-label="Abrir menu"
                onClick={() => setDrawerOpen((prev) => !prev)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  background: "#ffffff",
                  cursor: "pointer",
                  fontSize: 18,
                  lineHeight: 1,
                  color: "#111827",
                }}
              >
                =
              </button>
            ) : null}
            <div style={{ display: "grid", minWidth: 0 }}>
              <strong style={{ color: "#111827" }}>Panel Superadmin</strong>
              <span style={{ color: "#6b7280", fontSize: 12 }}>Gestion global</span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {session?.user?.email ? (
              <span style={{ color: "#6b7280", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
                {session.user.email}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => void handleLogout()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                border: "1px solid #d1d5db",
                borderRadius: 8,
                background: "#fff",
                padding: "6px 10px",
                cursor: "pointer",
                fontSize: 13,
                color: "#374151",
                whiteSpace: "nowrap",
              }}
            >
              <LogOut size={14} />
              Cerrar sesion
            </button>
          </div>
        </header>

        <div key={location.pathname} className="route-fade-slide">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
