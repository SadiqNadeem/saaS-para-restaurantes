import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../../restaurant/RestaurantContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type RangeKey = "today" | "7d" | "30d" | "month";

type OrderRow = {
  id: string;
  created_at: string;
  status: string;
  total: number;
  order_type: string;
  payment_method: string;
};

type OrderItemRaw = {
  product_id: string;
  qty: number;
  unit_price: number;
  products: { name: string } | null;
};

type TopProduct = {
  name: string;
  units: number;
  revenue: number;
};

type DayPoint = {
  label: string;
  revenue: number;
  orders: number;
};

type HourPoint = {
  label: string;
  orders: number;
};

type PiePoint = {
  name: string;
  value: number;
};

type StatusRow = {
  status: string;
  label: string;
  count: number;
  pct: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Hoy" },
  { key: "7d", label: "7 días" },
  { key: "30d", label: "30 días" },
  { key: "month", label: "Este mes" },
];

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  accepted: "Aceptado",
  preparing: "Preparando",
  ready: "Listo",
  out_for_delivery: "En camino",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

const STATUS_ORDER = [
  "pending",
  "accepted",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
  "cancelled",
];

const PIE_COLORS = ["#4ec580", "#6366f1"];
const BRAND = "#4ec580";
const ACCENT = "#6366f1";
const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Utility functions ────────────────────────────────────────────────────────

function getRangeBounds(key: RangeKey): { from: Date; to: Date } {
  const now = new Date();
  if (key === "today") {
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    return { from, to: now };
  }
  if (key === "7d") {
    return { from: new Date(now.getTime() - 7 * DAY_MS), to: now };
  }
  if (key === "30d") {
    return { from: new Date(now.getTime() - 30 * DAY_MS), to: now };
  }
  // "month" = first calendar day of current month
  const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  return { from, to: now };
}

