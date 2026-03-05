import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";

import { isOrderStatus, type OrderStatus } from "../../constants/orderStatus";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../../restaurant/RestaurantContext";

type TodaySummary = {
  totalRevenue: number;
  totalOrders: number;
  pendingCount: number;
  totalCash: number;
  totalCard: number;
};

type PendingOrderRow = {
  id: string;
  createdAt: string | null;
  customerName: string;
  orderType: string;
  total: number;
  status: OrderStatus;
};

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toText(value: unknown, fallback = ""): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function formatDateTime(value: string | null): string {
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

function formatDateInput(value: Date): string {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function mapSummaryRow(row: Record<string, unknown> | null): TodaySummary {
  if (!row) {
    return {
      totalRevenue: 0,
      totalOrders: 0,
      pendingCount: 0,
      totalCash: 0,
      totalCard: 0,
    };
  }

  return {
    totalRevenue: toNumber(row.total_revenue ?? row.revenue),
    totalOrders: Math.max(0, Math.round(toNumber(row.total_orders ?? row.orders_count))),
    pendingCount: Math.max(0, Math.round(toNumber(row.pending_count ?? row.pending))),
    totalCash: toNumber(row.total_cash ?? row.cash_total),
    totalCard: toNumber(row.total_card ?? row.card_total),
  };
}

function mapPendingRows(rows: Array<Record<string, unknown>>): PendingOrderRow[] {
  return rows.map((row) => ({
    id: toText(row.id, "-"),
    createdAt: toText(row.created_at) || null,
    customerName: toText(row.customer_name, "Sin nombre"),
    orderType: toText(row.order_type, "-"),
    total: toNumber(row.total),
    status: isOrderStatus(row.status) ? row.status : "pending",
  }));
}

export default function AdminHomePage() {
  const { restaurantId, adminPath } = useRestaurant();
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState<TodaySummary>({
    totalRevenue: 0,
    totalOrders: 0,
    pendingCount: 0,
    totalCash: 0,
    totalCard: 0,
  });
  const [pendingOrders, setPendingOrders] = useState<PendingOrderRow[]>([]);
  const [cashClosedToday, setCashClosedToday] = useState(false);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoading(true);
      setErrorMessage(null);

      const today = formatDateInput(new Date());
      const [summaryResult, pendingResult, closingResult] = await Promise.all([
        supabase
          .from("v_admin_today_summary")
          .select("*")
          .eq("restaurant_id", restaurantId)
          .limit(1)
          .maybeSingle(),
        supabase
          .from("v_admin_pending_orders")
          .select("*")
          .eq("restaurant_id", restaurantId)
          .limit(10),
        supabase
          .from("cash_closings")
          .select("id")
          .eq("restaurant_id", restaurantId)
          .eq("day", today)
          .limit(1)
          .maybeSingle(),
      ]);

      if (!alive) return;

      if (summaryResult.error || pendingResult.error || closingResult.error) {
        const message =
          summaryResult.error?.message ??
          pendingResult.error?.message ??
          closingResult.error?.message ??
          "No se pudo cargar el dashboard.";
        setErrorMessage(message);
        setSummary({
          totalRevenue: 0,
          totalOrders: 0,
          pendingCount: 0,
          totalCash: 0,
          totalCard: 0,
        });
        setPendingOrders([]);
        setCashClosedToday(false);
        setLoading(false);
        return;
      }

      const summaryRow = (summaryResult.data ?? null) as Record<string, unknown> | null;
      const pendingRows = (pendingResult.data ?? []) as Array<Record<string, unknown>>;
      setSummary(mapSummaryRow(summaryRow));
      setPendingOrders(mapPendingRows(pendingRows));
      setCashClosedToday(Boolean(closingResult.data));
      setLoading(false);
    };

    void load();
    return () => {
      alive = false;
    };
  }, [restaurantId]);

  const cards = useMemo(
    () => [
      { label: "Ventas hoy", value: formatMoney(summary.totalRevenue) },
      { label: "Pedidos hoy", value: String(summary.totalOrders) },
      { label: "Pendientes", value: String(summary.pendingCount) },
      { label: "Efectivo / Tarjeta", value: `${formatMoney(summary.totalCash)} / ${formatMoney(summary.totalCard)}` },
      { label: "Caja", value: cashClosedToday ? "Cerrada" : "Abierta" },
    ],
    [cashClosedToday, summary]
  );

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <header style={{ display: "grid", gap: 4 }}>
        <h2 style={{ margin: 0 }}>Dashboard</h2>
        <p style={{ margin: 0, color: "#6b7280" }}>Resumen operativo de hoy.</p>
      </header>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <Link to={`${adminPath}/orders`} style={quickLinkStyle}>
          Ir a Pedidos
        </Link>
        <Link to={`${adminPath}/pos`} style={quickLinkStyle}>
          Ir a Caja
        </Link>
        <Link to={`${adminPath}/products`} style={quickLinkStyle}>
          Ir a Productos
        </Link>
        <Link to={`${adminPath}/categories`} style={quickLinkStyle}>
          Ir a Categorias
        </Link>
      </div>

      {errorMessage ? (
        <div role="alert" style={errorBoxStyle}>
          {errorMessage}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        {cards.map((card) => (
          <article key={card.label} style={cardStyle}>
            <div style={cardLabelStyle}>{card.label}</div>
            <strong style={cardValueStyle}>{loading ? "..." : card.value}</strong>
          </article>
        ))}
      </div>

      <article style={panelStyle}>
        <h3 style={{ margin: 0 }}>Pendientes</h3>
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead>
              <tr style={{ background: "#f9fafb", color: "#374151", textAlign: "left" }}>
                <th style={thStyle}>Hora</th>
                <th style={thStyle}>Pedido</th>
                <th style={thStyle}>Cliente</th>
                <th style={thStyle}>Tipo</th>
                <th style={thStyle}>Total</th>
                <th style={thStyle}>Estado</th>
                <th style={thStyle}>Accion</th>
              </tr>
            </thead>
            <tbody>
              {!loading && pendingOrders.length === 0 ? (
                <tr>
                  <td style={tdStyle} colSpan={7}>
                    No hay pedidos pendientes.
                  </td>
                </tr>
              ) : (
                pendingOrders.map((row) => (
                  <tr key={row.id}>
                    <td style={tdStyle}>{formatDateTime(row.createdAt)}</td>
                    <td style={tdStyle}>{row.id.slice(0, 8)}</td>
                    <td style={tdStyle}>{row.customerName}</td>
                    <td style={tdStyle}>{row.orderType}</td>
                    <td style={tdStyle}>{formatMoney(row.total)}</td>
                    <td style={tdStyle}>{row.status}</td>
                    <td style={tdStyle}>
                      <Link to={`${adminPath}/orders`} style={viewLinkStyle}>
                        Ver
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>
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
  fontSize: 22,
  color: "#111827",
  lineHeight: 1.2,
};

const panelStyle: CSSProperties = {
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

const quickLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  borderRadius: 8,
  border: "1px solid var(--brand-primary)",
  background: "var(--brand-primary)",
  color: "var(--brand-white)",
  padding: "8px 12px",
  fontWeight: 600,
};

const viewLinkStyle: CSSProperties = {
  color: "var(--brand-hover)",
  textDecoration: "underline",
  fontWeight: 600,
};

const errorBoxStyle: CSSProperties = {
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#991b1b",
  padding: 12,
  borderRadius: 10,
};
