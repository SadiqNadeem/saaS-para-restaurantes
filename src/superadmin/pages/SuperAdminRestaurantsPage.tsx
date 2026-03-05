import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { supabase } from "../../lib/supabase";

type RestaurantRow = {
  id: string;
  name: string;
  slug: string;
  created_at: string | null;
  is_active: boolean;
  custom_domain: string | null;
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 60);
}

function toDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-ES", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function getPlatformHost(): string {
  if (typeof window === "undefined") return "tudominio.com";
  const hostname = window.location.hostname;
  if (hostname === "localhost" || hostname.match(/^\d{1,3}(\.\d{1,3}){3}$/)) {
    return "tudominio.com";
  }
  const parts = hostname.split(".");
  if (parts.length >= 2) return parts.slice(-2).join(".");
  return hostname;
}

function buildRestaurantUrl(row: RestaurantRow): string {
  if (row.custom_domain) {
    return `https://${row.custom_domain}`;
  }
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/r/${row.slug}`;
}

type DnsInfoTarget = {
  slug: string;
  customDomain: string | null;
};

function DnsInfoModal({ target, onClose }: { target: DnsInfoTarget; onClose: () => void }) {
  const platformHost = getPlatformHost();
  const appHost = `app.${platformHost}`;
  const isCustom = Boolean(target.customDomain);

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(17,24,39,0.50)",
        display: "grid",
        placeItems: "center",
        zIndex: 2100,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Informacion DNS"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          width: "min(580px, 94vw)",
          padding: 20,
          display: "grid",
          gap: 14,
        }}
      >
        <h3 style={{ margin: 0 }}>Configuracion DNS — {target.slug}</h3>

        {isCustom ? (
          <>
            <p style={{ margin: 0, color: "#374151" }}>
              Tu restaurante tiene el dominio personalizado{" "}
              <strong>{target.customDomain}</strong>. Para que funcione, debes
              apuntar este dominio a la plataforma.
            </p>

            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#6b7280", textTransform: "uppercase" }}>
                Opcion 1 — CNAME (subdominio, ej: pedidos.mirestaurante.com)
              </div>
              <DnsRecord
                type="CNAME"
                host="pedidos"
                value={appHost}
              />

              <div style={{ fontWeight: 700, fontSize: 13, color: "#6b7280", textTransform: "uppercase", marginTop: 6 }}>
                Opcion 2 — CNAME raiz (dominio apex, si tu proveedor lo soporta)
              </div>
              <DnsRecord type="CNAME" host="@" value={appHost} />

              <div style={{ fontWeight: 700, fontSize: 13, color: "#6b7280", textTransform: "uppercase", marginTop: 6 }}>
                Opcion 3 — Registro A (si tu proveedor no soporta CNAME en raiz)
              </div>
              <DnsRecord type="A" host="@" value="[IP del servidor]" />
            </div>

            <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
              Los cambios de DNS pueden tardar hasta 48 horas en propagarse.
            </p>
          </>
        ) : (
          <>
            <p style={{ margin: 0, color: "#374151" }}>
              Este restaurante usa la URL de subdominio de la plataforma. Para que{" "}
              <strong>
                {target.slug}.{platformHost}
              </strong>{" "}
              funcione, crea el siguiente registro DNS en tu proveedor de dominio:
            </p>

            <DnsRecord
              type="CNAME"
              host={target.slug}
              value={appHost}
            />

            <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
              Los cambios de DNS pueden tardar hasta 48 horas en propagarse. Si
              quieres usar tu propio dominio personalizado, edita el restaurante y
              rellena el campo &quot;Dominio personalizado&quot;.
            </p>
          </>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: "1px solid #d1d5db",
              borderRadius: 8,
              background: "#fff",
              padding: "8px 14px",
              cursor: "pointer",
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function DnsRecord({ type, host, value }: { type: string; host: string; value: string }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "60px 1fr 1fr",
        gap: 8,
        background: "#f9fafb",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: "8px 10px",
        fontFamily: "monospace",
        fontSize: 13,
      }}
    >
      <span style={{ color: "#7c3aed", fontWeight: 700 }}>{type}</span>
      <span style={{ color: "#111827" }}>{host}</span>
      <span style={{ color: "#059669" }}>{value}</span>
    </div>
  );
}

export default function SuperAdminRestaurantsPage() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<RestaurantRow[]>([]);
  const [search, setSearch] = useState("");
  const [schemaHasIsActive, setSchemaHasIsActive] = useState(true);
  const [schemaHasCustomDomain, setSchemaHasCustomDomain] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createSlug, setCreateSlug] = useState("");

  const [editTarget, setEditTarget] = useState<RestaurantRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);
  const [editCustomDomain, setEditCustomDomain] = useState("");

  const [dnsTarget, setDnsTarget] = useState<DnsInfoTarget | null>(null);

  const loadRestaurants = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Try full schema first (with is_active and custom_domain)
    const fullResult = await supabase
      .from("restaurants")
      .select("id,name,slug,is_active,custom_domain,created_at")
      .order("created_at", { ascending: false });

    if (!fullResult.error) {
      const normalized = (Array.isArray(fullResult.data) ? fullResult.data : []).map((entry) => {
        const row = asRecord(entry);
        return {
          id: String(row.id ?? ""),
          name: String(row.name ?? ""),
          slug: String(row.slug ?? ""),
          created_at: typeof row.created_at === "string" ? row.created_at : null,
          is_active: Boolean(row.is_active ?? true),
          custom_domain: typeof row.custom_domain === "string" ? row.custom_domain || null : null,
        };
      });
      setRows(normalized);
      setSchemaHasIsActive(true);
      setSchemaHasCustomDomain(true);
      setLoading(false);
      return;
    }

    // Try without custom_domain (migration may not have run yet)
    const withIsActive = await supabase
      .from("restaurants")
      .select("id,name,slug,is_active,created_at")
      .order("created_at", { ascending: false });

    if (!withIsActive.error) {
      const normalized = (Array.isArray(withIsActive.data) ? withIsActive.data : []).map((entry) => {
        const row = asRecord(entry);
        return {
          id: String(row.id ?? ""),
          name: String(row.name ?? ""),
          slug: String(row.slug ?? ""),
          created_at: typeof row.created_at === "string" ? row.created_at : null,
          is_active: Boolean(row.is_active ?? true),
          custom_domain: null,
        };
      });
      setRows(normalized);
      setSchemaHasIsActive(true);
      setSchemaHasCustomDomain(false);
      setLoading(false);
      return;
    }

    // Fallback: no is_active, no custom_domain
    const fallback = await supabase
      .from("restaurants")
      .select("id,name,slug,created_at")
      .order("created_at", { ascending: false });

    if (fallback.error) {
      setError(fallback.error.message || "No se pudieron cargar restaurantes.");
      setRows([]);
      setLoading(false);
      return;
    }

    const normalized = (Array.isArray(fallback.data) ? fallback.data : []).map((entry) => {
      const row = asRecord(entry);
      return {
        id: String(row.id ?? ""),
        name: String(row.name ?? ""),
        slug: String(row.slug ?? ""),
        created_at: typeof row.created_at === "string" ? row.created_at : null,
        is_active: true,
        custom_domain: null,
      };
    });

    setRows(normalized);
    setSchemaHasIsActive(false);
    setSchemaHasCustomDomain(false);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadRestaurants();
  }, [loadRestaurants]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter(
      (row) =>
        row.name.toLowerCase().includes(query) ||
        row.slug.toLowerCase().includes(query) ||
        (row.custom_domain ?? "").toLowerCase().includes(query)
    );
  }, [rows, search]);

  const openCreate = () => {
    setCreateName("");
    setCreateSlug("");
    setCreateOpen(true);
  };

  const openEdit = (row: RestaurantRow) => {
    setEditTarget(row);
    setEditName(row.name);
    setEditSlug(row.slug);
    setEditIsActive(row.is_active);
    setEditCustomDomain(row.custom_domain ?? "");
  };

  const handleCreate = async () => {
    const name = createName.trim();
    const slug = slugify(createSlug || createName);
    if (!name || !slug) {
      setError("Nombre y slug son obligatorios.");
      return;
    }

    setSaving(true);
    setError(null);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.id) {
      setSaving(false);
      setError(userError?.message || "Sesion no valida.");
      return;
    }

    const insertPayload: Record<string, unknown> = { name, slug };
    if (schemaHasIsActive) insertPayload.is_active = true;

    const selectCols =
      "id,name,slug,created_at" +
      (schemaHasIsActive ? ",is_active" : "") +
      (schemaHasCustomDomain ? ",custom_domain" : "");

    const created = await supabase
      .from("restaurants")
      .insert(insertPayload)
      .select(selectCols)
      .single();

    if (created.error || !created.data) {
      setSaving(false);
      setError(created.error?.message || "No se pudo crear el restaurante.");
      return;
    }

    const createdRow = asRecord(created.data);
    const restaurantId = String(createdRow.id ?? "");

    const settingsResult = await supabase
      .from("restaurant_settings")
      .insert({ restaurant_id: restaurantId });

    if (settingsResult.error) {
      console.error(settingsResult.error);
    }

    const hoursRows = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      restaurant_id: restaurantId,
      day_of_week: day,
      is_open: false,
      open_time: "09:00",
      close_time: "22:00",
    }));
    const hoursResult = await supabase.from("restaurant_hours").insert(hoursRows);
    if (hoursResult.error) {
      console.error(hoursResult.error);
    }

    const membershipResult = await supabase.from("restaurant_members").insert({
      restaurant_id: restaurantId,
      user_id: user.id,
      role: "owner",
    });

    if (membershipResult.error) {
      setSaving(false);
      setError(membershipResult.error.message || "Restaurante creado pero no se pudo asignar membership.");
      return;
    }

    setCreateOpen(false);
    setSaving(false);
    await loadRestaurants();
  };

  const handleUpdate = async () => {
    if (!editTarget) return;

    const name = editName.trim();
    const slug = slugify(editSlug || editName);

    if (!name || !slug) {
      setError("Nombre y slug son obligatorios.");
      return;
    }

    setSaving(true);
    setError(null);

    const updatePayload: Record<string, unknown> = { name, slug };
    if (schemaHasIsActive) updatePayload.is_active = editIsActive;
    if (schemaHasCustomDomain) {
      const trimmed = editCustomDomain.trim().toLowerCase().replace(/^https?:\/\//, "");
      updatePayload.custom_domain = trimmed || null;
    }

    const result = await supabase
      .from("restaurants")
      .update(updatePayload)
      .eq("id", editTarget.id);

    if (result.error) {
      setSaving(false);
      setError(result.error.message || "No se pudo actualizar el restaurante.");
      return;
    }

    setEditTarget(null);
    setSaving(false);
    await loadRestaurants();
  };

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
        <h2 style={{ margin: 0 }}>Restaurantes</h2>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            placeholder="Buscar por nombre, slug o dominio"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            style={{
              border: "1px solid #d1d5db",
              borderRadius: 8,
              padding: "8px 10px",
              minWidth: 240,
            }}
          />

          <button
            type="button"
            onClick={openCreate}
            style={{
              borderRadius: 8,
              border: "1px solid var(--brand-primary)",
              background: "var(--brand-primary)",
              color: "var(--brand-white)",
              padding: "8px 12px",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Crear restaurante
          </button>
        </div>
      </header>

      {error ? (
        <div role="alert" style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#991b1b", borderRadius: 10, padding: "10px 12px" }}>
          {error}
        </div>
      ) : null}

      {!schemaHasCustomDomain ? (
        <div role="alert" style={{ border: "1px solid #fde68a", background: "#fffbeb", color: "#92400e", borderRadius: 10, padding: "10px 12px", fontSize: 13 }}>
          La columna <code>custom_domain</code> no existe aun. Aplica la migracion{" "}
          <strong>20260228_restaurants_custom_domain.sql</strong> en el panel de Supabase
          (SQL Editor) para activar la gestion de dominios personalizados.
        </div>
      ) : null}

      {loading ? (
        <div style={{ opacity: 0.75 }}>Cargando...</div>
      ) : (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.6fr 1fr 1fr 90px 150px 240px",
              gap: 8,
              padding: "10px 12px",
              background: "#f9fafb",
              borderBottom: "1px solid #e5e7eb",
              fontWeight: 700,
              fontSize: 13,
              color: "#374151",
            }}
          >
            <span>Nombre</span>
            <span>Slug / Dominio</span>
            <span>Activo</span>
            <span>Creado</span>
            <span></span>
            <span>Acciones</span>
          </div>

          {filteredRows.length === 0 ? (
            <div style={{ padding: 14, color: "#6b7280" }}>No hay restaurantes.</div>
          ) : (
            filteredRows.map((row) => (
              <div
                key={row.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.6fr 1fr 1fr 90px 150px 240px",
                  gap: 8,
                  padding: "10px 12px",
                  borderTop: "1px solid #f3f4f6",
                  alignItems: "center",
                }}
              >
                <span style={{ color: "#111827", fontWeight: 600 }}>{row.name || "-"}</span>

                {/* Slug + optional custom_domain badge */}
                <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ color: "#4b5563" }}>{row.slug || "-"}</span>
                  {row.custom_domain ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        background: "#eff6ff",
                        border: "1px solid #bfdbfe",
                        color: "#1d4ed8",
                        borderRadius: 6,
                        padding: "2px 6px",
                        fontSize: 11,
                        fontWeight: 600,
                        width: "fit-content",
                      }}
                    >
                      <span style={{ fontSize: 10 }}>&#127760;</span>
                      {row.custom_domain}
                    </span>
                  ) : null}
                </span>

                <span>{row.is_active ? "Si" : "No"}</span>
                <span style={{ color: "#4b5563", fontSize: 13 }}>{toDate(row.created_at)}</span>

                {/* DNS info + Probar */}
                <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setDnsTarget({ slug: row.slug, customDomain: row.custom_domain })}
                    title="Ver instrucciones DNS"
                    style={{
                      border: "1px solid #d1d5db",
                      background: "#fff",
                      color: "#374151",
                      borderRadius: 8,
                      padding: "6px 8px",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    DNS
                  </button>
                  <button
                    type="button"
                    onClick={() => window.open(buildRestaurantUrl(row), "_blank", "noopener,noreferrer")}
                    title="Abrir restaurante en nueva pestana"
                    style={{
                      border: "1px solid #d1d5db",
                      background: "#fff",
                      color: "#374151",
                      borderRadius: 8,
                      padding: "6px 8px",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    Probar
                  </button>
                </span>

                {/* Entrar + Editar */}
                <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => navigate(`/r/${row.slug}/admin`)}
                    style={{ border: "1px solid #d1d5db", background: "#fff", color: "#111827", borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}
                  >
                    Entrar
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(row)}
                    style={{ border: "1px solid #d1d5db", background: "#fff", color: "#111827", borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}
                  >
                    Editar
                  </button>
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Create modal */}
      {createOpen ? (
        <div
          role="presentation"
          onClick={() => !saving && setCreateOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,0.45)", display: "grid", placeItems: "center", zIndex: 2000 }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Crear restaurante"
            onClick={(event) => event.stopPropagation()}
            style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", width: "min(560px, 94vw)", padding: 16, display: "grid", gap: 12 }}
          >
            <h3 style={{ margin: 0 }}>Crear restaurante</h3>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Nombre</span>
              <input
                value={createName}
                onChange={(event) => {
                  const value = event.target.value;
                  setCreateName(value);
                  if (!createSlug.trim()) setCreateSlug(slugify(value));
                }}
                style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 10px" }}
              />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Slug</span>
              <input value={createSlug} onChange={(event) => setCreateSlug(slugify(event.target.value))} style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 10px" }} />
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" onClick={() => setCreateOpen(false)} disabled={saving} style={{ border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", padding: "8px 10px", cursor: "pointer" }}>
                Cancelar
              </button>
              <button type="button" onClick={() => void handleCreate()} disabled={saving} style={{ border: "1px solid var(--brand-primary)", borderRadius: 8, background: "var(--brand-primary)", color: "#fff", padding: "8px 10px", cursor: "pointer" }}>
                {saving ? "Guardando..." : "Crear"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Edit modal */}
      {editTarget ? (
        <div
          role="presentation"
          onClick={() => !saving && setEditTarget(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,0.45)", display: "grid", placeItems: "center", zIndex: 2000 }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Editar restaurante"
            onClick={(event) => event.stopPropagation()}
            style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", width: "min(560px, 94vw)", padding: 16, display: "grid", gap: 12 }}
          >
            <h3 style={{ margin: 0 }}>Editar restaurante</h3>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Nombre</span>
              <input value={editName} onChange={(event) => setEditName(event.target.value)} style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 10px" }} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Slug</span>
              <input value={editSlug} onChange={(event) => setEditSlug(slugify(event.target.value))} style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 10px" }} />
            </label>

            {schemaHasCustomDomain ? (
              <label style={{ display: "grid", gap: 6 }}>
                <span>
                  Dominio personalizado{" "}
                  <span style={{ color: "#6b7280", fontWeight: 400 }}>
                    (ej: mirestaurante.com o pedidos.mirestaurante.com)
                  </span>
                </span>
                <input
                  value={editCustomDomain}
                  onChange={(event) => setEditCustomDomain(event.target.value)}
                  placeholder="mirestaurante.com"
                  style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 10px" }}
                />
                <span style={{ fontSize: 12, color: "#6b7280" }}>
                  Deja en blanco para usar la URL de plataforma (/r/{editSlug || editTarget?.slug}).
                  El valor se guarda sin el prefijo https://.
                </span>
              </label>
            ) : (
              <div style={{ fontSize: 13, color: "#6b7280", background: "#f9fafb", borderRadius: 8, padding: "8px 10px" }}>
                Dominio personalizado no disponible — aplica la migracion primero.
              </div>
            )}

            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={editIsActive}
                disabled={!schemaHasIsActive}
                onChange={(event) => setEditIsActive(event.target.checked)}
              />
              <span>Activo</span>
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" onClick={() => setEditTarget(null)} disabled={saving} style={{ border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", padding: "8px 10px", cursor: "pointer" }}>
                Cancelar
              </button>
              <button type="button" onClick={() => void handleUpdate()} disabled={saving} style={{ border: "1px solid var(--brand-primary)", borderRadius: 8, background: "var(--brand-primary)", color: "#fff", padding: "8px 10px", cursor: "pointer" }}>
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* DNS Info modal */}
      {dnsTarget ? (
        <DnsInfoModal target={dnsTarget} onClose={() => setDnsTarget(null)} />
      ) : null}
    </section>
  );
}
