import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../../restaurant/RestaurantContext";
import PosModifierModal from "../components/PosModifierModal";
import type { ModalConfirmPayload, SelectedModifier } from "../components/PosModifierModal";
import {
  addItemToTableOrder,
  cancelTableOrder,
  changeOrderTable,
  closeTableOrder,
} from "../services/posOrderService";
import type { PosPaymentMethod, RestaurantTable, TableStatus } from "../services/posOrderService";
import { printKitchenTicket, printPosTicket } from "../services/posPrintService";

// ─── Types ────────────────────────────────────────────────────────────────────

type Category = { id: string; name: string; sort_order: number | null };
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
  sentToKitchen: boolean;
};

type OrderRow = {
  id: string;
  created_at: string;
  total: number | null;
  subtotal: number | null;
  status: string;
  source: string | null;
};

type TableWithOrder = RestaurantTable & {
  order_created_at?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _keySeq = 0;
function newKey(): string { return `ci-${++_keySeq}`; }

function fmtEur(n: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);
}

function elapsedLabel(createdAt: string): string {
  const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
  if (diff < 60) return `${diff} min`;
  return `${Math.floor(diff / 60)}h ${diff % 60}m`;
}

// ─── Payment modal ────────────────────────────────────────────────────────────

function PaymentModal({
  total,
  onConfirm,
  onClose,
}: {
  total: number;
  onConfirm: (method: PosPaymentMethod, cashGiven: number) => void;
  onClose: () => void;
}) {
  const [method, setMethod] = useState<PosPaymentMethod>("cash");
  const [cashInput, setCashInput] = useState("");

  const cashGiven = method === "cash" && cashInput ? Number(cashInput) : 0;
  const changeDue = method === "cash" && cashGiven >= total ? cashGiven - total : null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 16, padding: 24, width: "min(400px, 100%)", display: "flex", flexDirection: "column", gap: 16 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#f1f5f9" }}>Cobrar</h3>

        <div style={{ fontSize: 28, fontWeight: 900, color: "#4ade80", textAlign: "center" }}>{fmtEur(total)}</div>

        {/* Method */}
        <div style={{ display: "flex", gap: 8 }}>
          {(["cash", "card", "fiado"] as PosPaymentMethod[]).map((m) => (
            <button key={m} type="button" onClick={() => setMethod(m)}
              style={{ flex: 1, padding: "10px 6px", borderRadius: 10, border: "1px solid", borderColor: method === m ? "#4ade80" : "#334155", background: method === m ? "rgba(74,222,128,0.12)" : "transparent", color: method === m ? "#4ade80" : "#94a3b8", fontSize: 13, fontWeight: method === m ? 700 : 500, cursor: "pointer" }}>
              {m === "cash" ? "Efectivo" : m === "card" ? "Tarjeta" : "Fiado"}
            </button>
          ))}
        </div>

        {/* Cash given */}
        {method === "cash" && (
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em" }}>Entrega cliente</span>
            <input type="number" value={cashInput} onChange={(e) => setCashInput(e.target.value)}
              placeholder={fmtEur(total)} min={0} step={0.01}
              style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: "10px 12px", color: "#f1f5f9", fontSize: 18, fontWeight: 700, outline: "none", width: "100%", boxSizing: "border-box" }} />
          </label>
        )}

        {changeDue !== null && (
          <div style={{ background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#94a3b8", fontSize: 14 }}>Cambio</span>
            <span style={{ color: "#4ade80", fontWeight: 800, fontSize: 20 }}>{fmtEur(changeDue)}</span>
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={onClose} style={{ flex: "0 0 auto", padding: "12px 18px", borderRadius: 10, border: "1px solid #334155", background: "transparent", color: "#94a3b8", cursor: "pointer", fontWeight: 600 }}>Cancelar</button>
          <button type="button" onClick={() => onConfirm(method, cashGiven)} style={{ flex: 1, padding: "12px", borderRadius: 10, border: "none", background: "#4ade80", color: "#052e16", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
            Confirmar cobro
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Change table modal ───────────────────────────────────────────────────────

function ChangeTableModal({
  freeTables,
  onSelect,
  onClose,
}: {
  freeTables: RestaurantTable[];
  onSelect: (tableId: string) => void;
  onClose: () => void;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 16, padding: 24, width: "min(480px, 100%)", display: "flex", flexDirection: "column", gap: 16 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#f1f5f9" }}>Cambiar mesa</h3>
        {freeTables.length === 0 ? (
          <p style={{ color: "#64748b", textAlign: "center", padding: "20px 0" }}>No hay mesas libres disponibles.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
            {freeTables.map((t) => (
              <button key={t.id} type="button" onClick={() => onSelect(t.id)}
                style={{ padding: "14px 10px", borderRadius: 12, border: "1px solid #334155", background: "#0f172a", color: "#f1f5f9", cursor: "pointer", textAlign: "center", fontWeight: 700, fontSize: 14 }}>
                <div>{t.name}</div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{t.zone}</div>
              </button>
            ))}
          </div>
        )}
        <button type="button" onClick={onClose} style={{ alignSelf: "flex-end", padding: "9px 18px", borderRadius: 8, border: "1px solid #334155", background: "transparent", color: "#94a3b8", cursor: "pointer", fontWeight: 600 }}>Cerrar</button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PosTableSessionPage() {
  const { tableId } = useParams<{ tableId: string }>();
  const { restaurantId, name: restaurantName } = useRestaurant();
  const navigate = useNavigate();
  const location = useLocation();

  const posBase = window.location.pathname.includes("/r/")
    ? window.location.pathname.split("/pos")[0] + "/pos"
    : "/pos";

  const backPath = (location.state as { from?: string } | null)?.from === "floor-plan"
    ? `${posBase}/floor-plan`
    : `${posBase}/tables`;

  // ── Data state ──
  const [table, setTable] = useState<TableWithOrder | null>(null);
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── UI state ──
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [modalProduct, setModalProduct] = useState<Product | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [showChangeTable, setShowChangeTable] = useState(false);
  const [freeTables, setFreeTables] = useState<RestaurantTable[]>([]);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState("");
  const [statusToast, setStatusToast] = useState("");

  const autoPrint = useRef(localStorage.getItem("pos_auto_print") === "1");

  // ── Load table + order + menu ──
  const loadAll = useCallback(async () => {
    if (!tableId) return;

    // Reset stale state before fetching new table data
    setLoading(true);
    setError(null);
    setOrder(null);
    setCart([]);
    setBusy(false);

    const [tableRes, catRes, prodRes] = await Promise.all([
      supabase.from("restaurant_tables").select("*").eq("id", tableId).single(),
      supabase.from("categories").select("id, name, sort_order").eq("restaurant_id", restaurantId).eq("is_active", true).order("sort_order"),
      supabase.from("products").select("id, name, price, category_id, image_url, sort_order, track_stock, stock_quantity").eq("restaurant_id", restaurantId).eq("is_active", true).order("sort_order"),
    ]);

    if (tableRes.error) { setError(tableRes.error.message); setLoading(false); return; }

    const t = tableRes.data as TableWithOrder;
    setTable(t);
    setCategories((catRes.data ?? []) as Category[]);
    setProducts((prodRes.data ?? []) as Product[]);

    // Model A: ?order=<uuid> lets the POS open a specific order when a table has multiple
    const searchParams = new URLSearchParams(location.search);
    const effectiveOrderId = searchParams.get("order") ?? t.current_order_id;

    // Load existing order items if table is occupied
    if (effectiveOrderId) {
      const [orderRes, itemsRes] = await Promise.all([
        supabase.from("orders").select("id, created_at, total, subtotal, status, source").eq("id", effectiveOrderId).single(),
        supabase.from("order_items").select("id, product_id, qty, base_price, extras_total, final_unit_price, snapshot_name, notes, sent_to_kitchen, order_item_modifier_options(option_id, option_name, price)").eq("order_id", effectiveOrderId),
      ]);

      if (orderRes.data) {
        const o = orderRes.data as OrderRow & { created_at: string };
        setOrder(o);
        t.order_created_at = o.created_at;
      }

      type RawItem = {
        id: string;
        product_id: string;
        qty: number;
        base_price: number;
        extras_total: number;
        final_unit_price: number;
        snapshot_name: string;
        notes: string | null;
        sent_to_kitchen: boolean | null;
        order_item_modifier_options: Array<{ option_id: string; option_name: string; price: number }>;
      };

      if (itemsRes.data) {
        const loaded: CartItem[] = (itemsRes.data as RawItem[]).map((it) => ({
          key: newKey(),
          product_id: it.product_id,
          name: it.snapshot_name,
          base_price: Number(it.base_price),
          extras_total: Number(it.extras_total),
          unit_price: Number(it.final_unit_price),
          qty: it.qty,
          modifiers: (it.order_item_modifier_options ?? []).map((o) => ({
            group_id: "",
            group_name: "",
            option_id: o.option_id,
            option_name: o.option_name,
            price: Number(o.price),
          })),
          notes: it.notes ?? "",
          sentToKitchen: it.sent_to_kitchen ?? false,
        }));
        setCart(loaded);
      }
    }

    setLoading(false);
  }, [tableId, restaurantId]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  // ── Elapsed timer ──
  useEffect(() => {
    if (!table?.order_created_at) return;
    const update = () => setElapsed(elapsedLabel(table.order_created_at!));
    update();
    const id = window.setInterval(update, 60_000);
    return () => window.clearInterval(id);
  }, [table?.order_created_at]);

  // ── Derived ──
  const filteredProducts = useMemo(() => {
    let list = products;
    if (selectedCategory) list = list.filter((p) => p.category_id === selectedCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    return list;
  }, [products, selectedCategory, searchQuery]);

  const cartTotal = useMemo(() => cart.reduce((s, i) => s + i.unit_price * i.qty, 0), [cart]);
  const unsent = useMemo(() => cart.filter((i) => !i.sentToKitchen), [cart]);

  // ── Add item to cart ──
  const handleModalConfirm = (payload: ModalConfirmPayload) => {
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
        sentToKitchen: false,
      },
    ]);
    setModalProduct(null);
  };

  // ── Qty controls ──
  const changeQty = (key: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => (i.key === key ? { ...i, qty: Math.max(1, i.qty + delta) } : i))
        .filter((i) => i.qty > 0)
    );
  };
  const removeItem = (key: string) => setCart((prev) => prev.filter((i) => i.key !== key));

  // ── Send to kitchen (only unsent items) ──
  const handleSendKitchen = async () => {
    const toSend = cart.filter((i) => !i.sentToKitchen);
    if (toSend.length === 0 || !order || !table) return;

    setBusy(true);
    try {
      for (const item of toSend) {
        await addItemToTableOrder(order.id, restaurantId, item);
      }

      // Print kitchen ticket for new items only
      if (autoPrint.current) {
        printKitchenTicket({
          orderId: order.id,
          restaurantName: restaurantName,
          orderType: "dine_in",
          customerName: table.name,
          subtotal: cartTotal,
          total: cartTotal,
          items: toSend.map((i) => ({
            qty: i.qty,
            name: i.name,
            unitPrice: i.unit_price,
            modifiers: i.modifiers.map((m) => ({ name: m.option_name, price: m.price })),
            notes: i.notes || undefined,
          })),
        });
      }

      setCart((prev) => prev.map((i) => ({ ...i, sentToKitchen: true })));
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  // ── Payment ──
  const handlePaymentConfirm = async (method: PosPaymentMethod, cashGiven: number) => {
    if (!order || !table) return;
    setBusy(true);
    try {
      // First send any unsent items
      const toSend = cart.filter((i) => !i.sentToKitchen);
      for (const item of toSend) {
        await addItemToTableOrder(order.id, restaurantId, item);
      }

      await closeTableOrder(order.id, table.id, method, cashGiven);

      // Print receipt
      printPosTicket({
        orderId: order.id,
        createdAt: order.created_at,
        restaurantName,
        orderType: "dine_in",
        customerName: table.name,
        paymentMethod: method,
        cashGiven: method === "cash" ? cashGiven : null,
        changeDue: method === "cash" && cashGiven >= cartTotal ? cashGiven - cartTotal : null,
        subtotal: cartTotal,
        total: cartTotal,
        items: cart.map((i) => ({
          qty: i.qty,
          name: i.name,
          unitPrice: i.unit_price,
          modifiers: i.modifiers.map((m) => ({ name: m.option_name, price: m.price })),
          notes: i.notes || undefined,
        })),
      });

      navigate(backPath);
    } catch (e) {
      console.error(e);
      setBusy(false);
    }
  };

  // ── Cancel account ──
  const handleCancelAccount = async () => {
    if (!order || !table) return;
    if (!window.confirm(`¿Cancelar la cuenta de ${table.name}? Se liberará la mesa.`)) return;
    setBusy(true);
    try {
      await cancelTableOrder(order.id, table.id);
      navigate(backPath);
    } catch (e) {
      console.error(e);
      setBusy(false);
    }
  };

  // ── Manual status override ──
  const handleSetTableStatus = async (newStatus: TableStatus) => {
    if (!table || newStatus === table.status) return;

    // Warn when clearing a table that has an open order
    if (newStatus === "free" && order) {
      if (!window.confirm("Esta mesa tiene una cuenta abierta. ¿Seguro que quieres marcarla como libre?")) return;
    }

    // Reserved is only meaningful when the table is currently free or reserved
    if (newStatus === "reserved" && table.status !== "free" && table.status !== "reserved") return;

    const { error } = await supabase
      .from("restaurant_tables")
      .update({ status: newStatus })
      .eq("id", table.id);

    if (!error) {
      setTable((prev) => prev ? { ...prev, status: newStatus } : prev);
      setStatusToast("Estado actualizado");
      setTimeout(() => setStatusToast(""), 2000);
    }
  };

  // ── Change table ──
  const loadFreeTables = async () => {
    const { data } = await supabase
      .from("restaurant_tables")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .eq("status", "free")
      .eq("is_active", true)
      .neq("id", tableId ?? "");
    setFreeTables((data ?? []) as RestaurantTable[]);
  };

  const handleChangeTable = async (newTableId: string) => {
    if (!order || !table) return;
    setBusy(true);
    try {
      await changeOrderTable(order.id, table.id, newTableId);
      // Reset busy before navigating — same component instance stays mounted
      // so setBusy(false) would not be called otherwise
      setBusy(false);
      navigate(`${posBase}/tables/${newTableId}`);
    } catch (e) {
      console.error(e);
      setBusy(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontSize: 14 }}>
        Cargando...
      </div>
    );
  }

  if (error || !table) {
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "#f87171" }}>
        <div>{error ?? "Mesa no encontrada"}</div>
        <button type="button" onClick={() => navigate(`${posBase}/tables`)} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #334155", background: "transparent", color: "#94a3b8", cursor: "pointer" }}>
          Volver a mesas
        </button>
      </div>
    );
  }

  const s: Record<string, CSSProperties> = {
    root: { height: "100%", display: "flex", background: "#0f172a", color: "#f1f5f9", fontFamily: "system-ui, -apple-system, sans-serif", overflow: "hidden" },
    // Left: categories
    catPanel: { width: 100, flexShrink: 0, background: "#1e293b", borderRight: "1px solid #334155", display: "flex", flexDirection: "column", overflowY: "auto" },
    catBtn: { padding: "14px 8px", border: "none", background: "transparent", color: "#94a3b8", fontSize: 12, fontWeight: 500, cursor: "pointer", textAlign: "center", lineHeight: 1.3, borderBottom: "1px solid #0f172a", wordBreak: "break-word" },
    catBtnActive: { color: "#4ade80", background: "rgba(74,222,128,0.08)", fontWeight: 700 },
    // Center: products
    centerPanel: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },
    searchBar: { padding: "10px 12px", flexShrink: 0, borderBottom: "1px solid #1e293b" },
    searchInput: { width: "100%", background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "8px 12px", color: "#f1f5f9", fontSize: 14, outline: "none", boxSizing: "border-box" as const },
    prodGrid: { flex: 1, overflowY: "auto", padding: 10, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8, alignContent: "start" },
    prodCard: { background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: "12px 10px", cursor: "pointer", textAlign: "center" as const, display: "flex", flexDirection: "column" as const, gap: 6 },
    // Right: order panel
    orderPanel: { width: 280, flexShrink: 0, background: "#1e293b", borderLeft: "1px solid #334155", display: "flex", flexDirection: "column" },
    orderHeader: { padding: "12px 14px", borderBottom: "1px solid #334155", flexShrink: 0 },
    orderItems: { flex: 1, overflowY: "auto", padding: "8px 12px", display: "flex", flexDirection: "column", gap: 6 },
    orderFooter: { flexShrink: 0, borderTop: "1px solid #334155", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 },
  };

  return (
    <div style={s.root}>
      {/* ── Left: categories ── */}
      <div style={s.catPanel}>
        <button type="button"
          style={{ ...s.catBtn, ...(selectedCategory === null ? s.catBtnActive : {}) }}
          onClick={() => setSelectedCategory(null)}>
          Todos
        </button>
        {categories.map((c) => (
          <button key={c.id} type="button"
            style={{ ...s.catBtn, ...(selectedCategory === c.id ? s.catBtnActive : {}) }}
            onClick={() => setSelectedCategory(c.id)}>
            {c.name}
          </button>
        ))}
      </div>

      {/* ── Center: products ── */}
      <div style={s.centerPanel}>
        <div style={s.searchBar}>
          <input
            style={s.searchInput}
            placeholder="Buscar producto..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div style={s.prodGrid}>
          {filteredProducts.map((p) => (
            <button key={p.id} type="button" onClick={() => setModalProduct(p)} style={s.prodCard}>
              {p.image_url && (
                <img src={p.image_url} alt="" style={{ width: "100%", height: 64, objectFit: "cover", borderRadius: 8 }} />
              )}
              <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9", lineHeight: 1.3 }}>{p.name}</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#4ade80" }}>{fmtEur(Number(p.price))}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Right: order panel ── */}
      <div style={s.orderPanel}>
        {/* Header */}
        <div style={s.orderHeader}>
          <button
            type="button"
            onClick={() => navigate(backPath)}
            style={{ background: "none", border: "none", color: "#64748b", fontSize: 12, cursor: "pointer", padding: "0 0 6px 0", display: "flex", alignItems: "center", gap: 4, fontWeight: 600 }}
          >
            ← Volver
          </button>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 17, fontWeight: 800, color: "#f1f5f9" }}>{table.name}</span>
            {elapsed && (
              <span style={{ fontSize: 12, color: "#64748b" }}> {elapsed}</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8" }}>{table.zone}</span>
            {!order && (
              <span style={{ fontSize: 10, color: "#fbbf24" }}>· Sin comanda abierta</span>
            )}
            {order?.source === "qr_table" && (
              <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 10, background: "rgba(96,165,250,0.2)", color: "#60a5fa", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                Cliente QR
              </span>
            )}
            {order?.source === "pos" && (
              <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 10, background: "rgba(100,116,139,0.2)", color: "#94a3b8", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                TPV
              </span>
            )}
          </div>

          {/* ── Status selector pills ── */}
          <div style={{ display: "flex", gap: 5, marginTop: 10 }}>
            {(
              [
                { value: "free", label: " Libre", activeBg: "rgba(74,222,128,0.18)", activeColor: "#4ade80", activeBorder: "rgba(74,222,128,0.5)" },
                { value: "occupied", label: " Ocupada", activeBg: "rgba(248,113,113,0.18)", activeColor: "#f87171", activeBorder: "rgba(248,113,113,0.5)" },
                { value: "reserved", label: " Reservada", activeBg: "rgba(251,191,36,0.18)", activeColor: "#fbbf24", activeBorder: "rgba(251,191,36,0.5)" },
              ] as const
            ).map(({ value, label, activeBg, activeColor, activeBorder }) => {
              const isActive = table.status === value;
              const isDisabled = value === "reserved" && table.status !== "free" && table.status !== "reserved";
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => void handleSetTableStatus(value)}
                  disabled={isDisabled}
                  style={{
                    flex: 1,
                    padding: "5px 3px",
                    borderRadius: 8,
                    border: `1px solid ${isActive ? activeBorder : "#334155"}`,
                    background: isActive ? activeBg : "transparent",
                    color: isActive ? activeColor : "#64748b",
                    fontSize: 10,
                    fontWeight: isActive ? 700 : 500,
                    cursor: isDisabled ? "not-allowed" : "pointer",
                    opacity: isDisabled ? 0.35 : 1,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Items */}
        <div style={s.orderItems}>
          {cart.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px 0", color: "#475569", fontSize: 13 }}>
              Sin productos aún
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.key} style={{ background: "#0f172a", borderRadius: 10, padding: "9px 10px", border: item.sentToKitchen ? "1px solid #1e293b" : "1px solid rgba(74,222,128,0.25)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9", flex: 1, lineHeight: 1.3 }}>{item.name}</div>
                  <button type="button" onClick={() => removeItem(item.key)} disabled={item.sentToKitchen}
                    style={{ fontSize: 14, color: item.sentToKitchen ? "#1e293b" : "#64748b", background: "none", border: "none", cursor: item.sentToKitchen ? "default" : "pointer", flexShrink: 0, padding: "0 2px", lineHeight: 1 }}>
                    ×
                  </button>
                </div>
                {item.modifiers.length > 0 && (
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                    {item.modifiers.map((m) => m.option_name).join(", ")}
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <button type="button" onClick={() => changeQty(item.key, -1)} disabled={item.sentToKitchen}
                      style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid #334155", background: "#1e293b", color: "#f1f5f9", cursor: item.sentToKitchen ? "default" : "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      −
                    </button>
                    <span style={{ minWidth: 24, textAlign: "center", fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>{item.qty}</span>
                    <button type="button" onClick={() => changeQty(item.key, 1)} disabled={item.sentToKitchen}
                      style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid #334155", background: "#1e293b", color: "#f1f5f9", cursor: item.sentToKitchen ? "default" : "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      +
                    </button>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#4ade80" }}>{fmtEur(item.unit_price * item.qty)}</span>
                </div>
                {item.sentToKitchen && (
                  <div style={{ fontSize: 10, color: "#4ade80", marginTop: 4, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>Enviado cocina</div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={s.orderFooter}>
          {/* Total */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#94a3b8" }}>Total</span>
            <span style={{ fontSize: 22, fontWeight: 900, color: "#4ade80" }}>{fmtEur(cartTotal)}</span>
          </div>

          {/* Send to kitchen */}
          <button type="button" onClick={() => void handleSendKitchen()} disabled={busy || unsent.length === 0}
            style={{ width: "100%", padding: "12px", borderRadius: 10, border: "1px solid #334155", background: unsent.length > 0 ? "#1e3a5f" : "transparent", color: unsent.length > 0 ? "#60a5fa" : "#334155", fontWeight: 700, fontSize: 14, cursor: busy || unsent.length === 0 ? "not-allowed" : "pointer" }}>
             Enviar a cocina {unsent.length > 0 ? `(${unsent.length})` : ""}
          </button>

          {/* Cobrar */}
          <button type="button" onClick={() => setShowPayment(true)} disabled={busy || cart.length === 0}
            style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: cart.length > 0 ? "#4ade80" : "#1e293b", color: cart.length > 0 ? "#052e16" : "#334155", fontWeight: 800, fontSize: 15, cursor: busy || cart.length === 0 ? "not-allowed" : "pointer" }}>
             Cobrar
          </button>

          {/* Secondary actions */}
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={() => { void loadFreeTables(); setShowChangeTable(true); }} disabled={busy}
              style={{ flex: 1, padding: "9px 6px", borderRadius: 8, border: "1px solid #334155", background: "transparent", color: "#94a3b8", fontSize: 12, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer" }}>
               Cambiar mesa
            </button>
            <button type="button" onClick={() => void handleCancelAccount()} disabled={busy}
              style={{ flex: 1, padding: "9px 6px", borderRadius: 8, border: "1px solid rgba(248,113,113,0.25)", background: "transparent", color: "#f87171", fontSize: 12, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer" }}>
               Cancelar
            </button>
          </div>
        </div>
      </div>

      {/* ── Modifier modal ── */}
      {modalProduct && (
        <PosModifierModal
          product={modalProduct}
          restaurantId={restaurantId}
          onConfirm={handleModalConfirm}
          onClose={() => setModalProduct(null)}
        />
      )}

      {/* ── Payment modal ── */}
      {showPayment && (
        <PaymentModal
          total={cartTotal}
          onConfirm={(method, cashGiven) => { setShowPayment(false); void handlePaymentConfirm(method, cashGiven); }}
          onClose={() => setShowPayment(false)}
        />
      )}

      {/* ── Change table modal ── */}
      {showChangeTable && (
        <ChangeTableModal
          freeTables={freeTables}
          onSelect={(id) => { setShowChangeTable(false); void handleChangeTable(id); }}
          onClose={() => setShowChangeTable(false)}
        />
      )}

      {/* ── Status toast ── */}
      {statusToast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: "9px 18px", fontSize: 13, fontWeight: 700, color: "#4ade80", zIndex: 2000, pointerEvents: "none", whiteSpace: "nowrap" }}>
          ✓ {statusToast}
        </div>
      )}
    </div>
  );
}
