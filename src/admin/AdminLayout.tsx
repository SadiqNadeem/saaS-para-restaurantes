import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ShoppingCart } from "lucide-react";

import { supabase } from "../lib/supabase";
import { useRestaurant } from "../restaurant/RestaurantContext";

type AdminNavItem = {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
};

const SIDEBAR_FULL = 252;
const SIDEBAR_COLLAPSED = 64;

function RestaurantAvatar({ name, size = 38 }: { name: string; size?: number }) {
  const initial = (name || "R").charAt(0).toUpperCase();
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: 10,
        background: "rgba(255,255,255,0.18)",
        border: "1.5px solid rgba(255,255,255,0.28)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 900,
        fontSize: size * 0.47,
        color: "#fff",
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      {initial}
    </div>
  );
}

function AdminLayout() {
  const { adminPath, menuPath, name, isSuperadmin, availableRestaurants, restaurantId, setCurrentRestaurantId } =
    useRestaurant();
  const navigate = useNavigate();
  const location = useLocation();
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 960;
  });
  const [isSmallMobile, setIsSmallMobile] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 768;
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [fabHover, setFabHover] = useState(false);

  // POS path — mirrors the same logic PosLayout uses
  const posPath = menuPath === "/" ? "/pos" : `${menuPath}/pos`;

  const navItems = useMemo<AdminNavItem[]>(
    () => [
      { to: `${adminPath}`, label: "Dashboard", icon: "◈", end: true },
      { to: `${adminPath}/metrics`, label: "Metricas", icon: "↗" },
      { to: `${adminPath}/orders`, label: "Pedidos", icon: "◎" },
      { to: `${adminPath}/categories`, label: "Categorias", icon: "◫" },
      { to: `${adminPath}/products`, label: "Productos", icon: "⊟" },
      { to: `${adminPath}/modifiers`, label: "Modificadores", icon: "⊕" },
      { to: `${adminPath}/coupons`, label: "Cupones", icon: "🏷" },
      { to: `${adminPath}/loyalty`, label: "Fidelización", icon: "★" },
      { to: `${adminPath}/reviews`, label: "Reseñas", icon: "☆" },
      { to: `${adminPath}/abandoned-carts`, label: "Carritos", icon: "◌" },
      { to: `${adminPath}/pos`, label: "Caja", icon: "⊞" },
      { to: `${adminPath}/import`, label: "Importar menú", icon: "⇪" },
      { to: `${adminPath}/settings`, label: "Ajustes", icon: "◉" },
      { to: `${adminPath}/logs`, label: "Logs", icon: "≡" },
    ],
    [adminPath]
  );

  useEffect(() => {
    const onResize = () => {
      setIsMobile(window.innerWidth < 960);
      setIsSmallMobile(window.innerWidth < 768);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session && (event === "SIGNED_OUT" || event === "TOKEN_REFRESHED")) {
        navigate(menuPath);
      }
    });
    return () => subscription.unsubscribe();
  }, [menuPath, navigate]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const handleSignOut = async () => {
    setSignOutError(null);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setSignOutError(error.message);
      return;
    }
    navigate(menuPath);
  };

  const linkStyle = ({ isActive }: { isActive: boolean }) => ({
    display: "flex",
    alignItems: "center",
    gap: collapsed ? 0 : 10,
    justifyContent: collapsed ? "center" : "flex-start",
    borderRadius: 10,
    textDecoration: "none",
    padding: collapsed ? "10px 0" : "10px 12px",
    color: isActive ? "var(--brand-white)" : "rgba(255,255,255,0.88)",
    background: isActive ? "rgba(255,255,255,0.18)" : "transparent",
    fontWeight: isActive ? 700 : 500,
    transition: "background 0.15s ease, color 0.15s ease, padding 0.2s ease",
    overflow: "hidden",
    whiteSpace: "nowrap" as const,
  });

  const sidebarBody = (forDrawer = false) => {
    const isCollapsed = !forDrawer && collapsed;

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          gap: 0,
          overflow: "hidden",
        }}
      >
        {/* Restaurant identity */}
        <div
          style={{
            padding: isCollapsed ? "14px 8px 10px" : "14px 14px 10px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            overflow: "hidden",
            flexShrink: 0,
            borderBottom: "1px solid rgba(255,255,255,0.12)",
            marginBottom: 10,
            justifyContent: isCollapsed ? "center" : "flex-start",
          }}
        >
          <RestaurantAvatar name={name} />
          {!isCollapsed && (
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 15,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {name || "Restaurante"}
              </div>
              <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 1 }}>
                Panel de gestión
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav
          style={{
            display: "grid",
            gap: 4,
            alignContent: "start",
            flex: 1,
            minHeight: 0,
            padding: isCollapsed ? "0 8px" : "0 10px",
            overflowY: "auto",
          }}
        >
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              style={isCollapsed ? linkStyle : linkStyle}
              end={item.end}
              title={isCollapsed ? item.label : undefined}
            >
              <span
                style={{
                  width: 28,
                  height: 28,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 7,
                  background: "rgba(255,255,255,0.12)",
                  fontSize: 14,
                  flexShrink: 0,
                  fontStyle: "normal",
                }}
              >
                {item.icon}
              </span>
              {!isCollapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Ver menú público */}
        <div
          style={{
            padding: isCollapsed ? "8px 8px 4px" : "8px 10px 4px",
            borderTop: "1px solid rgba(255,255,255,0.12)",
            flexShrink: 0,
          }}
        >
          <a
            href={menuPath}
            target="_blank"
            rel="noopener noreferrer"
            title={isCollapsed ? "Ver menú público" : undefined}
            style={{
              display: "flex",
              alignItems: "center",
              gap: isCollapsed ? 0 : 10,
              justifyContent: isCollapsed ? "center" : "flex-start",
              borderRadius: 10,
              textDecoration: "none",
              padding: isCollapsed ? "10px 0" : "10px 12px",
              color: "rgba(255,255,255,0.75)",
              fontWeight: 500,
              fontSize: 14,
              transition: "background 0.15s ease, color 0.15s ease",
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.1)";
              e.currentTarget.style.color = "#fff";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "rgba(255,255,255,0.75)";
            }}
          >
            <span
              style={{
                width: 28,
                height: 28,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 7,
                background: "rgba(255,255,255,0.12)",
                fontSize: 14,
                flexShrink: 0,
              }}
            >
              ↗
            </span>
            {!isCollapsed && <span>Ver menú público</span>}
          </a>
          <Link
            to={`${adminPath}/settings#qr-section`}
            title={isCollapsed ? "Ver QR del menú" : undefined}
            style={{
              display: "flex",
              alignItems: "center",
              gap: isCollapsed ? 0 : 10,
              justifyContent: isCollapsed ? "center" : "flex-start",
              borderRadius: 10,
              textDecoration: "none",
              marginTop: 4,
              padding: isCollapsed ? "10px 0" : "10px 12px",
              color: "rgba(255,255,255,0.75)",
              fontWeight: 500,
              fontSize: 14,
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.1)";
              e.currentTarget.style.color = "#fff";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "rgba(255,255,255,0.75)";
            }}
          >
            <span
              style={{
                width: 28,
                height: 28,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 7,
                background: "rgba(255,255,255,0.12)",
                fontSize: 14,
                flexShrink: 0,
              }}
            >
              ▣
            </span>
            {!isCollapsed && <span>Ver QR</span>}
          </Link>
        </div>

        {/* Collapse toggle — desktop only */}
        {!forDrawer && (
          <div
            style={{
              padding: isCollapsed ? "4px 8px 12px" : "4px 10px 12px",
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              onClick={() => setCollapsed((prev) => !prev)}
              title={isCollapsed ? "Expandir sidebar" : "Colapsar sidebar"}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: isCollapsed ? "center" : "flex-start",
                gap: 10,
                borderRadius: 10,
                border: "none",
                background: "rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.65)",
                padding: isCollapsed ? "8px 0" : "8px 12px",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 500,
                transition: "background 0.15s ease, color 0.15s ease",
                whiteSpace: "nowrap",
                overflow: "hidden",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.14)";
                e.currentTarget.style.color = "#fff";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                e.currentTarget.style.color = "rgba(255,255,255,0.65)";
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1, transform: isCollapsed ? "rotate(180deg)" : "none", transition: "transform 0.2s ease", display: "inline-block" }}>
                ‹‹
              </span>
              {!isCollapsed && <span>Colapsar</span>}
            </button>
          </div>
        )}
      </div>
    );
  };

  const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_FULL;

  return (
    <div style={{ minHeight: "100vh", background: "var(--admin-content-bg, #f8fafc)", position: "relative" }}>
      {/* Desktop sidebar */}
      {!isMobile ? (
        <aside
          style={{
            position: "fixed",
            top: 16,
            left: 16,
            bottom: 16,
            width: sidebarWidth,
            background: "var(--brand-primary)",
            borderRadius: 14,
            border: "1px solid var(--brand-hover)",
            overflowY: "auto",
            overflowX: "hidden",
            transition: "width 0.22s ease",
            zIndex: 100,
          }}
        >
          {sidebarBody(false)}
        </aside>
      ) : null}

      {/* Mobile drawer */}
      {isMobile && drawerOpen ? (
        <div
          role="presentation"
          onClick={() => setDrawerOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(17, 24, 39, 0.45)",
            zIndex: 1200,
            transition: "opacity 0.2s ease",
          }}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Menu admin"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 260,
              maxWidth: "85vw",
              height: "100%",
              background: "var(--brand-primary)",
              borderRight: "1px solid var(--brand-hover)",
              transition: "transform 0.22s ease",
            }}
          >
            {sidebarBody(true)}
          </aside>
        </div>
      ) : null}

      {/* Main content */}
      <main
        style={{
          marginLeft: isMobile ? 0 : sidebarWidth + 32,
          padding: isMobile ? `12px 12px ${isSmallMobile ? "72px" : "16px"}` : "16px 16px 20px",
          minWidth: 0,
          transition: "margin-left 0.22s ease",
        }}
      >
        {/* Topbar */}
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 900,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "10px 14px",
            border: "1px solid var(--admin-card-border, #e5e7eb)",
            borderRadius: 12,
            background: "#ffffff",
            marginBottom: 14,
            boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
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
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                  cursor: "pointer",
                  fontSize: 18,
                  lineHeight: 1,
                  color: "#374151",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                ☰
              </button>
            ) : null}
            <div style={{ display: "grid", minWidth: 0 }}>
              <strong
                style={{
                  color: "var(--admin-text-primary, #111827)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  fontSize: 15,
                }}
              >
                {name || "Restaurante"}
              </strong>
              <span style={{ color: "var(--admin-text-secondary, #6b7280)", fontSize: 12 }}>Panel Admin</span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {isSuperadmin ? (
              <select
                aria-label="Seleccionar restaurante"
                value={restaurantId}
                onChange={(event) => setCurrentRestaurantId(event.target.value)}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  background: "#fff",
                  padding: "7px 10px",
                  fontSize: 13,
                  color: "#111827",
                  maxWidth: 220,
                }}
              >
                {availableRestaurants.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            ) : null}

            <button
              type="button"
              onClick={() => void handleSignOut()}
              style={{
                borderRadius: 8,
                border: "1px solid var(--brand-primary)",
                background: "var(--brand-primary)",
                color: "#fff",
                padding: "7px 12px",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 13,
                flexShrink: 0,
              }}
            >
              Cerrar sesión
            </button>
          </div>
        </header>

        {signOutError ? (
          <div
            role="alert"
            style={{
              marginBottom: 10,
              color: "#7f1d1d",
              border: "1px solid #fecaca",
              background: "#fef2f2",
              borderRadius: 10,
              padding: "8px 12px",
              fontSize: 13,
            }}
          >
            {signOutError}
          </div>
        ) : null}

        <Outlet />
      </main>

      {/* ── Mobile bottom nav (< 768px) ── */}
      {isSmallMobile ? (
        <nav className="admin-bottom-nav" aria-label="Navegación principal">
          {[
            { to: `${adminPath}`, label: "Dashboard", icon: "◈", end: true },
            { to: `${adminPath}/orders`, label: "Pedidos", icon: "◎" },
            { to: `${adminPath}/products`, label: "Productos", icon: "⊟" },
            { to: `${adminPath}/pos`, label: "Caja", icon: "⊞" },
          ].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `admin-bottom-nav-item${isActive ? " active" : ""}`
              }
            >
              <span className="admin-bottom-nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      ) : null}

      {/* ── FAB: Nueva venta (POS) ── */}
      <style>{`
        @keyframes pos-fab-pulse {
          0%, 100% { box-shadow: 0 4px 20px rgba(34,197,94,0.45), 0 2px 8px rgba(0,0,0,0.18); }
          50%       { box-shadow: 0 4px 28px rgba(34,197,94,0.72), 0 2px 12px rgba(0,0,0,0.22); }
        }
      `}</style>
      <button
        type="button"
        aria-label="Nueva venta — abrir caja TPV"
        onClick={() => navigate(posPath)}
        onMouseEnter={() => setFabHover(true)}
        onMouseLeave={() => setFabHover(false)}
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 50,
          display: "flex",
          alignItems: "center",
          gap: 8,
          height: 56,
          padding: "0 22px",
          borderRadius: 28,
          border: "none",
          background: fabHover ? "#16a34a" : "#22c55e",
          color: "#fff",
          cursor: "pointer",
          fontSize: 15,
          fontWeight: 700,
          letterSpacing: "0.02em",
          animation: "pos-fab-pulse 2.8s ease-in-out infinite",
          transition: "background 0.15s ease",
          userSelect: "none",
        }}
      >
        <ShoppingCart size={20} strokeWidth={2.2} />
        Nueva venta
      </button>
    </div>
  );
}

export default AdminLayout;
