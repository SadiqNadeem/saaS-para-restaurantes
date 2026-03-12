import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown } from "lucide-react";

import { supabase } from "../lib/supabase";
import { useRestaurant } from "../restaurant/RestaurantContext";
import { useAdminMembership } from "./components/AdminMembershipContext";
import { runErrorCheck } from "./services/diagnosticsService";
import { useRestaurantFeatures } from "./features/useRestaurantFeatures";
import { SIDEBAR_GROUPS, SIDEBAR_ITEMS } from "./config/sidebarConfig";
import type { SidebarItemConfig } from "./config/sidebarConfig";
import { SupportChatWidget } from "./components/SupportChat/SupportChatWidget";

const SIDEBAR_FULL = 252;
const SIDEBAR_COLLAPSED = 64;
const GROUPS_KEY = "admin_sidebar_v2";

type NavItem = {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
};

type NavGroup = {
  id: string;
  label: string;
  icon: string;
  defaultOpen: boolean;
  items: NavItem[];
};

const navItem = {
  display: "flex",
  alignItems: "center",
  borderRadius: 10,
  textDecoration: "none",
  fontFamily: "inherit",
  transition: "background 0.15s ease, color 0.15s ease",
  overflow: "hidden" as const,
  whiteSpace: "nowrap" as const,
};

const subNavItem = {
  ...navItem,
  gap: 10,
  padding: "9px 12px",
  fontSize: 13,
  fontWeight: 500,
  marginLeft: 8,
};

const activeNavItem = {
  color: "var(--brand-primary)",
  background: "rgba(255,255,255,0.95)",
  fontWeight: 700,
};

const hoverNavItem = {
  color: "#fff",
  background: "rgba(255,255,255,0.12)",
};

const ICON_BOX_SIZE = 28;
const ICON_FONT_SIZE = 14;

type SidebarItemLinkProps = {
  to: string;
  label: string;
  icon: string;
  collapsed: boolean;
  end?: boolean;
  variant?: "top" | "sub";
};

function SidebarItemLink({
  to,
  label,
  icon,
  collapsed,
  end,
  variant = "top",
}: SidebarItemLinkProps) {
  const [isHovered, setIsHovered] = useState(false);
  const isSub = variant === "sub";

  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      onClick={() => {
        if (import.meta.env.DEV) {
          if (to.includes("/categories")) {
            console.warn("[AI_DEBUG] navigate categories from sidebar link", { to, label });
          } else {
            console.info("[AI_DEBUG] navigate from sidebar link", { to, label });
          }
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={({ isActive }) => {
        const baseStyle: CSSProperties = isSub
          ? subNavItem
          : {
              ...navItem,
              gap: collapsed ? 0 : 10,
              justifyContent: collapsed ? "center" : "flex-start",
              padding: collapsed ? "11px 0" : "11px 12px",
              fontSize: 14,
              fontWeight: 500,
            };

        return {
          ...baseStyle,
          ...(isActive
            ? activeNavItem
            : isHovered
              ? hoverNavItem
              : { color: isSub ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.88)" }),
          fontWeight: isActive ? 700 : isSub ? 500 : 500,
          transition: "background 0.18s ease, color 0.18s ease, padding 0.2s ease",
        };
      }}
    >
      {({ isActive }) => (
        <>
          <span
            style={{
              width: ICON_BOX_SIZE,
              height: ICON_BOX_SIZE,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              background: isActive
                ? "rgba(37,99,235,0.14)"
                : isHovered
                  ? "rgba(255,255,255,0.18)"
                  : "rgba(255,255,255,0.12)",
              fontSize: ICON_FONT_SIZE,
              flexShrink: 0,
              fontStyle: "normal",
              color: "inherit",
              transition: "background 0.18s ease",
            }}
          >
            {icon}
          </span>
          {!collapsed && <span>{label}</span>}
        </>
      )}
    </NavLink>
  );
}

function SidebarExternalLink({
  href,
  label,
  icon,
  collapsed,
}: {
  href: string;
  label: string;
  icon: string;
  collapsed: boolean;
}) {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={collapsed ? label : undefined}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        ...navItem,
        gap: collapsed ? 0 : 10,
        justifyContent: collapsed ? "center" : "flex-start",
        padding: collapsed ? "11px 0" : "11px 12px",
        fontSize: 14,
        fontWeight: 500,
        ...(isHovered ? hoverNavItem : { color: "rgba(255,255,255,0.82)" }),
      }}
    >
      <span
        style={{
          width: ICON_BOX_SIZE,
          height: ICON_BOX_SIZE,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 8,
          background: isHovered ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.12)",
          fontSize: ICON_FONT_SIZE,
          flexShrink: 0,
          color: "inherit",
          transition: "background 0.18s ease",
        }}
      >
        {icon}
      </span>
      {!collapsed && <span>{label}</span>}
    </a>
  );
}

