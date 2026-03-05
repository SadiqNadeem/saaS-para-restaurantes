import { useEffect, useMemo, useState } from "react";

import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../../restaurant/RestaurantContext";

type RangeKey = "today" | "7d" | "30d";

type AbandonedCart = {
  id: string;
  customer_email: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  cart_items: CartItemSnapshot[];
  cart_total: number;
  order_type: string | null;
  session_id: string | null;
  recovered: boolean;
  recovered_at: string | null;
  created_at: string;
  updated_at: string;
};

type CartItemSnapshot = {
  productId?: string;
  name?: string;
  qty?: number;
  basePrice?: number;
  unitPrice?: number;
  selectedModifiers?: { groupName?: string; options?: { name?: string; price?: number }[] }[];
  extras?: { name?: string; price?: number }[];
};

function getRangeStart(key: RangeKey): Date {
  const now = new Date();
  if (key === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (key === "7d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const d = new Date(now);
  d.setDate(d.getDate() - 29);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function timeSince(value: string): string {
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function cartItemCount(items: CartItemSnapshot[]): number {
  return items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
}

function exportToCSV(carts: AbandonedCart[]): void {
  const headers = [
    "Fecha",
    "Nombre",
    "Teléfono",
    "Email",
    "Items",
    "Total",
    "Tipo",
    "Recuperado",
  ];
  const rows = carts.map((c) => [
    formatDate(c.created_at),
    c.customer_name ?? "",
    c.customer_phone ?? "",
    c.customer_email ?? "",
    cartItemCount(c.cart_items),
    c.cart_total.toFixed(2),
    c.order_type ?? "",
    c.recovered ? "Sí" : "No",
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `carritos_abandonados_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function AdminAbandonedCartsPage() {
  const { restaurantId, name: restaurantName } = useRestaurant();

  const [rangeKey, setRangeKey] = useState<RangeKey>("7d");
  const [showRecovered, setShowRecovered] = useState(false);
  const [carts, setCarts] = useState<AbandonedCart[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);

    const rangeStart = getRangeStart(rangeKey);

    const load = async () => {
      let query = supabase
        .from("abandoned_carts")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", rangeStart.toISOString())
        .order("created_at", { ascending: false });

      if (!showRecovered) {
        query = query.eq("recovered", false);
      }

      const { data, error: dbError } = await query;

      if (!alive) return;

      if (dbError) {
        setError(dbError.message);
        setLoading(false);
        return;
      }

      const rows = (Array.isArray(data) ? data : []) as AbandonedCart[];
      setCarts(rows);
      setLoading(false);
    };

    void load();
    return () => {
      alive = false;
    };
  }, [restaurantId, rangeKey, showRecovered]);

  const stats = useMemo(() => {
    const allInRange = carts;
    const abandoned = allInRange.filter((c) => !c.recovered);
    const recovered = allInRange.filter((c) => c.recovered);
    const totalValue = abandoned.reduce((sum, c) => sum + Number(c.cart_total || 0), 0);
    const total = allInRange.length;
    const rate = total > 0 ? Math.round((recovered.length / total) * 100) : 0;
    return { abandonedCount: abandoned.length, totalValue, recoveryRate: rate, total };
  }, [carts]);

  const buildWhatsAppUrl = (cart: AbandonedCart): string => {
    const phone = (cart.customer_phone ?? "").replace(/\D/g, "");
    const name = cart.customer_name ?? "cliente";
    const msg = encodeURIComponent(
      `Hola ${name}, vimos que dejaste tu pedido a medias en ${restaurantName}. ¿Puedo ayudarte a completarlo? 🛒`
    );
    return `https://wa.me/${phone}?text=${msg}`;
  };

  const statCard = (label: string, value: string | number, sub?: string) => (
    <div
      style={{
        background: "var(--admin-card-bg, #fff)",
        border: "1px solid var(--admin-card-border, #e5e7eb)",
        borderRadius: "var(--admin-radius-md, 12px)",
        padding: "16px 20px",
        display: "grid",
        gap: 4,
      }}
    >
      <div style={{ fontSize: 13, color: "var(--admin-text-secondary, #6b7280)", fontWeight: 500 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: "var(--admin-text-primary, #111827)" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: "var(--admin-text-muted, #9ca3af)" }}>{sub}</div>}
    </div>
  );

  return (
    <section style={{ display: "grid", gap: 20 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <h1 className="admin-panel" style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>
          Carritos abandonados
        </h1>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* Range selector */}
          <select
            value={rangeKey}
            onChange={(e) => setRangeKey(e.target.value as RangeKey)}
            style={{
              border: "1px solid var(--admin-card-border, #e5e7eb)",
              borderRadius: 8,
              padding: "7px 10px",
              fontSize: 13,
              background: "#fff",
            }}
          >
            <option value="today">Hoy</option>
            <option value="7d">Últimos 7 días</option>
            <option value="30d">Últimos 30 días</option>
          </select>

          {/* Toggle recovered */}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              cursor: "pointer",
              userSelect: "none",
              color: "var(--admin-text-secondary, #6b7280)",
            }}
          >
            <input
              type="checkbox"
              checked={showRecovered}
              onChange={(e) => setShowRecovered(e.target.checked)}
              style={{ accentColor: "var(--brand-primary, #4ec580)", width: 15, height: 15 }}
            />
            Mostrar recuperados
          </label>

          {/* Export CSV */}
          <button
            type="button"
            onClick={() => exportToCSV(carts)}
            disabled={carts.length === 0}
            style={{
              border: "1px solid var(--admin-card-border, #e5e7eb)",
              borderRadius: 8,
              padding: "7px 12px",
              fontSize: 13,
              background: "#fff",
              cursor: "pointer",
              fontWeight: 500,
              color: "var(--admin-text-primary, #111827)",
            }}
          >
            ↓ Exportar CSV
          </button>
        </div>
      </div>

      {/* Stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
        }}
      >
        {statCard("Carritos abandonados", stats.abandonedCount)}
        {statCard("Valor total perdido", formatMoney(stats.totalValue), "carritos no recuperados")}
        {statCard(
          "Tasa de recuperación",
          `${stats.recoveryRate}%`,
          `${stats.total} carritos en total`
        )}
      </div>

      {error && (
        <div
          role="alert"
          style={{
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#7f1d1d",
            borderRadius: 10,
            padding: "10px 14px",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {/* Table */}
      <div
        style={{
          background: "var(--admin-card-bg, #fff)",
          border: "1px solid var(--admin-card-border, #e5e7eb)",
          borderRadius: "var(--admin-radius-md, 12px)",
          overflow: "hidden",
        }}
      >
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--admin-text-muted, #9ca3af)", fontSize: 14 }}>
            Cargando carritos...
          </div>
        ) : carts.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--admin-text-muted, #9ca3af)", fontSize: 14 }}>
            No hay carritos abandonados en este período.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr
                style={{
                  background: "var(--admin-content-bg, #f8fafc)",
                  borderBottom: "1px solid var(--admin-card-border, #e5e7eb)",
                }}
              >
                {["Fecha", "Cliente", "Items", "Total", "Tiempo", "Estado", ""].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "10px 14px",
                      textAlign: "left",
                      fontWeight: 600,
                      color: "var(--admin-text-secondary, #6b7280)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {carts.map((cart) => {
                const isExpanded = expandedId === cart.id;
                const items = Array.isArray(cart.cart_items) ? cart.cart_items : [];
                const itemCount = cartItemCount(items);

                return (
                  <>
                    <tr
                      key={cart.id}
                      style={{
                        borderBottom: "1px solid var(--admin-card-border, #e5e7eb)",
                        background: isExpanded ? "var(--admin-content-bg, #f8fafc)" : "#fff",
                        cursor: "pointer",
                      }}
                      onClick={() => setExpandedId(isExpanded ? null : cart.id)}
                    >
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        {formatDate(cart.created_at)}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ fontWeight: 600 }}>{cart.customer_name ?? "—"}</div>
                        {cart.customer_phone && (
                          <div style={{ color: "var(--admin-text-muted, #9ca3af)", fontSize: 12 }}>
                            {cart.customer_phone}
                          </div>
                        )}
                        {cart.customer_email && (
                          <div style={{ color: "var(--admin-text-muted, #9ca3af)", fontSize: 12 }}>
                            {cart.customer_email}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        {itemCount} {itemCount === 1 ? "item" : "items"}
                      </td>
                      <td style={{ padding: "10px 14px", fontWeight: 700 }}>
                        {formatMoney(Number(cart.cart_total))}
                      </td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap", color: "var(--admin-text-muted, #9ca3af)" }}>
                        hace {timeSince(cart.created_at)}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        {cart.recovered ? (
                          <span
                            style={{
                              background: "#dcfce7",
                              color: "#14532d",
                              borderRadius: 999,
                              padding: "3px 10px",
                              fontSize: 12,
                              fontWeight: 700,
                            }}
                          >
                            Recuperado
                          </span>
                        ) : (
                          <span
                            style={{
                              background: "#fee2e2",
                              color: "#7f1d1d",
                              borderRadius: 999,
                              padding: "3px 10px",
                              fontSize: 12,
                              fontWeight: 700,
                            }}
                          >
                            Abandonado
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <div
                          style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {cart.customer_phone && !cart.recovered && (
                            <a
                              href={buildWhatsAppUrl(cart)}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Contactar por WhatsApp"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                background: "#25d366",
                                color: "#fff",
                                borderRadius: 8,
                                padding: "5px 10px",
                                fontSize: 12,
                                fontWeight: 600,
                                textDecoration: "none",
                                whiteSpace: "nowrap",
                              }}
                            >
                              WhatsApp
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => setExpandedId(isExpanded ? null : cart.id)}
                            style={{
                              border: "1px solid var(--admin-card-border, #e5e7eb)",
                              borderRadius: 8,
                              padding: "5px 10px",
                              fontSize: 12,
                              background: "#fff",
                              cursor: "pointer",
                              color: "var(--admin-text-secondary, #6b7280)",
                            }}
                          >
                            {isExpanded ? "▲ Cerrar" : "▼ Ver items"}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${cart.id}-expanded`}>
                        <td
                          colSpan={7}
                          style={{
                            padding: "12px 14px 16px",
                            background: "var(--admin-content-bg, #f8fafc)",
                            borderBottom: "1px solid var(--admin-card-border, #e5e7eb)",
                          }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--admin-text-primary, #111827)" }}>
                            Productos en el carrito
                          </div>
                          {items.length === 0 ? (
                            <div style={{ color: "var(--admin-text-muted, #9ca3af)" }}>Sin items</div>
                          ) : (
                            <div style={{ display: "grid", gap: 6 }}>
                              {items.map((item, idx) => (
                                <div
                                  key={idx}
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "flex-start",
                                    gap: 12,
                                    padding: "8px 12px",
                                    background: "#fff",
                                    borderRadius: 8,
                                    border: "1px solid var(--admin-card-border, #e5e7eb)",
                                  }}
                                >
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600 }}>
                                      {item.name ?? "Producto"} × {item.qty ?? 1}
                                    </div>
                                    {(item.selectedModifiers ?? []).length > 0 && (
                                      <div style={{ marginTop: 4, fontSize: 12, color: "var(--admin-text-secondary, #6b7280)" }}>
                                        {item.selectedModifiers!.map((group, gi) => (
                                          <div key={gi}>
                                            {group.groupName}: {(group.options ?? []).map((o) => o.name).join(", ")}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    {(item.extras ?? []).length > 0 && (
                                      <div style={{ marginTop: 2, fontSize: 12, color: "var(--admin-text-secondary, #6b7280)" }}>
                                        Extras: {item.extras!.map((e) => e.name).join(", ")}
                                      </div>
                                    )}
                                  </div>
                                  <div style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                                    {formatMoney(Number(item.unitPrice ?? item.basePrice ?? 0) * Number(item.qty ?? 1))}
                                  </div>
                                </div>
                              ))}
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "flex-end",
                                  fontWeight: 800,
                                  paddingTop: 6,
                                  fontSize: 14,
                                }}
                              >
                                Total: {formatMoney(Number(cart.cart_total))}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
