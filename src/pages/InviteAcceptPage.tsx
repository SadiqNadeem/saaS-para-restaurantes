import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type InvitationRow = {
  id: string;
  restaurant_id: string;
  access_role: string;
  job_role: string | null;
  note: string | null;
  expires_at: string;
  used_at: string | null;
  restaurants: { name: string; slug: string } | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  owner: "Propietario",
  admin: "Administrador",
  staff: "Staff",
};

const JOB_LABELS: Record<string, string> = {
  manager: "Manager",
  camarero: "Camarero",
  repartidor: "Repartidor",
  cocina: "Cocina",
  cajero: "Cajero",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const { session, status: authStatus } = useAuth();
  const navigate = useNavigate();

  const [invitation, setInvitation] = useState<InvitationRow | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "found" | "invalid" | "expired" | "used">("loading");
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  // Load the invitation by token
  useEffect(() => {
    if (!token) { setLoadState("invalid"); return; }

    void (async () => {
      const { data, error } = await supabase
        .from("restaurant_invitations")
        .select("id, restaurant_id, access_role, job_role, note, expires_at, used_at, restaurants(name, slug)")
        .eq("token", token)
        .maybeSingle<InvitationRow>();

      if (error || !data) { setLoadState("invalid"); return; }
      if (data.used_at)    { setLoadState("used");    setInvitation(data); return; }
      if (new Date(data.expires_at) < new Date()) { setLoadState("expired"); setInvitation(data); return; }

      setInvitation(data);
      setLoadState("found");
    })();
  }, [token]);

  // If not logged in, redirect to login with ?next=... so they come back here
  const handleLoginRedirect = () => {
    navigate(`/login?next=/invite/${token ?? ""}`);
  };

  const handleAccept = async () => {
    if (!invitation || !session?.user?.id) return;
    setAccepting(true);
    setAcceptError(null);

    try {
      // Mark invitation as used
      const { error: useErr } = await supabase
        .from("restaurant_invitations")
        .update({ used_at: new Date().toISOString(), used_by: session.user.id })
        .eq("id", invitation.id)
        .is("used_at", null); // optimistic lock

      if (useErr) throw useErr;

      // Insert or update the member row (upsert in case they were already a member)
      const { error: memberErr } = await supabase
        .from("restaurant_members")
        .upsert(
          {
            user_id: session.user.id,
            restaurant_id: invitation.restaurant_id,
            role: invitation.access_role,
            access_role: invitation.access_role,
            job_role: invitation.job_role ?? null,
            is_active: true,
            joined_at: new Date().toISOString(),
          },
          { onConflict: "user_id,restaurant_id" }
        );

      if (memberErr) throw memberErr;

      // Redirect to the admin panel of that restaurant
      const slug = invitation.restaurants?.slug ?? "";
      navigate(`/r/${slug}/admin`, { replace: true });
    } catch (err: unknown) {
      setAcceptError((err as Error).message ?? "Error al aceptar la invitación");
    } finally {
      setAccepting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (authStatus === "loading" || loadState === "loading") {
    return <LoadingScreen />;
  }

  if (loadState === "invalid") {
    return (
      <StatusScreen
        emoji="❌"
        title="Invitación no válida"
        message="El enlace de invitación no existe o es incorrecto."
      />
    );
  }

  if (loadState === "used") {
    return (
      <StatusScreen
        emoji="✅"
        title="Invitación ya utilizada"
        message="Este enlace ya fue utilizado. Si crees que es un error, contacta con el propietario del restaurante."
      />
    );
  }

  if (loadState === "expired") {
    return (
      <StatusScreen
        emoji="⏱️"
        title="Invitación caducada"
        message="Este enlace de invitación ha caducado (48 h). Pide al propietario que genere uno nuevo."
      />
    );
  }

  const restaurantName = invitation!.restaurants?.name ?? "un restaurante";
  const roleLabel = ROLE_LABELS[invitation!.access_role] ?? invitation!.access_role;
  const jobLabel  = invitation!.job_role ? JOB_LABELS[invitation!.job_role] ?? invitation!.job_role : null;

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.restaurantIcon}>🍽️</div>
          <h1 style={styles.title}>Invitación al equipo</h1>
          <p style={styles.subtitle}>
            Te han invitado a unirte al equipo de{" "}
            <strong>{restaurantName}</strong>
          </p>
        </div>

        {/* Role info */}
        <div style={styles.roleBox}>
          <div style={styles.roleRow}>
            <span style={styles.roleLabel}>Rol de acceso</span>
            <span style={{ ...styles.badge, background: "#dbeafe", color: "#1d4ed8" }}>
              {roleLabel}
            </span>
          </div>
          {jobLabel && (
            <div style={styles.roleRow}>
              <span style={styles.roleLabel}>Puesto</span>
              <span style={{ ...styles.badge, background: "#d1fae5", color: "#065f46" }}>
                {jobLabel}
              </span>
            </div>
          )}
          {invitation!.note && (
            <div style={{ marginTop: 8, fontSize: 13, color: "#6b7280", fontStyle: "italic" }}>
              "{invitation!.note}"
            </div>
          )}
        </div>

        {/* Action */}
        {authStatus !== "authenticated" ? (
          <div style={styles.actionSection}>
            <p style={{ fontSize: 13, color: "#6b7280", margin: 0, marginBottom: 12 }}>
              Debes iniciar sesión o registrarte para aceptar la invitación.
            </p>
            <button style={styles.primaryBtn} onClick={handleLoginRedirect}>
              Iniciar sesión / Registrarse
            </button>
          </div>
        ) : (
          <div style={styles.actionSection}>
            {acceptError && (
              <p style={{ fontSize: 13, color: "#dc2626", margin: "0 0 10px" }}>{acceptError}</p>
            )}
            <button
              style={{ ...styles.primaryBtn, opacity: accepting ? 0.7 : 1 }}
              disabled={accepting}
              onClick={() => void handleAccept()}
            >
              {accepting ? "Aceptando..." : `Unirme a ${restaurantName}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <p style={{ textAlign: "center", color: "#6b7280" }}>Cargando invitación...</p>
      </div>
    </div>
  );
}

function StatusScreen({ emoji, title, message }: { emoji: string; title: string; message: string }) {
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>{emoji}</div>
          <h2 style={{ margin: "0 0 8px", fontSize: 20, color: "#111827" }}>{title}</h2>
          <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>{message}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  page: {
    minHeight: "100dvh",
    background: "#f8fafc",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  } as React.CSSProperties,
  card: {
    background: "#fff",
    borderRadius: 16,
    boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
    padding: 32,
    width: "100%",
    maxWidth: 420,
    display: "flex",
    flexDirection: "column",
    gap: 24,
  } as React.CSSProperties,
  header: {
    textAlign: "center" as const,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 8,
  },
  restaurantIcon: { fontSize: 40 },
  title: { margin: 0, fontSize: 22, fontWeight: 700, color: "#111827" },
  subtitle: { margin: 0, fontSize: 14, color: "#6b7280" },
  roleBox: {
    background: "#f8fafc",
    borderRadius: 10,
    padding: "12px 16px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  },
  roleRow: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  roleLabel: { fontSize: 13, color: "#374151", fontWeight: 600 },
  badge: {
    display: "inline-block",
    padding: "3px 12px",
    borderRadius: 99,
    fontSize: 12,
    fontWeight: 600,
  } as React.CSSProperties,
  actionSection: { display: "flex", flexDirection: "column" as const },
  primaryBtn: {
    padding: "12px 20px",
    borderRadius: 10,
    border: "none",
    background: "var(--brand-primary, #4ec580)",
    color: "#fff",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    width: "100%",
  } as React.CSSProperties,
};