// ── RestaurantAvatar ───────────────────────────────────────────────────────
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

// ── SidebarGroup ───────────────────────────────────────────────────────────
function SidebarGroup({
  group,
  isOpen,
  onToggle,
  sidebarCollapsed,
}: {
  group: NavGroup;
  isOpen: boolean;
  onToggle: () => void;
  sidebarCollapsed: boolean;
}) {
  const { pathname } = useLocation();
  const [headerHover, setHeaderHover] = useState(false);

  const hasActiveChild = group.items.some((item) =>
    item.end
      ? pathname === item.to
      : pathname === item.to || pathname.startsWith(item.to + "/")
  );

  // Icon-only collapsed sidebar: flat icon list, no group header
  if (sidebarCollapsed) {
    return (
      <>
        {group.items.map((item) => (
          <SidebarItemLink
            key={item.to}
            to={item.to}
            label={item.label}
            icon={item.icon}
            collapsed
            end={item.end}
          />
        ))}
      </>
    );
  }

  // Expanded sidebar: collapsible group
  const headerBg =
    headerHover || (hasActiveChild && !isOpen)
      ? "rgba(255,255,255,0.08)"
      : "transparent";
  const headerColor =
    hasActiveChild && !isOpen ? "#fff" : "rgba(255,255,255,0.84)";

  return (
    <div style={{ marginBottom: 2 }}>
      <button
        type="button"
        onClick={onToggle}
        onMouseEnter={() => setHeaderHover(true)}
        onMouseLeave={() => setHeaderHover(false)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 7,
          borderRadius: 8,
          border: "none",
          background: headerBg,
          color: headerColor,
          padding: "8px 10px",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.02em",
          textTransform: "uppercase",
          transition: "background 0.15s ease, color 0.15s ease",
          marginTop: 12,
          marginBottom: 2,
        }}
      >
        <span style={{ fontSize: 13, lineHeight: "1", opacity: 0.95 }}>
          {group.icon}
        </span>
        <span style={{ flex: 1, textAlign: "left" }}>{group.label}</span>
        <ChevronDown
          size={13}
          style={{
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.22s ease",
            flexShrink: 0,
            opacity: 0.78,
          }}
        />
      </button>

      {/* Collapsible children */}
      <div
        style={{
          maxHeight: isOpen ? "600px" : "0",
          overflow: "hidden",
          transition: "max-height 0.25s ease",
        }}
      >
        <div
          style={{
            borderLeft: "2px solid rgba(255,255,255,0.14)",
            marginLeft: 21,
            paddingLeft: 4,
            paddingTop: 2,
            paddingBottom: 4,
            display: "flex",
            flexDirection: "column",
            gap: 1,
          }}
        >
          {group.items.map((item) => (
            <SidebarItemLink
              key={item.to}
              to={item.to}
              label={item.label}
              icon={item.icon}
              collapsed={false}
              end={item.end}
              variant="sub"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── AdminLayout ────────────────────────────────────────────────────────────
function AdminLayout() {
  const {
    adminPath,
    menuPath,
    name,
    isSuperadmin,
    availableRestaurants,
    restaurantId,
    setCurrentRestaurantId,
  } = useRestaurant();
  const { isOwner, isAdmin } = useAdminMembership();
  const { isEnabled } = useRestaurantFeatures(restaurantId);
  const navigate = useNavigate();
  const location = useLocation();
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth < 960 : false
  );
  const [isSmallMobile, setIsSmallMobile] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Diagnostics error banner
  const BANNER_KEY = `diag_banner_dismissed_${restaurantId}`;
  const [errorCount, setErrorCount] = useState(0);
  const [bannerDismissed, setBannerDismissed] = useState(() => {
    try { return sessionStorage.getItem(`diag_banner_dismissed_${restaurantId}`) === "1"; } catch { return false; }
  });
  const diagFetched = useRef(false);

  // Group open/closed state — persisted in localStorage
  const [groupsOpen, setGroupsOpen] = useState<Record<string, boolean>>(() => {
    const defaults: Record<string, boolean> = { menu: true, marketing: false, equipo: false, ajustes: false };
    try {
      const raw = localStorage.getItem(GROUPS_KEY);
      if (raw) return { ...defaults, ...(JSON.parse(raw) as Record<string, boolean>) };
    } catch {
      // ignore
    }
    return defaults;
  });

  const toggleGroup = (id: string) => {
    setGroupsOpen((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(GROUPS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const isGroupOpen = (id: string, defaultOpen: boolean): boolean =>
    groupsOpen[id] !== undefined ? groupsOpen[id] : defaultOpen;

  // Role gate: returns true if the current user meets the requiredRole.
  const canSee = (
    requiredRole: SidebarItemConfig["requiredRole"],
    requiredFeature?: SidebarItemConfig["requiredFeature"]
  ): boolean => {
    const roleOk = !requiredRole
      ? true
      : requiredRole === "admin"
        ? isAdmin
        : requiredRole === "owner"
          ? isOwner
          : false;

    if (!roleOk) return false;
    if (requiredFeature && !isEnabled(requiredFeature)) return false;
    return true;
  };

  // Resolve an item's relative path to a full NavLink `to` value.
  const resolvePath = (path: string) => (path ? `${adminPath}/${path}` : adminPath);

  // Top-level items (no group, not bottom) — filtered by role.
  const topItems = useMemo<NavItem[]>(
    () =>
      SIDEBAR_ITEMS.filter((item) => !item.group && !item.bottom && canSee(item.requiredRole, item.requiredFeature)).map(
        (item) => ({ to: resolvePath(item.path), label: item.label, icon: item.icon, end: item.end })
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [adminPath, isOwner, isAdmin, isEnabled]
  );

  // Grouped nav items — groups and their items filtered by role.
  const navGroups = useMemo<NavGroup[]>(
    () =>
      SIDEBAR_GROUPS.filter((g) => canSee(g.requiredRole))
        .map((g) => ({
          id: g.id,
          label: g.label,
          icon: g.icon,
          defaultOpen: g.defaultOpen,
          items: SIDEBAR_ITEMS.filter(
            (item) => item.group === g.id && canSee(item.requiredRole, item.requiredFeature)
          ).map((item) => ({
            to: resolvePath(item.path),
            label: item.label,
            icon: item.icon,
            end: item.end,
          })),
        }))
        .filter((g) => g.items.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [adminPath, isOwner, isAdmin, isEnabled]
  );

  // Bottom settings items — filtered by role.
  const bottomItems = useMemo<NavItem[]>(
    () =>
      SIDEBAR_ITEMS.filter((item) => item.bottom && canSee(item.requiredRole, item.requiredFeature)).map((item) => ({
        to: resolvePath(item.path),
        label: item.label,
        icon: item.icon,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [adminPath, isOwner, isAdmin, isEnabled]
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
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (import.meta.env.DEV) {
        console.info("[admin-layout] auth event", {
          event,
          hasSession: Boolean(session),
          targetOnSignOut: menuPath,
        });
      }
      if (!session && event === "SIGNED_OUT") {
        if (import.meta.env.DEV) {
          console.warn("[admin-layout] redirect -> public menu", {
            reason: "signed_out",
            target: menuPath,
          });
        }
        navigate(menuPath);
      }
    });
    return () => subscription.unsubscribe();
  }, [menuPath, navigate]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Fetch error count once on mount (for the alert banner)
  useEffect(() => {
    if (diagFetched.current || !restaurantId) return;
    diagFetched.current = true;

    void runErrorCheck(restaurantId).then((count) => {
      setErrorCount(count);
    });
  }, [restaurantId]);

  const handleDismissBanner = useCallback(() => {
    setBannerDismissed(true);
    try { sessionStorage.setItem(BANNER_KEY, "1"); } catch { /* ignore */ }
  }, [BANNER_KEY]);

  const handleSignOut = async () => {
    setSignOutError(null);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setSignOutError(error.message);
      return;
    }
    navigate(menuPath);
  };

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
            marginBottom: 6,
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
            display: "flex",
            flexDirection: "column",
            gap: 2,
            flex: 1,
            minHeight: 0,
            padding: isCollapsed ? "4px 8px" : "4px 10px",
            overflowY: "auto",
          }}
        >
          {/* ── Top-level items (always visible) ── */}
          {topItems.map((item) => (
            <SidebarItemLink
              key={item.to}
              to={item.to}
              label={item.label}
              icon={item.icon}
              collapsed={isCollapsed}
              end={item.end}
            />
          ))}

          {/* ── Grouped sections ── */}
          {navGroups.map((group) => (
            <SidebarGroup
              key={group.id}
              group={group}
              isOpen={isGroupOpen(group.id, group.defaultOpen)}
              onToggle={() => toggleGroup(group.id)}
              sidebarCollapsed={isCollapsed}
            />
          ))}
        </nav>

        {/* ── Bottom: Ajustes + external links ── */}
        <div
          style={{
            padding: isCollapsed ? "8px 8px 4px" : "8px 10px 4px",
            borderTop: "1px solid rgba(255,255,255,0.12)",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {/* Bottom settings items — role-filtered via sidebarConfig */}
          {bottomItems.map((item) => (
            <SidebarItemLink
              key={item.to}
              to={item.to}
              label={item.label}
              icon={item.icon}
              collapsed={isCollapsed}
            />
          ))}

          {/* Ver menú público */}
          <SidebarExternalLink
            href={menuPath}
            label="Ver menú público"
            icon=""
            collapsed={isCollapsed}
          />

        </div>

        {/* ── Colapsar button — desktop only ── */}
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
              <span
                style={{
                  fontSize: 16,
                  lineHeight: "1",
                  transform: isCollapsed ? "rotate(180deg)" : "none",
                  transition: "transform 0.2s ease",
                  display: "inline-block",
                }}
              >
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
    <div
      style={{
        minHeight: "100vh",
        background: "var(--admin-content-bg, #f8fafc)",
        position: "relative",
      }}
    >
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
          padding: isMobile
            ? `12px 12px ${isSmallMobile ? "72px" : "16px"}`
            : "16px 16px 20px",
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
                  lineHeight: "1",
                  color: "#374151",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                
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
              <span style={{ color: "var(--admin-text-secondary, #6b7280)", fontSize: 12 }}>
                Panel Admin
              </span>
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
              onClick={() => {
                if (import.meta.env.DEV) {
                  console.info("[AI_DEBUG] clicked assistant topbar button");
                }
                window.dispatchEvent(new CustomEvent("open-support-chat"));
              }}
              title="Abrir asistente IA"
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
                cursor: "pointer",
                fontWeight: 800,
                fontSize: 16,
                color: "#6b7280",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                transition: "border-color 0.15s, color 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#3b82f6";
                e.currentTarget.style.color = "#3b82f6";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#e5e7eb";
                e.currentTarget.style.color = "#6b7280";
              }}
            >
              IA
            </button>

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

        {/* Diagnostics error banner */}
        {errorCount > 0 && !bannerDismissed && (
          <div
            role="alert"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              marginBottom: 10,
              padding: "9px 14px",
              background: "#ef4444",
              color: "#fff",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              flexWrap: "wrap",
            }}
          >
            <span>
               {errorCount} problema{errorCount !== 1 ? "s" : ""} crítico{errorCount !== 1 ? "s" : ""} detectado{errorCount !== 1 ? "s" : ""}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                type="button"
                onClick={() => navigate(`${adminPath}/diagnostics`)}
                style={{
                  background: "rgba(255,255,255,0.22)",
                  border: "1px solid rgba(255,255,255,0.4)",
                  color: "#fff",
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Ver diagnóstico →
              </button>
              <button
                type="button"
                onClick={handleDismissBanner}
                aria-label="Cerrar alerta"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: 18,
                  lineHeight: "1",
                  padding: "0 2px",
                  opacity: 0.8,
                }}
              >
                ×
              </button>
            </div>
          </div>
        )}

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
            { to: `${adminPath}`, label: "Dashboard", icon: "D", end: true },
            { to: `${adminPath}/tpv`, label: "TPV", icon: "T" },
            { to: `${adminPath}/orders`, label: "Pedidos", icon: "O" },
            { to: `${adminPath}/tables`, label: "Mesas", icon: "M" },
            { to: `${adminPath}/caja`, label: "Caja", icon: "C" },
          ]
            .filter((item) => {
              if (item.to.endsWith("/orders")) return isEnabled("online_ordering");
              if (item.to.endsWith("/tpv") || item.to.endsWith("/caja")) return isEnabled("pos");
              if (item.to.endsWith("/tables")) return isEnabled("tables");
              return true;
            })
            .map((item) => (
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

      <SupportChatWidget />
    </div>
  );
}

export default AdminLayout;




