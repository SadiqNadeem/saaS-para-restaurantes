import { useEffect, useRef, useState } from "react";

import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../../restaurant/RestaurantContext";
import AccessDenied from "../components/AccessDenied";
import { useRestaurantRole } from "../hooks/useRestaurantRole";
import type { JobRole, RestaurantRole } from "../components/AdminMembershipContext";

// ── Types ──────────────────────────────────────────────────────────────────

type Member = {
  id: string;
  user_id: string;
  role: RestaurantRole;
  access_role: RestaurantRole;
  job_role: JobRole | null;
  is_active: boolean;
  display_name: string | null;
  created_at: string;
  email?: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────

const ACCESS_ROLE_LABELS: Record<RestaurantRole, string> = {
  owner: "Owner",
  admin: "Admin",
  staff: "Staff",
};

const ACCESS_ROLE_COLORS: Record<RestaurantRole, { bg: string; color: string }> = {
  owner: { bg: "#f3e8ff", color: "#7c3aed" },
  admin: { bg: "#dbeafe", color: "#1d4ed8" },
  staff: { bg: "#f3f4f6", color: "#374151" },
};

const JOB_ROLE_LABELS: Record<JobRole, string> = {
  manager: "Manager",
  camarero: "Camarero",
  repartidor: "Repartidor",
  cocina: "Cocina",
  cajero: "Cajero",
};

const JOB_ROLE_COLORS: Record<JobRole, { bg: string; color: string }> = {
  manager: { bg: "#fef3c7", color: "#92400e" },
  camarero: { bg: "#d1fae5", color: "#065f46" },
  repartidor: { bg: "#fee2e2", color: "#991b1b" },
  cocina: { bg: "#ffedd5", color: "#9a3412" },
  cajero: { bg: "#e0e7ff", color: "#3730a3" },
};

function Badge({
  label,
  bg,
  color,
}: {
  label: string;
  bg: string;
  color: string;
}) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 99,
        fontSize: 12,
        fontWeight: 600,
        background: bg,
        color,
      }}
    >
      {label}
    </span>
  );
}

function Avatar({ email, displayName }: { email?: string; displayName?: string | null }) {
  const name = displayName || email || "?";
  const initial = name.charAt(0).toUpperCase();
  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        background: "var(--brand-primary-soft, rgba(78,197,128,0.14))",
        border: "1.5px solid var(--brand-primary-border, rgba(78,197,128,0.45))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: 14,
        color: "var(--brand-hover, #2e8b57)",
        flexShrink: 0,
      }}
    >
      {initial}
    </div>
  );
}

// ── Edit Modal ──────────────────────────────────────────────────────────────

