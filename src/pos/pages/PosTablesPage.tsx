import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import TableQRModal from "../components/TableQRModal";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../../restaurant/RestaurantContext";
import type { RestaurantTable, TableStatus } from "../services/posOrderService";
import { openTableOrder } from "../services/posOrderService";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtEur(n: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);
}

function elapsedLabel(createdAt: string): string {
  const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
  if (diff < 60) return `${diff} min`;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

const ZONES = ["Todas", "Sala", "Terraza", "Barra"];

// ─── Types ────────────────────────────────────────────────────────────────────

type TableWithOrder = RestaurantTable & {
  order_created_at?: string;
  order_total?: number;
  order_item_count?: number;
  order_source?: string;
};

// ─── Card component ───────────────────────────────────────────────────────────

function TableCard({
  table,
  onOpen,
  onQR,
  onStatusClick,
}: {
  table: TableWithOrder;
  onOpen: (table: TableWithOrder) => void;
  onQR: (table: TableWithOrder) => void;
  onStatusClick: (table: TableWithOrder) => void;
}) {
  const isFree = table.status === "free";
  const isOccupied = table.status === "occupied";
  const isClosing = table.status === "closing";
  const isReserved = table.status === "reserved";

  const cardBg = isFree
    ? "#1e293b"
    : isOccupied
    ? "rgba(74,222,128,0.12)"
    : isReserved
    ? "rgba(251,191,36,0.08)"
    : "rgba(251,191,36,0.12)";
  const cardBorder = isFree
    ? "1px solid #334155"
    : isOccupied
    ? "1px solid rgba(74,222,128,0.5)"
    : isReserved
    ? "1px solid rgba(251,191,36,0.4)"
    : "1px solid rgba(251,191,36,0.5)";

  const statusLabel = isFree ? "Libre" : isOccupied ? "Ocupada" : isReserved ? "Reservada" : "Cobrando";
  const statusBg = isFree
    ? "rgba(100,116,139,0.25)"
    : isOccupied
    ? "rgba(74,222,128,0.2)"
    : isReserved
    ? "rgba(251,191,36,0.2)"
    : "rgba(251,191,36,0.25)";
  const statusColor = isFree ? "#94a3b8" : isOccupied ? "#4ade80" : isReserved ? "#fbbf24" : "#fbbf24";

  return (
    <button
      type="button"
      onClick={() => onOpen(table)}
      style={{
        background: cardBg,
        border: cardBorder,
        borderRadius: 14,
        padding: "16px 14px",
        textAlign: "left",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minHeight: 130,
        transition: "transform 0.12s, box-shadow 0.12s",
        color: "#f1f5f9",
        fontFamily: "system-ui, -apple-system, sans-serif",
        width: "100%",
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
        <span style={{ fontSize: 17, fontWeight: 800, color: "#f1f5f9", lineHeight: 1.2 }}>
          {table.name}
        </span>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
          {/* Clickable status badge */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onStatusClick(table); }}
            title="Cambiar estado"
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              padding: "3px 8px",
              borderRadius: 20,
              border: `1px solid ${statusColor}44`,
              background: statusBg,
              color: statusColor,
              flexShrink: 0,
              cursor: "pointer",
            }}
          >
            {statusLabel}
          </button>
          {table.order_source === "qr_table" && (
            <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 10, background: "rgba(96,165,250,0.2)", color: "#60a5fa", letterSpacing: "0.05em" }}>
              QR
            </span>
          )}
        </div>
      </div>

      {/* Zone + capacity */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "#64748b" }}>{table.zone}</span>
        {table.capacity && (
          <span style={{ fontSize: 12, color: "#64748b" }}>· {table.capacity} pax</span>
        )}
      </div>

      {/* Occupied info */}
      {(isOccupied || isClosing) && table.order_created_at && (
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>
              ⏱ {elapsedLabel(table.order_created_at)}
            </span>
            {(table.order_item_count ?? 0) > 0 && (
              <span style={{ fontSize: 12, color: "#94a3b8" }}>
                {table.order_item_count} art.
              </span>
            )}
          </div>
          {(table.order_total ?? 0) > 0 && (
            <span style={{ fontSize: 18, fontWeight: 800, color: isOccupied ? "#4ade80" : "#fbbf24" }}>
              {fmtEur(table.order_total ?? 0)}
            </span>
          )}
        </div>
      )}

      {/* Free state — tap to open */}
      {isFree && (
        <div style={{ marginTop: "auto", fontSize: 12, color: "#475569" }}>
          Toca para abrir cuenta
        </div>
      )}

      {/* QR button */}
      {table.qr_token && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onQR(table); }}
          style={{ alignSelf: "flex-end", marginTop: 4, fontSize: 11, fontWeight: 600, color: "#64748b", background: "rgba(100,116,139,0.15)", border: "none", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}
        >
          QR
        </button>
      )}
    </button>
  );
}

