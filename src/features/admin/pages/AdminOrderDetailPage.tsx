import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useRestaurant } from "../../../restaurant/RestaurantContext";
import {
  getOrderDetail,
  type AdminOrderDetail,
  type AdminOrderDetailItem,
} from "../services/orderDetailService";

function formatMoney(value: number | null | undefined): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) {
    return "0.00 EUR";
  }
  return `${amount.toFixed(2)} EUR`;
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
    return "Efectivo";
  }
  if (method === "card_online") {
    return "Tarjeta online";
  }
  if (method === "card_on_delivery") {
    return "Tarjeta en entrega";
  }
  return method || "-";
}

function formatExtras(extras: any[] | null): string {
  if (!extras || extras.length === 0) {
    return "-";
  }

  return extras
    .map((entry) => {
      const row = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
      const name = String(row.name ?? row.option_name ?? row.ingredient_name ?? "Extra");
      const price = Number(row.price ?? 0);
      return Number.isFinite(price) && price > 0 ? `${name} (+${price.toFixed(2)} EUR)` : name;
    })
    .join(", ");
}

function renderItemCard(item: AdminOrderDetailItem) {
  return (
    <article
      key={item.id}
      style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, display: "grid", gap: 6 }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: 8 }}>
        <strong>Cantidad</strong>
        <span>{item.qty}</span>
        <strong>Nombre</strong>
        <span>{item.name}</span>
        <strong>Notas item</strong>
        <span>{item.itemNotes || "-"}</span>
        <strong>Extras</strong>
        <span>{formatExtras(item.snapshotExtras)}</span>
        <strong>Base price</strong>
        <span>{formatMoney(item.basePrice)}</span>
        <strong>Extras total</strong>
        <span>{formatMoney(item.extrasTotal)}</span>
        <strong>Line total</strong>
        <span>{formatMoney(item.lineTotal)}</span>
      </div>
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

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <Link to={`${adminPath}/orders`}>Volver a pedidos</Link>

      <header style={{ display: "grid", gap: 6 }}>
        <h2 style={{ margin: 0 }}>Pedido #{order.id.slice(0, 8)}</h2>
        <div style={{ color: "#6b7280" }}>{formatDateTime(order.createdAt)}</div>
      </header>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, display: "grid", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Resumen</h3>
        <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: 8 }}>
          <strong>Cliente</strong>
          <span>{order.customerName || "-"}</span>
          <strong>Telefono</strong>
          <span>{order.customerPhone || "-"}</span>
          <strong>Tipo pedido</strong>
          <span>{order.orderType || "-"}</span>
          <strong>Estado</strong>
          <span>{order.status || "-"}</span>
          <strong>Fecha</strong>
          <span>{formatDateTime(order.createdAt)}</span>
        </div>
      </section>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, display: "grid", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Entrega</h3>
        <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: 8 }}>
          <strong>Direccion</strong>
          <span>{order.address || "-"}</span>
          <strong>Notas</strong>
          <span>{order.notes || "-"}</span>
        </div>
      </section>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, display: "grid", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Pago</h3>
        <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: 8 }}>
          <strong>Metodo</strong>
          <span>{formatPaymentMethod(order.paymentMethod)}</span>
          <strong>Total</strong>
          <span>{formatMoney(order.total)}</span>
          <strong>Envio</strong>
          <span>{formatMoney(order.shipping)}</span>
          {order.discountAmount > 0 ? (
            <>
              <strong>Cupón</strong>
              <span style={{ color: "#166534", fontWeight: 600 }}>
                {order.couponCode ? `${order.couponCode} · ` : ""}-{formatMoney(order.discountAmount)}
              </span>
            </>
          ) : null}
          {order.tipAmount > 0 ? (
            <>
              <strong>Propina</strong>
              <span>{formatMoney(order.tipAmount)}</span>
            </>
          ) : null}
          {order.paymentMethod === "cash" ? (
            <>
              <strong>Efectivo</strong>
              <span>{formatMoney(order.cashGiven)}</span>
              <strong>Cambio</strong>
              <span>{formatMoney(order.changeDue)}</span>
            </>
          ) : null}
        </div>
      </section>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, display: "grid", gap: 10 }}>
        <h3 style={{ margin: 0 }}>Items</h3>
        {items.length === 0 ? (
          <p style={{ margin: 0, color: "#6b7280" }}>Sin items.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>{items.map((item) => renderItemCard(item))}</div>
        )}
      </section>
    </section>
  );
}