function EditMemberModal({
  member,
  canChangeAccessRole,
  onClose,
  onSave,
  onRemove,
  currentUserId,
}: {
  member: Member;
  canChangeAccessRole: boolean;
  onClose: () => void;
  onSave: (updated: Partial<Member>) => Promise<void>;
  onRemove: (memberId: string) => Promise<void>;
  currentUserId: string | null;
}) {
  const [accessRole, setAccessRole] = useState<RestaurantRole>(member.access_role);
  const [jobRole, setJobRole] = useState<JobRole | "">(member.job_role ?? "");
  const [isActive, setIsActive] = useState(member.is_active);
  const [displayName, setDisplayName] = useState(member.display_name ?? "");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const isSelf = currentUserId === member.user_id;

  const handleSave = async () => {
    setSaving(true);
    await onSave({
      access_role: accessRole,
      job_role: jobRole || null,
      is_active: isActive,
      display_name: displayName.trim() || null,
    });
    setSaving(false);
  };

  const handleRemove = async () => {
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    setRemoving(true);
    await onRemove(member.id);
    setRemoving(false);
  };

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: 24,
          width: "100%",
          maxWidth: 420,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar email={member.email} displayName={member.display_name} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>
              {member.display_name || member.email || "Usuario"}
            </div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>{member.email}</div>
          </div>
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
          <span style={{ fontWeight: 600, color: "#374151" }}>Nombre a mostrar</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Nombre del miembro"
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: "8px 10px",
              fontSize: 14,
            }}
          />
        </label>

        {canChangeAccessRole && (
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
            <span style={{ fontWeight: 600, color: "#374151" }}>Rol de acceso</span>
            <select
              value={accessRole}
              onChange={(e) => setAccessRole(e.target.value as RestaurantRole)}
              style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px", fontSize: 14 }}
            >
              <option value="owner">Owner — control total</option>
              <option value="admin">Admin — gestión completa</option>
              <option value="staff">Staff — operaciones básicas</option>
            </select>
          </label>
        )}

        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
          <span style={{ fontWeight: 600, color: "#374151" }}>Puesto de trabajo</span>
          <select
            value={jobRole}
            onChange={(e) => setJobRole(e.target.value as JobRole | "")}
            style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px", fontSize: 14 }}
          >
            <option value="">Sin especificar</option>
            <option value="manager">Manager</option>
            <option value="camarero">Camarero</option>
            <option value="cajero">Cajero</option>
            <option value="cocina">Cocina</option>
            <option value="repartidor">Repartidor</option>
          </select>
        </label>

        <label
          style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, cursor: "pointer" }}
        >
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            style={{ width: 16, height: 16 }}
          />
          <span style={{ fontWeight: 600, color: "#374151" }}>Activo (puede acceder al panel)</span>
        </label>

        <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
          {!isSelf && canChangeAccessRole && (
            <button
              type="button"
              onClick={() => void handleRemove()}
              disabled={removing}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid #fecaca",
                background: confirmRemove ? "#fee2e2" : "#fff",
                color: "#dc2626",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {removing ? "Eliminando..." : confirmRemove ? "Confirmar eliminación" : "Eliminar del equipo"}
            </button>
          )}
          <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                background: "#fff",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              style={{
                padding: "8px 18px",
                borderRadius: 8,
                border: "none",
                background: "var(--brand-primary, #4ec580)",
                color: "#fff",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function AdminTeamPage() {
  const { restaurantId } = useRestaurant();
  const { canManageTeam, isAdmin } = useRestaurantRole();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingMember, setEditingMember] = useState<Member | null>(null);

  // Add-member form
  const [searchEmail, setSearchEmail] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<{ id: string; email: string } | null | "not_found">(undefined as unknown as null);
  const [addRole, setAddRole] = useState<RestaurantRole>("staff");
  const [addJobRole, setAddJobRole] = useState<JobRole | "">("");
  const [addingMember, setAddingMember] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState(false);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });
  }, []);

  const loadMembers = async () => {
    if (!restaurantId) return;
    setLoading(true);

    const { data: memberRows, error } = await supabase
      .from("restaurant_members")
      .select("id, user_id, role, access_role, job_role, is_active, display_name, created_at")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: true });

    if (error || !memberRows) {
      setLoading(false);
      return;
    }

    // Fetch emails from profiles
    const userIds = memberRows.map((m) => m.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email")
      .in("id", userIds);

    const emailMap = new Map<string, string>();
    for (const p of profiles ?? []) {
      if (p.id && p.email) emailMap.set(p.id, p.email);
    }

    const enriched: Member[] = memberRows.map((m) => ({
      ...m,
      access_role: (m.access_role || m.role) as RestaurantRole,
      email: emailMap.get(m.user_id) ?? undefined,
    }));

    setMembers(enriched);
    setLoading(false);
  };

  useEffect(() => {
    void loadMembers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  const handleSaveMember = async (memberId: string, updates: Partial<Member>) => {
    const { error } = await supabase
      .from("restaurant_members")
      .update({
        access_role: updates.access_role,
        job_role: updates.job_role ?? null,
        is_active: updates.is_active,
        display_name: updates.display_name ?? null,
      })
      .eq("id", memberId)
      .eq("restaurant_id", restaurantId!);

    if (!error) {
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, ...updates } : m))
      );
      setEditingMember(null);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    const { error } = await supabase
      .from("restaurant_members")
      .delete()
      .eq("id", memberId)
      .eq("restaurant_id", restaurantId!);

    if (!error) {
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      setEditingMember(null);
    }
  };

  const handleSearch = async () => {
    const email = searchEmail.trim().toLowerCase();
    if (!email) return;
    setSearchLoading(true);
    setSearchResult(null as unknown as "not_found");
    setAddError(null);
    setAddSuccess(false);

    const { data } = await supabase
      .from("profiles")
      .select("id, email")
      .eq("email", email)
      .maybeSingle<{ id: string; email: string }>();

    setSearchLoading(false);

    if (!data) {
      setSearchResult("not_found");
    } else {
      setSearchResult(data);
    }
  };

  const handleAddMember = async () => {
    if (!restaurantId || !searchResult || searchResult === "not_found") return;
    setAddingMember(true);
    setAddError(null);

    // Check not already a member
    const existing = members.find((m) => m.user_id === searchResult.id);
    if (existing) {
      setAddError("Este usuario ya es miembro del restaurante.");
      setAddingMember(false);
      return;
    }

    const { error } = await supabase.from("restaurant_members").insert({
      user_id: searchResult.id,
      restaurant_id: restaurantId,
      role: addRole,
      access_role: addRole,
      job_role: addJobRole || null,
      is_active: true,
    });

    setAddingMember(false);

    if (error) {
      setAddError(error.message);
    } else {
      setAddSuccess(true);
      setSearchEmail("");
      setSearchResult(null as unknown as "not_found");
      setAddRole("staff");
      setAddJobRole("");
      void loadMembers();
    }
  };

  if (!isAdmin) return <AccessDenied />;

  const cardStyle: React.CSSProperties = {
    background: "var(--admin-card-bg, #fff)",
    border: "1px solid var(--admin-card-border, #e5e7eb)",
    borderRadius: "var(--admin-radius-md, 12px)",
    padding: 20,
    boxShadow: "var(--admin-card-shadow, 0 1px 3px rgba(0,0,0,0.06))",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 760 }}>
      {/* Header */}
      <div>
        <h1 className="admin-panel" style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>
          Equipo y roles
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--admin-text-secondary, #6b7280)" }}>
          Gestiona los miembros de tu equipo y sus permisos
        </p>
      </div>

      {/* Members list */}
      <div style={cardStyle}>
        <h2 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "#111827" }}>
          Miembros actuales
        </h2>

        {loading ? (
          <div style={{ color: "#6b7280", fontSize: 14 }}>Cargando equipo...</div>
        ) : members.length === 0 ? (
          <div style={{ color: "#6b7280", fontSize: 14 }}>No hay miembros en este restaurante.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {members.map((member) => {
              const arColors = ACCESS_ROLE_COLORS[member.access_role] ?? ACCESS_ROLE_COLORS.staff;
              const jrColors = member.job_role ? JOB_ROLE_COLORS[member.job_role] : null;
              const isSelf = currentUserId === member.user_id;

              return (
                <div
                  key={member.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #f0f0f0",
                    background: member.is_active ? "#fff" : "#f9fafb",
                    opacity: member.is_active ? 1 : 0.6,
                  }}
                >
                  <Avatar email={member.email} displayName={member.display_name} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "#111827" }}>
                      {member.display_name || member.email || member.user_id.slice(0, 8)}
                      {isSelf && (
                        <span style={{ marginLeft: 6, fontSize: 11, color: "#9ca3af" }}>(tú)</span>
                      )}
                    </div>
                    {member.email && (
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 1 }}>{member.email}</div>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                    <Badge
                      label={ACCESS_ROLE_LABELS[member.access_role] ?? member.access_role}
                      bg={arColors.bg}
                      color={arColors.color}
                    />
                    {jrColors && member.job_role && (
                      <Badge
                        label={JOB_ROLE_LABELS[member.job_role]}
                        bg={jrColors.bg}
                        color={jrColors.color}
                      />
                    )}
                    {!member.is_active && (
                      <Badge label="Inactivo" bg="#f3f4f6" color="#6b7280" />
                    )}
                  </div>

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setEditingMember(member)}
                      style={{
                        padding: "5px 12px",
                        borderRadius: 7,
                        border: "1px solid #e5e7eb",
                        background: "#fff",
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#374151",
                        flexShrink: 0,
                      }}
                    >
                      Editar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add member */}
      {canManageTeam && (
        <div style={cardStyle}>
          <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: "#111827" }}>
            Añadir miembro
          </h2>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "#6b7280" }}>
            Busca un usuario por email para añadirlo al equipo.
          </p>

          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input
              ref={searchInputRef}
              type="email"
              value={searchEmail}
              onChange={(e) => {
                setSearchEmail(e.target.value);
                setSearchResult(null as unknown as "not_found");
                setAddError(null);
                setAddSuccess(false);
              }}
              onKeyDown={(e) => { if (e.key === "Enter") void handleSearch(); }}
              placeholder="email@ejemplo.com"
              style={{
                flex: 1,
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 14,
              }}
            />
            <button
              type="button"
              onClick={() => void handleSearch()}
              disabled={searchLoading || !searchEmail.trim()}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "none",
                background: "var(--brand-primary, #4ec580)",
                color: "#fff",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {searchLoading ? "Buscando..." : "Buscar"}
            </button>
          </div>

          {searchResult === "not_found" && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                background: "#fef9c3",
                border: "1px solid #fde68a",
                fontSize: 13,
                color: "#854d0e",
              }}
            >
              Este email no tiene cuenta. Pídele que se registre primero.
            </div>
          )}

          {searchResult && searchResult !== "not_found" && (
            <div
              style={{
                padding: 14,
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#f9fafb",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Avatar email={searchResult.email} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{searchResult.email}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Usuario encontrado</div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                  <span style={{ fontWeight: 600 }}>Rol de acceso</span>
                  <select
                    value={addRole}
                    onChange={(e) => setAddRole(e.target.value as RestaurantRole)}
                    style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "7px 10px", fontSize: 13 }}
                  >
                    <option value="admin">Admin</option>
                    <option value="staff">Staff</option>
                  </select>
                </label>

                <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                  <span style={{ fontWeight: 600 }}>Puesto</span>
                  <select
                    value={addJobRole}
                    onChange={(e) => setAddJobRole(e.target.value as JobRole | "")}
                    style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "7px 10px", fontSize: 13 }}
                  >
                    <option value="">Sin especificar</option>
                    <option value="manager">Manager</option>
                    <option value="camarero">Camarero</option>
                    <option value="cajero">Cajero</option>
                    <option value="cocina">Cocina</option>
                    <option value="repartidor">Repartidor</option>
                  </select>
                </label>
              </div>

              {addError && (
                <div style={{ fontSize: 13, color: "#dc2626" }}>{addError}</div>
              )}

              <button
                type="button"
                onClick={() => void handleAddMember()}
                disabled={addingMember}
                style={{
                  padding: "9px 0",
                  borderRadius: 8,
                  border: "none",
                  background: "var(--brand-primary, #4ec580)",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                {addingMember ? "Añadiendo..." : "Añadir al equipo"}
              </button>
            </div>
          )}

          {addSuccess && (
            <div
              style={{
                marginTop: 8,
                padding: "10px 14px",
                borderRadius: 8,
                background: "#dcfce7",
                border: "1px solid #86efac",
                fontSize: 13,
                color: "#166534",
              }}
            >
              Miembro añadido correctamente.
            </div>
          )}
        </div>
      )}

      {/* Permissions reference */}
      <details style={cardStyle}>
        <summary
          style={{
            cursor: "pointer",
            fontWeight: 700,
            fontSize: 14,
            color: "#374151",
            userSelect: "none",
          }}
        >
          Referencia de permisos por rol
        </summary>
        <div
          style={{
            marginTop: 14,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            fontSize: 13,
            color: "#374151",
          }}
        >
          {[
            { role: "Owner", desc: "Control total: equipo, ajustes, métricas, menú, pedidos, caja" },
            { role: "Admin", desc: "Gestión completa excepto equipo: menú, métricas, ajustes, pedidos, caja" },
            { role: "Staff + cocina", desc: "Ver y actualizar estado de pedidos únicamente" },
            { role: "Staff + cajero", desc: "Caja y nueva venta (TPV)" },
            { role: "Staff + repartidor", desc: "Ver pedidos de tipo delivery" },
          ].map(({ role, desc }) => (
            <div key={role} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ fontWeight: 700, minWidth: 130, flexShrink: 0 }}>{role}</span>
              <span style={{ color: "#6b7280" }}>{desc}</span>
            </div>
          ))}
        </div>
      </details>

      {/* Edit modal */}
      {editingMember && (
        <EditMemberModal
          member={editingMember}
          canChangeAccessRole={canManageTeam}
          currentUserId={currentUserId}
          onClose={() => setEditingMember(null)}
          onSave={(updates) => handleSaveMember(editingMember.id, updates)}
          onRemove={handleRemoveMember}
        />
      )}
    </div>
  );
}
