import { useEffect, useState } from "react";

import { useAuth } from "../../auth/AuthContext";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../../restaurant/RestaurantContext";
import { AdminMembershipProvider, type JobRole, type RestaurantRole } from "./AdminMembershipContext";

type GateStatus = "forbidden" | "rls" | "restaurant_not_found" | null;

type MemberRow = {
  role: RestaurantRole;
  access_role: RestaurantRole;
  job_role: JobRole | null;
  is_active: boolean;
  display_name: string | null;
};

function isRlsError(error: { code?: string | null; message?: string | null } | null | undefined) {
  const message = String(error?.message ?? "").toLowerCase();
  const code = String(error?.code ?? "");
  return code === "42501" || message.includes("row-level security") || message.includes("permission denied");
}

function AdminGate({ children }: { children: React.ReactNode }) {
  const { restaurantId, menuPath, isSuperadmin } = useRestaurant();
  const { session } = useAuth();

  const [loading, setLoading] = useState(true);
  const [memberRow, setMemberRow] = useState<MemberRow | null>(null);
  const [gateStatus, setGateStatus] = useState<GateStatus>(null);
  const [gateMessage, setGateMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const loadMembership = async () => {
      if (!session) {
        if (!alive) return;
        setMemberRow(null);
        setGateStatus(null);
        setGateMessage(null);
        setLoading(false);
        return;
      }

      if (!restaurantId) {
        if (!alive) return;
        setMemberRow(null);
        setGateStatus("restaurant_not_found");
        setGateMessage("No tienes restaurante asignado.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setGateStatus(null);
      setGateMessage(null);

      if (isSuperadmin) {
        setMemberRow({ role: "owner", access_role: "owner", job_role: null, is_active: true, display_name: null });
        setLoading(false);
        return;
      }

      const { data: authUserData, error: authUserError } = await supabase.auth.getUser();

      if (authUserError || !authUserData?.user?.id) {
        if (!alive) return;
        setMemberRow(null);
        setLoading(false);
        return;
      }

      const userId = authUserData.user.id;

      const { data, error } = await supabase
        .from("restaurant_members")
        .select("role, access_role, job_role, is_active, display_name")
        .eq("user_id", userId)
        .eq("restaurant_id", restaurantId)
        .maybeSingle<MemberRow>();

      if (!alive) return;

      if (error) {
        if (isRlsError(error)) {
          setGateStatus("rls");
          setGateMessage("RLS bloquea lectura de restaurant_members");
        } else {
          setGateStatus("forbidden");
          setGateMessage(`No se pudo verificar membresía: ${error.message}`);
        }
        setMemberRow(null);
        setLoading(false);
        return;
      }

      if (!data?.access_role) {
        setGateStatus("forbidden");
        setGateMessage("No tienes acceso al admin de este restaurante.");
        setMemberRow(null);
        setLoading(false);
        return;
      }

      if (!data.is_active) {
        setGateStatus("forbidden");
        setGateMessage("Tu cuenta ha sido desactivada. Contacta con el propietario del restaurante.");
        setMemberRow(null);
        setLoading(false);
        return;
      }

      setMemberRow(data);
      setLoading(false);
    };

    void loadMembership();

    return () => {
      alive = false;
    };
  }, [isSuperadmin, restaurantId, session]);

  if (loading) return <div style={{ padding: 16 }}>Cargando...</div>;

  if (gateStatus && gateMessage) {
    const isDeactivated = gateMessage.includes("desactivada");
    return (
      <div style={{ padding: 16, display: "grid", gap: 12, maxWidth: 520 }}>
        <h2>{gateStatus === "restaurant_not_found" ? "Restaurant no encontrado" : "403 - Acceso denegado"}</h2>
        <p>{gateMessage}</p>
        {isDeactivated ? (
          <button onClick={() => (window.location.href = "/login")}>Ir al login</button>
        ) : (
          <button onClick={() => (window.location.href = menuPath)}>Volver</button>
        )}
      </div>
    );
  }

  if (!memberRow) {
    return <div style={{ padding: 16 }}>Verificando permisos...</div>;
  }

  return (
    <AdminMembershipProvider
      role={memberRow.role}
      accessRole={memberRow.access_role}
      jobRole={memberRow.job_role}
      isActive={memberRow.is_active}
      displayName={memberRow.display_name}
    >
      {children}
    </AdminMembershipProvider>
  );
}

export default AdminGate;
