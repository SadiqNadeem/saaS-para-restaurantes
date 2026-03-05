import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ALL_ORDER_STATUSES, isOrderStatus, type OrderStatus } from "../../constants/orderStatus";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../../restaurant/RestaurantContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type LogRow = {
  id: string;
  changed_at: string | null;
  order_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  old_status: string | null;
  new_status: string | null;
  changed_by: string | null;
  order_type: string | null;
  total: number | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pendiente",
  accepted: "Aceptado",
  preparing: "Preparando",
  ready: "Listo",
  out_for_delivery: "En reparto",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

// Maps OrderStatus to CSS variable slug (out_for_delivery → out-for-delivery)
function statusCssSlug(status: string): string {
  return status.replace(/_/g, "-");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function asStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return asStr(value) || "—";
  return new Intl.DateTimeFormat("es-ES", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function shortId(orderId: string | null | undefined): string {
  const id = asStr(orderId).trim();
  return id ? id.slice(0, 8).toUpperCase() : "—";
}

function shortChangedBy(v: string | null | undefined): string {
  const raw = asStr(v).trim();
  if (!raw) return "—";
  const display = raw.includes("@") ? raw.split("@")[0] : raw;
  return display.length > 20 ? `${display.slice(0, 20)}…` : display;
}

function toStartOfDay(d: string): number {
  return new Date(`${d}T00:00:00`).getTime();
}

function toEndOfDay(d: string): number {
  return new Date(`${d}T23:59:59.999`).getTime();
}

function normalizeStatus(s: string | null | undefined): OrderStatus {
  if (isOrderStatus(s)) return s;
  return "pending";
}

// ─── CSV export ────────────────────────────────────────────────────────────────

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function exportLogsToCsv(rows: LogRow[], restaurantName: string): void {
  const header = ["fecha", "pedido_id", "estado_anterior", "estado_nuevo", "cambiado_por"];
  const lines = rows.map((row) => {
    const ts = row.changed_at ? new Date(asStr(row.changed_at)).toISOString() : "";
    return [
      escapeCsv(ts),
      escapeCsv(asStr(row.order_id)),
      escapeCsv(asStr(row.old_status)),
      escapeCsv(asStr(row.new_status)),
      escapeCsv(asStr(row.changed_by)),
    ].join(",");
  });

  const csv = [header.join(","), ...lines].join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  const slug = restaurantName.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  const filename = `logs-${slug}-${date}.csv`;
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusChip({ status }: { status: string | null | undefined }) {
  const slug = statusCssSlug(asStr(status) || "pending");
  const label = isOrderStatus(status) ? STATUS_LABEL[status] : asStr(status) || "—";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 999,
        padding: "3px 10px",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.5,
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        background: `var(--status-${slug}-bg, #f3f4f6)`,
        color: `var(--status-${slug}-color, #374151)`,
      }}
    >
      {label}
    </span>
  );
}

function SkeletonRow() {
  const cell = (w: string) => (
    <td style={{ padding: "12px 14px", borderBottom: "1px solid #f3f4f6" }}>
      <div
        style={{
          height: 14,
          width: w,
          background: "#e5e7eb",
          borderRadius: 6,
          animation: "logs-pulse 1.4s ease-in-out infinite",
        }}
      />
    </td>
  );
  return (
    <tr>
      {cell("90px")}
      {cell("64px")}
      {cell("120px")}
      {cell("140px")}
      {cell("100px")}
    </tr>
  );
}

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--admin-card-border)",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 14,
  color: "var(--admin-text-primary)",
  background: "#fff",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "var(--admin-text-secondary)",
  marginBottom: 4,
  display: "block",
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminLogsPage() {
  const { restaurantId, name } = useRestaurant();

  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Pagination
  const [page, setPage] = useState(1);

  // Toasts
  const [toasts, setToasts] = useState<Array<{ id: number; type: "error" | "success"; message: string }>>([]);
  const toastSeqRef = useRef(0);

  const pushToast = useCallback((type: "error" | "success", message: string) => {
    toastSeqRef.current += 1;
    const id = toastSeqRef.current;
    setToasts((prev) => [...prev, { id, type, message }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    // Confirmed view columns: id, restaurant_id, order_id, old_status, new_status,
    // changed_by, changed_at, customer_name, customer_phone, total, order_type
    const { data, error } = await supabase
      .from("v_order_status_history_admin")
      .select("id, changed_at, order_id, customer_name, customer_phone, old_status, new_status, changed_by, order_type, total")
      .eq("restaurant_id", restaurantId)
      .order("changed_at", { ascending: false })
      .limit(500);

    if (error) {
      setErrorMessage("No se pudieron cargar los registros. Inténtalo de nuevo.");
      pushToast("error", "No se pudo cargar el historial de cambios.");
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data ?? []) as LogRow[]);
    setPage(1);
    setLoading(false);
  }, [restaurantId, pushToast]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Filter + paginate ─────────────────────────────────────────────────────

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const fromTs = dateFrom ? toStartOfDay(dateFrom) : null;
    const toTs = dateTo ? toEndOfDay(dateTo) : null;

    return rows.filter((row) => {
      if (term) {
        const matchId = asStr(row.order_id).toLowerCase().includes(term);
        const matchName = asStr(row.customer_name).toLowerCase().includes(term);
        if (!matchId && !matchName) return false;
      }

      if (statusFilter && normalizeStatus(row.new_status) !== statusFilter) return false;

      if (fromTs !== null || toTs !== null) {
        const ts = new Date(asStr(row.changed_at)).getTime();
        if (Number.isNaN(ts)) return false;
        if (fromTs !== null && ts < fromTs) return false;
        if (toTs !== null && ts > toTs) return false;
      }

      return true;
    });
  }, [rows, search, statusFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, dateFrom, dateTo]);

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("");
    setDateFrom("");
    setDateTo("");
  };

  const hasFilters = search || statusFilter || dateFrom || dateTo;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @keyframes logs-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
        .logs-input:focus-visible {
          border-color: var(--brand-primary) !important;
          box-shadow: 0 0 0 3px var(--brand-primary-soft);
          outline: none;
        }
        .logs-tr:hover { background: #f8fafc; }
        .logs-page-btn {
          border: 1px solid var(--admin-card-border);
          background: #fff;
          border-radius: 6px;
          padding: 5px 12px;
          font-size: 13px;
          cursor: pointer;
          color: var(--admin-text-primary);
          font-weight: 500;
          transition: background 0.12s;
        }
        .logs-page-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .logs-page-btn:not(:disabled):hover { background: #f3f4f6; }
      `}</style>

      <section className="admin-panel" style={{ display: "grid", gap: 20 }}>

        {/* ── Header ── */}
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Logs de pedidos</h2>
            <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--admin-text-secondary)" }}>
              Auditoría de todos los cambios de estado en pedidos.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => { exportLogsToCsv(filteredRows, name ?? "restaurante"); }}
              disabled={loading || filteredRows.length === 0}
              style={{
                border: "1px solid var(--brand-primary-border)",
                background: "var(--brand-primary-soft)",
                borderRadius: 8,
                padding: "8px 16px",
                fontSize: 14,
                fontWeight: 500,
                cursor: loading || filteredRows.length === 0 ? "not-allowed" : "pointer",
                opacity: loading || filteredRows.length === 0 ? 0.5 : 1,
                color: "var(--brand-hover)",
              }}
            >
              ↓ Exportar CSV
            </button>
            <button
              type="button"
              onClick={() => { void load(); }}
              disabled={loading}
              style={{
                border: "1px solid var(--admin-card-border)",
                background: "#fff",
                borderRadius: 8,
                padding: "8px 16px",
                fontSize: 14,
                fontWeight: 500,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
                color: "var(--admin-text-primary)",
              }}
            >
              {loading ? "Cargando..." : "↻ Recargar"}
            </button>
          </div>
        </header>

        {/* ── Filter bar ── */}
        <article
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
            borderRadius: "var(--admin-radius-md)",
            boxShadow: "var(--admin-card-shadow)",
            padding: "16px 20px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr 1fr",
              gap: 12,
              alignItems: "end",
            }}
          >
            <div>
              <label style={labelStyle}>Buscar</label>
              <input
                className="logs-input"
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); }}
                placeholder="ID de pedido o nombre del cliente..."
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Estado nuevo</label>
              <select
                className="logs-input"
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value as OrderStatus | ""); }}
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                <option value="">Todos</option>
                {ALL_ORDER_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Desde</label>
              <input
                className="logs-input"
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); }}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Hasta</label>
              <input
                className="logs-input"
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); }}
                style={inputStyle}
              />
            </div>
          </div>

          {hasFilters && (
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, color: "var(--admin-text-secondary)" }}>
                {filteredRows.length} resultado{filteredRows.length !== 1 ? "s" : ""}
              </span>
              <button
                type="button"
                onClick={clearFilters}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 13,
                  color: "var(--brand-hover)",
                  cursor: "pointer",
                  padding: 0,
                  textDecoration: "underline",
                }}
              >
                Limpiar filtros
              </button>
            </div>
          )}
        </article>

        {/* ── Error ── */}
        {errorMessage && (
          <div className="admin-error-banner" role="alert">
            <span>{errorMessage}</span>
            <button
              type="button"
              className="admin-btn-secondary"
              style={{ padding: "6px 12px", fontSize: 13 }}
              onClick={() => void load()}
            >
              Reintentar
            </button>
          </div>
        )}

        {/* ── Table card ── */}
        <article
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
            borderRadius: "var(--admin-radius-md)",
            boxShadow: "var(--admin-card-shadow)",
            overflow: "hidden",
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
              <thead>
                <tr
                  style={{
                    background: "#f8fafc",
                    borderBottom: "1px solid var(--admin-card-border)",
                    textAlign: "left",
                  }}
                >
                  {["Fecha / hora", "Pedido", "Estado anterior", "Estado nuevo", "Cambiado por"].map(
                    (col) => (
                      <th
                        key={col}
                        style={{
                          padding: "11px 14px",
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--admin-text-secondary)",
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {col}
                      </th>
                    )
                  )}
                </tr>
              </thead>

              <tbody>
                {/* Loading skeleton */}
                {loading &&
                  Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}

                {/* Empty state */}
                {!loading && filteredRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      style={{
                        padding: "48px 20px",
                        textAlign: "center",
                        color: "var(--admin-text-muted)",
                      }}
                    >
                      <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
                      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4, color: "var(--admin-text-secondary)" }}>
                        No hay logs
                      </div>
                      <div style={{ fontSize: 13 }}>
                        {hasFilters
                          ? "No hay logs para los filtros seleccionados."
                          : "Todavía no se han registrado cambios de estado."}
                      </div>
                    </td>
                  </tr>
                )}

                {/* Rows */}
                {!loading &&
                  pageRows.map((row, i) => (
                    <tr
                      key={`${asStr(row.id)}-${i}`}
                      className="logs-tr"
                      style={{ borderBottom: "1px solid #f3f4f6" }}
                    >
                      <td
                        style={{
                          padding: "11px 14px",
                          fontSize: 13,
                          color: "var(--admin-text-secondary)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatDateTime(row.changed_at)}
                      </td>

                      <td style={{ padding: "11px 14px" }}>
                        <div>
                          <code
                            style={{
                              fontFamily: "monospace",
                              fontSize: 13,
                              fontWeight: 600,
                              color: "var(--admin-text-primary)",
                              background: "#f3f4f6",
                              borderRadius: 4,
                              padding: "1px 6px",
                            }}
                          >
                            {shortId(row.order_id)}
                          </code>
                        </div>
                        {row.customer_name && (
                          <div
                            style={{
                              fontSize: 12,
                              color: "var(--admin-text-muted)",
                              marginTop: 3,
                            }}
                          >
                            {row.customer_name}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: "11px 14px" }}>
                        <StatusChip status={row.old_status} />
                      </td>

                      <td style={{ padding: "11px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 13, color: "var(--admin-text-muted)" }}>→</span>
                          <StatusChip status={row.new_status} />
                        </div>
                      </td>

                      <td
                        style={{
                          padding: "11px 14px",
                          fontSize: 13,
                          color: "var(--admin-text-secondary)",
                        }}
                      >
                        {shortChangedBy(row.changed_by)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ── */}
          {!loading && filteredRows.length > PAGE_SIZE && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 16px",
                borderTop: "1px solid var(--admin-card-border)",
                background: "#f8fafc",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontSize: 13, color: "var(--admin-text-secondary)" }}>
                {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredRows.length)} de{" "}
                {filteredRows.length} entradas
              </span>

              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button
                  type="button"
                  className="logs-page-btn"
                  onClick={() => { setPage(1); }}
                  disabled={safePage === 1}
                >
                  «
                </button>
                <button
                  type="button"
                  className="logs-page-btn"
                  onClick={() => { setPage((p) => Math.max(1, p - 1)); }}
                  disabled={safePage === 1}
                >
                  ‹ Anterior
                </button>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--admin-text-primary)",
                    padding: "0 4px",
                  }}
                >
                  Pág. {safePage} / {totalPages}
                </span>
                <button
                  type="button"
                  className="logs-page-btn"
                  onClick={() => { setPage((p) => Math.min(totalPages, p + 1)); }}
                  disabled={safePage === totalPages}
                >
                  Siguiente ›
                </button>
                <button
                  type="button"
                  className="logs-page-btn"
                  onClick={() => { setPage(totalPages); }}
                  disabled={safePage === totalPages}
                >
                  »
                </button>
              </div>
            </div>
          )}
        </article>

        {/* ── Footer count (no pagination) ── */}
        {!loading && filteredRows.length > 0 && filteredRows.length <= PAGE_SIZE && (
          <p style={{ margin: 0, fontSize: 13, color: "var(--admin-text-muted)", textAlign: "right" }}>
            {filteredRows.length} entrada{filteredRows.length !== 1 ? "s" : ""}
          </p>
        )}
      </section>

      {/* ── Toasts ── */}
      <div style={{ position: "fixed", right: 16, bottom: 16, display: "grid", gap: 8, zIndex: 60 }}>
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            style={{
              border: `1px solid ${toast.type === "error" ? "#fecaca" : "var(--brand-primary-border)"}`,
              background: toast.type === "error" ? "#fef2f2" : "var(--brand-primary-soft)",
              color: toast.type === "error" ? "#991b1b" : "var(--brand-hover)",
              borderRadius: 10,
              padding: "10px 14px",
              minWidth: 220,
              maxWidth: 360,
              boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
              fontWeight: 500,
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>{toast.type === "success" ? "✓" : "✕"}</span>
            {toast.message}
          </div>
        ))}
      </div>
    </>
  );
}
