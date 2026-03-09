import { useEffect, useState } from "react";

import TableQRModal from "../../pos/components/TableQRModal";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../../restaurant/RestaurantContext";
import { useAdminMembership } from "../components/AdminMembershipContext";
import type { RestaurantTable } from "../../pos/services/posOrderService";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtEur(n: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);
}

const STATUS_LABELS: Record<string, string> = {
  free: "Libre",
  occupied: "Ocupada",
  closing: "Cobrando",
  reserved: "Reservada",
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  free: { bg: "rgba(100,116,139,0.15)", color: "#94a3b8" },
  occupied: { bg: "rgba(74,197,128,0.14)", color: "#4ec580" },
  closing: { bg: "rgba(251,191,36,0.15)", color: "#fbbf24" },
  reserved: { bg: "rgba(251,191,36,0.12)", color: "#fbbf24" },
};

// ─── Edit modal ───────────────────────────────────────────────────────────────

function EditTableModal({
  table,
  onSave,
  onClose,
}: {
  table: RestaurantTable | null;
  onSave: (id: string | null, name: string, zone: string, capacity: number | null) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(table?.name ?? "");
  const [zone, setZone] = useState(table?.zone ?? "Sala");
  const [capacity, setCapacity] = useState(String(table?.capacity ?? ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim()) { setError("El nombre es obligatorio"); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave(table?.id ?? null, name.trim(), zone, capacity ? Number(capacity) : null);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ background: "var(--admin-card-bg)", border: "1px solid var(--admin-card-border)", borderRadius: 14, padding: 24, width: "min(420px, 100%)", display: "flex", flexDirection: "column", gap: 16, boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--admin-text-primary)" }}>
          {table ? "Editar mesa" : "Nueva mesa"}
        </h3>

        {error && (
          <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#ef4444" }}>{error}</div>
        )}

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Nombre *</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Mesa 1, Barra 1, Terraza 3..."
            style={{ border: "1px solid var(--admin-card-border)", borderRadius: 8, padding: "9px 12px", fontSize: 14, color: "var(--admin-text-primary)", outline: "none", background: "transparent" }} />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Zona</span>
          <select value={zone} onChange={(e) => setZone(e.target.value)}
            style={{ border: "1px solid var(--admin-card-border)", borderRadius: 8, padding: "9px 12px", fontSize: 14, color: "var(--admin-text-primary)", background: "var(--admin-card-bg)" }}>
            {["Sala", "Terraza", "Barra"].map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Capacidad (opcional)</span>
          <input type="number" min={1} max={50} value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="Ej: 4"
            style={{ border: "1px solid var(--admin-card-border)", borderRadius: 8, padding: "9px 12px", fontSize: 14, color: "var(--admin-text-primary)", outline: "none", background: "transparent", width: 120 }} />
        </label>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={{ padding: "9px 18px", borderRadius: 8, border: "1px solid var(--admin-card-border)", background: "transparent", color: "var(--admin-text-secondary)", fontSize: 14, cursor: "pointer", fontWeight: 600 }}>Cancelar</button>
          <button type="button" onClick={() => void handleSubmit()} disabled={saving}
            style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: "var(--brand-primary)", color: "#052e16", fontSize: 14, cursor: saving ? "not-allowed" : "pointer", fontWeight: 700 }}>
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminTablesPage() {
  const { restaurantId, slug } = useRestaurant();
  const { canManage } = useAdminMembership();

  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState<RestaurantTable | null | undefined>(undefined); // undefined = closed, null = create new
  const [orderTotals, setOrderTotals] = useState<Record<string, number>>({});
  const [qrTable, setQrTable] = useState<RestaurantTable | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("restaurant_tables")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("position", { ascending: true });

    if (!data) { setLoading(false); return; }
    setTables(data as RestaurantTable[]);

    const orderIds = (data as RestaurantTable[])
      .filter((t) => t.current_order_id)
      .map((t) => t.current_order_id as string);

    if (orderIds.length > 0) {
      const { data: orders } = await supabase
        .from("orders")
        .select("id, total, subtotal")
        .in("id", orderIds);

      type ORow = { id: string; total: number | null; subtotal: number | null };
      const map: Record<string, number> = {};
      for (const o of (orders ?? []) as ORow[]) {
        map[o.id] = Number(o.total ?? o.subtotal ?? 0);
      }
      setOrderTotals(map);
    }

    setLoading(false);
  };

  useEffect(() => { void load(); }, [restaurantId]);

  const handleSave = async (id: string | null, name: string, zone: string, capacity: number | null) => {
    if (id) {
      const { error } = await supabase.from("restaurant_tables").update({ name, zone, capacity }).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const maxPos = tables.reduce((m, t) => Math.max(m, t.position), 0);
      const { error } = await supabase.from("restaurant_tables").insert({ restaurant_id: restaurantId, name, zone, capacity, position: maxPos + 1 });
      if (error) throw new Error(error.message);
    }
    await load();
  };

  const handleToggleActive = async (table: RestaurantTable) => {
    await supabase.from("restaurant_tables").update({ is_active: !table.is_active }).eq("id", table.id);
    setTables((prev) => prev.map((t) => t.id === table.id ? { ...t, is_active: !t.is_active } : t));
  };

  const handleDelete = async (table: RestaurantTable) => {
    if (table.status !== "free") {
      alert("No puedes eliminar una mesa ocupada. Cierra la cuenta primero.");
      return;
    }
    if (!window.confirm(`¿Eliminar "${table.name}"? Esta acción no se puede deshacer.`)) return;
    await supabase.from("restaurant_tables").delete().eq("id", table.id);
    setTables((prev) => prev.filter((t) => t.id !== table.id));
  };

  const moveUp = async (index: number) => {
    if (index === 0) return;
    const updated = [...tables];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    setTables(updated);
    await Promise.all([
      supabase.from("restaurant_tables").update({ position: index - 1 }).eq("id", updated[index - 1].id),
      supabase.from("restaurant_tables").update({ position: index }).eq("id", updated[index].id),
    ]);
  };

  const moveDown = async (index: number) => {
    if (index >= tables.length - 1) return;
    const updated = [...tables];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    setTables(updated);
    await Promise.all([
      supabase.from("restaurant_tables").update({ position: index }).eq("id", updated[index].id),
      supabase.from("restaurant_tables").update({ position: index + 1 }).eq("id", updated[index + 1].id),
    ]);
  };

  return (
    <div style={{ padding: "24px 28px", maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, gap: 12 }}>
        <div>
          <h1 className="admin-panel" style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Mesas</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--admin-text-secondary)" }}>
            Gestiona las mesas del restaurante para pedidos en sala.
          </p>
        </div>
        {canManage && (
          <button type="button" onClick={() => setEditTarget(null)}
            style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: "var(--brand-primary)", color: "#052e16", fontSize: 14, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
            + Nueva mesa
          </button>
        )}
      </div>

      {/* Table list */}
      {loading ? (
        <div style={{ color: "var(--admin-text-muted)", fontSize: 14, padding: "40px 0", textAlign: "center" }}>Cargando...</div>
      ) : tables.length === 0 ? (
        <div style={{ background: "var(--admin-card-bg)", border: "1px solid var(--admin-card-border)", borderRadius: 14, padding: "48px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🍽️</div>
          <p style={{ margin: 0, color: "var(--admin-text-secondary)", fontSize: 14 }}>No hay mesas configuradas.</p>
          {canManage && (
            <button type="button" onClick={() => setEditTarget(null)} style={{ marginTop: 14, padding: "9px 20px", borderRadius: 8, border: "none", background: "var(--brand-primary)", color: "#052e16", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              Añadir primera mesa
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {tables.map((table, idx) => {
            const statusStyle = STATUS_COLORS[table.status] ?? STATUS_COLORS.free;
            const orderTotal = table.current_order_id ? (orderTotals[table.current_order_id] ?? 0) : 0;

            return (
              <div key={table.id}
                style={{ background: "var(--admin-card-bg)", border: "1px solid var(--admin-card-border)", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 14, opacity: table.is_active ? 1 : 0.55 }}>
                {/* Reorder */}
                {canManage && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
                    <button type="button" onClick={() => void moveUp(idx)} disabled={idx === 0}
                      style={{ border: "none", background: "transparent", color: idx === 0 ? "#d1d5db" : "#6b7280", cursor: idx === 0 ? "default" : "pointer", fontSize: 12, padding: "2px 4px", lineHeight: 1 }}>▲</button>
                    <button type="button" onClick={() => void moveDown(idx)} disabled={idx === tables.length - 1}
                      style={{ border: "none", background: "transparent", color: idx === tables.length - 1 ? "#d1d5db" : "#6b7280", cursor: idx === tables.length - 1 ? "default" : "pointer", fontSize: 12, padding: "2px 4px", lineHeight: 1 }}>▼</button>
                  </div>
                )}

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "var(--admin-text-primary)" }}>{table.name}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 20, textTransform: "uppercase", letterSpacing: "0.06em", background: statusStyle.bg, color: statusStyle.color }}>
                      {STATUS_LABELS[table.status] ?? table.status}
                    </span>
                    {!table.is_active && (
                      <span style={{ fontSize: 11, color: "var(--admin-text-muted)", fontStyle: "italic" }}>Inactiva</span>
                    )}
                  </div>
                  <div style={{ marginTop: 4, display: "flex", gap: 12, fontSize: 13, color: "var(--admin-text-secondary)" }}>
                    <span>{table.zone}</span>
                    {table.capacity && <span>· {table.capacity} pax</span>}
                    {table.status !== "free" && orderTotal > 0 && (
                      <span style={{ color: "var(--brand-primary)", fontWeight: 700 }}>· {fmtEur(orderTotal)}</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  {table.qr_token && (
                    <button type="button" onClick={() => setQrTable(table)}
                      style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--admin-card-border)", background: "transparent", color: "var(--admin-text-secondary)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      Ver QR
                    </button>
                  )}
                  {canManage && (
                    <>
                      <button type="button" onClick={() => handleToggleActive(table)}
                        style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--admin-card-border)", background: "transparent", color: "var(--admin-text-secondary)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                        {table.is_active ? "Desactivar" : "Activar"}
                      </button>
                      <button type="button" onClick={() => setEditTarget(table)}
                        style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--admin-card-border)", background: "transparent", color: "var(--admin-text-secondary)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                        Editar
                      </button>
                      <button type="button" onClick={() => void handleDelete(table)}
                        style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.25)", background: "transparent", color: "#ef4444", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                        Eliminar
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit/Create modal */}
      {editTarget !== undefined && (
        <EditTableModal
          table={editTarget}
          onSave={handleSave}
          onClose={() => setEditTarget(undefined)}
        />
      )}

      {/* QR modal */}
      {qrTable?.qr_token && (
        <TableQRModal
          table={{ id: qrTable.id, name: qrTable.name, qr_token: qrTable.qr_token }}
          restaurantSlug={slug}
          onClose={() => setQrTable(null)}
          onTokenRegenerated={(newToken) =>
            setTables((prev) =>
              prev.map((t) => t.id === qrTable.id ? { ...t, qr_token: newToken } : t)
            )
          }
        />
      )}
    </div>
  );
}
