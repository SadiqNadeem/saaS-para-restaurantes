import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../../restaurant/RestaurantContext";
import PosModifierModal from "../components/PosModifierModal";
import type { ModalConfirmPayload, SelectedModifier } from "../components/PosModifierModal";
import { createPosOrder } from "../services/posOrderService";
import type { PosPaymentMethod } from "../services/posOrderService";
import { enqueueOrder } from "../services/offlineQueue";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import { printKitchenTicket, printPosTicket } from "../services/posPrintService";
import type { PosTicketData } from "../services/posPrintService";

// ─── Types ────────────────────────────────────────────────────────────────────

type Category = {
  id: string;
  name: string;
  sort_order: number | null;
};

type Product = {
  id: string;
  name: string;
  price: number;
  category_id: string;
  image_url: string | null;
  sort_order: number | null;
  track_stock: boolean;
  stock_quantity: number;
};

type CartItem = {
  key: string;
  product_id: string;
  name: string;
  base_price: number;
  extras_total: number;
  unit_price: number;
  qty: number;
  modifiers: SelectedModifier[];
  notes: string;
};

type OrderType = "counter" | "pickup" | "delivery";

type SuccessState = {
  orderId: string;
  total: number;
  changeDue: number | null;
  ticketData: PosTicketData;
  isOfflineOrder?: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _keySeq = 0;
function newKey(): string {
  return `ci-${++_keySeq}`;
}

function fmtEur(n: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(n);
}

const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  counter: "Mostrador",
  pickup: "Recoger",
  delivery: "Delivery",
};

const PLACEHOLDER_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f59e0b",
  "#10b981", "#3b82f6", "#f43f5e", "#14b8a6",
];

function getPlaceholderColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PLACEHOLDER_COLORS[Math.abs(hash) % PLACEHOLDER_COLORS.length];
}

// ─── Component ────────────────────────────────────────────────────────────────

const MENU_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

function menuCacheKey(restaurantId: string) {
  return `pos_menu_${restaurantId}`;
}

