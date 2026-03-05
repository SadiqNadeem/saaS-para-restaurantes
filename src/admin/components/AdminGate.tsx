import { useEffect, useState } from "react";

import { useAuth } from "../../auth/AuthContext";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../../restaurant/RestaurantContext";
import { AdminMembershipProvider, type RestaurantRole } from "./AdminMembershipContext";

type GateStatus = "forbidden" | "rls" | "restaurant_not_found" | null;

function isRlsError(error: { code?: string | null; message?: string | null } | null | undefined) {
  const message = String(error?.message ?? "").toLowerCase();
  const code = String(error?.code ?? "");
  return code === "42501" || message.includes("row-level security") || message.includes("permission denied");
}

function AdminGate({ children }: { children: React.ReactNode }) {
  const { restaurantId, menuPath, isSuperadmin } = useRestaurant();
  const { session } = useAuth();

  const [loading, setLoading] = useState(true);

  const [membershipRole, setMembershipRole] = useState<RestaurantRole | null>(null);
  const [gateStatus, setGateStatus] = useState<GateStatus>(null);
  const [gateMessage, setGateMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const loadMembership = async () => {
      if (!session) {
        if (!alive) return;
        setMembershipRole(null);
        setGateStatus(null);
        setGateMessage(null);
        setLoading(false);
        return;
      }

      if (!restaurantId) {
        if (!alive) return;
        setMembershipRole(null);
        setGateStatus("restaurant_not_found");
        setGateMessage("No tienes restaurante asignado.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setGateStatus(null);
      setGateMessage(null);

      if (isSuperadmin) {
        setMembershipRole("owner");
        setLoading(false);
        return;
      }

      const { data: authUserData, error: authUserError } = await supabase.auth.getUser();

      if (authUserError || !authUserData?.user?.id) {
        if (!alive) return;
        setMembershipRole(null);
        setLoading(false);
        return;
      }

      const userId = authUserData.user.id;

      const { data, error } = await supabase
        .from("restaurant_members")
        .select("role")
        .eq("user_id", userId)
        .eq("restaurant_id", restaurantId)
        .maybeSingle<{ role: RestaurantRole }>();

      if (!alive) return;

      if (error) {
        if (isRlsError(error)) {
          setGateStatus("rls");
          setGateMessage("RLS bloquea lectura de restaurant_members");
        } else {
          setGateStatus("forbidden");
          setGateMessage(`No se pudo verificar membresia: ${error.message}`);
        }
        setMembershipRole(null);
        setLoading(false);
        return;
      }

      if (!data?.role) {
        setGateStatus("forbidden");
        setGateMessage("No tienes acceso al admin de este restaurante.");
        setMembershipRole(null);
        setLoading(false);
        return;
      }

      setMembershipRole(data.role);
      setLoading(false);
    };

    void loadMembership();

    return () => {
      alive = false;
    };
  }, [isSuperadmin, restaurantId, session]);

  if (loading) return <div style={{ padding: 16 }}>Cargando...</div>;

  if (gateStatus && gateMessage) {
    return (
      <div style={{ padding: 16, display: "grid", gap: 12, maxWidth: 520 }}>
        <h2>{gateStatus === "restaurant_not_found" ? "Restaurant no encontrado" : "403 - Acceso denegado"}</h2>
        <p>{gateMessage}</p>
        <button onClick={() => (window.location.href = menuPath)}>Volver</button>
      </div>
    );
  }

  if (!membershipRole) {
    return <div style={{ padding: 16 }}>Verificando permisos...</div>;
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <span>Rol: {membershipRole}</span>
      </div>
      <AdminMembershipProvider role={membershipRole}>{children}</AdminMembershipProvider>
    </div>
  );
}

export default AdminGate;
