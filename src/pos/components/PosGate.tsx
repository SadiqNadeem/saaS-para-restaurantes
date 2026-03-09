import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../../restaurant/RestaurantContext";

type GateStatus = "forbidden" | "rls" | "restaurant_not_found" | null;
const POS_ALLOWED_ROLES = new Set(["owner", "admin", "staff"]);

function isRlsError(
  error: { code?: string | null; message?: string | null } | null | undefined
) {
  const message = String(error?.message ?? "").toLowerCase();
  const code = String(error?.code ?? "");
  return (
    code === "42501" ||
    message.includes("row-level security") ||
    message.includes("permission denied")
  );
}

export default function PosGate({ children }: { children: React.ReactNode }) {
  const { restaurantId, menuPath, isSuperadmin } = useRestaurant();
  const { session } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [gateStatus, setGateStatus] = useState<GateStatus>(null);
  const [gateMessage, setGateMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const check = async () => {
      // No session â€” redirect to login preserving intended destination
      if (!session) {
        if (!alive) return;
        const next = encodeURIComponent(`${location.pathname}${location.search}`);
        navigate(`/login?next=${next}`, { replace: true });
        return;
      }

      if (!restaurantId) {
        if (!alive) return;
        setGateStatus("restaurant_not_found");
        setGateMessage("No se encontrÃ³ el restaurante.");
        setLoading(false);
        return;
      }

      // Superadmin always has access
      if (isSuperadmin) {
        if (!alive) return;
        setAllowed(true);
        setLoading(false);
        return;
      }

      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr || !authData?.user?.id) {
        if (!alive) return;
        setGateStatus("forbidden");
        setGateMessage("No se pudo verificar la identidad.");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("restaurant_members")
        .select("access_role")
        .eq("user_id", authData.user.id)
        .eq("restaurant_id", restaurantId)
        .maybeSingle<{ access_role: string }>();

      if (!alive) return;

      if (error) {
        setGateStatus(isRlsError(error) ? "rls" : "forbidden");
        setGateMessage(
          isRlsError(error)
            ? "RLS bloquea la lectura de restaurant_members."
            : `No se pudo verificar membresía: ${error.message}`
        );
        setLoading(false);
        return;
      }

      const role = String(data?.access_role ?? "").trim().toLowerCase();
      if (POS_ALLOWED_ROLES.has(role)) {
        setAllowed(true);
      } else {
        setGateStatus("forbidden");
        setGateMessage("No tienes acceso al TPV de este restaurante.");
      }

      setLoading(false);
    };

    void check();

    return () => {
      alive = false;
    };
  }, [isSuperadmin, location.pathname, location.search, navigate, restaurantId, session]);

  if (loading) {
    return (
      <div style={{ padding: 24, color: "#6b7280" }}>Verificando acceso...</div>
    );
  }

  if (gateStatus && gateMessage) {
    return (
      <div style={{ padding: 24, display: "grid", gap: 12, maxWidth: 480 }}>
        <h2 style={{ margin: 0 }}>
          {gateStatus === "restaurant_not_found"
            ? "Restaurante no encontrado"
            : "403 â€” Acceso denegado"}
        </h2>
        <p style={{ margin: 0, color: "#4b5563" }}>{gateMessage}</p>
        <button
          type="button"
          onClick={() => {
            window.location.href = menuPath;
          }}
          style={{
            alignSelf: "start",
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: "#fff",
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          Volver al menÃº
        </button>
      </div>
    );
  }

  if (!allowed) return null;

  return <>{children}</>;
}
