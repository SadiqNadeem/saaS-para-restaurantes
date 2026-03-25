import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../../restaurant/RestaurantContext";
import { DiagnosticsWidget } from "../components/DiagnosticsWidget";

type RangeKey = "today" | "7d" | "30d";

type SetupStatus = {
  loaded: boolean;
  hasProducts: boolean;
  hasOpenHours: boolean;
  hasDeliveryRadius: boolean;
  hasPaymentMethod: boolean;
  hasSEO: boolean;
};

const SETUP_EMPTY: SetupStatus = {
  loaded: false,
  hasProducts: false,
  hasOpenHours: false,
  hasDeliveryRadius: false,
  hasPaymentMethod: false,
  hasSEO: false,
};

type MetricsStatus = {
  pending: number;
  delivered: number;
  cancelled: number;
};

type TimeseriesPoint = {
  day: string;
  orders: number;
  revenue: number;
};

type MetricsData = {
  totalOrders: number;
  totalRevenue: number;
  avgTicket: number;
  status: MetricsStatus;
  timeseries: TimeseriesPoint[];
};

type RecentOrder = {
  id: string;
  created_at: string | null;
  status: string | null;
  total: number | null;
  customer_name: string | null;
  order_type: string | null;
  source: string | null;
  payment_method: string | null;
};

type HourlyPoint = {
  hour: string;
  pedidos: number;
};

type ComparisonValue = { orders: number; revenue: number; avgTicket: number };
type ComparisonStats = { today: ComparisonValue; lastWeek: ComparisonValue };
type WeeklyBarPoint = { day: string; estaS: number; semAnt: number };

const STATUS_MAP: Record<string, { label: string; bg: string; color: string }> = {
  pending: { label: "Pendiente", bg: "#fef3c7", color: "#92400e" },
  accepted: { label: "Aceptado", bg: "#dbeafe", color: "#1e40af" },
  preparing: { label: "Preparando", bg: "#ffedd5", color: "#9a3412" },
  ready: { label: "Listo", bg: "#ede9fe", color: "#5b21b6" },
  out_for_delivery: { label: "En camino", bg: "#e0e7ff", color: "#3730a3" },
  delivered: { label: "Entregado", bg: "#dcfce7", color: "#14532d" },
  cancelled: { label: "Cancelado", bg: "#fee2e2", color: "#7f1d1d" },
};

function statusChipStyle(status: string | null): { label: string; style: CSSProperties } {
  const s = STATUS_MAP[status ?? ""] ?? { label: status ?? "-", bg: "#f3f4f6", color: "#374151" };
  return {
    label: s.label,
    style: {
      display: "inline-block",
      background: s.bg,
      color: s.color,
      borderRadius: 999,
      padding: "3px 9px",
      fontSize: 12,
      fontWeight: 700,
      whiteSpace: "nowrap",
    },
  };
}

function shortOrderId(id: string): string {
  const value = String(id ?? "").trim().toUpperCase();
  if (!value) return "N/A";
  return value.slice(0, 8);
}

function orderTypeLabel(value: string | null | undefined): string {
  const raw = String(value ?? "").toLowerCase();
  if (!raw) return "Sin tipo";
  if (raw === "delivery" || raw === "domicilio") return "Domicilio";
  if (raw === "pickup" || raw === "takeaway" || raw === "recoger") return "Recoger";
  if (raw === "dine_in" || raw === "table" || raw === "mesa") return "Mesa";
  return String(value);
}

function sourceLabel(value: string | null | undefined): string {
  const raw = String(value ?? "").toLowerCase();
  if (!raw) return "Canal no definido";
  if (raw === "pos") return "TPV";
  if (raw === "qr_table") return "Mesa QR";
  if (raw === "web") return "Web";
  return String(value);
}

function paymentMethodLabel(value: string | null | undefined): string {
  const raw = String(value ?? "").toLowerCase();
  if (!raw) return "Pago no indicado";
  if (raw === "cash" || raw === "efectivo") return "Efectivo";
  if (raw === "card" || raw === "tarjeta") return "Tarjeta";
  if (raw === "card_online" || raw === "online" || raw === "stripe") return "Online";
  if (raw === "card_on_delivery") return "Tarjeta";
  return String(value);
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value);
}

function formatInt(value: number): string {
  return new Intl.NumberFormat("es-ES").format(value);
}

