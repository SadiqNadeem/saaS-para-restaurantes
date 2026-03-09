import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { supabase } from "../lib/supabase";
import { useRestaurant } from "../restaurant/RestaurantContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type TableInfo = { id: string; name: string; is_active: boolean };
type Category = { id: string; name: string; sort_order: number | null };
type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  category_id: string | null;
  sort_order: number | null;
};

type CartItem = {
  key: string;
  productId: string;
  name: string;
  price: number;
  qty: number;
};

type PageState = "menu" | "checkout" | "success" | "not_found" | "inactive" | "loading";

let _seq = 0;
function newKey() { return `tm-${++_seq}`; }

function fmtEur(n: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TableMenuPage() {
  const { qrToken } = useParams<{ qrToken: string }>();
  const { restaurantId, name: restaurantName } = useRestaurant();

  // Table lookup
  const [table, setTable] = useState<TableInfo | null>(null);
  const [pageState, setPageState] = useState<PageState>("loading");

  // Menu data
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);

  // Checkout form
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);

  // ── Load table + menu ──
  useEffect(() => {
    if (!qrToken || !restaurantId) return;

    void (async () => {
      const { data: tableData, error: tableErr } = await supabase.rpc("get_public_table_by_qr", {
        p_restaurant_id: restaurantId,
        p_qr_token: qrToken,
      });

      const row = Array.isArray(tableData) ? tableData[0] : null;
      if (tableErr || !row) { setPageState("not_found"); return; }
      const t = row as TableInfo;
      if (!t.is_active) { setPageState("inactive"); return; }
      setTable(t);

      const [catRes, prodRes] = await Promise.all([
        supabase.from("categories").select("id, name, sort_order").eq("restaurant_id", restaurantId).eq("is_active", true).order("sort_order"),
        supabase.from("products").select("id, name, description, price, image_url, category_id, sort_order").eq("restaurant_id", restaurantId).eq("is_active", true).order("sort_order"),
      ]);

      setCategories((catRes.data ?? []) as Category[]);
      setProducts((prodRes.data ?? []) as Product[]);
      setPageState("menu");
    })();
  }, [qrToken, restaurantId]);

  // ── Derived ──
  const visibleProducts = useMemo(() => {
    if (!activeCategory) return products;
    return products.filter((p) => p.category_id === activeCategory);
  }, [products, activeCategory]);

  const cartTotal = useMemo(() => cart.reduce((s, i) => s + i.price * i.qty, 0), [cart]);
  const cartCount = useMemo(() => cart.reduce((s, i) => s + i.qty, 0), [cart]);

  // ── Cart handlers ──
  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) => i.productId === product.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { key: newKey(), productId: product.id, name: product.name, price: Number(product.price), qty: 1 }];
    });
  };

  const changeQty = (key: string, delta: number) => {
    setCart((prev) =>
      prev.map((i) => i.key === key ? { ...i, qty: Math.max(0, i.qty + delta) } : i)
        .filter((i) => i.qty > 0)
    );
  };

  // ── Submit order ──
  const handleSubmitOrder = async () => {
    if (!table || cart.length === 0) return;
    if (!customerName.trim()) { setSubmitError("Introduce tu nombre"); return; }

    setSubmitting(true);
    setSubmitError(null);

    const rpcItems = cart.map((i) => ({
      product_id: i.productId,
      qty: i.qty,
      options: [],
      ingredients: [],
    }));

    const { data, error } = await supabase.rpc("create_table_qr_order", {
      p_restaurant_id: restaurantId,
      p_table_id: table.id,
      p_client_order_key: crypto.randomUUID(),
      p_customer_name: customerName.trim() || table.name,
      p_customer_phone: customerPhone.trim(),
      p_notes: JSON.stringify({ dine_in: true, table_name: table.name }),
      p_items: rpcItems,
    });

    if (error) {
      setSubmitError("Error al crear el pedido. Inténtalo de nuevo.");
      setSubmitting(false);
      return;
    }

    let newOrderId = "";
    if (typeof data === "string") newOrderId = data.trim();
    else if (data && typeof data === "object") {
      const d = data as { order_id?: unknown; id?: unknown };
      newOrderId = String(d.order_id ?? d.id ?? "").trim();
    }

    setOrderId(newOrderId);
    setPageState("success");
    setSubmitting(false);
  };

  // ─────────────────────────────────────────────────────────────────────────────

  if (pageState === "loading") {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#6b7280", fontSize: 14, fontFamily: "system-ui, sans-serif" }}>
        Cargando mesa...
      </div>
    );
  }

  if (pageState === "not_found") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 12, padding: 24, fontFamily: "system-ui, sans-serif" }}>
        <div style={{ fontSize: 48 }}>🔍</div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#111827" }}>Mesa no encontrada</h2>
        <p style={{ margin: 0, fontSize: 14, color: "#6b7280", textAlign: "center" }}>El código QR no corresponde a ninguna mesa.</p>
      </div>
    );
  }

  if (pageState === "inactive") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 12, padding: 24, fontFamily: "system-ui, sans-serif" }}>
        <div style={{ fontSize: 48 }}>🚫</div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#111827" }}>Mesa no disponible</h2>
        <p style={{ margin: 0, fontSize: 14, color: "#6b7280", textAlign: "center" }}>Esta mesa no está disponible en este momento.</p>
      </div>
    );
  }

  if (pageState === "success") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 16, padding: 24, fontFamily: "system-ui, sans-serif", background: "#f0fdf4" }}>
        <div style={{ fontSize: 64 }}>✅</div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#15803d" }}>¡Pedido enviado!</h2>
        <p style={{ margin: 0, fontSize: 15, color: "#374151", textAlign: "center" }}>
          {table?.name} — Te atenderemos enseguida.
        </p>
        {orderId && (
          <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>Pedido #{orderId.slice(-8).toUpperCase()}</p>
        )}
        <button
          type="button"
          onClick={() => { setCart([]); setCustomerName(""); setCustomerPhone(""); setPageState("menu"); }}
          style={{ marginTop: 8, padding: "12px 24px", borderRadius: 10, border: "none", background: "#16a34a", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}
        >
          Volver al menú
        </button>
      </div>
    );
  }

  const s = {
    root: { minHeight: "100vh", background: "#fafafa", fontFamily: "system-ui, -apple-system, sans-serif" } as const,
    banner: { background: "var(--brand-primary, #4ec580)", color: "#052e16", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky" as const, top: 0, zIndex: 100 },
    catBar: { display: "flex", gap: 8, overflowX: "auto" as const, padding: "10px 16px", background: "#fff", borderBottom: "1px solid #e5e7eb", position: "sticky" as const, top: 52, zIndex: 90 },
    catPill: (active: boolean) => ({ padding: "6px 14px", borderRadius: 20, border: "1px solid", borderColor: active ? "var(--brand-primary, #4ec580)" : "#e5e7eb", background: active ? "rgba(78,197,128,0.14)" : "transparent", color: active ? "#15803d" : "#374151", fontSize: 13, fontWeight: active ? 700 : 500, cursor: "pointer", whiteSpace: "nowrap" as const }),
    grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, padding: 16 } as const,
    card: { background: "#fff", borderRadius: 12, overflow: "hidden", border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", cursor: "pointer" } as const,
  };

  // ── Checkout panel ──
  if (pageState === "checkout") {
    return (
      <div style={s.root}>
        {/* Banner */}
        <div style={s.banner}>
          <span style={{ fontSize: 15, fontWeight: 800 }}>{table?.name} — {restaurantName}</span>
          <button type="button" onClick={() => setPageState("menu")}
            style={{ background: "rgba(0,0,0,0.1)", border: "none", borderRadius: 8, padding: "6px 12px", color: "#052e16", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
            ← Menú
          </button>
        </div>

        <div style={{ maxWidth: 480, margin: "0 auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#111827" }}>Confirmar pedido</h2>

          {/* Order summary */}
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            {cart.map((item) => (
              <div key={item.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button type="button" onClick={() => changeQty(item.key, -1)}
                      style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid #e5e7eb", background: "#f9fafb", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                    <span style={{ minWidth: 20, textAlign: "center", fontSize: 14, fontWeight: 700 }}>{item.qty}</span>
                    <button type="button" onClick={() => changeQty(item.key, 1)}
                      style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid #e5e7eb", background: "#f9fafb", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                  </div>
                  <span style={{ fontSize: 14, color: "#111827" }}>{item.name}</span>
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#111827", flexShrink: 0 }}>{fmtEur(item.price * item.qty)}</span>
              </div>
            ))}
            <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 8, display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Total</span>
              <span style={{ fontWeight: 800, fontSize: 18, color: "#15803d" }}>{fmtEur(cartTotal)}</span>
            </div>
          </div>

          {/* Customer info */}
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>Tu nombre *</span>
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Ej: María"
                style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 12px", fontSize: 15, outline: "none" }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>Teléfono (opcional)</span>
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Por si necesitamos contactarte"
                style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 12px", fontSize: 15, outline: "none" }}
              />
            </label>
          </div>

          {submitError && (
            <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "10px 14px", fontSize: 14, color: "#ef4444" }}>
              {submitError}
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleSubmitOrder()}
            disabled={submitting || cart.length === 0}
            style={{ padding: "15px", borderRadius: 12, border: "none", background: cart.length > 0 ? "#16a34a" : "#e5e7eb", color: cart.length > 0 ? "#fff" : "#9ca3af", fontSize: 16, fontWeight: 800, cursor: submitting || cart.length === 0 ? "not-allowed" : "pointer" }}
          >
            {submitting ? "Enviando pedido..." : "Enviar pedido a cocina"}
          </button>
        </div>
      </div>
    );
  }

  // ── Menu view ──
  return (
    <div style={s.root}>
      {/* Banner */}
      <div style={s.banner}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.8 }}>{restaurantName}</div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{table?.name} — Haz tu pedido</div>
        </div>
        {cartCount > 0 && (
          <button type="button" onClick={() => setPageState("checkout")}
            style={{ background: "#052e16", color: "var(--brand-primary, #4ec580)", border: "none", borderRadius: 10, padding: "10px 16px", fontSize: 14, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ background: "var(--brand-primary, #4ec580)", color: "#052e16", borderRadius: 50, width: 22, height: 22, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900 }}>{cartCount}</span>
            {fmtEur(cartTotal)}
          </button>
        )}
      </div>

      {/* Category filter */}
      {categories.length > 1 && (
        <div style={s.catBar}>
          <button type="button" style={s.catPill(!activeCategory)} onClick={() => setActiveCategory(null)}>Todos</button>
          {categories.map((c) => (
            <button key={c.id} type="button" style={s.catPill(activeCategory === c.id)} onClick={() => setActiveCategory(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Products grid */}
      <div style={s.grid}>
        {visibleProducts.map((product) => {
          const inCart = cart.find((i) => i.productId === product.id);
          return (
            <div key={product.id} style={s.card} onClick={() => addToCart(product)}>
              {product.image_url && (
                <img src={product.image_url} alt={product.name} style={{ width: "100%", height: 120, objectFit: "cover" }} />
              )}
              <div style={{ padding: "10px 12px" }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", lineHeight: 1.3 }}>{product.name}</div>
                {product.description && (
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 3, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>
                    {product.description}
                  </div>
                )}
                <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: "#15803d" }}>{fmtEur(Number(product.price))}</span>
                  {inCart ? (
                    <span style={{ fontSize: 12, fontWeight: 700, background: "rgba(78,197,128,0.14)", color: "#15803d", borderRadius: 6, padding: "3px 8px" }}>
                      ×{inCart.qty}
                    </span>
                  ) : (
                    <span style={{ fontSize: 18, fontWeight: 700, color: "#16a34a", lineHeight: 1 }}>+</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Sticky cart bar */}
      {cartCount > 0 && (
        <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", zIndex: 200 }}>
          <button
            type="button"
            onClick={() => setPageState("checkout")}
            style={{ padding: "14px 28px", borderRadius: 14, border: "none", background: "#16a34a", color: "#fff", fontSize: 16, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 20px rgba(22,163,74,0.45)", display: "flex", alignItems: "center", gap: 12, whiteSpace: "nowrap" }}
          >
            <span style={{ background: "#fff", color: "#16a34a", borderRadius: 50, width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900 }}>{cartCount}</span>
            Ver pedido — {fmtEur(cartTotal)}
          </button>
        </div>
      )}
    </div>
  );
}
