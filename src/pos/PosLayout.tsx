import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";

import { supabase } from "../lib/supabase";
import { useRestaurant } from "../restaurant/RestaurantContext";
import { PosRealtimeProvider, usePosRealtimeCtx } from "./PosRealtimeContext";
import { usePosRole } from "./hooks/usePosRole";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { createPosOrder } from "./services/posOrderService";
import { getOfflineQueue, removeFromQueue } from "./services/offlineQueue";

// ─── Role badge ───────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  superadmin: "Superadmin",
  owner: "Propietario",
  admin: "Admin",
  staff: "Staff",
};

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  superadmin: { bg: "rgba(168,85,247,0.2)", color: "#c084fc" },
  owner: { bg: "rgba(74,222,128,0.15)", color: "#4ade80" },
  admin: { bg: "rgba(59,130,246,0.15)", color: "#60a5fa" },
  staff: { bg: "rgba(100,116,139,0.15)", color: "#94a3b8" },
};

// ─── Inner layout (consumes context) ─────────────────────────────────────────

type SyncToast = { id: number; type: "success" | "error"; message: string };

function PosLayoutInner() {
  const { name, menuPath, adminPath } = useRestaurant();
  const { pendingWebCount, toasts, dismissToast } = usePosRealtimeCtx();
  const { role } = usePosRole();
  const location = useLocation();
  const navigate = useNavigate();

  const isOnline = useOnlineStatus();
  const prevOnlineRef = useRef(isOnline);
  const [syncToasts, setSyncToasts] = useState<SyncToast[]>([]);
  const syncToastIdRef = useRef(0);

  const pushSyncToast = useCallback((type: SyncToast["type"], message: string) => {
    const id = ++syncToastIdRef.current;
    setSyncToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setSyncToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  // Process the offline queue when connectivity is restored
  const syncQueue = useCallback(async () => {
    const queue = getOfflineQueue();
    if (queue.length === 0) return;

    for (const entry of queue) {
      try {
        await createPosOrder(entry.params);
        removeFromQueue(entry.queueId);
        pushSyncToast("success", `Pedido de ${entry.customerLabel} sincronizado`);
      } catch {
        pushSyncToast("error", `Error al sincronizar pedido de ${entry.customerLabel} — se reintentará`);
      }
    }
  }, [pushSyncToast]);

  useEffect(() => {
    if (!prevOnlineRef.current && isOnline) {
      // just came back online — flush the queue
      void syncQueue();
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline, syncQueue]);

  const posBase = menuPath === "/" ? "/pos" : `${menuPath}/pos`;

  const [autoPrint, setAutoPrint] = useState(
    () => localStorage.getItem("pos_auto_print") === "1"
  );

  const [currentTime, setCurrentTime] = useState(() =>
    new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
  );
  useEffect(() => {
    const id = window.setInterval(() => {
      setCurrentTime(
        new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
      );
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const toggleAutoPrint = () => {
    const next = !autoPrint;
    setAutoPrint(next);
    if (next) {
      localStorage.setItem("pos_auto_print", "1");
    } else {
      localStorage.removeItem("pos_auto_print");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const isOrdersActive = location.pathname.includes("/orders");
  const isFloorPlanActive = location.pathname.includes("/floor-plan");

  const roleStyle = role ? (ROLE_COLORS[role] ?? ROLE_COLORS.staff) : null;

  return (
    <div
      className="pos-shell"
      style={{
        display: "flex",
        height: "100dvh",
        overflow: "hidden",
        background: "#0f172a",
        fontFamily: "system-ui, -apple-system, sans-serif",
        flexDirection: "column",
      }}
    >
      {/* ── Web-order alert banner ── */}
      {pendingWebCount > 0 && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate(`${posBase}/orders?status=pending&source=web`)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              navigate(`${posBase}/orders?status=pending&source=web`);
            }
          }}
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            padding: "10px 20px",
            background: "linear-gradient(90deg,#7c2d12,#c2410c)",
            color: "#fff",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            animation: "pos-banner-pulse 2s ease-in-out infinite",
            letterSpacing: "0.01em",
            userSelect: "none",
            zIndex: 100,
          }}
        >
          <span style={{ fontSize: 18 }}></span>
          <span>
            {pendingWebCount === 1
              ? "1 pedido web pendiente de atender"
              : `${pendingWebCount} pedidos web pendientes de atender`}
          </span>
          <span
            style={{
              marginLeft: 8,
              fontSize: 11,
              fontWeight: 600,
              opacity: 0.8,
              textDecoration: "underline",
            }}
          >
            Ver pedidos →
          </span>
        </div>
      )}

      {/* ── Offline banner ── */}
      {!isOnline && (
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            padding: "10px 20px",
            background: "#1e293b",
            borderBottom: "1px solid #f59e0b",
            color: "#fbbf24",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          <span>📶</span>
          <span>Sin conexión — los pedidos se guardarán localmente</span>
        </div>
      )}

      {/* ── Main layout row ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* ── Sidebar ── */}
        <aside
          style={{
            width: 224,
            flexShrink: 0,
            background: "#1e293b",
            borderRight: "1px solid #334155",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Restaurant name / header */}
          <div
            style={{
              padding: "14px 16px 12px",
              borderBottom: "1px solid #334155",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <p
                style={{
                  margin: 0,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  color: "#64748b",
                }}
              >
                TPV
              </p>
              <span style={{ fontSize: 18, fontWeight: 800, color: "#f1f5f9", fontVariantNumeric: "tabular-nums" }}>
                {currentTime}
              </span>
            </div>
            <p
              style={{
                margin: 0,
                fontSize: 15,
                fontWeight: 700,
                color: "#f1f5f9",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={name}
            >
              {name}
            </p>
            {/* FIX 4: Role badge */}
            {role && roleStyle && (
              <span
                style={{
                  display: "inline-block",
                  marginTop: 6,
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 20,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  background: roleStyle.bg,
                  color: roleStyle.color,
                }}
              >
                {ROLE_LABELS[role] ?? role}
              </span>
            )}
          </div>

          {/* Nav links */}
          <nav
            style={{
              flex: 1,
              padding: "10px 8px",
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            {/* Caja */}
            <Link
              to={posBase}
              className="ui-nav-item"
              style={{
                display: "flex",
                alignItems: "center",
                padding: "11px 14px",
                borderRadius: 8,
                fontSize: 15,
                fontWeight: location.pathname === posBase ? 600 : 400,
                color: location.pathname === posBase ? "#f1f5f9" : "#94a3b8",
                background:
                  location.pathname === posBase ? "#334155" : "transparent",
                textDecoration: "none",
                transition: "background 0.12s, color 0.12s",
                minHeight: 44,
              }}
            >
              Caja
            </Link>

            {/* Mesas */}
            <Link
              to={`${posBase}/tables`}
              className="ui-nav-item"
              style={{
                display: "flex",
                alignItems: "center",
                padding: "11px 14px",
                borderRadius: 8,
                fontSize: 15,
                fontWeight: location.pathname.includes("/tables") ? 600 : 400,
                color: location.pathname.includes("/tables") ? "#f1f5f9" : "#94a3b8",
                background: location.pathname.includes("/tables") ? "#334155" : "transparent",
                textDecoration: "none",
                transition: "background 0.12s, color 0.12s",
                minHeight: 44,
              }}
            >
              Mesas
            </Link>

            {/* Plano de sala */}
            <Link
              to={`${posBase}/floor-plan`}
              className="ui-nav-item"
              style={{
                display: "flex",
                alignItems: "center",
                padding: "11px 14px",
                borderRadius: 8,
                fontSize: 15,
                fontWeight: isFloorPlanActive ? 600 : 400,
                color: isFloorPlanActive ? "#f1f5f9" : "#94a3b8",
                background: isFloorPlanActive ? "#334155" : "transparent",
                textDecoration: "none",
                transition: "background 0.12s, color 0.12s",
                minHeight: 44,
              }}
            >
              Plano de sala
            </Link>

            {/* Pedidos — with pending-web badge */}
            <Link
              to={`${posBase}/orders`}
              className="ui-nav-item"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "11px 14px",
                borderRadius: 8,
                fontSize: 15,
                fontWeight: isOrdersActive ? 600 : 400,
                color: isOrdersActive ? "#f1f5f9" : "#94a3b8",
                background: isOrdersActive ? "#334155" : "transparent",
                textDecoration: "none",
                transition: "background 0.12s, color 0.12s",
                minHeight: 44,
              }}
            >
              <span>Pedidos</span>
              {pendingWebCount > 0 && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 20,
                    height: 20,
                    borderRadius: 10,
                    background: "#ef4444",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 800,
                    padding: "0 5px",
                    animation: "pos-badge-pop 0.3s ease-out",
                  }}
                >
                  {pendingWebCount}
                </span>
              )}
            </Link>

            {/* Admin panel link */}
            <a
              href={adminPath}
              className="ui-nav-item"
              style={{
                display: "flex",
                alignItems: "center",
                padding: "11px 14px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 400,
                color: "#64748b",
                textDecoration: "none",
                minHeight: 44,
                marginTop: 8,
                gap: 6,
              }}
            >
              ← Panel Admin
            </a>
          </nav>

          {/* Auto-print toggle */}
          <div
            style={{
              padding: "10px 14px",
              borderTop: "1px solid #334155",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>
               Auto-imprimir
            </span>
            <button
              type="button"
              onClick={toggleAutoPrint}
              className="ui-switch"
              style={{
                width: 40,
                height: 22,
                borderRadius: 11,
                border: "none",
                background: autoPrint ? "#4ade80" : "#334155",
                cursor: "pointer",
                position: "relative",
                transition: "background 0.2s",
                flexShrink: 0,
              }}
              title={
                autoPrint
                  ? "Desactivar impresión automática"
                  : "Activar impresión automática"
              }
            >
              <span
                className="ui-switch-thumb"
                style={{
                  position: "absolute",
                  top: 3,
                  left: 3,
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: "#fff",
                  transform: autoPrint ? "translateX(18px)" : "translateX(0)",
                }}
              />
            </button>
          </div>

          {/* Logout */}
          <div
            style={{ padding: "10px 8px 14px", borderTop: "1px solid #334155" }}
          >
            <button
              type="button"
              onClick={() => void handleLogout()}
              style={{
                width: "100%",
                padding: "11px 14px",
                borderRadius: 8,
                border: "1px solid #334155",
                background: "transparent",
                color: "#94a3b8",
                fontSize: 14,
                textAlign: "left",
                cursor: "pointer",
                minHeight: 44,
              }}
            >
              Cerrar sesión
            </button>
          </div>
        </aside>

        {/* ── Main content ── */}
        <main
          style={{
            flex: 1,
            overflow: "auto",
            background: "#0f172a",
            color: "#f1f5f9",
          }}
        >
          <div key={location.pathname} className="route-fade-slide">
            <Outlet />
          </div>
        </main>
      </div>

      {/* ── Sync toasts (offline queue) ── */}
      {syncToasts.length > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: 16,
            right: 16,
            zIndex: 9000,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            pointerEvents: "none",
          }}
        >
          {syncToasts.map((t) => (
            <div
              key={t.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 16px",
                borderRadius: 10,
                background: "#1e293b",
                border: `1px solid ${t.type === "success" ? "#4ade80" : "#f87171"}`,
                color: t.type === "success" ? "#4ade80" : "#f87171",
                fontSize: 14,
                fontWeight: 600,
                boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
                animation: "pos-toast-in 0.25s ease-out",
                maxWidth: 340,
              }}
            >
              <span>{t.type === "success" ? "✓" : "⚠"}</span>
              <span>{t.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── FAB: Nuevo pedido ── */}
      {location.pathname !== posBase && location.pathname !== posBase + "/" && (
        <button
          type="button"
          onClick={() => navigate(posBase)}
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            gap: 8,
            height: 48,
            padding: "0 20px",
            borderRadius: 24,
            border: "none",
            background: "#4ade80",
            color: "#0f172a",
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 4px 20px rgba(74,222,128,0.40)",
            transition: "background 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#22c55e";
            e.currentTarget.style.boxShadow = "0 6px 28px rgba(74,222,128,0.55)";
            e.currentTarget.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#4ade80";
            e.currentTarget.style.boxShadow = "0 4px 20px rgba(74,222,128,0.40)";
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
          <span>Nuevo pedido</span>
        </button>
      )}

      {/* ── Toast notifications ── */}
      {toasts.length > 0 && (
        <div
          style={{
            position: "fixed",
            top: pendingWebCount > 0 ? 54 : 16,
            right: 16,
            zIndex: 9000,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            pointerEvents: "none",
          }}
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 16px",
                borderRadius: 10,
                background: "#1e293b",
                border: "1px solid #f97316",
                color: "#f1f5f9",
                fontSize: 14,
                fontWeight: 600,
                boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
                animation: "pos-toast-in 0.25s ease-out",
                pointerEvents: "all",
                maxWidth: 320,
              }}
            >
              <span style={{ flex: 1 }}>{toast.message}</span>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "#64748b",
                  cursor: "pointer",
                  fontSize: 18,
                  lineHeight: 1,
                  padding: "0 2px",
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Keyframes injection ──────────────────────────────────────────────────────

if (typeof document !== "undefined") {
  const styleId = "pos-layout-keyframes";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      @keyframes pos-banner-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.85; }
      }
      @keyframes pos-badge-pop {
        0% { transform: scale(0.6); opacity: 0; }
        100% { transform: scale(1); opacity: 1; }
      }
      @keyframes pos-toast-in {
        0% { transform: translateX(40px); opacity: 0; }
        100% { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }
}

// ─── Public export (wraps inner with provider) ────────────────────────────────

export default function PosLayout() {
  return (
    <PosRealtimeProvider>
      <PosLayoutInner />
    </PosRealtimeProvider>
  );
}