// ─── Status picker modal ──────────────────────────────────────────────────────

function StatusPickerModal({
  table,
  onSelect,
  onClose,
}: {
  table: TableWithOrder;
  onSelect: (status: TableStatus) => void;
  onClose: () => void;
}) {
  const options: { value: TableStatus; label: string; emoji: string; bg: string; color: string; border: string; disabled?: boolean }[] = [
    { value: "free",     label: "Libre",     emoji: "🟢", bg: "rgba(74,222,128,0.15)",  color: "#4ade80", border: "rgba(74,222,128,0.4)" },
    { value: "occupied", label: "Ocupada",   emoji: "🔴", bg: "rgba(248,113,113,0.15)", color: "#f87171", border: "rgba(248,113,113,0.4)" },
    { value: "reserved", label: "Reservada", emoji: "🟡", bg: "rgba(251,191,36,0.15)",  color: "#fbbf24", border: "rgba(251,191,36,0.4)",
      disabled: table.status !== "free" && table.status !== "reserved" },
  ];

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 16, padding: 20, width: "min(320px, 100%)", display: "flex", flexDirection: "column", gap: 12 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#f1f5f9" }}>Estado — {table.name}</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Estado actual: <span style={{ color: "#94a3b8", fontWeight: 600 }}>{table.status}</span></div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {options.map(({ value, label, emoji, bg, color, border, disabled }) => {
            const isActive = table.status === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => !disabled && onSelect(value)}
                disabled={disabled}
                style={{
                  padding: "11px 14px",
                  borderRadius: 10,
                  border: `1px solid ${isActive ? border : "#334155"}`,
                  background: isActive ? bg : "transparent",
                  color: isActive ? color : disabled ? "#374151" : "#94a3b8",
                  fontSize: 14,
                  fontWeight: isActive ? 800 : 500,
                  cursor: disabled ? "not-allowed" : "pointer",
                  textAlign: "left",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 16 }}>{emoji}</span>
                {label}
                {isActive && <span style={{ marginLeft: "auto", fontSize: 11, opacity: 0.7 }}>actual</span>}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ alignSelf: "flex-end", padding: "8px 16px", borderRadius: 8, border: "1px solid #334155", background: "transparent", color: "#64748b", fontSize: 13, cursor: "pointer", fontWeight: 600 }}
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}

// ─── Create modal ─────────────────────────────────────────────────────────────

function CreateTableModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string, zone: string, capacity: number | null) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [zone, setZone] = useState("Sala");
  const [capacity, setCapacity] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim()) { setError("El nombre es obligatorio"); return; }
    setSaving(true);
    setError(null);
    try {
      await onCreate(name.trim(), zone, capacity ? Number(capacity) : null);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear mesa");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 16, padding: 24, width: "min(420px, 100%)", display: "flex", flexDirection: "column", gap: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#f1f5f9" }}>Nueva mesa</h3>

        {error && (
          <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid #f87171", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#f87171" }}>
            {error}
          </div>
        )}

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em" }}>Nombre</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mesa 1, Barra 1, Terraza 3..."
            style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: "10px 12px", color: "#f1f5f9", fontSize: 14, outline: "none" }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em" }}>Zona</span>
          <select
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: "10px 12px", color: "#f1f5f9", fontSize: 14, outline: "none" }}
          >
            {["Sala", "Terraza", "Barra"].map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em" }}>Capacidad (opcional)</span>
          <input
            type="number"
            min={1}
            max={50}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            placeholder="Ej: 4"
            style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: "10px 12px", color: "#f1f5f9", fontSize: 14, outline: "none", width: 100 }}
          />
        </label>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: "10px 18px", borderRadius: 8, border: "1px solid #334155", background: "transparent", color: "#94a3b8", fontSize: 14, cursor: "pointer", fontWeight: 600 }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving}
            style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: "#4ade80", color: "#052e16", fontSize: 14, cursor: saving ? "not-allowed" : "pointer", fontWeight: 800 }}
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Confirm open dialog ──────────────────────────────────────────────────────

