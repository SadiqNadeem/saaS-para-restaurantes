import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../../restaurant/RestaurantContext";

type Toast = {
  id: number;
  message: string;
};

type DailyMetrics = {
  totalRevenue: number;
  totalCash: number;
  totalCard: number;
  totalOrders: number;
  avgTicket: number;
};

type TopProductRow = {
  productName: string;
  totalQty: number;
  totalAmount: number;
};

type CashClosingRow = {
  day: string | null;
  expected_total: number;
  counted_total: number;
  diff_total: number;
  closed_at: string | null;
};

type RangePreset = "today" | "7d" | "30d" | "custom";
type ExportKind = "orders" | "items" | "closings";

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickNumber(row: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    if (key in row) {
      return toNumber(row[key]);
    }
  }
  return 0;
}

function pickString(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return "";
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function formatInt(value: number): string {
  return new Intl.NumberFormat("es-ES").format(value);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("es-ES", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function computeMetrics(rows: Array<Record<string, unknown>>): DailyMetrics {
  if (rows.length === 0) {
    return {
      totalRevenue: 0,
      totalCash: 0,
      totalCard: 0,
      totalOrders: 0,
      avgTicket: 0,
    };
  }

  const single = rows[0];
  const directRevenue = pickNumber(single, ["total_revenue", "revenue", "total_sales", "sales"]);
  const directCash = pickNumber(single, ["total_cash", "cash_total", "cash_revenue"]);
  const directCard = pickNumber(single, ["total_card", "card_total", "card_revenue"]);
  const directOrders = pickNumber(single, ["total_orders", "orders_count", "orders"]);

  if (directRevenue > 0 || directCash > 0 || directCard > 0 || directOrders > 0 || rows.length === 1) {
    const avg = directOrders > 0 ? directRevenue / directOrders : 0;
    return {
      totalRevenue: directRevenue,
      totalCash: directCash,
      totalCard: directCard,
      totalOrders: Math.max(0, Math.round(directOrders)),
      avgTicket: avg,
    };
  }

  let totalRevenue = 0;
  let totalCash = 0;
  let totalCard = 0;
  let totalOrders = 0;

  for (const row of rows) {
    totalRevenue += pickNumber(row, ["total_revenue", "revenue", "total_sales", "sales", "amount"]);
    totalCash += pickNumber(row, ["total_cash", "cash_total", "cash_revenue"]);
    totalCard += pickNumber(row, ["total_card", "card_total", "card_revenue"]);
    totalOrders += pickNumber(row, ["total_orders", "orders_count", "orders"]);
  }

  return {
    totalRevenue,
    totalCash,
    totalCard,
    totalOrders: Math.max(0, Math.round(totalOrders)),
    avgTicket: totalOrders > 0 ? totalRevenue / totalOrders : 0,
  };
}

function mapTopProducts(rows: Array<Record<string, unknown>>): TopProductRow[] {
  return rows
    .map((row) => ({
      productName: pickString(row, ["product_name", "name", "product", "title"]) || "Producto",
      totalQty: pickNumber(row, ["total_qty", "qty", "quantity", "units", "sold_qty"]),
      totalAmount: pickNumber(row, ["total_amount", "amount", "revenue", "sales"]),
    }))
    .sort((a, b) => b.totalQty - a.totalQty);
}

function mapClosingRows(rows: Array<Record<string, unknown>>): CashClosingRow[] {
  return rows.map((row) => {
    const expectedTotal = pickNumber(row, ["expected_total", "expected_amount", "expected"]);
    const countedCash = pickNumber(row, ["counted_cash"]);
    const countedCard = pickNumber(row, ["counted_card"]);
    const countedTotal =
      "counted_total" in row ? pickNumber(row, ["counted_total"]) : countedCash + countedCard;
    const diffTotal =
      "diff_total" in row ? pickNumber(row, ["diff_total"]) : countedTotal - expectedTotal;

    return {
      day: pickString(row, ["day", "closing_day", "date"]) || null,
      expected_total: expectedTotal,
      counted_total: countedTotal,
      diff_total: diffTotal,
      closed_at: pickString(row, ["closed_at", "created_at", "updated_at"]) || null,
    };
  });
}

function formatDateInput(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(base: Date, diff: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + diff);
}

function getRangeFromPreset(preset: Exclude<RangePreset, "custom">): { from: string; to: string } {
  const today = new Date();
  const to = formatDateInput(today);

  if (preset === "7d") {
    return { from: formatDateInput(addDays(today, -6)), to };
  }

  if (preset === "30d") {
    return { from: formatDateInput(addDays(today, -29)), to };
  }

  return { from: to, to };
}

function normalizeRange(from: string, to: string): { from: string; to: string } {
  if (!from && !to) {
    const today = formatDateInput(new Date());
    return { from: today, to: today };
  }
  if (!from) return { from: to, to };
  if (!to) return { from, to: from };
  if (from <= to) return { from, to };
  return { from: to, to: from };
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = typeof value === "object" ? JSON.stringify(value) : String(value);
  const escaped = raw.replace(/"/g, "\"\"");
  return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  const headers: string[] = [];
  const headerSet = new Set<string>();

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (headerSet.has(key)) continue;
      headerSet.add(key);
      headers.push(key);
    }
  }

  if (headers.length === 0) {
    return "";
  }

  const lines: string[] = [];
  lines.push(headers.map((header) => escapeCsvCell(header)).join(","));

  for (const row of rows) {
    lines.push(headers.map((header) => escapeCsvCell(row[header])).join(","));
  }

  return lines.join("\n");
}

function downloadCsv(filename: string, csvText: string): void {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function toStartDateTime(from: string): string {
  return `${from}T00:00:00`;
}

function toNextDayDate(to: string): string {
  const parsed = new Date(`${to}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return to;
  return formatDateInput(addDays(parsed, 1));
}

export default function AdminPosPage() {
  const { restaurantId } = useRestaurant();
  const initialRange = getRangeFromPreset("today");

  const [metrics, setMetrics] = useState<DailyMetrics>({
    totalRevenue: 0,
    totalCash: 0,
    totalCard: 0,
    totalOrders: 0,
    avgTicket: 0,
  });
  const [topProducts, setTopProducts] = useState<TopProductRow[]>([]);
  const [cashClosings, setCashClosings] = useState<CashClosingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rangePreset, setRangePreset] = useState<RangePreset>("today");
  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);

  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [countedCash, setCountedCash] = useState("");
  const [countedCard, setCountedCard] = useState("0");
  const [notes, setNotes] = useState("");
  const [closingBusy, setClosingBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState<ExportKind | null>(null);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeqRef = useRef(0);

  const pushToast = useCallback((message: string) => {
    toastSeqRef.current += 1;
    const nextId = toastSeqRef.current;
    setToasts((prev) => [...prev, { id: nextId, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== nextId));
    }, 3500);
  }, []);

  const effectiveRange = useMemo(() => normalizeRange(fromDate, toDate), [fromDate, toDate]);
  const todayIso = useMemo(() => formatDateInput(new Date()), []);
  const isTodayRange = useMemo(
    () => effectiveRange.from === todayIso && effectiveRange.to === todayIso,
    [effectiveRange.from, effectiveRange.to, todayIso]
  );

  const applyPreset = (preset: Exclude<RangePreset, "custom">) => {
    const next = getRangeFromPreset(preset);
    setRangePreset(preset);
    setFromDate(next.from);
    setToDate(next.to);
  };

  const exportRangeLabel = `${effectiveRange.from}_${effectiveRange.to}`;
  const exportDisabled = loading || exportBusy !== null;

  const handleExport = useCallback(
    async (kind: ExportKind) => {
      if (exportBusy !== null) return;

      setExportBusy(kind);

      try {
        let rows: Array<Record<string, unknown>> = [];
        let filename = "";

        if (kind === "orders") {
          const query = await supabase
            .from("v_orders_export_admin")
            .select("*")
            .eq("restaurant_id", restaurantId)
            .gte("created_at", toStartDateTime(effectiveRange.from))
            .lt("created_at", toStartDateTime(toNextDayDate(effectiveRange.to)));

          if (query.error) {
            throw new Error(query.error.message || "No se pudo exportar pedidos.");
          }

          rows = (query.data ?? []) as Array<Record<string, unknown>>;
          filename = `orders_${exportRangeLabel}.csv`;
        }

        if (kind === "items") {
          const query = await supabase
            .from("v_order_items_export_admin")
            .select("*")
            .eq("restaurant_id", restaurantId)
            .gte("created_at", toStartDateTime(effectiveRange.from))
            .lt("created_at", toStartDateTime(toNextDayDate(effectiveRange.to)));

          if (query.error) {
            throw new Error(query.error.message || "No se pudo exportar items.");
          }

          rows = (query.data ?? []) as Array<Record<string, unknown>>;
          filename = `order_items_${exportRangeLabel}.csv`;
        }

        if (kind === "closings") {
          const query = await supabase
            .from("v_cash_closings_export_admin")
            .select("*")
            .eq("restaurant_id", restaurantId)
            .gte("day", effectiveRange.from)
            .lte("day", effectiveRange.to);

          if (query.error) {
            throw new Error(query.error.message || "No se pudo exportar cierres.");
          }

          rows = (query.data ?? []) as Array<Record<string, unknown>>;
          filename = `cash_closings_${exportRangeLabel}.csv`;
        }

        const csv = toCsv(rows);
        downloadCsv(filename, csv);
        pushToast(`Exportado ${filename} (${rows.length} filas).`);
      } catch (error) {
        pushToast(String((error as { message?: unknown })?.message ?? "Error exportando CSV."));
      } finally {
        setExportBusy(null);
      }
    },
    [effectiveRange.from, effectiveRange.to, exportBusy, exportRangeLabel, pushToast, restaurantId]
  );

  const loadDashboardData = useCallback(async () => {
    const [salesResult, productsResult] = await Promise.all([
      supabase.rpc("admin_sales_summary_range", {
        p_restaurant_id: restaurantId,
        p_from: effectiveRange.from,
        p_to: effectiveRange.to,
      }),
      supabase.rpc("admin_top_products_range", {
        p_restaurant_id: restaurantId,
        p_from: effectiveRange.from,
        p_to: effectiveRange.to,
        p_limit: 20,
      }),
    ]);

    if (salesResult.error || productsResult.error) {
      const message =
        salesResult.error?.message ?? productsResult.error?.message ?? "No se pudieron cargar datos de caja.";
      throw new Error(message);
    }

    const salesData = salesResult.data;
    const productsData = productsResult.data;
    const salesRowsRaw = (
      Array.isArray(salesData)
        ? salesData
        : salesData
        ? [salesData as Record<string, unknown>]
        : []
    ) as Array<Record<string, unknown>>;
    const productsRowsRaw = (
      Array.isArray(productsData)
        ? productsData
        : productsData
        ? [productsData as Record<string, unknown>]
        : []
    ) as Array<Record<string, unknown>>;

    setMetrics(computeMetrics(salesRowsRaw));
    setTopProducts(mapTopProducts(productsRowsRaw));
  }, [effectiveRange.from, effectiveRange.to, restaurantId]);

  const loadClosings = useCallback(async () => {
    const query = await supabase
      .from("cash_closings")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("day", { ascending: false })
      .limit(200);

    if (query.error) {
      throw new Error(`No se pudo cargar historial de cierres: ${query.error.message}`);
    }

    const rows = (query.data ?? []) as Array<Record<string, unknown>>;
    setCashClosings(mapClosingRows(rows));
  }, [restaurantId]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      await Promise.all([loadDashboardData(), loadClosings()]);
    } catch (error) {
      const message = String((error as { message?: unknown })?.message ?? "Error cargando caja.");
      setErrorMessage(message);
      pushToast(message);
      setMetrics({ totalRevenue: 0, totalCash: 0, totalCard: 0, totalOrders: 0, avgTicket: 0 });
      setTopProducts([]);
      setCashClosings([]);
    } finally {
      setLoading(false);
    }
  }, [loadClosings, loadDashboardData, pushToast]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const cards = useMemo(
    () => [
      { label: "Total ventas", value: formatMoney(metrics.totalRevenue) },
      { label: "Total efectivo", value: formatMoney(metrics.totalCash) },
      { label: "Total tarjeta", value: formatMoney(metrics.totalCard) },
      { label: "Numero de pedidos", value: formatInt(metrics.totalOrders) },
      { label: "Ticket promedio", value: formatMoney(metrics.avgTicket) },
    ],
    [metrics]
  );

  const resetCloseForm = () => {
    setCountedCash("");
    setCountedCard("0");
    setNotes("");
  };

  const openCloseModal = () => {
    if (!isTodayRange) {
      pushToast("El cierre de caja solo esta disponible para el rango de hoy.");
      return;
    }
    resetCloseForm();
    setCloseModalOpen(true);
  };

  const onConfirmClose = async () => {
    if (closingBusy) {
      return;
    }

    const cash = Number(countedCash);
    const card = Number(countedCard || "0");

    if (!Number.isFinite(cash) || cash < 0) {
      pushToast("Introduce counted_cash valido (>= 0).");
      return;
    }

    if (!Number.isFinite(card) || card < 0) {
      pushToast("Introduce counted_card valido (>= 0).");
      return;
    }

    setClosingBusy(true);

    const { error } = await supabase.rpc("admin_close_cash", {
      p_restaurant_id: restaurantId,
      p_day: new Date().toISOString().slice(0, 10),
      p_counted_cash: cash,
      p_counted_card: card,
      p_notes: notes.trim() ? notes.trim() : null,
    });

    if (error) {
      const codeText = String(error.code ?? "").toUpperCase();
      const msgText = String(error.message ?? "").toUpperCase();
      const alreadyClosed = codeText.includes("ALREADY_CLOSED") || msgText.includes("ALREADY_CLOSED");

      if (alreadyClosed) {
        pushToast("La caja ya esta cerrada hoy");
      } else {
        pushToast(`No se pudo cerrar caja: ${error.message}`);
      }

      setClosingBusy(false);
      return;
    }

    pushToast("Caja cerrada correctamente.");
    setCloseModalOpen(false);
    resetCloseForm();

    try {
      await Promise.all([loadDashboardData(), loadClosings()]);
    } catch (reloadError) {
      pushToast(
        String((reloadError as { message?: unknown })?.message ?? "No se pudo recargar datos tras el cierre.")
      );
    }

    setClosingBusy(false);
  };

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Caja</h2>
          <p style={{ margin: "4px 0 0", color: "#6b7280" }}>
            Resumen de caja y productos vendidos en el rango seleccionado.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => void loadAll()}
            disabled={loading}
            style={{
              borderRadius: 8,
              border: "1px solid #d1d5db",
              background: "#ffffff",
              padding: "8px 12px",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Cargando..." : "Recargar"}
          </button>

          <button
            type="button"
            onClick={openCloseModal}
            disabled={!isTodayRange}
            title={
              isTodayRange ? "Cerrar caja del dia de hoy" : "El cierre de caja solo esta disponible para hoy"
            }
            style={{
              borderRadius: 8,
              border: "1px solid #1f2937",
              background: "var(--brand-primary)",
              color: "var(--brand-white)",
              padding: "8px 12px",
              cursor: isTodayRange ? "pointer" : "not-allowed",
              opacity: isTodayRange ? 1 : 0.6,
            }}
          >
            Cerrar caja
          </button>
        </div>
      </header>

      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 12,
          display: "grid",
          gap: 10,
          background: "#ffffff",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button
            type="button"
            onClick={() => applyPreset("today")}
            style={rangePreset === "today" ? quickRangeButtonActiveStyle : quickRangeButtonStyle}
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={() => applyPreset("7d")}
            style={rangePreset === "7d" ? quickRangeButtonActiveStyle : quickRangeButtonStyle}
          >
            7 dias
          </button>
          <button
            type="button"
            onClick={() => applyPreset("30d")}
            style={rangePreset === "30d" ? quickRangeButtonActiveStyle : quickRangeButtonStyle}
          >
            30 dias
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end" }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ color: "#6b7280", fontSize: 13 }}>From</span>
            <input
              type="date"
              value={fromDate}
              onChange={(event) => {
                setRangePreset("custom");
                setFromDate(event.target.value);
              }}
              style={{ border: "1px solid #d1d5db", borderRadius: 8, background: "#ffffff", padding: "8px 10px" }}
            />
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ color: "#6b7280", fontSize: 13 }}>To</span>
            <input
              type="date"
              value={toDate}
              onChange={(event) => {
                setRangePreset("custom");
                setToDate(event.target.value);
              }}
              style={{ border: "1px solid #d1d5db", borderRadius: 8, background: "#ffffff", padding: "8px 10px" }}
            />
          </label>
        </div>
      </div>

      {errorMessage ? (
        <div
          role="alert"
          style={{
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#991b1b",
            padding: 12,
            borderRadius: 10,
          }}
        >
          {errorMessage}
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
        }}
      >
        {cards.map((card) => (
          <article key={card.label} style={cardStyle}>
            <div style={cardLabelStyle}>{card.label}</div>
            <strong style={cardValueStyle}>{card.value}</strong>
          </article>
        ))}
      </div>

      <article style={tablePanelStyle}>
        <h3 style={{ margin: 0 }}>Exportar</h3>
        <p style={{ margin: "4px 0 0", color: "#6b7280" }}>
          Rango: {effectiveRange.from} a {effectiveRange.to}
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          <button
            type="button"
            disabled={exportDisabled}
            onClick={() => void handleExport("orders")}
            style={quickRangeButtonStyle}
          >
            {exportBusy === "orders" ? "Exportando..." : "Exportar pedidos (CSV)"}
          </button>

          <button
            type="button"
            disabled={exportDisabled}
            onClick={() => void handleExport("items")}
            style={quickRangeButtonStyle}
          >
            {exportBusy === "items" ? "Exportando..." : "Exportar items (CSV)"}
          </button>

          <button
            type="button"
            disabled={exportDisabled}
            onClick={() => void handleExport("closings")}
            style={quickRangeButtonStyle}
          >
            {exportBusy === "closings" ? "Exportando..." : "Exportar cierres caja (CSV)"}
          </button>
        </div>
      </article>

      <article style={tablePanelStyle}>
        <h3 style={{ margin: 0 }}>Top productos ({effectiveRange.from} a {effectiveRange.to})</h3>

        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
            <thead>
              <tr style={{ background: "#f9fafb", color: "#374151", textAlign: "left" }}>
                <th style={thStyle}>Producto</th>
                <th style={thStyle}>Cantidad</th>
                <th style={thStyle}>Importe</th>
              </tr>
            </thead>
            <tbody>
              {topProducts.length === 0 ? (
                <tr>
                  <td style={tdStyle} colSpan={3}>
                    No hay ventas en este rango.
                  </td>
                </tr>
              ) : (
                topProducts.map((row, index) => (
                  <tr key={`${row.productName}-${index}`}>
                    <td style={tdStyle}>{row.productName}</td>
                    <td style={tdStyle}>{formatInt(row.totalQty)}</td>
                    <td style={tdStyle}>{formatMoney(row.totalAmount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>

      <article style={tablePanelStyle}>
        <h3 style={{ margin: 0 }}>Historial de cierres</h3>

        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead>
              <tr style={{ background: "#f9fafb", color: "#374151", textAlign: "left" }}>
                <th style={thStyle}>Day</th>
                <th style={thStyle}>Expected total</th>
                <th style={thStyle}>Counted total</th>
                <th style={thStyle}>Diff total</th>
                <th style={thStyle}>Closed at</th>
                <th style={thStyle}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {cashClosings.length === 0 ? (
                <tr>
                  <td style={tdStyle} colSpan={6}>
                    No hay cierres registrados.
                  </td>
                </tr>
              ) : (
                cashClosings.map((row, index) => (
                  <tr key={`${row.day ?? "no-day"}-${row.closed_at ?? "no-closed"}-${index}`}>
                    <td style={tdStyle}>{row.day ?? "-"}</td>
                    <td style={tdStyle}>{formatMoney(row.expected_total)}</td>
                    <td style={tdStyle}>{formatMoney(row.counted_total)}</td>
                    <td style={{ ...tdStyle, color: row.diff_total === 0 ? "#111827" : row.diff_total > 0 ? "var(--brand-hover)" : "#b91c1c" }}>
                      {formatMoney(row.diff_total)}
                    </td>
                    <td style={tdStyle}>{formatDateTime(row.closed_at)}</td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          borderRadius: 999,
                          border: "1px solid var(--brand-primary-border)",
                          background: "var(--brand-primary-soft)",
                          color: "var(--brand-hover)",
                          padding: "3px 10px",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        Cerrado
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>

      {closeModalOpen ? (
        <div
          role="presentation"
          onClick={() => {
            if (!closingBusy) setCloseModalOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(17, 24, 39, 0.45)",
            zIndex: 1000,
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Cerrar caja"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(560px, 100%)",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              boxShadow: "0 20px 45px rgba(0,0,0,0.18)",
              padding: 16,
              display: "grid",
              gap: 12,
            }}
          >
            <h3 style={{ margin: 0 }}>Cerrar caja</h3>

            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "#f9fafb", display: "grid", gap: 6 }}>
              <div>Esperado efectivo: <strong>{formatMoney(metrics.totalCash)}</strong></div>
              <div>Esperado tarjeta: <strong>{formatMoney(metrics.totalCard)}</strong></div>
              <div>Esperado total: <strong>{formatMoney(metrics.totalRevenue)}</strong></div>
            </div>

            <label style={{ display: "grid", gap: 4 }}>
              <span>counted_cash</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={countedCash}
                onChange={(event) => setCountedCash(event.target.value)}
              />
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span>counted_card</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={countedCard}
                onChange={(event) => setCountedCard(event.target.value)}
              />
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span>notes</span>
              <textarea
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Notas opcionales del cierre"
              />
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => setCloseModalOpen(false)}
                disabled={closingBusy}
                style={{
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  background: "#ffffff",
                  padding: "8px 12px",
                  cursor: closingBusy ? "not-allowed" : "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void onConfirmClose()}
                disabled={closingBusy}
                style={{
                  borderRadius: 8,
                  border: "1px solid #1f2937",
                  background: "var(--brand-primary)",
                  color: "var(--brand-white)",
                  padding: "8px 12px",
                  cursor: closingBusy ? "not-allowed" : "pointer",
                  opacity: closingBusy ? 0.7 : 1,
                }}
              >
                {closingBusy ? "Confirmando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ position: "fixed", right: 16, bottom: 16, display: "grid", gap: 8, zIndex: 60 }}>
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            style={{
              border: "1px solid #fecaca",
              background: "#fef2f2",
              color: "#991b1b",
              borderRadius: 10,
              padding: "10px 12px",
              minWidth: 220,
              maxWidth: 340,
              boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
            }}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </section>
  );
}

const cardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 14,
  display: "grid",
  gap: 6,
  background: "#ffffff",
  boxShadow: "0 8px 20px rgba(17, 24, 39, 0.06)",
};

const cardLabelStyle: CSSProperties = {
  color: "#6b7280",
  fontSize: 13,
};

const cardValueStyle: CSSProperties = {
  fontSize: 24,
  color: "#111827",
  lineHeight: 1.1,
};

const tablePanelStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 14,
  background: "#ffffff",
  boxShadow: "0 8px 20px rgba(17, 24, 39, 0.05)",
};

const thStyle: CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #e5e7eb",
};

const tdStyle: CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #f3f4f6",
};

const quickRangeButtonStyle: CSSProperties = {
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "#ffffff",
  color: "#111827",
  padding: "8px 12px",
  cursor: "pointer",
  fontWeight: 600,
};

const quickRangeButtonActiveStyle: CSSProperties = {
  ...quickRangeButtonStyle,
  border: "1px solid var(--brand-primary)",
  background: "var(--brand-primary)",
  color: "var(--brand-white)",
};
