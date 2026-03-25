import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { supabase } from "../lib/supabase";
import { useRestaurant } from "../restaurant/RestaurantContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type TableInfo       = { id: string; name: string; is_active: boolean };
type Category        = { id: string; name: string; sort_order: number | null };
type ModifierOption  = { id: string; name: string; price: number; is_active: boolean; position: number };
type ModifierGroup   = { id: string; name: string; min_select: number; max_select: number; options: ModifierOption[] };
type Product         = {
  id: string; name: string; description: string | null; price: number;
  image_url: string | null; category_id: string | null; sort_order: number | null;
  modifierGroups: ModifierGroup[];
};
type SelectedOption  = { option_id: string; option_name: string; price: number };
type CartItem        = {
  key: string; productId: string; name: string;
  basePrice: number; price: number; qty: number;
  modifiers: SelectedOption[]; modifierLabel: string;
};
type PageState  = "loading" | "not_found" | "inactive" | "menu" | "success";
type SheetStep  = "cart" | "checkout";

let _seq = 0;
const newKey  = () => `tm-${++_seq}`;
const fmtEur  = (n: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);

function useIsMobile() {
  const [m, setM] = useState(() => typeof window !== "undefined" ? window.innerWidth < 768 : true);
  useEffect(() => {
    const h = () => setM(window.innerWidth < 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return m;
}

// ─── ModifierModal ─────────────────────────────────────────────────────────────

function ModifierModal({
  product, onConfirm, onClose,
}: {
  product: Product;
  onConfirm: (selected: SelectedOption[], qty: number) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Map<string, SelectedOption>>(new Map());
  const [qty, setQty] = useState(1);

  const toggle = (group: ModifierGroup, opt: ModifierOption) => {
    setSelected(prev => {
      const next = new Map(prev);
      if (next.has(opt.id)) { next.delete(opt.id); return next; }
      if (group.max_select === 1) {
        for (const k of next.keys()) if (group.options.some(o => o.id === k)) next.delete(k);
      }
      const cnt = group.options.filter(o => next.has(o.id)).length;
      if (group.max_select > 1 && cnt >= group.max_select) return next;
      next.set(opt.id, { option_id: opt.id, option_name: opt.name, price: opt.price });
      return next;
    });
  };

  const extras     = Array.from(selected.values()).reduce((s, o) => s + o.price, 0);
  const unitPrice  = Number(product.price) + extras;
  const totalPrice = unitPrice * qty;
  const isValid    = product.modifierGroups.every(g =>
    g.options.filter(o => selected.has(o.id)).length >= g.min_select,
  );

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 600,
      background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#fff", borderRadius: "24px 24px 0 0",
        width: "100%", maxWidth: 540, maxHeight: "92vh",
        display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: "0 -12px 60px rgba(0,0,0,0.2)",
      }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: "#e5e7eb" }} />
        </div>

        {product.image_url ? (
          <div style={{ position: "relative", height: 200, flexShrink: 0 }}>
            <img src={product.image_url} alt={product.name}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 50%)" }} />
            <button onClick={onClose} style={{
              position: "absolute", top: 12, right: 12,
              background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)",
              border: "none", borderRadius: "50%", width: 34, height: 34,
              cursor: "pointer", color: "#fff", fontSize: 16,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>✕</button>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "flex-end", padding: "4px 16px" }}>
            <button onClick={onClose} style={{
              background: "#f3f4f6", border: "none", borderRadius: "50%",
              width: 32, height: 32, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
            }}>✕</button>
          </div>
        )}

        <div style={{ padding: "14px 20px 8px" }}>
          <div style={{ fontSize: 21, fontWeight: 800, color: "#111827" }}>{product.name}</div>
          {product.description && (
            <div style={{ fontSize: 14, color: "#6b7280", marginTop: 4, lineHeight: 1.5 }}>{product.description}</div>
          )}
          <div style={{ fontSize: 18, fontWeight: 800, color: "#16a34a", marginTop: 6 }}>{fmtEur(Number(product.price))}</div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 12px" }}>
          {product.modifierGroups.map(group => {
            const cnt       = group.options.filter(o => selected.has(o.id)).length;
            const required  = group.min_select > 0;
            const satisfied = cnt >= group.min_select;
            return (
              <div key={group.id} style={{
                marginTop: 16, borderRadius: 14, padding: "12px 14px",
                background: "#fafafa",
                border: `1.5px solid ${required && !satisfied ? "#fca5a5" : "#f0f0f0"}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: "#111827", flex: 1 }}>{group.name}</span>
                  {required ? (
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 8,
                      background: satisfied ? "rgba(78,197,128,0.15)" : "#fef9c3",
                      color: satisfied ? "#15803d" : "#854d0e",
                    }}>{satisfied ? "✓ OK" : "Obligatorio"}</span>
                  ) : (
                    <span style={{ fontSize: 11, color: "#9ca3af" }}>Opcional</span>
                  )}
                  {group.max_select > 1 && <span style={{ fontSize: 11, color: "#9ca3af" }}>{cnt}/{group.max_select}</span>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {group.options.filter(o => o.is_active).sort((a, b) => a.position - b.position).map(opt => {
                    const isOn    = selected.has(opt.id);
                    const isRadio = group.max_select === 1;
                    return (
                      <button key={opt.id} type="button" onClick={() => toggle(group, opt)} style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "10px 12px", borderRadius: 10, textAlign: "left",
                        border: `1.5px solid ${isOn ? "#4ec580" : "#e5e7eb"}`,
                        background: isOn ? "rgba(78,197,128,0.08)" : "#fff", cursor: "pointer",
                      }}>
                        <span style={{
                          width: 20, height: 20, flexShrink: 0,
                          borderRadius: isRadio ? "50%" : 4,
                          border: `2px solid ${isOn ? "#4ec580" : "#d1d5db"}`,
                          background: isOn ? "#4ec580" : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {isOn && <span style={{ color: "#fff", fontSize: 11, fontWeight: 900 }}>✓</span>}
                        </span>
                        <span style={{ flex: 1, fontSize: 14, color: "#111827", fontWeight: isOn ? 600 : 400 }}>{opt.name}</span>
                        {opt.price > 0 && <span style={{ fontSize: 13, fontWeight: 600, color: "#6b7280", flexShrink: 0 }}>+{fmtEur(opt.price)}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ padding: "12px 20px 28px", borderTop: "1px solid #f3f4f6", background: "#fff" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 2, background: "#f3f4f6", borderRadius: 12, padding: 4, flexShrink: 0 }}>
              <button type="button" onClick={() => setQty(q => Math.max(1, q - 1))} style={{
                width: 36, height: 36, border: "none",
                background: qty <= 1 ? "transparent" : "#fff", borderRadius: 8,
                cursor: qty <= 1 ? "default" : "pointer",
                fontSize: 20, color: qty <= 1 ? "#d1d5db" : "#111827", fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: qty <= 1 ? "none" : "0 1px 3px rgba(0,0,0,0.1)",
              }}>−</button>
              <span style={{ minWidth: 30, textAlign: "center", fontSize: 16, fontWeight: 800 }}>{qty}</span>
              <button type="button" onClick={() => setQty(q => q + 1)} style={{
                width: 36, height: 36, border: "none", background: "#fff", borderRadius: 8,
                cursor: "pointer", fontSize: 20, color: "#111827", fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
              }}>+</button>
            </div>
            <button type="button" disabled={!isValid}
              onClick={() => isValid && onConfirm(Array.from(selected.values()), qty)}
              style={{
                flex: 1, padding: "14px", borderRadius: 14, border: "none",
                background: isValid ? "#16a34a" : "#e5e7eb",
                color: isValid ? "#fff" : "#9ca3af",
                fontSize: 15, fontWeight: 800,
                cursor: isValid ? "pointer" : "not-allowed",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
              <span>Añadir al pedido</span>
              <span>{fmtEur(totalPrice)}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Mobile bottom sheet ───────────────────────────────────────────────────────

function MobileSheet({
  open, step, cart, cartTotal,
  customerName, setCustomerName,
  customerPhone, setCustomerPhone,
  submitting, submitError, tableName,
  onClose, onChangeQty, onContinue, onBack, onSubmit,
}: {
  open: boolean; step: SheetStep; cart: CartItem[]; cartTotal: number;
  customerName: string; setCustomerName: (v: string) => void;
  customerPhone: string; setCustomerPhone: (v: string) => void;
  submitting: boolean; submitError: string | null; tableName: string;
  onClose: () => void; onChangeQty: (key: string, d: number) => void;
  onContinue: () => void; onBack: () => void; onSubmit: () => void;
}) {
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  return (
    <>
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(0,0,0,0.5)", backdropFilter: "blur(3px)",
        opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none",
        transition: "opacity 0.3s ease",
      }} />
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 400,
        display: "flex", justifyContent: "center",
        transform: open ? "translateY(0)" : "translateY(100%)",
        transition: "transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)",
      }}>
        <div style={{
          background: "#fff", borderRadius: "24px 24px 0 0",
          width: "100%", maxWidth: 540, maxHeight: "90vh",
          display: "flex", flexDirection: "column",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.12)", overflow: "hidden",
        }}>
          <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 6px" }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "#e5e7eb" }} />
          </div>

          {step === "cart" ? (
            <>
              <div style={{ padding: "0 20px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f3f4f6" }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#111827" }}>Tu pedido</h2>
                  <p style={{ margin: 0, fontSize: 13, color: "#9ca3af" }}>{cartCount} artículo{cartCount !== 1 ? "s" : ""}</p>
                </div>
                <button onClick={onClose} style={{ background: "#f3f4f6", border: "none", borderRadius: "50%", width: 34, height: 34, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "#374151" }}>✕</button>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px" }}>
                {cart.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "48px 0", color: "#9ca3af" }}>
                    <div style={{ fontSize: 44, marginBottom: 12 }}>🛒</div>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>El pedido está vacío</div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>Añade algo del menú</div>
                  </div>
                ) : cart.map((item, idx) => (
                  <div key={item.key} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 0", borderBottom: idx < cart.length - 1 ? "1px solid #f9fafb" : "none" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{item.name}</div>
                      {item.modifierLabel && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{item.modifierLabel}</div>}
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#16a34a", marginTop: 4 }}>{fmtEur(item.price * item.qty)}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#f3f4f6", borderRadius: 10, padding: 3, flexShrink: 0 }}>
                      <button type="button" onClick={() => onChangeQty(item.key, -1)} style={{ width: 30, height: 30, border: "none", background: "#fff", borderRadius: 7, cursor: "pointer", fontSize: 18, fontWeight: 700, color: "#374151", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }}>−</button>
                      <span style={{ minWidth: 26, textAlign: "center", fontSize: 14, fontWeight: 800, color: "#111827" }}>{item.qty}</span>
                      <button type="button" onClick={() => onChangeQty(item.key, 1)} style={{ width: 30, height: 30, border: "none", background: "#fff", borderRadius: 7, cursor: "pointer", fontSize: 18, fontWeight: 700, color: "#374151", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }}>+</button>
                    </div>
                  </div>
                ))}
              </div>
              {cart.length > 0 && (
                <div style={{ padding: "14px 20px 28px", borderTop: "1px solid #f3f4f6" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
                    <span style={{ fontSize: 15, color: "#374151" }}>Total estimado</span>
                    <span style={{ fontSize: 20, fontWeight: 800, color: "#111827" }}>{fmtEur(cartTotal)}</span>
                  </div>
                  <button type="button" onClick={onContinue} style={{ width: "100%", padding: "15px", borderRadius: 14, border: "none", background: "#16a34a", color: "#fff", fontSize: 16, fontWeight: 800, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>Continuar</span><span>→</span>
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ padding: "0 20px 14px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid #f3f4f6" }}>
                <button onClick={onBack} style={{ background: "#f3f4f6", border: "none", borderRadius: 10, padding: "8px 14px", cursor: "pointer", fontSize: 14, fontWeight: 700, color: "#374151", display: "flex", alignItems: "center", gap: 6 }}>← Volver</button>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#111827" }}>Confirmar</h2>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ background: "#f9fafb", borderRadius: 14, padding: "14px 16px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Resumen — {tableName}</div>
                  {cart.map(item => (
                    <div key={item.key} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, color: "#374151", marginBottom: 5 }}>
                      <span style={{ flex: 1 }}><span style={{ fontWeight: 700 }}>{item.qty}×</span> {item.name}{item.modifierLabel && <span style={{ color: "#9ca3af" }}> · {item.modifierLabel}</span>}</span>
                      <span style={{ fontWeight: 700, flexShrink: 0 }}>{fmtEur(item.price * item.qty)}</span>
                    </div>
                  ))}
                  <div style={{ borderTop: "1px solid #e5e7eb", marginTop: 8, paddingTop: 10, display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 800 }}>
                    <span>Total</span><span style={{ color: "#16a34a" }}>{fmtEur(cartTotal)}</span>
                  </div>
                </div>
                <CustomerForm customerName={customerName} setCustomerName={setCustomerName} customerPhone={customerPhone} setCustomerPhone={setCustomerPhone} />
                {submitError && <div style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 14, color: "#dc2626" }}>{submitError}</div>}
              </div>
              <div style={{ padding: "12px 20px 28px", borderTop: "1px solid #f3f4f6" }}>
                <button type="button" onClick={onSubmit} disabled={submitting} style={{ width: "100%", padding: "15px", borderRadius: 14, border: "none", background: "#16a34a", color: "#fff", fontSize: 16, fontWeight: 800, cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.7 : 1 }}>
                  {submitting ? "Enviando..." : "Enviar pedido a cocina"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Desktop cart panel ────────────────────────────────────────────────────────

function DesktopCartPanel({
  cart, cartTotal, tableName,
  customerName, setCustomerName,
  customerPhone, setCustomerPhone,
  submitting, submitError, onChangeQty, onSubmit,
}: {
  cart: CartItem[]; cartTotal: number; tableName: string;
  customerName: string; setCustomerName: (v: string) => void;
  customerPhone: string; setCustomerPhone: (v: string) => void;
  submitting: boolean; submitError: string | null;
  onChangeQty: (key: string, d: number) => void; onSubmit: () => void;
}) {
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  return (
    <aside style={{
      width: 360, flexShrink: 0,
      background: "#fff", borderLeft: "1px solid #e8ede9",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid #f0f4f1" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#111827" }}>Tu pedido</h2>
          {cartCount > 0 && (
            <span style={{ background: "#16a34a", color: "#fff", borderRadius: "50%", width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900 }}>{cartCount}</span>
          )}
        </div>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "#9ca3af" }}>{tableName}</p>
      </div>

      {/* Items */}
      <div style={{ flex: 1, overflowY: "auto", padding: cart.length ? "0 0 8px" : 0 }}>
        {cart.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, padding: 32, color: "#9ca3af", textAlign: "center" }}>
            <div style={{ fontSize: 48, opacity: 0.5 }}>🛒</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>El pedido está vacío</div>
            <div style={{ fontSize: 12, lineHeight: 1.5 }}>Selecciona productos del menú para añadirlos aquí</div>
          </div>
        ) : (
          cart.map((item, idx) => (
            <div key={item.key} style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              padding: "12px 20px",
              borderBottom: idx < cart.length - 1 ? "1px solid #f9fafb" : "none",
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", lineHeight: 1.3 }}>{item.name}</div>
                {item.modifierLabel && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{item.modifierLabel}</div>}
                <div style={{ fontSize: 13, fontWeight: 700, color: "#16a34a", marginTop: 4 }}>{fmtEur(item.price * item.qty)}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#f3f4f6", borderRadius: 9, padding: 3, flexShrink: 0 }}>
                <button type="button" onClick={() => onChangeQty(item.key, -1)} style={{ width: 26, height: 26, border: "none", background: "#fff", borderRadius: 6, cursor: "pointer", fontSize: 16, fontWeight: 700, color: "#374151", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 2px rgba(0,0,0,0.07)" }}>−</button>
                <span style={{ minWidth: 22, textAlign: "center", fontSize: 13, fontWeight: 800, color: "#111827" }}>{item.qty}</span>
                <button type="button" onClick={() => onChangeQty(item.key, 1)} style={{ width: 26, height: 26, border: "none", background: "#fff", borderRadius: 6, cursor: "pointer", fontSize: 16, fontWeight: 700, color: "#374151", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 2px rgba(0,0,0,0.07)" }}>+</button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer: form + submit */}
      {cart.length > 0 && (
        <div style={{ borderTop: "1px solid #f0f4f1", padding: "16px 20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700 }}>
            <span style={{ color: "#6b7280" }}>Total estimado</span>
            <span style={{ color: "#111827", fontSize: 18, fontWeight: 800 }}>{fmtEur(cartTotal)}</span>
          </div>

          <CustomerForm customerName={customerName} setCustomerName={setCustomerName} customerPhone={customerPhone} setCustomerPhone={setCustomerPhone} />

          {submitError && (
            <div style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, padding: "9px 12px", fontSize: 13, color: "#dc2626" }}>{submitError}</div>
          )}

          <button type="button" onClick={onSubmit} disabled={submitting} style={{
            width: "100%", padding: "14px", borderRadius: 12, border: "none",
            background: "#16a34a", color: "#fff", fontSize: 15, fontWeight: 800,
            cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.7 : 1,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span>{submitting ? "Enviando..." : "Enviar pedido a cocina"}</span>
            {!submitting && <span>→</span>}
          </button>
        </div>
      )}
    </aside>
  );
}

// ─── Customer form (shared) ────────────────────────────────────────────────────

function CustomerForm({ customerName, setCustomerName, customerPhone, setCustomerPhone }: {
  customerName: string; setCustomerName: (v: string) => void;
  customerPhone: string; setCustomerPhone: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>Tu nombre *</span>
        <input value={customerName} onChange={e => setCustomerName(e.target.value)}
          placeholder="Ej: María" autoComplete="given-name"
          style={{ border: "1.5px solid #e5e7eb", borderRadius: 9, padding: "10px 12px", fontSize: 14, outline: "none", fontFamily: "inherit" }}
          onFocus={e => { e.target.style.borderColor = "#4ec580"; }}
          onBlur={e => { e.target.style.borderColor = "#e5e7eb"; }} />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>
          Teléfono <span style={{ color: "#9ca3af", fontWeight: 400 }}>(opcional)</span>
        </span>
        <input type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}
          placeholder="Por si necesitamos contactarte" autoComplete="tel"
          style={{ border: "1.5px solid #e5e7eb", borderRadius: 9, padding: "10px 12px", fontSize: 14, outline: "none", fontFamily: "inherit" }}
          onFocus={e => { e.target.style.borderColor = "#4ec580"; }}
          onBlur={e => { e.target.style.borderColor = "#e5e7eb"; }} />
      </label>
    </div>
  );
}

// ─── Product card ──────────────────────────────────────────────────────────────

function ProductCard({
  product, inCart, onAdd, onChangeQty, isMobile,
}: {
  product: Product; inCart: CartItem[];
  onAdd: (p: Product) => void; onChangeQty: (key: string, d: number) => void;
  isMobile: boolean;
}) {
  const inCartQty    = inCart.reduce((s, i) => s + i.qty, 0);
  const hasModifiers = product.modifierGroups.length > 0;
  const imgHeight    = isMobile ? 130 : 150;

  return (
    <div
      onClick={() => onAdd(product)}
      style={{
        background: "#fff", borderRadius: 16, overflow: "hidden", cursor: "pointer",
        border: inCartQty > 0 ? "2px solid #4ec580" : "1.5px solid #ebebeb",
        boxShadow: inCartQty > 0 ? "0 2px 14px rgba(78,197,128,0.18)" : "0 1px 4px rgba(0,0,0,0.05)",
        position: "relative",
        transition: "box-shadow 0.15s, border-color 0.15s, transform 0.1s",
      }}
      onMouseEnter={e => { if (!isMobile) (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { if (!isMobile) (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)"; }}
    >
      {inCartQty > 0 && (
        <div style={{
          position: "absolute", top: 8, right: 8, zIndex: 10,
          background: "#16a34a", color: "#fff",
          borderRadius: "50%", width: 24, height: 24,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 900, boxShadow: "0 2px 8px rgba(22,163,74,0.4)",
        }}>{inCartQty}</div>
      )}

      {product.image_url ? (
        <img src={product.image_url} alt={product.name}
          style={{ width: "100%", height: imgHeight, objectFit: "cover", display: "block" }} />
      ) : (
        <div style={{
          height: isMobile ? 80 : 100,
          background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36,
        }}>🍽</div>
      )}

      <div style={{ padding: isMobile ? "10px 12px 14px" : "12px 14px 16px" }}>
        <div style={{ fontSize: isMobile ? 13 : 14, fontWeight: 700, color: "#111827", lineHeight: 1.3, marginBottom: 3 }}>
          {product.name}
        </div>
        {product.description && (
          <div style={{
            fontSize: isMobile ? 11 : 12, color: "#9ca3af", lineHeight: 1.4, marginBottom: 8,
            display: "-webkit-box", WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical" as const, overflow: "hidden",
          }}>
            {product.description}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: isMobile ? 15 : 16, fontWeight: 800, color: "#16a34a" }}>
            {fmtEur(Number(product.price))}
          </span>

          {hasModifiers ? (
            <span style={{ fontSize: 11, color: "#6b7280", background: "#f3f4f6", padding: "3px 8px", borderRadius: 6, fontWeight: 500 }}>
              Personalizar
            </span>
          ) : inCartQty === 0 ? (
            <div style={{
              width: 30, height: 30, borderRadius: 9,
              background: "#16a34a", color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, fontWeight: 700, boxShadow: "0 2px 6px rgba(22,163,74,0.35)",
            }}>+</div>
          ) : (
            <div onClick={e => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <button type="button"
                onClick={() => { const item = inCart[0]; if (item) onChangeQty(item.key, -1); }}
                style={{ width: 26, height: 26, border: "none", background: "#f3f4f6", borderRadius: 7, cursor: "pointer", fontSize: 16, fontWeight: 700, color: "#374151", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
              <span style={{ minWidth: 20, textAlign: "center", fontSize: 13, fontWeight: 800, color: "#111827" }}>{inCartQty}</span>
              <button type="button"
                onClick={() => onAdd(product)}
                style={{ width: 26, height: 26, border: "none", background: "#16a34a", borderRadius: 7, cursor: "pointer", fontSize: 16, fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function TableMenuPage() {
  const { qrToken }                            = useParams<{ qrToken: string }>();
  const { restaurantId, name: restaurantName } = useRestaurant();
  const isMobile                               = useIsMobile();

  const [table, setTable]             = useState<TableInfo | null>(null);
  const [pageState, setPageState]     = useState<PageState>("loading");
  const [categories, setCategories]   = useState<Category[]>([]);
  const [products, setProducts]       = useState<Product[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const [cart, setCart]               = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen]       = useState(false);
  const [sheetStep, setSheetStep]     = useState<SheetStep>("cart");
  const [pendingProduct, setPendingProduct] = useState<Product | null>(null);

  const [customerName, setCustomerName]   = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [submitting, setSubmitting]       = useState(false);
  const [submitError, setSubmitError]     = useState<string | null>(null);
  const [orderId, setOrderId]             = useState<string | null>(null);

  const [menuUpdated, setMenuUpdated] = useState(false);
  const menuUpdatedTimer = useRef<number | null>(null);

  // ── Menu data fetch (cart is never touched here) ──
  const loadMenu = useCallback(async () => {
    if (!restaurantId) return;

    const [catRes, prodRes] = await Promise.all([
      supabase.from("categories").select("id, name, sort_order").eq("restaurant_id", restaurantId).eq("is_active", true).order("sort_order"),
      supabase.from("products").select("id, name, description, price, image_url, category_id, sort_order").eq("restaurant_id", restaurantId).eq("is_active", true).order("sort_order"),
    ]);

    const rawProducts = (prodRes.data ?? []) as Omit<Product, "modifierGroups">[];

    if (rawProducts.length > 0) {
      const { data: pmgData } = await supabase
        .from("product_modifier_groups")
        .select("product_id, sort_order, modifier_groups!product_modifier_groups_modifier_group_id_fkey(id, name, min_select, max_select, is_active, modifier_options(id, name, price, is_active, position))")
        .eq("restaurant_id", restaurantId)
        .in("product_id", rawProducts.map(p => p.id))
        .order("sort_order");

      type PmgRow = { product_id: string; sort_order: number; modifier_groups: { id: string; name: string; min_select: number; max_select: number; is_active: boolean; modifier_options: ModifierOption[] } | null };
      const groupsByProduct = new Map<string, ModifierGroup[]>();
      for (const r of (pmgData ?? []) as PmgRow[]) {
        const g = r.modifier_groups;
        if (!g || !g.is_active) continue;
        if (!groupsByProduct.has(r.product_id)) groupsByProduct.set(r.product_id, []);
        groupsByProduct.get(r.product_id)!.push({
          id: g.id, name: g.name, min_select: g.min_select, max_select: g.max_select,
          options: (g.modifier_options ?? []).filter(o => o.is_active).sort((a, b) => a.position - b.position),
        });
      }
      setProducts(rawProducts.map(p => ({ ...p, modifierGroups: groupsByProduct.get(p.id) ?? [] })));
    } else {
      setProducts([]);
    }

    setCategories((catRes.data ?? []) as Category[]);
  }, [restaurantId]);

  // ── Initial load: validate QR table (once) then load menu ──
  useEffect(() => {
    if (!qrToken || !restaurantId) return;
    let cancelled = false;
    void (async () => {
      const { data: tableData, error: tableErr } = await supabase.rpc("get_public_table_by_qr", {
        p_restaurant_id: restaurantId, p_qr_token: qrToken,
      });
      if (cancelled) return;
      const row = Array.isArray(tableData) ? tableData[0] : null;
      if (tableErr || !row) { setPageState("not_found"); return; }
      const t = row as TableInfo;
      if (!t.is_active) { setPageState("inactive"); return; }
      setTable(t);
      await loadMenu();
      if (cancelled) return;
      setPageState("menu");
    })();
    return () => { cancelled = true; };
  }, [qrToken, restaurantId, loadMenu]);

  // ── Realtime subscription: reload menu on any menu-table change ──
  useEffect(() => {
    if (!restaurantId) return;
    const debounceMs = 400;
    let debounceTimer: number | null = null;

    const triggerReload = () => {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(async () => {
        await loadMenu();
        // Show "menu updated" badge for 3 seconds
        setMenuUpdated(true);
        if (menuUpdatedTimer.current !== null) clearTimeout(menuUpdatedTimer.current);
        menuUpdatedTimer.current = window.setTimeout(() => setMenuUpdated(false), 3000);
      }, debounceMs);
    };

    const channel = supabase
      .channel(`tm-menu-${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "products",               filter: `restaurant_id=eq.${restaurantId}` }, triggerReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "categories",             filter: `restaurant_id=eq.${restaurantId}` }, triggerReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "modifier_groups",        filter: `restaurant_id=eq.${restaurantId}` }, triggerReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "modifier_options",       filter: `restaurant_id=eq.${restaurantId}` }, triggerReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "product_modifier_groups", filter: `restaurant_id=eq.${restaurantId}` }, triggerReload)
      .subscribe();

    return () => {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      if (menuUpdatedTimer.current !== null) clearTimeout(menuUpdatedTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [restaurantId, loadMenu]);

  const visibleProducts = useMemo(() => {
    if (!activeCategory) return products;
    return products.filter(p => p.category_id === activeCategory);
  }, [products, activeCategory]);

  const cartTotal = useMemo(() => cart.reduce((s, i) => s + i.price * i.qty, 0), [cart]);
  const cartCount = useMemo(() => cart.reduce((s, i) => s + i.qty, 0), [cart]);

  const addToCart = (product: Product, modifiers: SelectedOption[], qty = 1) => {
    const extras      = modifiers.reduce((s, m) => s + m.price, 0);
    const unitPrice   = Number(product.price) + extras;
    const modifierKey = modifiers.map(m => m.option_id).sort().join(",");
    setCart(prev => {
      const existing = prev.find(i => i.productId === product.id && i.modifiers.map(m => m.option_id).sort().join(",") === modifierKey);
      if (existing) return prev.map(i => i.key === existing.key ? { ...i, qty: i.qty + qty } : i);
      return [...prev, { key: newKey(), productId: product.id, name: product.name, basePrice: Number(product.price), price: unitPrice, qty, modifiers, modifierLabel: modifiers.map(m => m.option_name).join(", ") }];
    });
  };

  const changeQty = (key: string, delta: number) => {
    setCart(prev => prev.map(i => i.key === key ? { ...i, qty: Math.max(0, i.qty + delta) } : i).filter(i => i.qty > 0));
  };

  const handleProductClick = (product: Product) => {
    if (product.modifierGroups.length > 0) setPendingProduct(product);
    else addToCart(product, []);
  };

  const handleSubmitOrder = async () => {
    if (!table || cart.length === 0) return;
    if (!customerName.trim()) { setSubmitError("Introduce tu nombre para continuar"); return; }
    setSubmitting(true);
    setSubmitError(null);

    const { data, error } = await supabase.rpc("create_table_qr_order", {
      p_restaurant_id: restaurantId,
      p_table_id: table.id,
      p_client_order_key: crypto.randomUUID(),
      p_customer_name: customerName.trim() || table.name,
      p_customer_phone: customerPhone.trim(),
      p_notes: JSON.stringify({ dine_in: true, table_name: table.name }),
      p_items: cart.map(i => ({ product_id: i.productId, qty: i.qty, options: i.modifiers.map(m => ({ option_id: m.option_id, qty: 1 })), ingredients: [] })),
    });

    if (error) {
      setSubmitError("No se pudo enviar el pedido. Inténtalo de nuevo.");
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
    setCartOpen(false);
    setPageState("success");
    setSubmitting(false);
  };

  // ─── Loading / error states ───────────────────────────────────────────────────

  if (pageState === "loading") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100dvh", gap: 16, fontFamily: "system-ui, sans-serif", background: "#f8faf8" }}>
        <style>{`@keyframes tmSpin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ width: 44, height: 44, borderRadius: "50%", border: "3px solid #e5e7eb", borderTopColor: "#4ec580", animation: "tmSpin 0.8s linear infinite" }} />
        <div style={{ fontSize: 14, color: "#9ca3af" }}>Cargando menú...</div>
      </div>
    );
  }

  if (pageState === "not_found") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100dvh", gap: 12, padding: 24, fontFamily: "system-ui, sans-serif" }}>
        <div style={{ fontSize: 56 }}>🔍</div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#111827" }}>Mesa no encontrada</h2>
        <p style={{ margin: 0, fontSize: 14, color: "#6b7280", textAlign: "center", maxWidth: 280 }}>El código QR no corresponde a ninguna mesa activa.</p>
      </div>
    );
  }

  if (pageState === "inactive") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100dvh", gap: 12, padding: 24, fontFamily: "system-ui, sans-serif" }}>
        <div style={{ fontSize: 56 }}>🚫</div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#111827" }}>Mesa no disponible</h2>
        <p style={{ margin: 0, fontSize: 14, color: "#6b7280", textAlign: "center", maxWidth: 280 }}>Esta mesa no está disponible ahora. Contacta con un camarero.</p>
      </div>
    );
  }

  if (pageState === "success") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100dvh", gap: 20, padding: 24, fontFamily: "system-ui, sans-serif", background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)" }}>
        <div style={{ width: 84, height: 84, borderRadius: "50%", background: "#16a34a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, color: "#fff", boxShadow: "0 8px 32px rgba(22,163,74,0.35)" }}>✓</div>
        <div style={{ textAlign: "center" }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 26, fontWeight: 900, color: "#15803d" }}>¡Pedido enviado!</h2>
          <p style={{ margin: 0, fontSize: 16, color: "#374151" }}>{table?.name} — Te atendemos enseguida</p>
          {orderId && <p style={{ margin: "8px 0 0", fontSize: 13, color: "#6b7280" }}>Pedido #{orderId.slice(-8).toUpperCase()}</p>}
        </div>
        <button type="button" onClick={() => { setCart([]); setCustomerName(""); setCustomerPhone(""); setSheetStep("cart"); setPageState("menu"); }}
          style={{ padding: "14px 32px", borderRadius: 14, border: "none", background: "#16a34a", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 16px rgba(22,163,74,0.35)" }}>
          Pedir más
        </button>
      </div>
    );
  }

  // ─── Menu view ─────────────────────────────────────────────────────────────────

  const cols = isMobile ? "repeat(2, 1fr)" : "repeat(3, 1fr)";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden", background: "#f8faf8", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <style>{`
        .tm-catbar::-webkit-scrollbar { display: none; }
        .tm-catbar { -ms-overflow-style: none; scrollbar-width: none; }
        .tm-products::-webkit-scrollbar { width: 6px; }
        .tm-products::-webkit-scrollbar-track { background: transparent; }
        .tm-products::-webkit-scrollbar-thumb { background: #d1fae5; border-radius: 3px; }
        @keyframes tmSpin { to { transform: rotate(360deg); } }
        @keyframes tmFadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* Modifier modal */}
      {pendingProduct && (
        <ModifierModal product={pendingProduct}
          onConfirm={(mods, qty) => { addToCart(pendingProduct, mods, qty); setPendingProduct(null); }}
          onClose={() => setPendingProduct(null)} />
      )}

      {/* Mobile bottom sheet */}
      {isMobile && (
        <MobileSheet
          open={cartOpen} step={sheetStep} cart={cart} cartTotal={cartTotal}
          customerName={customerName} setCustomerName={setCustomerName}
          customerPhone={customerPhone} setCustomerPhone={setCustomerPhone}
          submitting={submitting} submitError={submitError} tableName={table?.name ?? ""}
          onClose={() => { setCartOpen(false); setSheetStep("cart"); }}
          onChangeQty={changeQty}
          onContinue={() => setSheetStep("checkout")}
          onBack={() => { setSheetStep("cart"); setSubmitError(null); }}
          onSubmit={() => void handleSubmitOrder()}
        />
      )}

      {/* ── Header ── */}
      <header style={{
        flexShrink: 0,
        background: "linear-gradient(135deg, #15803d 0%, #22c55e 100%)",
        padding: isMobile ? "14px 20px 12px" : "16px 28px 14px",
        boxShadow: "0 2px 16px rgba(22,163,74,0.25)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: 2 }}>{restaurantName}</div>
          <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 900, color: "#fff", letterSpacing: "-0.01em" }}>{table?.name}</div>
        </div>
        {isMobile && cartCount > 0 && (
          <button type="button" onClick={() => { setSheetStep("cart"); setCartOpen(true); }} style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "#fff", color: "#15803d",
            border: "none", borderRadius: 12, padding: "8px 14px", cursor: "pointer",
            boxShadow: "0 2px 10px rgba(0,0,0,0.15)",
          }}>
            <span style={{ background: "#15803d", color: "#fff", borderRadius: "50%", width: 22, height: 22, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900 }}>{cartCount}</span>
            <span style={{ fontSize: 14, fontWeight: 800 }}>{fmtEur(cartTotal)}</span>
          </button>
        )}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          {!isMobile && (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", fontWeight: 500 }}>Haz tu pedido desde la mesa</div>
          )}
          {menuUpdated && (
            <div style={{
              fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
              background: "rgba(255,255,255,0.22)", color: "#fff",
              animation: "tmFadeIn 0.3s ease",
            }}>
              Menú actualizado
            </div>
          )}
        </div>
      </header>

      {/* ── Content area ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ── Left: menu ── */}
        <main className="tm-products" style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
          {/* Category bar */}
          {categories.length > 1 && (
            <div style={{ position: "sticky", top: 0, zIndex: 20, background: "#fff", borderBottom: "1px solid #f0f0f0", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
              <div className="tm-catbar" style={{ display: "flex", gap: 6, overflowX: "auto", padding: isMobile ? "10px 16px" : "12px 24px" }}>
                <button type="button" onClick={() => setActiveCategory(null)} style={{
                  padding: isMobile ? "7px 16px" : "8px 18px", borderRadius: 20, border: "none", flexShrink: 0,
                  background: !activeCategory ? "#15803d" : "#f3f4f6",
                  color: !activeCategory ? "#fff" : "#374151",
                  fontSize: isMobile ? 13 : 14, fontWeight: !activeCategory ? 700 : 500, cursor: "pointer",
                }}>Todos</button>
                {categories.map(c => (
                  <button key={c.id} type="button" onClick={() => setActiveCategory(c.id)} style={{
                    padding: isMobile ? "7px 16px" : "8px 18px", borderRadius: 20, border: "none", flexShrink: 0,
                    background: activeCategory === c.id ? "#15803d" : "#f3f4f6",
                    color: activeCategory === c.id ? "#fff" : "#374151",
                    fontSize: isMobile ? 13 : 14, fontWeight: activeCategory === c.id ? 700 : 500, cursor: "pointer",
                  }}>{c.name}</button>
                ))}
              </div>
            </div>
          )}

          {/* Products */}
          <div style={{ padding: isMobile ? "16px" : "24px 28px", paddingBottom: isMobile && cartCount > 0 ? 100 : undefined }}>
            <div style={{ display: "grid", gridTemplateColumns: cols, gap: isMobile ? 12 : 16 }}>
              {visibleProducts.map(product => (
                <ProductCard
                  key={product.id}
                  product={product}
                  inCart={cart.filter(i => i.productId === product.id)}
                  onAdd={handleProductClick}
                  onChangeQty={changeQty}
                  isMobile={isMobile}
                />
              ))}
            </div>
            {visibleProducts.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#9ca3af" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🍽</div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>Sin productos en esta categoría</div>
              </div>
            )}
          </div>
        </main>

        {/* ── Right: desktop cart ── */}
        {!isMobile && (
          <DesktopCartPanel
            cart={cart} cartTotal={cartTotal} tableName={table?.name ?? ""}
            customerName={customerName} setCustomerName={setCustomerName}
            customerPhone={customerPhone} setCustomerPhone={setCustomerPhone}
            submitting={submitting} submitError={submitError}
            onChangeQty={changeQty}
            onSubmit={() => void handleSubmitOrder()}
          />
        )}
      </div>

      {/* ── Mobile sticky bottom bar ── */}
      {isMobile && cartCount > 0 && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 150, padding: "10px 16px 28px", background: "linear-gradient(to top, rgba(248,250,248,1) 60%, rgba(248,250,248,0) 100%)" }}>
          <button type="button" onClick={() => { setSheetStep("cart"); setCartOpen(true); }} style={{
            width: "100%", padding: "15px 20px", borderRadius: 16,
            border: "none", background: "#16a34a", color: "#fff",
            fontSize: 16, fontWeight: 800, cursor: "pointer",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            boxShadow: "0 4px 20px rgba(22,163,74,0.4)",
          }}>
            <span style={{ background: "rgba(255,255,255,0.25)", borderRadius: 8, padding: "2px 10px", fontSize: 14, fontWeight: 900 }}>{cartCount}</span>
            <span>Ver pedido</span>
            <span style={{ fontWeight: 700 }}>{fmtEur(cartTotal)}</span>
          </button>
        </div>
      )}
    </div>
  );
}