function ConfirmOpenModal({
  table,
  onConfirm,
  onClose,
  busy,
}: {
  table: TableWithOrder;
  onConfirm: () => void;
  onClose: () => void;
  busy: boolean;
}) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 16, padding: 24, width: "min(360px, 100%)", display: "flex", flexDirection: "column", gap: 16, textAlign: "center" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 40 }}>🍽️</div>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#f1f5f9" }}>
          Abrir cuenta — {table.name}
        </h3>
        <p style={{ margin: 0, fontSize: 14, color: "#94a3b8" }}>
          Se creará una nueva comanda para esta mesa.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={onClose} style={{ flex: 1, padding: "12px", borderRadius: 10, border: "1px solid #334155", background: "transparent", color: "#94a3b8", fontSize: 14, cursor: "pointer", fontWeight: 600 }}>
            Cancelar
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} style={{ flex: 1, padding: "12px", borderRadius: 10, border: "none", background: "#4ade80", color: "#052e16", fontSize: 14, cursor: busy ? "not-allowed" : "pointer", fontWeight: 800 }}>
            {busy ? "Abriendo..." : "Abrir mesa"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PosTablesPage() {
  const { restaurantId, slug } = useRestaurant();
  const navigate = useNavigate();
  const posBase = window.location.pathname.includes("/r/")
    ? window.location.pathname.split("/pos")[0] + "/pos"
    : "/pos";

  const [tables, setTables] = useState<TableWithOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoneFilter, setZoneFilter] = useState("Todas");
  const [showCreate, setShowCreate] = useState(false);
  const [confirmTable, setConfirmTable] = useState<TableWithOrder | null>(null);
  const [openingBusy, setOpeningBusy] = useState(false);
  const [qrTable, setQrTable] = useState<TableWithOrder | null>(null);
  const [statusPickerTable, setStatusPickerTable] = useState<TableWithOrder | null>(null);

  // ── Load tables with order details ──
  const loadTables = async () => {
    const { data, error } = await supabase
      .from("restaurant_tables")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .order("position", { ascending: true });

    if (error || !data) return;

    const rows = data as RestaurantTable[];
    const orderIds = rows
      .filter((t) => t.current_order_id)
      .map((t) => t.current_order_id as string);

    if (orderIds.length === 0) {
      setTables(rows.map((t) => ({ ...t })));
      setLoading(false);
      return;
    }

    // Fetch order details for occupied tables
    const { data: ordersData } = await supabase
      .from("orders")
      .select("id, created_at, total, subtotal, source, status")
      .in("id", orderIds);

    const { data: itemCounts } = await supabase
      .from("order_items")
      .select("order_id")
      .in("order_id", orderIds);

    type OrderRow = { id: string; created_at: string; total: number | null; subtotal: number | null; source: string | null; status: string | null };
    const orderMap = new Map((ordersData ?? []).map((o) => [(o as OrderRow).id, o as OrderRow]));
    const countMap = new Map<string, number>();
    for (const ic of (itemCounts ?? []) as Array<{ order_id: string }>) {
      countMap.set(ic.order_id, (countMap.get(ic.order_id) ?? 0) + 1);
    }

    setTables(
      rows.map((t) => {
        if (!t.current_order_id) return { ...t };
        const o = orderMap.get(t.current_order_id);
        return {
          ...t,
          order_created_at: o?.created_at,
          order_total: Number(o?.total ?? o?.subtotal ?? 0),
          order_item_count: countMap.get(t.current_order_id) ?? 0,
          order_source: o?.source ?? undefined,
        };
      })
    );
    setLoading(false);
  };

  useEffect(() => {
    void loadTables();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  // ── Realtime subscription ──
  useEffect(() => {
    const channel = supabase
      .channel("pos-tables-" + restaurantId)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "restaurant_tables",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => {
          void loadTables();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  // ── Filtered tables ──
  const filtered =
    zoneFilter === "Todas"
      ? tables
      : tables.filter((t) => t.zone === zoneFilter);

  // ── Handlers ──
  const handleCardClick = (table: TableWithOrder) => {
    if (table.status === "free") {
      setConfirmTable(table);
    } else {
      navigate(`${posBase}/tables/${table.id}`);
    }
  };

  const handleOpenTable = async () => {
    if (!confirmTable) return;
    setOpeningBusy(true);
    try {
      await openTableOrder(restaurantId, confirmTable.id, confirmTable.name);
      setConfirmTable(null);
      navigate(`${posBase}/tables/${confirmTable.id}`);
    } catch (e) {
      console.error(e);
      setOpeningBusy(false);
    }
  };

  const handleQuickStatus = async (newStatus: TableStatus) => {
    if (!statusPickerTable || newStatus === statusPickerTable.status) {
      setStatusPickerTable(null);
      return;
    }
    if (newStatus === "free" && statusPickerTable.current_order_id) {
      if (!window.confirm(`Esta mesa tiene una cuenta abierta. ¿Seguro que quieres marcarla como libre?`)) return;
    }
    // Optimistic update
    setTables((prev) =>
      prev.map((t) => t.id === statusPickerTable.id ? { ...t, status: newStatus } : t)
    );
    setStatusPickerTable(null);
    await supabase
      .from("restaurant_tables")
      .update({ status: newStatus })
      .eq("id", statusPickerTable.id);
  };

  const handleCreateTable = async (name: string, zone: string, capacity: number | null) => {
    const maxPos = tables.reduce((m, t) => Math.max(m, t.position), 0);
    const { error } = await supabase.from("restaurant_tables").insert({
      restaurant_id: restaurantId,
      name,
      zone,
      capacity,
      position: maxPos + 1,
    });
    if (error) throw new Error(error.message);
    await loadTables();
  };

  // ── Zones present in data ──
  const zonesInData = ["Todas", ...Array.from(new Set(tables.map((t) => t.zone)))];
  const zonePills = ZONES.filter((z) => zonesInData.includes(z));

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#0f172a",
        color: "#f1f5f9",
        fontFamily: "system-ui, -apple-system, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          flexShrink: 0,
          padding: "16px 20px",
          borderBottom: "1px solid #1e293b",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Mesas</h1>
          <Link
            to={`${posBase}/floor-plan`}
            style={{ fontSize: 13, fontWeight: 600, color: "#64748b", textDecoration: "none", whiteSpace: "nowrap" }}
          >
            Ver plano →
          </Link>
          {/* Zone filter pills */}
          <div style={{ display: "flex", gap: 6 }}>
            {zonePills.map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => setZoneFilter(z)}
                style={{
                  padding: "5px 14px",
                  borderRadius: 20,
                  border: "1px solid",
                  borderColor: zoneFilter === z ? "#4ade80" : "#334155",
                  background: zoneFilter === z ? "rgba(74,222,128,0.15)" : "transparent",
                  color: zoneFilter === z ? "#4ade80" : "#94a3b8",
                  fontSize: 13,
                  fontWeight: zoneFilter === z ? 700 : 500,
                  cursor: "pointer",
                }}
              >
                {z}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowCreate(true)}
          style={{
            padding: "9px 16px",
            borderRadius: 10,
            border: "1px solid #334155",
            background: "transparent",
            color: "#94a3b8",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          + Nueva mesa
        </button>
      </div>

      {/* ── Grid ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#475569", fontSize: 14 }}>
            Cargando mesas...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#475569", fontSize: 14 }}>
            {zoneFilter === "Todas" ? "No hay mesas configuradas." : `No hay mesas en ${zoneFilter}.`}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: 12,
            }}
          >
            {filtered.map((table) => (
              <TableCard key={table.id} table={table} onOpen={handleCardClick} onQR={setQrTable} onStatusClick={setStatusPickerTable} />
            ))}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {showCreate && (
        <CreateTableModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreateTable}
        />
      )}

      {confirmTable && (
        <ConfirmOpenModal
          table={confirmTable}
          onConfirm={() => void handleOpenTable()}
          onClose={() => setConfirmTable(null)}
          busy={openingBusy}
        />
      )}

      {statusPickerTable && (
        <StatusPickerModal
          table={statusPickerTable}
          onSelect={(status) => void handleQuickStatus(status)}
          onClose={() => setStatusPickerTable(null)}
        />
      )}

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