function formatTime(value: string | null): string {
  if (!value) return "--:--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--:--";
  return new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(d);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function toDateParam(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDayLabel(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit" }).format(date);
}

function getRange(key: RangeKey) {
  const now = new Date();
  const tomorrowStart = addDays(startOfDay(now), 1);

  if (key === "today") {
    const from = startOfDay(now);
    return { from, to: tomorrowStart };
  }

  if (key === "7d") {
    const from = addDays(startOfDay(now), -6);
    return { from, to: tomorrowStart };
  }

  const from = addDays(startOfDay(now), -29);
  return { from, to: tomorrowStart };
}

function parseMetricsResponse(data: unknown): MetricsData {
  const rootCandidate = Array.isArray(data) ? data[0] : data;
  const root = asRecord(rootCandidate);

  const statusRaw = asRecord(root.status);
  const timeseriesRaw = Array.isArray(root.timeseries) ? root.timeseries : [];

  const timeseries = timeseriesRaw.map((entry) => {
    const row = asRecord(entry);
    return {
      day: toDayLabel(row.day),
      orders: Math.max(0, Math.round(toNumber(row.orders))),
      revenue: Math.max(0, toNumber(row.revenue)),
    };
  });

  return {
    totalOrders: Math.max(0, Math.round(toNumber(root.total_orders))),
    totalRevenue: Math.max(0, toNumber(root.total_revenue)),
    avgTicket: Math.max(0, toNumber(root.avg_ticket)),
    status: {
      pending: Math.max(0, Math.round(toNumber(statusRaw.pending))),
      delivered: Math.max(0, Math.round(toNumber(statusRaw.delivered))),
      cancelled: Math.max(0, Math.round(toNumber(statusRaw.cancelled))),
    },
    timeseries,
  };
}

const EMPTY_DATA: MetricsData = {
  totalOrders: 0,
  totalRevenue: 0,
  avgTicket: 0,
  status: { pending: 0, delivered: 0, cancelled: 0 },
  timeseries: [],
};

function deltaPct(today: number, lastWeek: number): number | null {
  if (lastWeek === 0) return null;
  return ((today - lastWeek) / lastWeek) * 100;
}

export default function AdminDashboardPage() {
  const { restaurantId, adminPath } = useRestaurant();
  const [rangeKey, setRangeKey] = useState<RangeKey>("today");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<MetricsData>(EMPTY_DATA);

  const [isAcceptingOrders, setIsAcceptingOrders] = useState<boolean | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [hourlyData, setHourlyData] = useState<HourlyPoint[]>([]);
  const [setup, setSetup] = useState<SetupStatus>(SETUP_EMPTY);
  const [abandonedStats, setAbandonedStats] = useState<{ total: number; recovered: number; rate: number } | null>(null);
  const [reviewsStats, setReviewsStats] = useState<{ total: number; avg: number; dist: number[] } | null>(null);

  // New: comparison & weekly chart state
  const [compStats, setCompStats] = useState<ComparisonStats | null>(null);
  const [weeklyBarData, setWeeklyBarData] = useState<WeeklyBarPoint[]>([]);
  const [loading14d, setLoading14d] = useState(true);

  // Metrics RPC
  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoading(true);
      setError(null);

      const range = getRange(rangeKey);
      const fromDate = toDateParam(range.from);
      const toDate = toDateParam(addDays(range.to, -1));
      const { data, error: rpcError } = await supabase.rpc("get_admin_metrics", {
        p_restaurant_id: restaurantId,
        p_from: fromDate,
        p_to: toDate,
      });

      if (!alive) return;

      if (rpcError) {
        setError(rpcError.message || "No se pudieron cargar metricas.");
        setMetrics(EMPTY_DATA);
        setLoading(false);
        return;
      }

      setMetrics(parseMetricsResponse(data));
      setLoading(false);
    };

    void load();
    return () => {
      alive = false;
    };
  }, [rangeKey, restaurantId]);

  // Settings + recent orders (only once per restaurant)
  useEffect(() => {
    let alive = true;

    const loadExtra = async () => {
      const [settingsResult, ordersResult] = await Promise.all([
        supabase
          .from("restaurant_settings")
          .select("is_accepting_orders")
          .eq("restaurant_id", restaurantId)
          .maybeSingle(),
        supabase
          .from("orders")
          .select("id,created_at,status,total,customer_name,order_type,source,payment_method")
          .eq("restaurant_id", restaurantId)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      if (!alive) return;

      const settingsRow = settingsResult.data as { is_accepting_orders?: unknown } | null;
      if (settingsRow && typeof settingsRow.is_accepting_orders === "boolean") {
        setIsAcceptingOrders(settingsRow.is_accepting_orders);
      } else {
        setIsAcceptingOrders(null);
      }

      const rawOrders = Array.isArray(ordersResult.data) ? ordersResult.data : [];
      setRecentOrders(
        rawOrders.map((o) => {
          const r = asRecord(o);
          return {
            id: String(r.id ?? ""),
            created_at: typeof r.created_at === "string" ? r.created_at : null,
            status: typeof r.status === "string" ? r.status : null,
            total: typeof r.total === "number" ? r.total : null,
            customer_name: typeof r.customer_name === "string" ? r.customer_name : null,
            order_type: typeof r.order_type === "string" ? r.order_type : null,
            source: typeof r.source === "string" ? r.source : null,
            payment_method: typeof r.payment_method === "string" ? r.payment_method : null,
          };
        })
      );
    };

    void loadExtra();
    return () => {
      alive = false;
    };
  }, [restaurantId]);

  // Setup checklist - runs once per restaurant
  useEffect(() => {
    let alive = true;

    const loadSetup = async () => {
      const [productsRes, hoursRes, settingsRes, restaurantRes] = await Promise.all([
        supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", restaurantId)
          .eq("is_active", true),
        supabase
          .from("restaurant_hours")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", restaurantId)
          .eq("is_open", true),
        supabase
          .from("restaurant_settings")
          .select("delivery_radius_km, allow_cash, allow_card, allow_card_on_delivery, allow_card_online")
          .eq("restaurant_id", restaurantId)
          .maybeSingle(),
        supabase
          .from("restaurants")
          .select("meta_title")
          .eq("id", restaurantId)
          .maybeSingle(),
      ]);

      if (!alive) return;

      const s = settingsRes.data as {
        delivery_radius_km?: number;
        allow_cash?: boolean;
        allow_card?: boolean;
        allow_card_on_delivery?: boolean;
        allow_card_online?: boolean;
      } | null;

      const r = restaurantRes.data as { meta_title?: string | null } | null;

      setSetup({
        loaded: true,
        hasProducts: (productsRes.count ?? 0) > 0,
        hasOpenHours: (hoursRes.count ?? 0) > 0,
        hasDeliveryRadius: (s?.delivery_radius_km ?? 0) > 0,
        hasPaymentMethod:
          Boolean(s?.allow_cash) ||
          Boolean(s?.allow_card) ||
          Boolean(s?.allow_card_on_delivery) ||
          Boolean(s?.allow_card_online),
        hasSEO: Boolean(r?.meta_title),
      });
    };

    void loadSetup();
    return () => { alive = false; };
  }, [restaurantId]);

  // Abandoned cart stats - last 30 days
  useEffect(() => {
    let alive = true;

    const load = async () => {
      const from = new Date();
      from.setDate(from.getDate() - 29);
      from.setHours(0, 0, 0, 0);

      const { data } = await supabase
        .from("abandoned_carts")
        .select("recovered")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", from.toISOString());

      if (!alive) return;

      const rows = Array.isArray(data) ? (data as { recovered: boolean }[]) : [];
      if (rows.length === 0) return;

      const recovered = rows.filter((r) => r.recovered).length;
      const total = rows.length;
      const rate = total > 0 ? Math.round((recovered / total) * 100) : 0;
      setAbandonedStats({ total, recovered, rate });
    };

    void load();
    return () => { alive = false; };
  }, [restaurantId]);

  // Reviews summary
  useEffect(() => {
    let alive = true;

    const load = async () => {
      const { data } = await supabase
        .from("reviews")
        .select("rating")
        .eq("restaurant_id", restaurantId)
        .limit(200);

      if (!alive) return;
      const rows = Array.isArray(data) ? (data as { rating: number }[]) : [];
      if (rows.length === 0) return;

      const dist = [1, 2, 3, 4, 5].map((s) => rows.filter((r) => r.rating === s).length);
      const avg = rows.reduce((sum, r) => sum + r.rating, 0) / rows.length;
      setReviewsStats({ total: rows.length, avg, dist });
    };

    void load();
    return () => { alive = false; };
  }, [restaurantId]);

  // 14-day data: comparison stats + weekly chart + peak hours
  useEffect(() => {
    let alive = true;
    setLoading14d(true);

    const now = new Date();
    const from = addDays(startOfDay(now), -13);
    const to = addDays(startOfDay(now), 1);
    const todayStr = toDateParam(startOfDay(now));
    const lastWeekStr = toDateParam(addDays(startOfDay(now), -7));

    supabase
      .from("orders")
      .select("created_at,total")
      .eq("restaurant_id", restaurantId)
      .neq("status", "cancelled")
      .gte("created_at", from.toISOString())
      .lt("created_at", to.toISOString())
      .then(({ data }) => {
        if (!alive) return;

        const orders = (Array.isArray(data) ? data : []) as { created_at: string | null; total: number | null }[];

        const summarize = (os: typeof orders): ComparisonValue => {
          const count = os.length;
          const rev = os.reduce((s, o) => s + (o.total ?? 0), 0);
          return { orders: count, revenue: rev, avgTicket: count > 0 ? rev / count : 0 };
        };

        const todayOrders = orders.filter(
          (o) => o.created_at && toDateParam(new Date(o.created_at)) === todayStr
        );
        const lastWeekOrders = orders.filter(
          (o) => o.created_at && toDateParam(new Date(o.created_at)) === lastWeekStr
        );
        setCompStats({ today: summarize(todayOrders), lastWeek: summarize(lastWeekOrders) });

        // Weekly bar: last 7 days vs prior 7 days
        const weeklyPoints: WeeklyBarPoint[] = [];
        for (let i = 6; i >= 0; i--) {
          const thisDay = addDays(startOfDay(now), -i);
          const prevDay = addDays(startOfDay(now), -i - 7);
          const thisDayStr = toDateParam(thisDay);
          const prevDayStr = toDateParam(prevDay);
          const estaS = orders
            .filter((o) => o.created_at && toDateParam(new Date(o.created_at)) === thisDayStr)
            .reduce((s, o) => s + (o.total ?? 0), 0);
          const semAnt = orders
            .filter((o) => o.created_at && toDateParam(new Date(o.created_at)) === prevDayStr)
            .reduce((s, o) => s + (o.total ?? 0), 0);
          weeklyPoints.push({
            day: new Intl.DateTimeFormat("es-ES", { weekday: "short" }).format(thisDay),
            estaS,
            semAnt,
          });
        }
        setWeeklyBarData(weeklyPoints);

        // Hourly distribution (last 14 days, only hours with ≥1 order)
        const counts = Array<number>(24).fill(0);
        for (const o of orders) {
          if (!o.created_at) continue;
          const h = new Date(o.created_at).getHours();
          if (h >= 0 && h < 24) counts[h]++;
        }
        setHourlyData(
          counts
            .map((pedidos, i) => ({ hour: `${String(i).padStart(2, "0")}h`, pedidos }))
            .filter((p) => p.pedidos > 0)
        );

        setLoading14d(false);
      });

    return () => { alive = false; };
  }, [restaurantId]);

  const maxOrders = useMemo(() => Math.max(1, ...metrics.timeseries.map((p) => p.orders)), [metrics.timeseries]);

  const isNotAccepting = isAcceptingOrders === false;

  const checklistItems = setup.loaded
    ? [
        { label: "Restaurante creado", done: true, link: null },
        { label: "Al menos 1 producto activo", done: setup.hasProducts, link: `${adminPath}/products` },
        { label: "Horarios configurados", done: setup.hasOpenHours, link: `${adminPath}/settings` },
        { label: "Radio de delivery guardado", done: setup.hasDeliveryRadius, link: `${adminPath}/settings` },
        { label: "Metodo de pago configurado", done: setup.hasPaymentMethod, link: `${adminPath}/settings` },
        { label: "SEO configurado", done: setup.hasSEO, link: `${adminPath}/settings` },
      ]
    : [];

  const completedCount = checklistItems.filter((i) => i.done).length;
  const allDone = completedCount === checklistItems.length;

  return (
    <section style={{ display: "grid", gap: 16 }}>
      {/* Diagnostics widget */}
      <DiagnosticsWidget />

      {/* Setup checklist - hidden once everything is configured */}
      {setup.loaded && !allDone ? (
        <div
          style={{
            border: "1px solid var(--brand-primary-border, rgba(23,33,43,0.20))",
            background: "var(--brand-primary-soft, rgba(23,33,43,0.08))",
            borderRadius: 12,
            padding: "14px 16px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <strong style={{ fontSize: 14, color: "#111827" }}>
              Configura tu restaurante
            </strong>
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "var(--color-primary, #17212B)",
                background: "#fff",
                border: "1px solid var(--brand-primary-border)",
                borderRadius: 999,
                padding: "2px 10px",
              }}
            >
              {completedCount}/{checklistItems.length} completado
            </span>
          </div>

          <div
            style={{
              height: 4,
              background: "rgba(255,255,255,0.6)",
              borderRadius: 4,
              overflow: "hidden",
              marginBottom: 12,
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${(completedCount / checklistItems.length) * 100}%`,
                background: "var(--color-primary, #17212B)",
                borderRadius: 4,
                transition: "width 0.4s ease",
              }}
            />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            {checklistItems.map((item) => (
              <div
                key={item.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  color: item.done ? "#6b7280" : "#111827",
                  textDecoration: item.done ? "line-through" : "none",
                }}
              >
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    border: item.done ? "none" : "1.5px solid #d1d5db",
                    background: item.done ? "var(--color-success, #16a34a)" : "#fff",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    fontSize: 10,
                    color: "#fff",
                    fontWeight: 900,
                  }}
                >
                  {item.done ? "OK" : ""}
                </span>
                {!item.done && item.link ? (
                  <Link
                    to={item.link}
                    style={{
                      color: "#111827",
                      fontWeight: 600,
                      textDecoration: "underline",
                      textUnderlineOffset: 2,
                    }}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span>{item.label}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* is_accepting_orders alert */}
      {isNotAccepting ? (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            border: "1px solid #fbbf24",
            background: "#fffbeb",
            color: "#78350f",
            borderRadius: 12,
            padding: "12px 16px",
            fontWeight: 600,
          }}
        >
          <span style={{ fontSize: 22 }}></span>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>El restaurante no esta aceptando pedidos</div>
            <div style={{ fontWeight: 400, fontSize: 13 }}>
              Ve a{" "}
              <Link
                to={`${adminPath}/settings`}
                style={{ color: "#92400e", fontWeight: 700, textDecoration: "underline" }}
              >
                Ajustes
              </Link>{" "}
              para activarlo.
            </div>
          </div>
        </div>
      ) : null}

      {/* Abandoned cart recovery widget */}
      {abandonedStats !== null && abandonedStats.total > 0 ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            border: "1px solid #e5e7eb",
            background: "#fff",
            borderRadius: 12,
            padding: "12px 16px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#111827", marginBottom: 2 }}>
              Recuperacion de carritos (30 dias)
            </div>
            <div style={{ fontSize: 13, color: "#6b7280" }}>
              {abandonedStats.recovered} de {abandonedStats.total} carritos recuperados -{" "}
              <strong style={{ color: abandonedStats.rate >= 50 ? "#14532d" : "#92400e" }}>
                {abandonedStats.rate}% tasa de recuperacion
              </strong>
            </div>
          </div>
          <Link
            to={`${adminPath}/abandoned-carts`}
            style={{
              background: "var(--color-accent, #3b82f6)",
              color: "#fff",
              borderRadius: 8,
              padding: "6px 12px",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            Ver carritos
          </Link>
        </div>
      ) : null}

      {/* Reviews summary widget */}
      {reviewsStats !== null && reviewsStats.total > 0 ? (
        <div
          style={{
            border: "1px solid #e5e7eb",
            background: "#fff",
            borderRadius: 12,
            padding: "14px 16px",
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>Reseñas de clientes</div>
              <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>
                <span style={{ color: "#f59e0b", fontWeight: 700, fontSize: 18 }}>{reviewsStats.avg.toFixed(1)}</span>
                <span style={{ color: "#f59e0b", marginLeft: 4 }}>★★★★★</span>
                <span style={{ marginLeft: 6, color: "#9ca3af" }}>({reviewsStats.total} reseñas)</span>
              </div>
            </div>
            <Link
              to={`${adminPath}/reviews`}
              style={{
                background: "#f3f4f6",
                color: "#374151",
                borderRadius: 8,
                padding: "6px 12px",
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
                whiteSpace: "nowrap",
                border: "1px solid #e5e7eb",
              }}
            >
              Ver todas
            </Link>
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            {[5, 4, 3, 2, 1].map((star) => {
              const count = reviewsStats.dist[star - 1];
              const pct = reviewsStats.total > 0 ? (count / reviewsStats.total) * 100 : 0;
              return (
                <div key={star} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                  <span style={{ color: "#6b7280", width: 16, textAlign: "right", flexShrink: 0 }}>{star}</span>
                  <span style={{ color: "#f59e0b", flexShrink: 0 }}>★</span>
                  <div style={{ flex: 1, height: 8, background: "#f3f4f6", borderRadius: 4, overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${pct}%`,
                        background: "#f59e0b",
                        borderRadius: 4,
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                  <span style={{ color: "#9ca3af", width: 24, textAlign: "right", flexShrink: 0 }}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* ── Comparison stat cards: today vs same day last week ── */}
      <div>
        <h2 style={{ margin: "0 0 10px", fontSize: 16 }}>Dashboard</h2>
        {compStats !== null ? (
          <div style={cardsWrapStyle}>
            <ComparisonStatCard
              label="Ventas hoy"
              todayVal={compStats.today.revenue}
              lastWeekVal={compStats.lastWeek.revenue}
              format={formatMoney}
            />
            <ComparisonStatCard
              label="Pedidos hoy"
              todayVal={compStats.today.orders}
              lastWeekVal={compStats.lastWeek.orders}
              format={formatInt}
            />
            <ComparisonStatCard
              label="Ticket medio"
              todayVal={compStats.today.avgTicket}
              lastWeekVal={compStats.lastWeek.avgTicket}
              format={formatMoney}
            />
            {reviewsStats !== null && reviewsStats.total > 0 ? (
              <article style={statCardBase}>
                <div style={statCardLabel}>Reseñas</div>
                <strong style={{ color: "#f59e0b", fontSize: 26, lineHeight: 1.1, fontWeight: 800 }}>
                  {reviewsStats.avg.toFixed(1)} ★
                </strong>
                <div style={{ fontSize: 12, color: "#9ca3af" }}>{reviewsStats.total} reseñas en total</div>
              </article>
            ) : null}
          </div>
        ) : (
          <div style={{ opacity: 0.6, fontSize: 13 }}>Cargando comparativa...</div>
        )}
      </div>

      {/* Range selector for the metrics section below */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(["today", "7d", "30d"] as RangeKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setRangeKey(key)}
            disabled={loading}
            style={rangeButtonStyle(rangeKey === key)}
          >
            {key === "today" ? "Hoy" : key === "7d" ? "Ultimos 7 dias" : "Ultimos 30 dias"}
          </button>
        ))}
      </div>

      {loading ? <div style={{ opacity: 0.8, fontSize: 14 }}>Cargando metricas...</div> : null}

      {error ? (
        <div role="alert" style={alertStyle}>
          {error}
        </div>
      ) : null}

      {/* Stat cards */}
      <div style={cardsWrapStyle}>
        <StatCard label="Pedidos" value={formatInt(metrics.totalOrders)} />
        <StatCard label="Ingresos" value={formatMoney(metrics.totalRevenue)} />
        <StatCard label="Ticket medio" value={formatMoney(metrics.avgTicket)} />
        <StatCard
          label="Pendientes"
          value={formatInt(metrics.status.pending)}
          accent={metrics.status.pending > 0}
        />
      </div>

      {/* Delivered / cancelled chips */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span style={chipStyle}> Entregados: {formatInt(metrics.status.delivered)}</span>
        <span style={{ ...chipStyle, color: "#7f1d1d", background: "#fee2e2", border: "1px solid #fecaca" }}>
          Cancelados: {formatInt(metrics.status.cancelled)}
        </span>
      </div>

      {/* ── Weekly sales comparison chart ── */}
      <section style={panelStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Ventas — esta semana vs semana anterior</h3>
          <div style={{ display: "flex", gap: 14, fontSize: 12, color: "#6b7280" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--brand-primary)", display: "inline-block", flexShrink: 0 }} />
              Esta semana
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: "#d1d5db", display: "inline-block", flexShrink: 0 }} />
              Semana anterior
            </span>
          </div>
        </div>
        {weeklyBarData.length === 0 ? (
          <div style={{ opacity: 0.7, fontSize: 13 }}>Sin datos para las últimas 2 semanas.</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weeklyBarData} margin={{ top: 4, right: 4, left: -4, bottom: 0 }} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 10, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
                width={52}
                tickFormatter={(v: number) => `${v}€`}
              />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
                formatter={(value: number, name: string) => [
                  formatMoney(value),
                  name === "estaS" ? "Esta semana" : "Semana anterior",
                ]}
                cursor={{ fill: "rgba(23,33,43,0.04)" }}
              />
              <Bar dataKey="estaS" name="Esta semana" fill="var(--brand-primary)" radius={[3, 3, 0, 0]} maxBarSize={26} />
              <Bar dataKey="semAnt" name="Semana anterior" fill="#d1d5db" radius={[3, 3, 0, 0]} maxBarSize={26} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>

      {/* ── Peak hours chart — last 14 days ── */}
      <section style={panelStyle}>
        <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Hora punta — últimas 2 semanas</h3>
        {loading14d ? (
          <div style={{ opacity: 0.7, fontSize: 13 }}>Cargando...</div>
        ) : hourlyData.length === 0 ? (
          <div style={{ opacity: 0.75, fontSize: 13 }}>Sin pedidos en los últimos 14 días.</div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={hourlyData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis
                dataKey="hour"
                tick={{ fontSize: 10, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
                width={28}
              />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
                formatter={(value) => [value, "Pedidos"]}
                cursor={{ fill: "rgba(23,33,43,0.06)" }}
              />
              <Bar
                dataKey="pedidos"
                fill="var(--brand-primary)"
                radius={[4, 4, 0, 0]}
                maxBarSize={32}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>

      {/* Daily orders chart - all ranges */}
      <section style={panelStyle}>
        <h3 style={{ margin: "0 0 10px", fontSize: 15 }}>
          {rangeKey === "today" ? "Resumen del dia" : "Pedidos por dia"}
        </h3>
        {metrics.timeseries.length === 0 ? (
          <div style={{ opacity: 0.75, fontSize: 13 }}>Sin datos para el rango seleccionado.</div>
        ) : (
          <div style={chartStyle}>
            {metrics.timeseries.map((point, index) => {
              const height = Math.max(8, (point.orders / maxOrders) * 150);
              return (
                <div key={`${point.day}-${index}`} style={barColumnStyle}>
                  <div title={`${point.day}: ${point.orders} pedidos`} style={{ ...barStyle, height }} />
                  <div style={barValueStyle}>{formatInt(point.orders)}</div>
                  <div style={barLabelStyle}>{point.day}</div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Recent orders */}
      <section style={panelStyle}>
        <style>{`
          .dashboard-order-row {
            display: grid;
            grid-template-columns: minmax(230px, 1.6fr) minmax(210px, 1.1fr) auto;
            align-items: center;
            gap: 14px;
            padding: 12px 14px;
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            background: #ffffff;
            transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
          }
          .dashboard-order-row:hover {
            border-color: #cfd8e3;
            box-shadow: 0 6px 14px rgba(15, 23, 42, 0.08);
            transform: translateY(-1px);
          }
          @media (max-width: 920px) {
            .dashboard-order-row {
              grid-template-columns: 1fr;
              gap: 10px;
            }
            .dashboard-order-right {
              justify-content: space-between;
            }
          }
        `}</style>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Ultimos pedidos</h3>
          <Link
            to={`${adminPath}/orders`}
            style={{ fontSize: 13, color: "var(--color-accent, #3b82f6)", fontWeight: 600, textDecoration: "none" }}
          >
            Ver todos
          </Link>
        </div>

        {recentOrders.length === 0 ? (
          <div style={{ opacity: 0.75, fontSize: 13 }}>No hay pedidos recientes.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {recentOrders.map((order) => {
              const chip = statusChipStyle(order.status);
              const orderRef = `#${shortOrderId(order.id)}`;
              return (
                <article key={order.id} className="dashboard-order-row">
                  <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={chip.style}>{chip.label}</span>
                      <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: 0.3, color: "#1f2937" }}>
                        {orderRef}
                      </span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {order.customer_name || "Cliente sin nombre"}
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>
                      {sourceLabel(order.source)}
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 4, fontSize: 12, color: "#475569" }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span style={metaPillStyle}>Tipo: {orderTypeLabel(order.order_type)}</span>
                      <span style={metaPillStyle}>Hora: {formatTime(order.created_at)}</span>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span style={metaPillStyle}>Pago: {paymentMethodLabel(order.payment_method)}</span>
                    </div>
                  </div>

                  <div className="dashboard-order-right" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <strong style={{ fontWeight: 800, fontSize: 18, color: "#0f172a", letterSpacing: -0.2, whiteSpace: "nowrap" }}>
                      {order.total !== null ? formatMoney(order.total) : "-"}
                    </strong>
                    <Link
                      to={`${adminPath}/orders/${order.id}`}
                      style={{
                        fontSize: 12,
                        color: "#0f172a",
                        fontWeight: 700,
                        textDecoration: "none",
                        whiteSpace: "nowrap",
                        background: "#f8fafc",
                        border: "1px solid #dbe2ea",
                        padding: "7px 11px",
                        borderRadius: 8,
                      }}
                    >
                      Ver detalle
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}

function StatCard({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <article
      style={{
        border: accent ? "1px solid #fbbf24" : "1px solid #e5e7eb",
        borderRadius: 12,
        background: accent ? "#fffbeb" : "#fff",
        padding: "14px 16px",
        display: "grid",
        gap: 6,
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      }}
    >
      <div style={{ color: "#6b7280", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
        {label}
      </div>
      <strong style={{ color: accent ? "#78350f" : "#111827", fontSize: 26, lineHeight: 1.1, fontWeight: 800 }}>
        {value}
      </strong>
    </article>
  );
}

function ComparisonStatCard({
  label,
  todayVal,
  lastWeekVal,
  format,
}: {
  label: string;
  todayVal: number;
  lastWeekVal: number;
  format: (v: number) => string;
}) {
  const delta = deltaPct(todayVal, lastWeekVal);
  const up = delta !== null && delta >= 0;

  return (
    <article style={statCardBase}>
      <div style={statCardLabel}>{label}</div>
      <strong style={{ color: "#111827", fontSize: 26, lineHeight: 1.1, fontWeight: 800 }}>
        {format(todayVal)}
      </strong>
      {delta !== null ? (
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
          <span style={{ color: up ? "#16a34a" : "#dc2626", fontWeight: 700 }}>
            {up ? "↑" : "↓"} {Math.abs(delta).toFixed(1)}%
          </span>
          <span style={{ color: "#9ca3af" }}>vs sem. anterior</span>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "#9ca3af" }}>
          {lastWeekVal === 0 ? "Sin datos sem. anterior" : ""}
        </div>
      )}
    </article>
  );
}

const statCardBase: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  background: "#fff",
  padding: "14px 16px",
  display: "grid",
  gap: 6,
  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
};

const statCardLabel: CSSProperties = {
  color: "#6b7280",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  fontWeight: 600,
};

function rangeButtonStyle(active: boolean): CSSProperties {
  return {
    borderRadius: 8,
    border: active ? "1px solid var(--brand-primary)" : "1px solid #e5e7eb",
    background: active ? "var(--brand-primary-soft)" : "#fff",
    color: active ? "var(--color-primary, #17212B)" : "#374151",
    padding: "7px 12px",
    cursor: "pointer",
    fontWeight: active ? 700 : 500,
    fontSize: 13,
    transition: "all 0.15s ease",
  };
}

const alertStyle: CSSProperties = {
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#991b1b",
  borderRadius: 10,
  padding: "10px 12px",
};

const cardsWrapStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
};

const chipStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 999,
  padding: "5px 12px",
  background: "#f9fafb",
  color: "#374151",
  fontWeight: 600,
  fontSize: 13,
};

const metaPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  border: "1px solid #e2e8f0",
  background: "#f8fafc",
  color: "#475569",
  borderRadius: 999,
  padding: "3px 8px",
  fontSize: 11,
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const panelStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  background: "#fff",
  padding: "14px 16px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
};

const chartStyle: CSSProperties = {
  minHeight: 160,
  display: "flex",
  alignItems: "flex-end",
  gap: 8,
  overflowX: "auto",
  paddingBottom: 8,
};

const barColumnStyle: CSSProperties = {
  minWidth: 34,
  display: "grid",
  justifyItems: "center",
  gap: 4,
  alignContent: "end",
};

const barStyle: CSSProperties = {
  width: 20,
  borderRadius: "6px 6px 0 0",
  background: "linear-gradient(180deg, var(--brand-primary) 0%, var(--brand-hover) 100%)",
};

const barValueStyle: CSSProperties = {
  fontSize: 11,
  color: "#374151",
  fontWeight: 600,
};

const barLabelStyle: CSSProperties = {
  fontSize: 10,
  color: "#9ca3af",
};
