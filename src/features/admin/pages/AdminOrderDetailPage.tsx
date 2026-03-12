import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Link, useParams } from "react-router-dom";

import { useRestaurant } from "../../../restaurant/RestaurantContext";
import {
  getOrderDetail,
  type AdminOrderDetail,
  type AdminOrderDetailItem,
} from "../services/orderDetailService";

const cardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  background: "#ffffff",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
  display: "grid",
  gap: 14,
  padding: 16,
};

const cardHeaderStyle: CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 700,
  color: "#111827",
};

function formatTitleCase(raw: string | null | undefined): string {
  const value = String(raw ?? "").trim();
  if (!value) {
    return "-";
  }

  const withSpaces = value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return withSpaces.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatMoney(value: number | null | undefined): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) {
    return "0,00 EUR";
  }

  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatMoneyOrDash(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "-";
  }
  return formatMoney(value);
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-ES", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatPaymentMethod(method: string | null): string {
  if (method === "cash") {
    return "Cash";
  }
  if (method === "card_online") {
    return "Card online";
  }
  if (method === "card_on_delivery") {
    return "Card on delivery";
  }
  return method || "-";
}

function formatOrderType(value: string | null): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return "-";
  }
  if (normalized === "dine_in") {
    return "Dine-in";
  }
  if (normalized === "takeaway" || normalized === "pickup") {
    return "Pickup";
  }
  return formatTitleCase(normalized);
}

function formatOrderStatus(value: string | null): string {
  return formatTitleCase(value);
}

function getStatusBadgeStyle(status: string | null): CSSProperties {
  const key = String(status ?? "").trim().toLowerCase();
  const palette: Record<string, { background: string; border: string; color: string }> = {
    pending: { background: "#fff7ed", border: "#fed7aa", color: "#9a3412" },
    accepted: { background: "#eff6ff", border: "#bfdbfe", color: "#1d4ed8" },
    preparing: { background: "#fefce8", border: "#fde68a", color: "#854d0e" },
    ready: { background: "#ecfdf5", border: "#86efac", color: "#166534" },
    out_for_delivery: { background: "#eff6ff", border: "#93c5fd", color: "#1e40af" },
    delivered: { background: "#f0fdf4", border: "#86efac", color: "#166534" },
    cancelled: { background: "#fef2f2", border: "#fca5a5", color: "#b91c1c" },
  };

  const resolved = palette[key] ?? {
    background: "#f9fafb",
    border: "#e5e7eb",
    color: "#374151",
  };

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: `1px solid ${resolved.border}`,
    background: resolved.background,
    color: resolved.color,
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: "nowrap",
  };
}

function formatExtras(extras: any[] | null): string[] {
  if (!extras || extras.length === 0) {
    return [];
  }

  return extras
    .map((entry) => {
      const row = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
      const name = String(row.name ?? row.option_name ?? row.ingredient_name ?? "Extra").trim();
      const price = Number(row.price ?? 0);
      if (!name) {
        return "";
      }
      return Number.isFinite(price) && price > 0 ? `${name} (+${formatMoney(price)})` : name;
    })
    .filter((value) => value.length > 0);
}

function formatDeliveryNotes(notes: string | null): string {
  const raw = String(notes ?? "").trim();
  if (!raw) {
    return "-";
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return raw;
    }

    const hiddenKeys = new Set([
      "pos",
      "dine_in",
      "pickup",
      "delivery",
      "web",
      "qr_table",
      "source",
      "table",
      "table_id",
      "flags",
    ]);

    const values = Object.entries(parsed as Record<string, unknown>)
      .filter(([key, value]) => !hiddenKeys.has(key.toLowerCase()) && typeof value === "string")
      .map(([, value]) => String(value).trim())
      .filter((value) => value.length > 0);

    return values.length > 0 ? values.join(" · ") : "-";
  } catch {
    return raw;
  }
}

function KeyValueGrid({ rows }: { rows: Array<{ label: string; value: ReactNode }> }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(130px, 170px) minmax(0, 1fr)",
        gap: "10px 14px",
        alignItems: "start",
      }}
    >
      {rows.map((row) => (
        <div key={row.label} style={{ display: "contents" }}>
          <dt style={{ margin: 0, color: "#6b7280", fontSize: 13, fontWeight: 600 }}>{row.label}</dt>
          <dd style={{ margin: 0, color: "#111827", fontSize: 14, fontWeight: 500, wordBreak: "break-word" }}>
            {row.value}
          </dd>
        </div>
      ))}
    </div>
  );
}

function PaymentRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 10 }}>
      <span style={{ color: "#6b7280", fontSize: 13, fontWeight: 600 }}>{label}</span>
      <span
        style={{
          color: "#111827",
          fontSize: strong ? 16 : 14,
          fontWeight: strong ? 700 : 600,
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function renderItemRow(item: AdminOrderDetailItem) {
  const extras = formatExtras(item.snapshotExtras);
  return (
    <article
      key={item.id}
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        background: "#ffffff",
        padding: 12,
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <strong style={{ margin: 0, fontSize: 15, color: "#111827" }}>
          {item.qty}x {item.name}
        </strong>
        <strong style={{ margin: 0, fontSize: 15, color: "#111827", fontVariantNumeric: "tabular-nums" }}>
          {formatMoney(item.lineTotal)}
        </strong>
      </div>
      {extras.length > 0 ? (
        <p style={{ margin: 0, color: "#4b5563", fontSize: 13, lineHeight: 1.45 }}>{extras.join(" · ")}</p>
      ) : null}
      {item.itemNotes ? (
        <p style={{ margin: 0, color: "#4b5563", fontSize: 13, lineHeight: 1.45 }}>{item.itemNotes}</p>
      ) : null}
    </article>
  );
}

export default function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { adminPath } = useRestaurant();
  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function run() {
      if (!id) {
        if (!mounted) {
          return;
        }
        setError("Pedido no encontrado");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const detail = await getOrderDetail(id);
        if (!mounted) {
          return;
        }
        setOrder(detail);
      } catch (err) {
        if (!mounted) {
          return;
        }
        const message = err instanceof Error ? err.message : "No se pudo cargar el detalle";
        setError(message);
        setOrder(null);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void run();
    return () => {
      mounted = false;
    };
  }, [id]);

  const items = useMemo(() => order?.items ?? [], [order?.items]);

  if (loading) {
    return <section style={{ padding: 20 }}>Cargando detalle...</section>;
  }

  if (error) {
    return (
      <section style={{ padding: 20, display: "grid", gap: 10 }}>
        <Link to={`${adminPath}/orders`}>Volver</Link>
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
          {error}
        </div>
      </section>
    );
  }

  if (!order) {
    return (
      <section style={{ padding: 20, display: "grid", gap: 10 }}>
        <Link to={`${adminPath}/orders`}>Volver</Link>
        <p>Pedido no encontrado.</p>
      </section>
    );
  }

  const subtotal = items.reduce((sum, item) => sum + Number(item.lineTotal ?? 0), 0);

  return (
    <section style={{ display: "grid", gap: 18 }}>
      <style>{`
        .order-detail-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }
        .order-detail-content-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }
        @media (max-width: 900px) {
          .order-detail-content-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <header className="order-detail-header">
        <div style={{ display: "grid", gap: 8 }}>
          <Link
            to={`${adminPath}/orders`}
            style={{
              color: "#475569",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 600,
              width: "fit-content",
            }}
          >
            Volver a pedidos
          </Link>
          <h1 style={{ margin: 0, color: "#111827", fontSize: 28, lineHeight: 1.1, letterSpacing: -0.4 }}>
            Pedido #{order.id.slice(0, 8)}
          </h1>
          <p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>{formatDateTime(order.createdAt)}</p>
        </div>

        <div style={{ display: "grid", gap: 10, justifyItems: "end" }}>
          <span style={getStatusBadgeStyle(order.status)}>{formatOrderStatus(order.status)}</span>
          <div style={{ minHeight: 32 }} />
        </div>
      </header>

      <div className="order-detail-content-grid">
        <section style={cardStyle}>
          <h3 style={cardHeaderStyle}>Order Summary</h3>
          <dl style={{ margin: 0 }}>
            <KeyValueGrid
              rows={[
                { label: "Customer", value: order.customerName || "-" },
                { label: "Phone", value: order.customerPhone || "-" },
                { label: "Order Type", value: formatOrderType(order.orderType) },
                { label: "Status", value: formatOrderStatus(order.status) },
                { label: "Date", value: formatDateTime(order.createdAt) },
              ]}
            />
          </dl>
        </section>

        <section style={cardStyle}>
          <h3 style={cardHeaderStyle}>Delivery</h3>
          <dl style={{ margin: 0 }}>
            <KeyValueGrid
              rows={[
                { label: "Address", value: order.address || "-" },
                { label: "Notes", value: formatDeliveryNotes(order.notes) },
              ]}
            />
          </dl>
        </section>
      </div>

      <section style={cardStyle}>
        <h3 style={cardHeaderStyle}>Payment</h3>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center" }}>
            <span style={{ color: "#6b7280", fontSize: 13, fontWeight: 600 }}>Payment Method</span>
            <strong style={{ color: "#111827", fontSize: 14, fontWeight: 600 }}>
              {formatPaymentMethod(order.paymentMethod)}
            </strong>
          </div>

          <div style={{ borderTop: "1px solid #e5e7eb", marginTop: 2, paddingTop: 12, display: "grid", gap: 10 }}>
            <PaymentRow label="Subtotal" value={formatMoney(subtotal)} />
            <PaymentRow label="Delivery Fee" value={formatMoney(order.shipping)} />
            {order.discountAmount > 0 ? (
              <PaymentRow
                label={`Discount${order.couponCode ? ` (${order.couponCode})` : ""}`}
                value={`-${formatMoney(order.discountAmount)}`}
              />
            ) : null}
            {order.tipAmount > 0 ? <PaymentRow label="Tip" value={formatMoney(order.tipAmount)} /> : null}
            <div style={{ borderTop: "1px solid #e5e7eb", marginTop: 2, paddingTop: 10 }}>
              <PaymentRow label="Total" value={formatMoney(order.total)} strong />
            </div>
            {order.paymentMethod === "cash" ? (
              <>
                <PaymentRow label="Cash Given" value={formatMoneyOrDash(order.cashGiven)} />
                <PaymentRow label="Change" value={formatMoneyOrDash(order.changeDue)} />
              </>
            ) : null}
          </div>
        </div>
      </section>

      <section style={cardStyle}>
        <h3 style={cardHeaderStyle}>Items</h3>
        {items.length === 0 ? (
          <div
            style={{
              border: "1px dashed #d1d5db",
              borderRadius: 10,
              background: "#f9fafb",
              padding: "20px 16px",
              display: "grid",
              gap: 4,
            }}
          >
            <p style={{ margin: 0, fontSize: 15, color: "#111827", fontWeight: 600 }}>No items in this order</p>
            <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
              This order does not contain any products.
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>{items.map((item) => renderItemRow(item))}</div>
        )}
      </section>
    </section>
  );
}