export default function PosCajaPage() {
  const { restaurantId, name } = useRestaurant();
  const isOnline = useOnlineStatus();

  // FIX 1: responsive layout
  const [windowWidth, setWindowWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280
  );
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const isMobile = windowWidth < 768;

  // ── Data state ──
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [modifierProductIds, setModifierProductIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // ── UI state ──
  const [activeCatId, setActiveCatId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [flashId, setFlashId] = useState<string | null>(null);
  const flashRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [modalProduct, setModalProduct] = useState<Product | null>(null);
  const prodGridRef = useRef<HTMLDivElement | null>(null);

  // ── Cart state ──
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderType, setOrderType] = useState<OrderType>("counter");
  const [payment, setPayment] = useState<PosPaymentMethod>("cash");
  const [cashGiven, setCashGiven] = useState("");
  const [customerName, setCustomerName] = useState("");

  // ── Order submission state ──
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [successOrder, setSuccessOrder] = useState<SuccessState | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkoutRef = useRef<() => Promise<void>>(async () => {});

  // ── Load categories + products + modifier assignment ──
  useEffect(() => {
    if (!restaurantId) return;
    let alive = true;
    void retryCount; // incluido en las dependencias para permitir reintentos

    const load = async () => {
      setLoading(true);
      setFetchError(null);

      const [catRes, prodRes] = await Promise.all([
        supabase
          .from("categories")
          .select("id, name, sort_order")
          .eq("restaurant_id", restaurantId)
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        supabase
          .from("products")
          .select("id, name, price, category_id, image_url, sort_order, track_stock, stock_quantity")
          .eq("restaurant_id", restaurantId)
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
      ]);

      if (!alive) return;

      if (catRes.error || prodRes.error) {
        if (import.meta.env.DEV) console.error("[PosCaja] load", catRes.error ?? prodRes.error);

        // Try to serve from cache when offline
        try {
          const cached = localStorage.getItem(menuCacheKey(restaurantId));
          if (cached) {
            type MenuCache = { categories: Category[]; products: Product[]; cachedAt: number };
            const { categories: cachedCats, products: cachedProds, cachedAt } = JSON.parse(cached) as MenuCache;
            const age = Date.now() - (cachedAt ?? 0);
            if (age < MENU_CACHE_TTL_MS) {
              if (!alive) return;
              setCategories(cachedCats);
              setProducts(cachedProds);
              setFetchError("Sin conexión — mostrando menú en caché");
              setLoading(false);
              return;
            }
          }
        } catch {
          // corrupt cache — ignore
        }

        setFetchError("No se pudo cargar el menú. Comprueba la conexión e inténtalo de nuevo.");
        setLoading(false);
        return;
      }

      const cats = (catRes.data ?? []) as Category[];
      const prods = (prodRes.data ?? []).map((p) => ({
        id: String(p.id),
        name: String(p.name ?? ""),
        price: Number(p.price ?? 0),
        category_id: String(p.category_id ?? ""),
        image_url: p.image_url ? String(p.image_url) : null,
        sort_order: typeof p.sort_order === "number" ? p.sort_order : null,
        track_stock: p.track_stock === true,
        stock_quantity: typeof p.stock_quantity === "number" ? p.stock_quantity : 0,
      }));
      setCategories(cats);
      setProducts(prods);

      // Persist menu for offline use
      try {
        localStorage.setItem(
          menuCacheKey(restaurantId),
          JSON.stringify({ categories: cats, products: prods, cachedAt: Date.now() })
        );
      } catch {
        // storage full — ignore
      }

      if (prods.length > 0) {
        const productIds = prods.map((p) => p.id);
        const { data: pmgData } = await supabase
          .from("product_modifier_groups")
          .select("product_id")
          .eq("restaurant_id", restaurantId)
          .in("product_id", productIds);

        if (!alive) return;

        const rows = (pmgData ?? []) as Array<{ product_id: string }>;
        setModifierProductIds(new Set(rows.map((r) => r.product_id)));
      }

      setLoading(false);
    };

    void load();
    return () => {
      alive = false;
    };
  }, [restaurantId, retryCount]);

  // ── Scroll product grid to top when category changes ──
  useEffect(() => {
    if (prodGridRef.current) {
      prodGridRef.current.scrollTop = 0;
    }
  }, [activeCatId]);

  // ── Open cart drawer when first item added (mobile) ──
  const prevCartLen = useRef(0);
  useEffect(() => {
    if (isMobile && cart.length > 0 && prevCartLen.current === 0) {
      setCartDrawerOpen(true);
    }
    prevCartLen.current = cart.length;
  }, [isMobile, cart.length]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModalProduct(null);
        setCartDrawerOpen(false);
        return;
      }
      if (e.key === "Enter" && !e.isComposing) {
        const target = e.target as HTMLElement;
        const tag = target.tagName.toLowerCase();
        if (tag !== "input" && tag !== "textarea" && tag !== "select" && tag !== "button") {
          void checkoutRef.current();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // ── Filtered products ──
  const filteredProducts = useMemo(() => {
    let list = products;
    if (activeCatId !== null) list = list.filter((p) => p.category_id === activeCatId);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q));
    return list;
  }, [products, activeCatId, search]);

  // ── Cart: add product directly ──
  const addDirectToCart = useCallback((product: Product) => {
    setCart((prev) => {
      const existing = prev.find(
        (item) => item.product_id === product.id && item.modifiers.length === 0
      );
      if (existing) {
        return prev.map((item) =>
          item.key === existing.key ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [
        ...prev,
        {
          key: newKey(),
          product_id: product.id,
          name: product.name,
          base_price: product.price,
          extras_total: 0,
          unit_price: product.price,
          qty: 1,
          modifiers: [],
          notes: "",
        },
      ];
    });
  }, []);

  // ── Cart: add from modal confirm ──
  const handleModalConfirm = useCallback((payload: ModalConfirmPayload) => {
    setCart((prev) => [
      ...prev,
      {
        key: newKey(),
        product_id: payload.product_id,
        name: payload.name,
        base_price: payload.base_price,
        extras_total: payload.extras_total,
        unit_price: payload.unit_price,
        qty: payload.qty,
        modifiers: payload.modifiers,
        notes: payload.notes,
      },
    ]);
    setModalProduct(null);
  }, []);

  // ── Click on product card ──
  const handleProductClick = useCallback(
    (product: Product) => {
      if (submitting) return;
      // FIX 5: block out-of-stock products
      if (product.track_stock && product.stock_quantity <= 0) return;

      if (flashRef.current) clearTimeout(flashRef.current);
      setFlashId(product.id);
      flashRef.current = setTimeout(() => setFlashId(null), 220);

      if (modifierProductIds.has(product.id)) {
        setModalProduct(product);
        return;
      }

      addDirectToCart(product);
    },
    [modifierProductIds, addDirectToCart, submitting]
  );

  // ── Cart: qty ──
  const adjustQty = (key: string, delta: number) => {
    if (submitting) return;
    setCart((prev) =>
      prev.flatMap((item) => {
        if (item.key !== key) return [item];
        const next = item.qty + delta;
        return next <= 0 ? [] : [{ ...item, qty: next }];
      })
    );
  };

  const removeItem = (key: string) => {
    if (submitting) return;
    setCart((prev) => prev.filter((i) => i.key !== key));
  };

  const clearCart = () => {
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    setSuccessOrder(null);
    setCart([]);
    setCashGiven("");
    setCustomerName("");
    setOrderError(null);
    setCartDrawerOpen(false);
  };

  // ── Totals ──
  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.unit_price * item.qty, 0),
    [cart]
  );
  const totalQty = useMemo(
    () => cart.reduce((sum, item) => sum + item.qty, 0),
    [cart]
  );

  const cashNum = parseFloat(cashGiven);
  const change =
    payment === "cash" && Number.isFinite(cashNum) && cashNum >= total && cashNum > 0
      ? cashNum - total
      : null;

  // ── Checkout ──
  const handleCheckout = useCallback(async () => {
    if (cart.length === 0 || submitting) return;
    setSubmitting(true);
    setOrderError(null);

    // ── Offline path: queue the order locally ──────────────────────────────
    if (!isOnline) {
      const orderParams = {
        restaurantId,
        orderType,
        payment,
        cashGiven: payment === "cash" ? (parseFloat(cashGiven) || 0) : 0,
        customerName,
        items: cart.map((item) => ({
          product_id: item.product_id,
          qty: item.qty,
          modifiers: item.modifiers,
        })),
      };
      const queueId = enqueueOrder(
        orderParams,
        total,
        customerName || "Cliente mostrador"
      );

      const offlineTicket: PosTicketData = {
        orderId: queueId,
        createdAt: new Date().toISOString(),
        restaurantName: name ?? "Restaurante",
        orderType,
        customerName: customerName || "Cliente mostrador",
        paymentMethod: payment === "cash" ? "cash" : payment === "fiado" ? "cash" : "card_on_delivery",
        cashGiven: payment === "cash" ? (parseFloat(cashGiven) || 0) : null,
        changeDue: change,
        subtotal: total,
        deliveryFee: 0,
        total,
        items: cart.map((item) => ({
          qty: item.qty,
          name: item.name,
          unitPrice: item.unit_price,
          modifiers: item.modifiers.map((mod) => ({
            name: mod.option_name,
            price: mod.price,
          })),
          notes: item.notes || undefined,
        })),
      };

      setSuccessOrder({
        orderId: queueId,
        total,
        changeDue: change,
        ticketData: offlineTicket,
        isOfflineOrder: true,
      });

      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => {
        setSuccessOrder(null);
        setCart([]);
        setCashGiven("");
        setCustomerName("");
        setOrderError(null);
        setCartDrawerOpen(false);
      }, 3000);

      setSubmitting(false);
      return;
    }

    try {
      const { orderId } = await createPosOrder({
        restaurantId,
        orderType,
        payment,
        cashGiven: payment === "cash" ? (parseFloat(cashGiven) || 0) : 0,
        customerName,
        items: cart.map((item) => ({
          product_id: item.product_id,
          qty: item.qty,
          modifiers: item.modifiers,
        })),
      });

      const ticketData: PosTicketData = {
        orderId,
        createdAt: new Date().toISOString(),
        restaurantName: name ?? "Restaurante",
        orderType,
        customerName: customerName || "Cliente mostrador",
        paymentMethod: payment === "cash" ? "cash" : payment === "fiado" ? "cash" : "card_on_delivery",
        cashGiven: payment === "cash" ? (parseFloat(cashGiven) || 0) : null,
        changeDue: change,
        subtotal: total,
        deliveryFee: 0,
        total,
        items: cart.map((item) => ({
          qty: item.qty,
          name: item.name,
          unitPrice: item.unit_price,
          modifiers: item.modifiers.map((mod) => ({
            name: mod.option_name,
            price: mod.price,
          })),
          notes: item.notes || undefined,
        })),
      };

      setSuccessOrder({ orderId, total, changeDue: change, ticketData });

      // FIX 2: auto-print customer ticket + kitchen ticket
      if (localStorage.getItem("pos_auto_print") === "1") {
        void printPosTicket(ticketData).catch(() => {});
        void printKitchenTicket(ticketData).catch(() => {});
      }

      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => {
        setSuccessOrder(null);
        setCart([]);
        setCashGiven("");
        setCustomerName("");
        setOrderError(null);
        setCartDrawerOpen(false);
      }, 3000);
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : "Error al crear el pedido");
    } finally {
      setSubmitting(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, submitting, restaurantId, orderType, payment, cashGiven, customerName, change, name, total, isOnline]);

  checkoutRef.current = handleCheckout;

  // ─── Cart panel (shared between desktop sidebar and mobile drawer) ──────────

  const cartPanel = (
    <>
      {/* Header */}
      <div style={s.cartHeader}>
        <span>Pedido{totalQty > 0 ? ` (${totalQty})` : ""}</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {isMobile && (
            <button type="button" style={s.clearBtn} onClick={() => setCartDrawerOpen(false)}>
              ↓
            </button>
          )}
          {cart.length > 0 && !submitting && (
            <button type="button" style={s.clearBtn} onClick={clearCart}>
              Vaciar
            </button>
          )}
        </div>
      </div>

      {/* Item list */}
      <div style={s.cartItems}>
        {cart.length === 0 ? (
          <div style={s.cartEmpty}>
            <span style={{ display: "block", fontSize: 28, marginBottom: 8 }}></span>
            Añade productos para empezar
          </div>
        ) : (
          cart.map((item) => (
            <div key={item.key} style={s.cartRow}>
              <div style={s.cartRowTop}>
                <span style={s.cartItemName}>{item.name}</span>
                <button
                  type="button"
                  style={s.removeBtn}
                  onClick={() => removeItem(item.key)}
                  aria-label="Eliminar"
                  disabled={submitting}
                >
                  ×
                </button>
              </div>

              {item.modifiers.length > 0 && (
                <div style={s.cartMods}>
                  {item.modifiers.map((mod) => mod.option_name).join(", ")}
                </div>
              )}
              {item.notes && (
                <div style={s.cartNotes}>{item.notes}</div>
              )}

              <div style={s.cartRowBot}>
                <div style={s.qtyCtrl}>
                  <button
                    type="button"
                    style={s.qtyBtn}
                    onClick={() => adjustQty(item.key, -1)}
                    disabled={submitting}
                  >
                    −
                  </button>
                  <span style={s.qtyVal}>{item.qty}</span>
                  <button
                    type="button"
                    style={s.qtyBtn}
                    onClick={() => adjustQty(item.key, 1)}
                    disabled={submitting}
                  >
                    +
                  </button>
                </div>
                <span style={s.lineTotal}>{fmtEur(item.unit_price * item.qty)}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div style={s.cartFooter}>
        <div style={s.totalRow}>
          <span style={s.totalLabel}>TOTAL</span>
          <strong style={s.totalAmount}>{fmtEur(total)}</strong>
        </div>

        <div style={s.sectionLabel}>Tipo de pedido</div>
        <div style={s.btnGroup}>
          {(["counter", "pickup", "delivery"] as const).map((type) => (
            <button
              key={type}
              type="button"
              style={orderType === type ? s.optBtnActive : s.optBtn}
              onClick={() => !submitting && setOrderType(type)}
              disabled={submitting}
            >
              {ORDER_TYPE_LABELS[type]}
            </button>
          ))}
        </div>

        {/* FIX 3: Payment method — Efectivo | Tarjeta | Fiado */}
        <div style={s.sectionLabel}>Pago</div>
        <div style={s.btnGroup}>
          <button
            type="button"
            style={payment === "cash" ? s.optBtnActive : s.optBtn}
            onClick={() => !submitting && setPayment("cash")}
            disabled={submitting}
          >
            Efectivo
          </button>
          <button
            type="button"
            style={payment === "card" ? s.optBtnActive : s.optBtn}
            onClick={() => !submitting && setPayment("card")}
            disabled={submitting}
          >
            Tarjeta
          </button>
          <button
            type="button"
            style={payment === "fiado" ? s.optBtnFiadoActive : s.optBtnFiado}
            onClick={() => !submitting && setPayment("fiado")}
            disabled={submitting}
          >
            Fiado
          </button>
        </div>

        {payment === "cash" && (
          <div style={s.cashSection}>
            <div style={s.sectionLabel}>Entrega cliente</div>
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder="0.00 €"
              value={cashGiven}
              onChange={(e) => setCashGiven(e.target.value)}
              style={s.cashInput}
              disabled={submitting}
            />
            {change !== null && (
              <div style={s.changeRow}>
                <span style={s.changeLabel}>Cambio</span>
                <strong style={s.changeAmount}>{fmtEur(change)}</strong>
              </div>
            )}
          </div>
        )}

        {payment === "fiado" && (
          <div style={s.fiadoNote}>
             El cobro queda pendiente. Aparecerá en pedidos como "Pendiente de cobro".
          </div>
        )}

        <div style={s.cashSection}>
          <div style={s.sectionLabel}>Nombre cliente</div>
          <input
            type="text"
            placeholder="Opcional..."
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            style={s.cashInput}
            disabled={submitting}
          />
        </div>

        {orderError && (
          <div style={s.errorMsg}>{orderError}</div>
        )}

        <button
          type="button"
          disabled={cart.length === 0 || submitting}
          style={cart.length > 0 && !submitting ? s.cobrarBtn : s.cobrarBtnDisabled}
          onClick={() => void handleCheckout()}
        >
          {submitting ? (
            <span style={s.spinner} />
          ) : cart.length > 0 ? (
            payment === "fiado" ? `FIADO ${fmtEur(total)}` : `COBRAR ${fmtEur(total)}`
          ) : (
            "COBRAR"
          )}
        </button>
      </div>
    </>
  );

  // ─────────────────────────────────────────────────────────────────────────

  // FIX 1: Categories — vertical panel (desktop) or horizontal row (mobile)
  const catButtons = (
    <>
      <button
        type="button"
        style={{
          ...(activeCatId === null
            ? (isMobile ? s.catItemMobileActive : s.catItemActive)
            : (isMobile ? s.catItemMobile : s.catItem)),
        }}
        onClick={() => setActiveCatId(null)}
      >
        Todos
      </button>
      {categories.map((cat) => (
        <button
          key={cat.id}
          type="button"
          style={{
            ...(activeCatId === cat.id
              ? (isMobile ? s.catItemMobileActive : s.catItemActive)
              : (isMobile ? s.catItemMobile : s.catItem)),
          }}
          onClick={() => setActiveCatId(cat.id)}
        >
          {cat.name}
        </button>
      ))}
    </>
  );

  if (fetchError) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 16, padding: 32, textAlign: "center" }}>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#111827" }}>
          {fetchError}
        </p>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={() => setRetryCount((n) => n + 1)}
            style={{ padding: "8px 20px", background: "var(--brand-primary, #4ec580)", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            Reintentar
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: "8px 20px", background: "transparent", color: "#6b7280", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            Recargar página
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={isMobile ? s.rootMobile : s.root}>

      {/* ═══════════════ MOBILE: categories horizontal row ═══════════════ */}
      {isMobile && (
        <div style={s.catRowMobile}>
          {catButtons}
        </div>
      )}

      {/* ═══════════════ DESKTOP: LEFT — Categories ═══════════════ */}
      {!isMobile && (
        <aside style={s.catPanel}>
          <div style={s.catHeader}>Categorías</div>
          {catButtons}
        </aside>
      )}

      {/* ═══════════════ CENTER — Products ═══════════════ */}
      <section style={isMobile ? s.prodsPanelMobile : s.prodsPanel}>
        {/* Search bar */}
        <div style={s.searchBar}>
          <input
            type="search"
            placeholder="Buscar producto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={s.searchInput}
          />
        </div>

        {/* Grid */}
        {loading ? (
          <div style={s.centered}>Cargando menú...</div>
        ) : filteredProducts.length === 0 ? (
          <div style={s.centered}>Sin productos</div>
        ) : (
          <div
            style={isMobile ? s.prodGridMobile : s.prodGrid}
            ref={prodGridRef}
          >
            {filteredProducts.map((product) => {
              const hasModifiers = modifierProductIds.has(product.id);
              const isFlashing = flashId === product.id;
              const outOfStock = product.track_stock && product.stock_quantity <= 0;

              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => handleProductClick(product)}
                  disabled={outOfStock}
                  style={{
                    ...(isFlashing ? { ...s.prodCard, ...s.prodCardFlash } : s.prodCard),
                    opacity: outOfStock ? 0.55 : 1,
                    cursor: outOfStock ? "not-allowed" : "pointer",
                    position: "relative",
                  }}
                >
                  <div style={s.prodImgBox}>
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        style={s.prodImg}
                      />
                    ) : (
                      <div
                        style={{
                          ...s.prodImgPlaceholder,
                          background: getPlaceholderColor(product.name),
                        }}
                      >
                        {product.name.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    {hasModifiers && (
                      <div style={s.modifierDot} title="Tiene opciones" />
                    )}
                    {/* FIX 5: Out-of-stock overlay */}
                    {outOfStock && (
                      <div style={s.outOfStockOverlay}>Sin stock</div>
                    )}
                  </div>

                  <div style={s.prodName}>{product.name}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 10px 10px" }}>
                    <span style={s.prodPrice}>{fmtEur(product.price)}</span>
                    {/* FIX 5: Stock badge */}
                    {product.track_stock && (
                      <span style={product.stock_quantity > 0 ? s.stockBadgeOk : s.stockBadgeEmpty}>
                        {product.stock_quantity > 0 ? product.stock_quantity : "0"}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* ═══════════════ DESKTOP: RIGHT — Cart ═══════════════ */}
      {!isMobile && (
        <aside style={s.cartPanel}>
          {cartPanel}
        </aside>
      )}

      {/* ═══════════════ MOBILE: Floating cart button ═══════════════ */}
      {isMobile && !cartDrawerOpen && totalQty > 0 && (
        <button
          type="button"
          style={s.floatingCartBtn}
          onClick={() => setCartDrawerOpen(true)}
        >
           Ver carrito ({totalQty}) — {fmtEur(total)}
        </button>
      )}

      {/* ═══════════════ MOBILE: Cart drawer ═══════════════ */}
      {isMobile && (
        <>
          {/* Backdrop */}
          {cartDrawerOpen && (
            <div
              style={s.drawerBackdrop}
              onClick={() => setCartDrawerOpen(false)}
            />
          )}
          <aside
            style={{
              ...s.cartDrawer,
              transform: cartDrawerOpen ? "translateY(0)" : "translateY(100%)",
            }}
          >
            {cartPanel}
          </aside>
        </>
      )}

      {/* ═══════════════ MODIFIER MODAL ═══════════════ */}
      {modalProduct && (
        <PosModifierModal
          product={modalProduct}
          restaurantId={restaurantId}
          onConfirm={handleModalConfirm}
          onClose={() => setModalProduct(null)}
        />
      )}

      {/* ═══════════════ SUCCESS OVERLAY ═══════════════ */}
      {successOrder && (
        <div style={s.successOverlay}>
          <div style={s.successCard}>
            <div style={s.successCheck}>{successOrder.isOfflineOrder ? "📶" : "✓"}</div>
            <div style={s.successTitle}>
              {successOrder.isOfflineOrder
                ? "Pedido guardado — se enviará al recuperar conexión"
                : `Pedido #${successOrder.orderId.slice(-6).toUpperCase()} creado`}
            </div>
            <div style={s.successTotal}>
              Total cobrado: <strong>{fmtEur(successOrder.total)}</strong>
            </div>
            {successOrder.changeDue !== null && successOrder.changeDue > 0 && (
              <div style={s.successChange}>
                Cambio: <strong style={{ color: G }}>{fmtEur(successOrder.changeDue)}</strong>
              </div>
            )}
            <div style={s.successActions}>
              <button
                type="button"
                style={s.printBtn}
                onClick={() =>
                  void printPosTicket(successOrder.ticketData).catch(() => {})
                }
              >
                Imprimir ticket cliente
              </button>
              <button
                type="button"
                style={s.printBtn}
                onClick={() =>
                  void printKitchenTicket(successOrder.ticketData).catch(() => {})
                }
              >
                Imprimir ticket cocina
              </button>
              <button
                type="button"
                className="ui-elevated-cta"
                style={s.newSaleBtn}
                onClick={clearCart}
              >
                Nueva venta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const G = "#f1f5f9";
const BG = "#0f172a";
const PANEL = "#1e293b";
const BORDER = "#334155";
const MUTED = "#64748b";
const SEC = "#94a3b8";
const TEXT = "#f1f5f9";
const AMBER = "#fbbf24";

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, CSSProperties> = {
  // ── Root ──
  root: {
    display: "flex",
    height: "100dvh",
    overflow: "hidden",
    fontFamily: "system-ui, -apple-system, sans-serif",
    color: TEXT,
    fontSize: 14,
    background: BG,
  },
  rootMobile: {
    display: "flex",
    flexDirection: "column",
    height: "100dvh",
    overflow: "hidden",
    fontFamily: "system-ui, -apple-system, sans-serif",
    color: TEXT,
    fontSize: 14,
    background: BG,
    position: "relative",
  },

  // ── Desktop left panel ──
  catPanel: {
    width: 180,
    flexShrink: 0,
    background: PANEL,
    borderRight: `1px solid ${BORDER}`,
    display: "flex",
    flexDirection: "column",
    overflowY: "auto",
  },
  catHeader: {
    padding: "14px 16px 10px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: MUTED,
    borderBottom: `1px solid ${BORDER}`,
    flexShrink: 0,
  },
  catItem: {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "13px 16px",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 500,
    color: SEC,
    borderBottom: `1px solid rgba(51,65,85,0.5)`,
    minHeight: 48,
    boxShadow: "inset 3px 0 0 transparent",
  },
  catItemActive: {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "13px 16px",
    border: "none",
    background: "rgba(74,222,128,0.08)",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 700,
    color: G,
    borderBottom: `1px solid rgba(51,65,85,0.5)`,
    minHeight: 48,
    boxShadow: `inset 3px 0 0 ${G}`,
  },

  // ── Mobile categories row ──
  catRowMobile: {
    display: "flex",
    flexDirection: "row",
    overflowX: "auto",
    background: PANEL,
    borderBottom: `1px solid ${BORDER}`,
    padding: "8px 10px",
    gap: 6,
    flexShrink: 0,
    scrollbarWidth: "none",
  },
  catItemMobile: {
    flexShrink: 0,
    padding: "7px 14px",
    borderRadius: 20,
    border: `1px solid ${BORDER}`,
    background: "transparent",
    color: SEC,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  catItemMobileActive: {
    flexShrink: 0,
    padding: "7px 14px",
    borderRadius: 20,
    border: `1px solid ${G}`,
    background: "rgba(74,222,128,0.10)",
    color: G,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 700,
    whiteSpace: "nowrap",
  },

  // ── Center panel ──
  prodsPanel: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    background: BG,
  },
  prodsPanelMobile: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    background: BG,
    paddingBottom: 72, // space for floating button
  },
  searchBar: {
    padding: "12px 14px",
    borderBottom: `1px solid ${BORDER}`,
    flexShrink: 0,
    background: PANEL,
  },
  searchInput: {
    width: "100%",
    padding: "10px 14px",
    borderRadius: 8,
    border: `1px solid ${BORDER}`,
    background: BG,
    color: TEXT,
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  },
  centered: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: MUTED,
    fontSize: 15,
  },
  prodGrid: {
    flex: 1,
    overflowY: "auto",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))",
    gap: 12,
    padding: 14,
    alignContent: "start",
  },
  prodGridMobile: {
    flex: 1,
    overflowY: "auto",
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 10,
    padding: 10,
    alignContent: "start",
  },

  // Product card
  prodCard: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    padding: 0,
    border: `1px solid ${BORDER}`,
    borderRadius: 10,
    background: PANEL,
    cursor: "pointer",
    textAlign: "left",
    overflow: "hidden",
    minHeight: 148,
    transition: "border-color 0.1s, background 0.1s",
  },
  prodCardFlash: {
    borderColor: G,
    background: "#0d2818",
  },
  prodImgBox: {
    width: "100%",
    height: 90,
    overflow: "hidden",
    flexShrink: 0,
    position: "relative",
  },
  prodImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  prodImgPlaceholder: {
    width: "100%",
    height: "100%",
    background: "#162034",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 24,
    fontWeight: 800,
    color: G,
    letterSpacing: 2,
  },
  modifierDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#facc15",
    border: `1px solid ${BG}`,
  },
  outOfStockOverlay: {
    position: "absolute",
    inset: 0,
    background: "rgba(15,23,42,0.72)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 800,
    color: "#f87171",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },
  prodName: {
    padding: "8px 10px 2px",
    fontSize: 13,
    fontWeight: 600,
    color: TEXT,
    lineHeight: 1.3,
    flex: 1,
  },
  prodPrice: {
    fontSize: 15,
    fontWeight: 800,
    color: G,
  },
  stockBadgeOk: {
    fontSize: 10,
    fontWeight: 700,
    padding: "1px 6px",
    borderRadius: 10,
    background: "rgba(74,222,128,0.15)",
    color: G,
  },
  stockBadgeEmpty: {
    fontSize: 10,
    fontWeight: 700,
    padding: "1px 6px",
    borderRadius: 10,
    background: "rgba(248,113,113,0.15)",
    color: "#f87171",
  },

  // ── Desktop right panel ──
  cartPanel: {
    width: 300,
    flexShrink: 0,
    background: PANEL,
    borderLeft: `1px solid ${BORDER}`,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },

  // ── Mobile cart drawer ──
  drawerBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    zIndex: 900,
  },
  cartDrawer: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 950,
    background: PANEL,
    borderTop: `2px solid ${G}`,
    borderRadius: "20px 20px 0 0",
    maxHeight: "88vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
  },
  floatingCartBtn: {
    position: "fixed",
    bottom: 16,
    left: 16,
    right: 16,
    zIndex: 800,
    padding: "16px",
    borderRadius: 14,
    border: "none",
    background: G,
    color: "#052e16",
    fontSize: 15,
    fontWeight: 800,
    cursor: "pointer",
    letterSpacing: "0.02em",
    boxShadow: "0 4px 20px rgba(74,222,128,0.4)",
  },

  cartHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 16px",
    borderBottom: `1px solid ${BORDER}`,
    fontSize: 15,
    fontWeight: 700,
    flexShrink: 0,
  },
  clearBtn: {
    border: "none",
    background: "transparent",
    color: "#f87171",
    cursor: "pointer",
    fontSize: 13,
    padding: "4px 6px",
    fontWeight: 600,
  },

  cartItems: {
    flex: 1,
    overflowY: "auto",
    padding: "6px 0",
  },
  cartEmpty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 40,
    color: MUTED,
    fontSize: 14,
  },
  cartRow: {
    padding: "10px 14px",
    borderBottom: `1px solid rgba(51,65,85,0.5)`,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  cartRowTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  cartItemName: {
    fontSize: 13,
    fontWeight: 600,
    color: TEXT,
    lineHeight: 1.3,
    flex: 1,
  },
  removeBtn: {
    border: "none",
    background: "transparent",
    color: MUTED,
    cursor: "pointer",
    fontSize: 20,
    lineHeight: 1,
    padding: "0 2px",
    flexShrink: 0,
  },
  cartMods: {
    fontSize: 11,
    color: SEC,
    lineHeight: 1.4,
  },
  cartNotes: {
    fontSize: 11,
    color: MUTED,
    fontStyle: "italic",
    lineHeight: 1.4,
  },
  cartRowBot: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },

  qtyCtrl: {
    display: "flex",
    alignItems: "center",
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    overflow: "hidden",
  },
  qtyBtn: {
    border: "none",
    background: "#263555",
    color: TEXT,
    cursor: "pointer",
    fontSize: 18,
    width: 36,
    height: 36,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 36,
    fontWeight: 700,
  },
  qtyVal: {
    fontSize: 14,
    fontWeight: 700,
    color: TEXT,
    minWidth: 28,
    textAlign: "center",
  },
  lineTotal: {
    fontSize: 14,
    fontWeight: 700,
    color: G,
  },

  cartFooter: {
    flexShrink: 0,
    padding: "12px 14px",
    borderTop: `1px solid ${BORDER}`,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    overflowY: "auto",
    maxHeight: "55vh",
  },
  totalRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 6,
    borderBottom: `1px solid ${BORDER}`,
  },
  totalLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: MUTED,
  },
  totalAmount: {
    fontSize: 22,
    fontWeight: 800,
    color: TEXT,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: MUTED,
  },
  btnGroup: {
    display: "flex",
    gap: 6,
  },
  optBtn: {
    flex: 1,
    padding: "10px 4px",
    borderRadius: 8,
    border: `1px solid ${BORDER}`,
    background: BG,
    color: SEC,
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 700,
    minHeight: 44,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  optBtnActive: {
    flex: 1,
    padding: "10px 4px",
    borderRadius: 8,
    border: `1px solid ${G}`,
    background: "rgba(74,222,128,0.10)",
    color: G,
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 700,
    minHeight: 44,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  // FIX 3: Fiado button styles
  optBtnFiado: {
    flex: 1,
    padding: "10px 4px",
    borderRadius: 8,
    border: `1px solid ${BORDER}`,
    background: BG,
    color: SEC,
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 700,
    minHeight: 44,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  optBtnFiadoActive: {
    flex: 1,
    padding: "10px 4px",
    borderRadius: 8,
    border: `1px solid ${AMBER}`,
    background: "rgba(251,191,36,0.10)",
    color: AMBER,
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 700,
    minHeight: 44,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  fiadoNote: {
    padding: "8px 10px",
    borderRadius: 8,
    background: "rgba(251,191,36,0.08)",
    border: `1px solid rgba(251,191,36,0.3)`,
    color: AMBER,
    fontSize: 11,
    lineHeight: 1.5,
  },

  cashSection: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  cashInput: {
    padding: "10px 12px",
    borderRadius: 8,
    border: `1px solid ${BORDER}`,
    background: BG,
    color: TEXT,
    fontSize: 15,
    fontWeight: 600,
    width: "100%",
    boxSizing: "border-box",
  },
  changeRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "4px 0",
  },
  changeLabel: {
    fontSize: 13,
    color: SEC,
  },
  changeAmount: {
    fontSize: 16,
    fontWeight: 800,
    color: G,
  },

  errorMsg: {
    padding: "10px 12px",
    borderRadius: 8,
    background: "rgba(248,113,113,0.10)",
    border: "1px solid rgba(248,113,113,0.40)",
    color: "#f87171",
    fontSize: 13,
    lineHeight: 1.4,
  },

  cobrarBtn: {
    width: "100%",
    padding: "16px",
    borderRadius: 10,
    border: "none",
    fontSize: 16,
    fontWeight: 800,
    cursor: "pointer",
    minHeight: 56,
    background: G,
    color: "#052e16",
    letterSpacing: "0.06em",
    marginTop: 2,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  cobrarBtnDisabled: {
    width: "100%",
    padding: "16px",
    borderRadius: 10,
    border: "none",
    fontSize: 16,
    fontWeight: 800,
    cursor: "not-allowed",
    minHeight: 56,
    background: "#1a2540",
    color: BORDER,
    letterSpacing: "0.06em",
    marginTop: 2,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  spinner: {
    display: "inline-block",
    width: 22,
    height: 22,
    borderRadius: "50%",
    border: "3px solid rgba(5,46,22,0.3)",
    borderTopColor: "#052e16",
    animation: "pos-spin 0.7s linear infinite",
  },

  successOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 2000,
    background: "rgba(0,0,0,0.80)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  successCard: {
    background: PANEL,
    border: `1px solid ${BORDER}`,
    borderRadius: 20,
    padding: "40px 36px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 14,
    minWidth: 320,
    maxWidth: 400,
    boxShadow: "0 24px 60px rgba(0,0,0,0.7)",
    textAlign: "center",
  },
  successCheck: {
    fontSize: 64,
    color: G,
    lineHeight: 1,
    fontWeight: 900,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: 800,
    color: TEXT,
    letterSpacing: "0.02em",
  },
  successTotal: {
    fontSize: 16,
    color: SEC,
  },
  successChange: {
    fontSize: 18,
    color: SEC,
  },
  successActions: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    width: "100%",
    marginTop: 8,
  },
  printBtn: {
    padding: "14px",
    borderRadius: 10,
    border: `1px solid ${BORDER}`,
    background: "transparent",
    color: SEC,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  newSaleBtn: {
    padding: "16px",
    borderRadius: 10,
    border: "none",
    background: G,
    color: "#052e16",
    fontSize: 16,
    fontWeight: 800,
    cursor: "pointer",
    letterSpacing: "0.04em",
    boxShadow: "0 6px 14px rgba(34,197,94,0.26)",
  },
};

if (typeof document !== "undefined") {
  const styleId = "pos-spinner-keyframes";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `@keyframes pos-spin { to { transform: rotate(360deg); } }`;
    document.head.appendChild(style);
  }
}
