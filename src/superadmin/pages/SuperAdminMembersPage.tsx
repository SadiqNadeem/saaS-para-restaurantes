import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

type MembershipRow = {
  restaurant_id: string;
  restaurant_name: string;
  role: string;
};

type UserRow = {
  id: string;
  role: string;
  email: string | null;
  memberships: MembershipRow[];
};

type RestaurantOption = {
  id: string;
  name: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const GLOBAL_ROLES = ["user", "admin", "superadmin"] as const;
const MEMBER_ROLES = ["staff", "manager", "owner"] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value))
    return value as Record<string, unknown>;
  return {};
}

function displayUser(user: UserRow): string {
  return user.email ?? `${user.id.slice(0, 8)}…`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SuperAdminMembersPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [restaurants, setRestaurants] = useState<RestaurantOption[]>([]);
  const [search, setSearch] = useState("");

  // Assign modal state
  const [assignTarget, setAssignTarget] = useState<UserRow | null>(null);
  const [assignRestaurantId, setAssignRestaurantId] = useState("");
  const [assignRole, setAssignRole] = useState<string>("staff");

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    // 1. Load profiles — email column added by migration 20260228_profiles_add_email.sql
    const profilesResult = await supabase
      .from("profiles")
      .select("id, role, email")
      .order("role");

    if (profilesResult.error) {
      setError(profilesResult.error.message || "No se pudieron cargar los usuarios.");
      setLoading(false);
      return;
    }

    const profiles = (Array.isArray(profilesResult.data) ? profilesResult.data : [])
      .map((entry) => {
        const row = asRecord(entry);
        return {
          id: String(row.id ?? "").trim(),
          role: String(row.role ?? "user"),
          email: row.email ? String(row.email) : null,
        };
      })
      .filter((p) => p.id);

    // 2. Load restaurant_members joined with restaurants
    const membersResult = await supabase
      .from("restaurant_members")
      .select("user_id, restaurant_id, role, restaurants(id, name)");

    const membershipsMap = new Map<string, MembershipRow[]>();

    if (!membersResult.error && Array.isArray(membersResult.data)) {
      for (const entry of membersResult.data) {
        const row = asRecord(entry);
        const userId = String(row.user_id ?? "").trim();
        const restaurantId = String(row.restaurant_id ?? "").trim();
        const memberRole = String(row.role ?? "");

        const nested = Array.isArray(row.restaurants)
          ? asRecord(row.restaurants[0])
          : asRecord(row.restaurants);
        const restaurantName = String(nested.name ?? restaurantId);

        if (!userId || !restaurantId) continue;

        if (!membershipsMap.has(userId)) membershipsMap.set(userId, []);
        membershipsMap.get(userId)!.push({
          restaurant_id: restaurantId,
          restaurant_name: restaurantName,
          role: memberRole,
        });
      }
    }

    // 3. Merge profiles + memberships
    setUsers(profiles.map((p) => ({ ...p, memberships: membershipsMap.get(p.id) ?? [] })));

    // 4. Load all restaurants for the assign dropdown
    const restaurantsResult = await supabase
      .from("restaurants")
      .select("id, name")
      .order("name");

    if (!restaurantsResult.error && Array.isArray(restaurantsResult.data)) {
      setRestaurants(
        restaurantsResult.data
          .map((r) => asRecord(r))
          .map((r) => ({ id: String(r.id ?? ""), name: String(r.name ?? "") }))
          .filter((r) => r.id)
      );
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleUpdateGlobalRole = async (userId: string, newRole: string) => {
    setError(null);
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));

    const { error: err } = await supabase
      .from("profiles")
      .update({ role: newRole })
      .eq("id", userId);

    if (err) {
      setError(err.message || "No se pudo actualizar el rol.");
      void loadData();
    }
  };

  const handleRemoveMembership = async (userId: string, restaurantId: string) => {
    setError(null);
    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId
          ? { ...u, memberships: u.memberships.filter((m) => m.restaurant_id !== restaurantId) }
          : u
      )
    );

    const { error: err } = await supabase
      .from("restaurant_members")
      .delete()
      .eq("user_id", userId)
      .eq("restaurant_id", restaurantId);

    if (err) {
      setError(err.message || "No se pudo quitar la membresía.");
      void loadData();
    }
  };

  const handleAssign = async () => {
    if (!assignTarget || !assignRestaurantId || !assignRole) return;

    const alreadyMember = assignTarget.memberships.some(
      (m) => m.restaurant_id === assignRestaurantId
    );
    if (alreadyMember) {
      setError("El usuario ya es miembro de ese restaurante.");
      return;
    }

    setSaving(true);
    setError(null);

    const { error: err } = await supabase.from("restaurant_members").insert({
      user_id: assignTarget.id,
      restaurant_id: assignRestaurantId,
      role: assignRole,
    });

    if (err) {
      setError(err.message || "No se pudo asignar al restaurante.");
      setSaving(false);
      return;
    }

    const restaurant = restaurants.find((r) => r.id === assignRestaurantId);
    if (restaurant) {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === assignTarget.id
            ? {
                ...u,
                memberships: [
                  ...u.memberships,
                  { restaurant_id: assignRestaurantId, restaurant_name: restaurant.name, role: assignRole },
                ],
              }
            : u
        )
      );
    }

    setAssignTarget(null);
    setAssignRestaurantId("");
    setAssignRole("staff");
    setSaving(false);
  };

  // ── Filter ────────────────────────────────────────────────────────────────

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;
    return users.filter((u) => (u.email ?? u.id).toLowerCase().includes(query));
  }, [users, search]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <h2 style={{ margin: 0 }}>Usuarios</h2>

        <input
          placeholder="Buscar por email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 10px", minWidth: 240 }}
        />
      </header>

      {error ? (
        <div
          role="alert"
          style={{
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#991b1b",
            borderRadius: 10,
            padding: "10px 12px",
          }}
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <div style={{ opacity: 0.75 }}>Cargando...</div>
      ) : (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 150px 3fr 110px",
              gap: 10,
              padding: "10px 12px",
              background: "#f9fafb",
              borderBottom: "1px solid #e5e7eb",
              fontWeight: 700,
              fontSize: 13,
              color: "#374151",
            }}
          >
            <span>Email</span>
            <span>Rol global</span>
            <span>Restaurantes</span>
            <span>Acciones</span>
          </div>

          {filteredUsers.length === 0 ? (
            <div style={{ padding: 14, color: "#6b7280" }}>
              {users.length === 0 ? "No hay usuarios en la tabla profiles." : "Sin resultados."}
            </div>
          ) : (
            filteredUsers.map((user) => (
              <div
                key={user.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 150px 3fr 110px",
                  gap: 10,
                  padding: "10px 12px",
                  borderTop: "1px solid #f3f4f6",
                  alignItems: "start",
                }}
              >
                <span style={{ color: "#111827", fontWeight: 600, fontSize: 13, wordBreak: "break-all" }}>
                  {displayUser(user)}
                </span>

                <select
                  value={user.role}
                  onChange={(e) => void handleUpdateGlobalRole(user.id, e.target.value)}
                  style={{
                    border: "1px solid #d1d5db",
                    borderRadius: 8,
                    padding: "5px 8px",
                    fontSize: 13,
                    cursor: "pointer",
                    background: "#fff",
                    color: "#111827",
                    width: "100%",
                  }}
                >
                  {GLOBAL_ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {user.memberships.length === 0 ? (
                    <span style={{ color: "#9ca3af", fontSize: 12 }}>Sin restaurantes</span>
                  ) : (
                    user.memberships.map((m) => (
                      <span
                        key={m.restaurant_id}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          background: "#f3f4f6",
                          border: "1px solid #e5e7eb",
                          borderRadius: 6,
                          padding: "3px 8px",
                          fontSize: 12,
                          color: "#374151",
                        }}
                      >
                        <strong style={{ color: "#111827" }}>{m.restaurant_name}</strong>
                        <span style={{ color: "#6b7280" }}>({m.role})</span>
                        <button
                          type="button"
                          aria-label={`Quitar de ${m.restaurant_name}`}
                          onClick={() => void handleRemoveMembership(user.id, m.restaurant_id)}
                          style={{
                            marginLeft: 2,
                            border: "none",
                            background: "none",
                            cursor: "pointer",
                            color: "#9ca3af",
                            fontSize: 14,
                            lineHeight: 1,
                            padding: 0,
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))
                  )}
                </div>

                <span>
                  <button
                    type="button"
                    onClick={() => {
                      setAssignTarget(user);
                      setAssignRestaurantId(restaurants[0]?.id ?? "");
                      setAssignRole("staff");
                    }}
                    style={{
                      border: "1px solid #d1d5db",
                      background: "#fff",
                      color: "#111827",
                      borderRadius: 8,
                      padding: "6px 10px",
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    Asignar
                  </button>
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {assignTarget ? (
        <div
          role="presentation"
          onClick={() => !saving && setAssignTarget(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(17,24,39,0.45)",
            display: "grid",
            placeItems: "center",
            zIndex: 2000,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Asignar restaurante"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              width: "min(480px, 94vw)",
              padding: 16,
              display: "grid",
              gap: 12,
            }}
          >
            <h3 style={{ margin: 0 }}>Asignar a restaurante</h3>

            <p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>
              Usuario: <strong style={{ color: "#111827" }}>{displayUser(assignTarget)}</strong>
            </p>

            {error ? (
              <div
                role="alert"
                style={{
                  border: "1px solid #fecaca",
                  background: "#fef2f2",
                  color: "#991b1b",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 13,
                }}
              >
                {error}
              </div>
            ) : null}

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Restaurante</span>
              <select
                value={assignRestaurantId}
                onChange={(e) => setAssignRestaurantId(e.target.value)}
                style={{
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 13,
                  background: "#fff",
                  color: "#111827",
                }}
              >
                {restaurants.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Rol en el restaurante</span>
              <select
                value={assignRole}
                onChange={(e) => setAssignRole(e.target.value)}
                style={{
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 13,
                  background: "#fff",
                  color: "#111827",
                }}
              >
                {MEMBER_ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => { setAssignTarget(null); setError(null); }}
                disabled={saving}
                style={{
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  background: "#fff",
                  color: "#111827",
                  padding: "8px 10px",
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleAssign()}
                disabled={saving || !assignRestaurantId}
                style={{
                  border: "1px solid var(--brand-primary)",
                  borderRadius: 8,
                  background: "var(--brand-primary)",
                  color: "#fff",
                  padding: "8px 10px",
                  cursor: "pointer",
                }}
              >
                {saving ? "Guardando..." : "Asignar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
