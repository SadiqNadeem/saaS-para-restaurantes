import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { supabase } from "../../lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

type RangeKey = "today" | "7d" | "30d";

type RestaurantStat = {
  id: string;
  name: string;
  orderCount: number;
  revenue: number;
};

type PlatformMetrics = {
  restaurantCount: number;
  totalOrders: number;
  totalRevenue: number;
  avgTicket: number;
  byRestaurant: RestaurantStat[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value))
    return value as Record<string, unknown>;
  return {};
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value);
}

function formatInt(value: number): string {
  return new Intl.NumberFormat("es-ES").format(value);
}

function getRangeStart(key: RangeKey): Date {
  const now = new Date();
  if (key === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (key === "7d") return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
}

const RANGE_LABELS: Record<RangeKey, string> = {
  today: "Hoy",
  "7d": "Ultimos 7 dias",
  "30d": "Ultimos 30 dias",
};

const EMPTY_METRICS: PlatformMetrics = {
  restaurantCount: 0,
  totalOrders: 0,
  totalRevenue: 0,
  avgTicket: 0,
  byRestaurant: [],
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function SuperAdminMetricsPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("30d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<PlatformMetrics>(EMPTY_METRICS);

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);

    const rangeStart = getRangeStart(rangeKey);

    const [restaurantsResult, ordersResult] = await Promise.all([
      supabase.from("restaurants").select("id, name").order("name"),
      supabase
        .from("orders")
        .select("id, restaurant_id, total, status")
        .gte("created_at", rangeStart.toISOString()),
    ]);

    if (restaurantsResult.error) {
      setError(restaurantsResult.error.message || "No se pudieron cargar los datos.");
      setLoading(false);
      return;
    }

    const restaurants = (Array.isArray(restaurantsResult.data) ? restaurantsResult.data : []).map(
      (r) => {
        const row = asRecord(r);
        return { id: String(row.id ?? ""), name: String(row.name ?? "") };
      }
    );

    const orders = (Array.isArray(ordersResult.data) ? ordersResult.data : []).map((o) => {
      const row = asRecord(o);
      return {
        restaurant_id: String(row.restaurant_id ?? ""),
        total: toNumber(row.total),
        status: String(row.status ?? ""),
      };
    });

    // Aggregate per restaurant — cancelled orders excluded from revenue
    const byRestaurant: RestaurantStat[] = restaurants
      .map((r) => {
        const rOrders = orders.filter((o) => o.restaurant_id === r.id);
        const revenue = rOrders
          .filter((o) => o.status !== "cancelled")
          .reduce((sum, o) => sum + o.total, 0);
        return { id: r.id, name: r.name, orderCount: rOrders.length, revenue };
      })
      .sort((a, b) => b.orderCount - a.orderCount);

    const totalOrders = orders.length;
    const totalRevenue = orders
      .filter((o) => o.status !== "cancelled")
      .reduce((sum, o) => sum + o.total, 0);
    const nonCancelledCount = orders.filter((o) => o.status !== "cancelled").length;
    const avgTicket = nonCancelledCount > 0 ? totalRevenue / nonCancelledCount : 0;

    setMetrics({ restaurantCount: restaurants.length, totalOrders, totalRevenue, avgTicket, byRestaurant });
    setLoading(false);
  }, [rangeKey]);

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  const chartData = useMemo(
    () =>
      metrics.byRestaurant.slice(0, 15).map((r) => ({
        name: r.name.length > 14 ? r.name.slice(0, 13) + "…" : r.name,
        fullName: r.name,
        pedidos: r.orderCount,
      })),
    [metrics.byRestaurant]
  );

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <header style={{ display: "grid", gap: 10 }}>
        <h2 style={{ margin: 0 }}>Metricas globales</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(["today", "7d", "30d"] as RangeKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setRangeKey(key)}
              disabled={loading}
              style={rangeButtonStyle(rangeKey === key)}
            >
              {RANGE_LABELS[key]}
            </button>
          ))}
        </div>
      </header>

      {error ? (
        <div role="alert" style={errorStyle}>{error}</div>
      ) : null}

      {loading ? <div style={{ opacity: 0.8 }}>Cargando...</div> : null}

      {/* KPI cards */}
      <div style={cardsWrapStyle}>
        <article style={cardStyle}>
          <div style={cardLabelStyle}>Restaurantes</div>
          <strong style={cardValueStyle}>{formatInt(metrics.restaurantCount)}</strong>
        </article>
        <article style={cardStyle}>
          <div style={cardLabelStyle}>Pedidos</div>
          <strong style={cardValueStyle}>{formatInt(metrics.totalOrders)}</strong>
          <div style={cardSubStyle}>{RANGE_LABELS[rangeKey].toLowerCase()}</div>
        </article>
        <article style={cardStyle}>
          <div style={cardLabelStyle}>Ingresos</div>
          <strong style={cardValueStyle}>{formatMoney(metrics.totalRevenue)}</strong>
          <div style={cardSubStyle}>{RANGE_LABELS[rangeKey].toLowerCase()}</div>
        </article>
        <article style={cardStyle}>
          <div style={cardLabelStyle}>Ticket medio</div>
          <strong style={cardValueStyle}>{formatMoney(metrics.avgTicket)}</strong>
          <div style={cardSubStyle}>sin cancelados</div>
        </article>
      </div>

      {/* Bar chart */}
      <div style={panelStyle}>
        <h3 style={{ margin: "0 0 14px", fontSize: 15, color: "#111827" }}>
          Pedidos por restaurante — {RANGE_LABELS[rangeKey].toLowerCase()}
        </h3>
        {chartData.length === 0 ? (
          <div style={{ color: "#6b7280", fontSize: 14 }}>Sin pedidos en el periodo seleccionado.</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 48 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12, fill: "#6b7280" }}
                angle={-35}
                textAnchor="end"
                interval={0}
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#6b7280" }} width={36} />
              <Tooltip
                formatter={(value: number | undefined) =>
                  value === undefined ? ["—", "Pedidos"] : [formatInt(value), "Pedidos"]
                }
                labelFormatter={(_label, payload) => payload?.[0]?.payload?.fullName ?? _label}
                contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13 }}
              />
              <Bar dataKey="pedidos" radius={[6, 6, 0, 0]} maxBarSize={52}>
                {chartData.map((_entry, index) => (
                  <Cell
                    key={index}
                    fill={index === 0 ? "var(--brand-hover)" : "var(--brand-primary)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Per-restaurant table */}
      <div style={panelStyle}>
        <h3 style={{ margin: "0 0 12px", fontSize: 15, color: "#111827" }}>
          Detalle por restaurante
        </h3>
        {metrics.byRestaurant.length === 0 ? (
          <div style={{ color: "#6b7280", fontSize: 14 }}>Sin datos.</div>
        ) : (
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
            <div style={tableHeaderStyle}>
              <span>#</span>
              <span>Restaurante</span>
              <span style={{ textAlign: "right" }}>Pedidos</span>
              <span style={{ textAlign: "right" }}>Ingresos</span>
              <span style={{ textAlign: "right" }}>Ticket medio</span>
            </div>
            {metrics.byRestaurant.map((r, i) => {
              const avg = r.orderCount > 0 ? r.revenue / r.orderCount : 0;
              return (
                <div
                  key={r.id}
                  style={{ ...tableRowStyle, background: i % 2 === 0 ? "#fff" : "#fafafa" }}
                >
                  <span style={{ color: "#9ca3af", fontSize: 12 }}>{i + 1}</span>
                  <span style={{ fontWeight: 600, color: "#111827" }}>{r.name}</span>
                  <span style={{ textAlign: "right", color: "#374151" }}>
                    {formatInt(r.orderCount)}
                  </span>
                  <span style={{ textAlign: "right", color: "#374151" }}>
                    {formatMoney(r.revenue)}
                  </span>
                  <span style={{ textAlign: "right", color: "#374151" }}>
                    {formatMoney(avg)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function rangeButtonStyle(active: boolean): CSSProperties {
  return {
    borderRadius: 8,
    border: "1px solid #d1d5db",
    background: active ? "var(--brand-primary-soft)" : "#fff",
    color: active ? "var(--brand-hover)" : "#111827",
    padding: "8px 10px",
    cursor: "pointer",
    fontWeight: active ? 700 : 500,
  };
}

const errorStyle: CSSProperties = {
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#991b1b",
  borderRadius: 10,
  padding: "10px 12px",
};

const cardsWrapStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const cardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  background: "#fff",
  padding: 14,
  display: "grid",
  gap: 4,
};

const cardLabelStyle: CSSProperties = {
  color: "#6b7280",
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const cardValueStyle: CSSProperties = {
  color: "#111827",
  fontSize: 26,
  lineHeight: 1.15,
};

const cardSubStyle: CSSProperties = {
  color: "#9ca3af",
  fontSize: 11,
};

const panelStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  background: "#fff",
  padding: 14,
};

const tableHeaderStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "32px 2fr 90px 120px 120px",
  gap: 10,
  padding: "8px 12px",
  background: "#f9fafb",
  borderBottom: "1px solid #e5e7eb",
  fontWeight: 700,
  fontSize: 12,
  color: "#374151",
};

const tableRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "32px 2fr 90px 120px 120px",
  gap: 10,
  padding: "9px 12px",
  borderTop: "1px solid #f3f4f6",
  fontSize: 13,
  alignItems: "center",
};