function formatMoney(v: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function formatInt(v: number): string {
  return new Intl.NumberFormat("es-ES").format(Math.round(v));
}

function toDayLabel(dateStr: string): string {
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function toHourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}h`;
}

function buildDaySeries(orders: OrderRow[], from: Date, to: Date): DayPoint[] {
  const days = new Map<string, DayPoint>();
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  while (cursor <= to) {
    const label = toDayLabel(cursor.toISOString());
    if (!days.has(label)) days.set(label, { label, revenue: 0, orders: 0 });
    cursor.setTime(cursor.getTime() + DAY_MS);
  }
  for (const order of orders) {
    if (order.status === "cancelled") continue;
    const label = toDayLabel(order.created_at);
    const entry = days.get(label);
    if (entry) {
      entry.revenue += Number(order.total ?? 0);
      entry.orders += 1;
    }
  }
  return Array.from(days.values());
}

function buildHourSeries(orders: OrderRow[]): HourPoint[] {
  const counts: number[] = Array(24).fill(0) as number[];
  for (const order of orders) {
    if (order.status === "cancelled") continue;
    const h = new Date(order.created_at).getHours();
    counts[h] = (counts[h] ?? 0) + 1;
  }
  return counts.map((n, hour) => ({ label: toHourLabel(hour), orders: n }));
}

function buildPieSeries(orders: OrderRow[]): PiePoint[] {
  let delivery = 0;
  let pickup = 0;
  for (const order of orders) {
    if (order.status === "cancelled") continue;
    if (order.order_type === "delivery") delivery++;
    else pickup++;
  }
  return [
    { name: "Domicilio", value: delivery },
    { name: "Recoger", value: pickup },
  ];
}

function buildStatusTable(orders: OrderRow[]): StatusRow[] {
  const counts: Record<string, number> = {};
  for (const order of orders) {
    counts[order.status] = (counts[order.status] ?? 0) + 1;
  }
  const total = orders.length;
  return STATUS_ORDER.filter((s) => (counts[s] ?? 0) > 0).map((s) => ({
    status: s,
    label: STATUS_LABELS[s] ?? s,
    count: counts[s] ?? 0,
    pct: total > 0 ? `${(((counts[s] ?? 0) / total) * 100).toFixed(1)}%` : "0%",
  }));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid var(--admin-card-border, #e5e7eb)",
        borderRadius: 14,
        padding: "16px 20px",
        display: "grid",
        gap: 4,
        boxShadow: "var(--admin-card-shadow, 0 1px 3px rgba(0,0,0,0.06))",
      }}
    >
      <div style={{ color: "var(--admin-text-secondary, #6b7280)", fontSize: 13, fontWeight: 500 }}>
        {title}
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 800,
          color: "var(--admin-text-primary, #111827)",
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
      {sub ? (
        <div style={{ color: "var(--admin-text-muted, #9ca3af)", fontSize: 12 }}>{sub}</div>
      ) : null}
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid var(--admin-card-border, #e5e7eb)",
        borderRadius: 14,
        padding: "16px 20px",
        boxShadow: "var(--admin-card-shadow, 0 1px 3px rgba(0,0,0,0.06))",
        display: "grid",
        gap: 14,
      }}
    >
      <div
        style={{ fontWeight: 700, fontSize: 15, color: "var(--admin-text-primary, #111827)" }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ color: "var(--admin-text-muted, #9ca3af)", fontSize: 13, padding: "8px 0" }}>
      {text}
    </div>
  );
}

function statusCssVar(status: string, suffix: "bg" | "color"): string {
  return `var(--status-${status.replace(/_/g, "-")}-${suffix}, ${suffix === "bg" ? "#f3f4f6" : "#374151"})`;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminMetricsPage() {
  const { restaurantId } = useRestaurant();
  const [rangeKey, setRangeKey] = useState<RangeKey>("7d");
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);

  // ─── Fetch orders ──────────────────────────────────────────────────────────

  const loadOrders = useCallback(async () => {
    setLoadingOrders(true);
    setError(null);
    const { from, to } = getRangeBounds(rangeKey);

    const { data, error: err } = await supabase
      .from("orders")
      .select("id, created_at, status, total, order_type, payment_method")
      .eq("restaurant_id", restaurantId)
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .order("created_at", { ascending: true });

    setLoadingOrders(false);

    if (err) {
      setError(err.message || "No se pudieron cargar los datos.");
      setOrders([]);
      return;
    }

    const rows: OrderRow[] = (data ?? []).map((row) => ({
      id: String(row.id ?? ""),
      created_at: String(row.created_at ?? ""),
      status: String(row.status ?? ""),
      total: Number(row.total ?? 0),
      order_type: String(row.order_type ?? ""),
      payment_method: String(row.payment_method ?? ""),
    }));

    setOrders(rows);
  }, [restaurantId, rangeKey]);

  // ─── Fetch top products ────────────────────────────────────────────────────

  const loadTopProducts = useCallback(async (orderRows: OrderRow[]) => {
    const validIds = orderRows
      .filter((o) => o.status !== "cancelled")
      .map((o) => o.id);

    if (validIds.length === 0) {
      setTopProducts([]);
      return;
    }

    setLoadingProducts(true);

    const { data, error: err } = await supabase
      .from("order_items")
      .select("product_id, qty, unit_price, products(name)")
      .in("order_id", validIds);

    setLoadingProducts(false);

    if (err) {
      setTopProducts([]);
      return;
    }

    const byProduct = new Map<string, TopProduct>();

    for (const raw of data ?? []) {
      const item = raw as unknown as OrderItemRaw;
      const productId = String(item.product_id ?? "");
      const name = String(item.products?.name ?? "Desconocido");
      const qty = Number(item.qty ?? 0);
      const price = Number(item.unit_price ?? 0);
      const existing = byProduct.get(productId);
      if (existing) {
        existing.units += qty;
        existing.revenue += qty * price;
      } else {
        byProduct.set(productId, { name, units: qty, revenue: qty * price });
      }
    }

    const sorted = Array.from(byProduct.values())
      .sort((a, b) => b.units - a.units)
      .slice(0, 10);

    setTopProducts(sorted);
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    void loadTopProducts(orders);
  }, [orders, loadTopProducts]);

  // ─── Derived metrics ───────────────────────────────────────────────────────

  const nonCancelled = useMemo(
    () => orders.filter((o) => o.status !== "cancelled"),
    [orders]
  );

  const totalRevenue = useMemo(
    () => nonCancelled.reduce((sum, o) => sum + o.total, 0),
    [nonCancelled]
  );

  const totalOrders = orders.length;

  const avgTicket = useMemo(
    () => (nonCancelled.length > 0 ? totalRevenue / nonCancelled.length : 0),
    [totalRevenue, nonCancelled]
  );

  const cancelledCount = useMemo(
    () => orders.filter((o) => o.status === "cancelled").length,
    [orders]
  );

  const cancellationRate = useMemo(
    () => (totalOrders > 0 ? (cancelledCount / totalOrders) * 100 : 0),
    [cancelledCount, totalOrders]
  );

  const { from: rangeFrom, to: rangeTo } = useMemo(() => getRangeBounds(rangeKey), [rangeKey]);

  const daySeries = useMemo(
    () => buildDaySeries(orders, rangeFrom, rangeTo),
    [orders, rangeFrom, rangeTo]
  );

  const hourSeries = useMemo(() => buildHourSeries(orders), [orders]);

  const pieSeries = useMemo(() => buildPieSeries(orders), [orders]);

  const statusTable = useMemo(() => buildStatusTable(orders), [orders]);

  const isLoading = loadingOrders;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <section style={{ display: "grid", gap: 20 }}>
      {/* Header + range selector */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Métricas</h2>
          <p style={{ margin: "4px 0 0", color: "var(--admin-text-secondary, #6b7280)", fontSize: 13 }}>
            Análisis de ventas y pedidos
          </p>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {RANGE_OPTIONS.map((opt) => {
            const active = rangeKey === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setRangeKey(opt.key)}
                style={{
                  borderRadius: 8,
                  border: `1px solid ${active ? BRAND : "#e5e7eb"}`,
                  background: active ? BRAND : "#ffffff",
                  color: active ? "#ffffff" : "var(--admin-text-primary, #111827)",
                  padding: "6px 14px",
                  fontWeight: active ? 700 : 500,
                  fontSize: 13,
                  cursor: "pointer",
                  transition: "background 0.15s ease, border-color 0.15s ease, color 0.15s ease",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Error */}
      {error ? (
        <div
          role="alert"
          style={{
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#991b1b",
            borderRadius: 10,
            padding: "10px 14px",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <div
          style={{
            color: "var(--admin-text-secondary, #6b7280)",
            padding: 24,
            textAlign: "center",
            fontSize: 14,
          }}
        >
          Cargando métricas...
        </div>
      ) : (
        <>
          {/* ── KPI Cards ────────────────────────────────────────── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 14,
            }}
          >
            <KpiCard
              title="Total ingresos"
              value={formatMoney(totalRevenue)}
              sub={`${formatInt(nonCancelled.length)} pedidos no cancelados`}
            />
            <KpiCard
              title="Total pedidos"
              value={formatInt(totalOrders)}
              sub={`${formatInt(cancelledCount)} cancelados`}
            />
            <KpiCard
              title="Ticket medio"
              value={avgTicket > 0 ? formatMoney(avgTicket) : "—"}
              sub="Solo pedidos no cancelados"
            />
            <KpiCard
              title="Tasa de cancelación"
              value={`${cancellationRate.toFixed(1)}%`}
              sub={`${formatInt(cancelledCount)} de ${formatInt(totalOrders)}`}
            />
          </div>

          {/* ── Charts row 1: line + hourly bar ──────────────────── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))",
              gap: 14,
            }}
          >
            {/* Line chart: ingresos por día */}
            <SectionCard title="Ingresos por día">
              {daySeries.length === 0 || daySeries.every((p) => p.revenue === 0) ? (
                <EmptyState text="Sin ingresos en el periodo seleccionado." />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={daySeries} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => `${Number(v).toFixed(0)}€`}
                      width={50}
                    />
                    <Tooltip
                      formatter={(value) => [formatMoney(Number(value)), "Ingresos"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke={BRAND}
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </SectionCard>

            {/* Bar chart: pedidos por hora del día */}
            <SectionCard title="Pedidos por hora del día">
              {hourSeries.every((p) => p.orders === 0) ? (
                <EmptyState text="Sin pedidos en el periodo seleccionado." />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={hourSeries} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={1} />
                    <YAxis tick={{ fontSize: 11 }} width={32} allowDecimals={false} />
                    <Tooltip formatter={(value) => [value, "Pedidos"]} />
                    <Bar dataKey="orders" fill={BRAND} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </SectionCard>
          </div>

          {/* ── Charts row 2: pie + top products bar ─────────────── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))",
              gap: 14,
            }}
          >
            {/* Pie chart: delivery vs pickup */}
            <SectionCard title="Tipo de pedido">
              {pieSeries.every((p) => p.value === 0) ? (
                <EmptyState text="Sin pedidos no cancelados en el periodo." />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={pieSeries}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      dataKey="value"
                    >
                      {pieSeries.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value, name) => [formatInt(Number(value)), name]} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </SectionCard>

            {/* Bar chart: top 10 productos */}
            <SectionCard title="Top 10 productos (unidades)">
              {loadingProducts ? (
                <EmptyState text="Cargando productos..." />
              ) : topProducts.length === 0 ? (
                <EmptyState text="Sin ventas en el periodo seleccionado." />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={topProducts}
                    layout="vertical"
                    margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 11 }}
                      width={110}
                    />
                    <Tooltip formatter={(value) => [value, "Unidades"]} />
                    <Bar dataKey="units" fill={ACCENT} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </SectionCard>
          </div>

          {/* ── Tables ───────────────────────────────────────────── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))",
              gap: 14,
            }}
          >
            {/* Top 10 products table */}
            <SectionCard title="Top 10 productos más vendidos">
              {topProducts.length === 0 ? (
                <EmptyState text="Sin datos en el periodo seleccionado." />
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr
                        style={{
                          borderBottom: "1px solid var(--admin-card-border, #e5e7eb)",
                        }}
                      >
                        <th
                          style={{
                            textAlign: "left",
                            padding: "6px 8px",
                            color: "var(--admin-text-secondary, #6b7280)",
                            fontWeight: 600,
                          }}
                        >
                          Producto
                        </th>
                        <th
                          style={{
                            textAlign: "right",
                            padding: "6px 8px",
                            color: "var(--admin-text-secondary, #6b7280)",
                            fontWeight: 600,
                          }}
                        >
                          Uds.
                        </th>
                        <th
                          style={{
                            textAlign: "right",
                            padding: "6px 8px",
                            color: "var(--admin-text-secondary, #6b7280)",
                            fontWeight: 600,
                          }}
                        >
                          Ingresos
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {topProducts.map((p, i) => (
                        <tr
                          key={i}
                          style={{ borderBottom: "1px solid #f3f4f6" }}
                        >
                          <td
                            style={{
                              padding: "7px 8px",
                              color: "var(--admin-text-primary, #111827)",
                            }}
                          >
                            {p.name}
                          </td>
                          <td
                            style={{
                              padding: "7px 8px",
                              textAlign: "right",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {formatInt(p.units)}
                          </td>
                          <td
                            style={{
                              padding: "7px 8px",
                              textAlign: "right",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {formatMoney(p.revenue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            {/* Status breakdown table */}
            <SectionCard title="Pedidos por estado">
              {statusTable.length === 0 ? (
                <EmptyState text="Sin pedidos en el periodo seleccionado." />
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr
                        style={{
                          borderBottom: "1px solid var(--admin-card-border, #e5e7eb)",
                        }}
                      >
                        <th
                          style={{
                            textAlign: "left",
                            padding: "6px 8px",
                            color: "var(--admin-text-secondary, #6b7280)",
                            fontWeight: 600,
                          }}
                        >
                          Estado
                        </th>
                        <th
                          style={{
                            textAlign: "right",
                            padding: "6px 8px",
                            color: "var(--admin-text-secondary, #6b7280)",
                            fontWeight: 600,
                          }}
                        >
                          Pedidos
                        </th>
                        <th
                          style={{
                            textAlign: "right",
                            padding: "6px 8px",
                            color: "var(--admin-text-secondary, #6b7280)",
                            fontWeight: 600,
                          }}
                        >
                          %
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {statusTable.map((row) => (
                        <tr
                          key={row.status}
                          style={{ borderBottom: "1px solid #f3f4f6" }}
                        >
                          <td style={{ padding: "7px 8px" }}>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 8px",
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 600,
                                background: statusCssVar(row.status, "bg"),
                                color: statusCssVar(row.status, "color"),
                              }}
                            >
                              {row.label}
                            </span>
                          </td>
                          <td
                            style={{
                              padding: "7px 8px",
                              textAlign: "right",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {formatInt(row.count)}
                          </td>
                          <td
                            style={{
                              padding: "7px 8px",
                              textAlign: "right",
                              fontVariantNumeric: "tabular-nums",
                              color: "var(--admin-text-secondary, #6b7280)",
                            }}
                          >
                            {row.pct}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </div>
        </>
      )}
    </section>
  );
}
