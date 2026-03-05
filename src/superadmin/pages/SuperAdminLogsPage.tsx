import { useCallback, useEffect, useMemo, useState } from "react";

import { type OrderStatus } from "../../constants/orderStatus";
import { supabase } from "../../lib/supabase";

const PAGE_SIZE = 25;

type LogRow = {
  changed_at: string | null;
  order_id: string | null;
  restaurant_id: string | null;
  old_status: OrderStatus | null;
  new_status: OrderStatus | null;
  changed_by: string | null;
};

type Restaurant = {
  id: string;
  name: string;
};

type DateRange = "today" | "7d" | "30d";

function asString(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

function formatDateTime(v: string | null | undefined): string {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return asString(v) || "-";
  return new Intl.DateTimeFormat("es-ES", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function normalizeStatus(s: OrderStatus | null | undefined): OrderStatus {
  return s ?? "pending";
}

function statusLabel(s: OrderStatus | null | undefined): string {
  const map: Record<OrderStatus, string> = {
    pending: "Pendiente",
    accepted: "Aceptado",
    preparing: "Preparando",
    ready: "Listo",
    out_for_delivery: "En reparto",
    delivered: "Entregado",
    cancelled: "Cancelado",
  };
  return map[normalizeStatus(s)] ?? asString(s);
}

function statusChipStyle(s: OrderStatus | null | undefined) {
  const palette: Record<OrderStatus, { bg: string; border: string; text: string }> = {
    pending: { bg: "#fffbeb", border: "#f59e0b", text: "#92400e" },
    accepted: { bg: "var(--brand-primary-soft)", border: "var(--brand-primary)", text: "var(--brand-hover)" },
    preparing: { bg: "var(--brand-primary-soft)", border: "var(--brand-primary)", text: "var(--brand-hover)" },
    ready: { bg: "var(--brand-primary-soft)", border: "var(--brand-primary)", text: "var(--brand-hover)" },
    out_for_delivery: { bg: "var(--brand-primary-soft)", border: "var(--brand-primary)", text: "var(--brand-hover)" },
    delivered: { bg: "var(--brand-primary-soft)", border: "var(--brand-primary)", text: "var(--brand-hover)" },
    cancelled: { bg: "#fef2f2", border: "#ef4444", text: "#b91c1c" },
  };
  const tone = palette[normalizeStatus(s)] ?? palette.pending;
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    border: `1px solid ${tone.border}`,
    background: tone.bg,
    color: tone.text,
    padding: "3px 10px",
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: 0.4,
    whiteSpace: "nowrap" as const,
  };
}

function shortOrderId(id: string | null | undefined): string {
  const s = asString(id).trim();
  return s ? s.slice(0, 8) : "-";
}

function getDateRangeBounds(range: DateRange): { from: string; to: string } {
  const now = new Date();
  if (range === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { from: start.toISOString(), to: now.toISOString() };
  }
  const days = range === "7d" ? 7 : 30;
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  return { from: start.toISOString(), to: now.toISOString() };
}

const DATE_RANGE_LABELS: Record<DateRange, string> = {
  today: "Hoy",
  "7d": "Últimos 7 días",
  "30d": "Últimos 30 días",
};

export default function SuperAdminLogsPage() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [restaurantFilter, setRestaurantFilter] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>("7d");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const restaurantMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of restaurants) m.set(r.id, r.name);
    return m;
  }, [restaurants]);

  const loadRestaurants = useCallback(async () => {
    const { data } = await supabase.from("restaurants").select("id, name").order("name");
    setRestaurants((data ?? []) as Restaurant[]);
  }, []);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { from, to } = getDateRangeBounds(dateRange);

    let query = supabase
      .from("v_order_status_history_admin")
      .select("restaurant_id, changed_at, order_id, old_status, new_status, changed_by")
      .gte("changed_at", from)
      .lte("changed_at", to)
      .order("changed_at", { ascending: false })
      .limit(500);

    if (restaurantFilter) {
      query = query.eq("restaurant_id", restaurantFilter);
    }

    const { data, error: err } = await query;

    if (err) {
      setError(`Error al cargar logs: ${err.message}`);
      setRows([]);
    } else {
      setRows((data ?? []) as LogRow[]);
    }

    setLoading(false);
  }, [dateRange, restaurantFilter]);

  useEffect(() => {
    void loadRestaurants();
  }, [loadRestaurants]);

  useEffect(() => {
    setPage(0);
    void loadLogs();
  }, [loadLogs]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => asString(r.order_id).toLowerCase().startsWith(term));
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pagedRows = filteredRows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const pillBtn = (active: boolean): React.CSSProperties => ({
    borderRadius: 999,
    border: `1px solid ${active ? "var(--brand-primary)" : "#d1d5db"}`,
    background: active ? "var(--brand-primary)" : "#fff",
    color: active ? "#fff" : "#374151",
    padding: "6px 14px",
    fontSize: 13,
    fontWeight: active ? 700 : 400,
    cursor: "pointer",
  });

  const thStyle: React.CSSProperties = {
    padding: "10px 12px",
    borderBottom: "1px solid #e5e7eb",
    textAlign: "left",
    fontWeight: 600,
    fontSize: 13,
    color: "#374151",
    background: "#f9fafb",
    whiteSpace: "nowrap",
  };

  const tdStyle: React.CSSProperties = {
    padding: "10px 12px",
    borderBottom: "1px solid #f3f4f6",
    verticalAlign: "top",
    fontSize: 14,
  };

  const pgBtn = (disabled: boolean): React.CSSProperties => ({
    borderRadius: 8,
    border: "1px solid #d1d5db",
    background: "#fff",
    padding: "6px 14px",
    fontSize: 13,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.4 : 1,
  });

  return (
    <section style={{ display: "grid", gap: 16 }}>
      {/* Header */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Logs de pedidos</h2>
          <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 14 }}>
            Historial de cambios de estado en todos los restaurantes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadLogs()}
          disabled={loading}
          style={{
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: "#fff",
            padding: "8px 14px",
            fontSize: 13,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Cargando..." : "Recargar"}
        </button>
      </header>

      {/* Filters */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 14,
          display: "grid",
          gap: 12,
          background: "#fff",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Buscar por ID de pedido..."
            style={{
              borderRadius: 8,
              border: "1px solid #d1d5db",
              padding: "8px 10px",
              fontSize: 13,
              outline: "none",
            }}
          />
          <select
            value={restaurantFilter}
            onChange={(e) => setRestaurantFilter(e.target.value)}
            style={{
              borderRadius: 8,
              border: "1px solid #d1d5db",
              padding: "8px 10px",
              fontSize: 13,
              background: "#fff",
            }}
          >
            <option value="">Todos los restaurantes</option>
            {restaurants.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "#6b7280", marginRight: 2 }}>Rango:</span>
          {(["today", "7d", "30d"] as DateRange[]).map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => setDateRange(range)}
              style={pillBtn(dateRange === range)}
            >
              {DATE_RANGE_LABELS[range]}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error ? (
        <div
          role="alert"
          style={{
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#991b1b",
            padding: 12,
            borderRadius: 10,
            fontSize: 14,
          }}
        >
          {error}
        </div>
      ) : null}

      {/* Result count */}
      {!loading && !error ? (
        <div style={{ fontSize: 13, color: "#6b7280" }}>
          {filteredRows.length === 0
            ? "Sin resultados."
            : `${filteredRows.length} evento${filteredRows.length !== 1 ? "s" : ""} — página ${safePage + 1} de ${totalPages}`}
        </div>
      ) : null}

      {/* Table */}
      {loading && rows.length === 0 ? (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: 32,
            color: "#6b7280",
            textAlign: "center",
            fontSize: 14,
          }}
        >
          Cargando logs...
        </div>
      ) : !loading && filteredRows.length === 0 ? (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: 32,
            color: "#6b7280",
            textAlign: "center",
            fontSize: 14,
          }}
        >
          No hay logs en el rango seleccionado.
        </div>
      ) : (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
            <thead>
              <tr>
                <th style={thStyle}>Fecha / hora</th>
                <th style={thStyle}>Restaurante</th>
                <th style={thStyle}>Pedido</th>
                <th style={thStyle}>Anterior</th>
                <th style={thStyle}>Nuevo</th>
                <th style={thStyle}>Cambiado por</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((row, i) => {
                const restaurantName =
                  restaurantMap.get(asString(row.restaurant_id)) ||
                  asString(row.restaurant_id).slice(0, 8);
                const changedBy = asString(row.changed_by).trim();

                return (
                  <tr key={`${asString(row.order_id)}-${asString(row.changed_at)}-${i}`}>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap", color: "#374151" }}>
                      {formatDateTime(row.changed_at)}
                    </td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          fontWeight: 600,
                          color: "var(--brand-hover)",
                          fontSize: 13,
                        }}
                      >
                        {restaurantName}
                      </span>
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        fontFamily: "monospace",
                        fontSize: 13,
                        color: "#374151",
                        letterSpacing: 0.5,
                      }}
                    >
                      {shortOrderId(row.order_id)}
                    </td>
                    <td style={tdStyle}>
                      {row.old_status ? (
                        <span style={statusChipStyle(row.old_status)}>
                          {statusLabel(row.old_status)}
                        </span>
                      ) : (
                        <span style={{ color: "#d1d5db", fontSize: 13 }}>—</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <span style={statusChipStyle(row.new_status)}>
                        {statusLabel(row.new_status)}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: "#6b7280", fontSize: 13 }}>
                      {changedBy || <span style={{ color: "#d1d5db" }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
            style={pgBtn(safePage === 0)}
          >
            ← Anterior
          </button>
          <span style={{ fontSize: 13, color: "#374151", minWidth: 60, textAlign: "center" }}>
            {safePage + 1} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={safePage >= totalPages - 1}
            style={pgBtn(safePage >= totalPages - 1)}
          >
            Siguiente →
          </button>
        </div>
      ) : null}
    </section>
  );
}
