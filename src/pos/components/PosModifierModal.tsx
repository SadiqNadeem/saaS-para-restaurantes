import { useEffect, useMemo, useState } from "react";
import { ShoppingCart, Check, MessageSquare, ChevronDown, Plus, Minus } from "lucide-react";
import { supabase } from "../../lib/supabase";

export type SelectedModifier = {
  group_id: string;
  group_name: string;
  option_id: string;
  option_name: string;
  price: number;
};

export type ModalConfirmPayload = {
  product_id: string;
  name: string;
  base_price: number;
  qty: number;
  modifiers: SelectedModifier[];
  extras_total: number;
  unit_price: number;
  notes: string;
};

type ModGroup = {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
};

type ModOption = {
  id: string;
  group_id: string;
  name: string;
  price: number;
  position: number | null;
};

type Props = {
  product: { id: string; name: string; price: number };
  restaurantId: string;
  onConfirm: (payload: ModalConfirmPayload) => void;
  onClose: () => void;
};

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  bg:         "#0d1117",
  panel:      "#141a23",
  surface:    "#1a2232",
  surfaceHi:  "#212d3f",
  border:     "#2a3547",
  borderHi:   "#3d5068",
  accent:     "#f59e0b",   // amber — seleccionado / botón añadir
  accentBg:   "#1c1203",
  accentText: "#0d1117",
  text:       "#f0f6fc",
  textSub:    "#8b949e",
  textMuted:  "#3d4f63",
  error:      "#f85149",
  errorBg:    "#1c0a0a",
} as const;

const DISPLAY = '"Barlow Condensed", "Arial Narrow", Arial, sans-serif';
const BODY    = '"DM Sans", "Helvetica Neue", Arial, sans-serif';

function fmtEur(n: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);
}

function injectFont() {
  const id = "pmm-font";
  if (document.getElementById(id)) return;
  const el = document.createElement("link");
  el.id  = id; el.rel = "stylesheet";
  el.href = "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=DM+Sans:wght@400;500;600&display=swap";
  document.head.appendChild(el);
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function PosModifierModal({ product, restaurantId, onConfirm, onClose }: Props) {
  const [groups, setGroups]           = useState<ModGroup[]>([]);
  const [optsByGroup, setOptsByGroup] = useState<Record<string, ModOption[]>>({});
  const [loading, setLoading]         = useState(true);
  const [loadError, setLoadError]     = useState<string | null>(null);
  const [selected, setSelected]       = useState<Record<string, string[]>>({});
  const [qty, setQty]                 = useState(1);
  const [notes, setNotes]             = useState("");
  const [notesOpen, setNotesOpen]     = useState(false);
  const [attempted, setAttempted]     = useState(false);

  useEffect(() => { injectFont(); }, []);

  // ── Carga de datos ───────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    setLoading(true); setLoadError(null);
    setGroups([]); setOptsByGroup({});
    setSelected({}); setQty(1); setNotes(""); setAttempted(false); setNotesOpen(false);

    (async () => {
      const { data: pmg, error: pmgErr } = await supabase
        .from("product_modifier_groups")
        .select("modifier_group_id")
        .eq("restaurant_id", restaurantId)
        .eq("product_id", product.id);

      if (!alive) return;
      if (pmgErr) { setLoadError("Error al cargar opciones."); setLoading(false); return; }

      const groupIds = ((pmg ?? []) as { modifier_group_id: string }[]).map(r => r.modifier_group_id);
      if (!groupIds.length) { setLoading(false); return; }

      const [gRes, oRes] = await Promise.all([
        supabase.from("modifier_groups").select("id,name,min_select,max_select")
          .in("id", groupIds).eq("restaurant_id", restaurantId).eq("is_active", true),
        supabase.from("modifier_options").select("id,group_id,name,price,position")
          .in("group_id", groupIds).eq("restaurant_id", restaurantId).eq("is_active", true)
          .order("position", { ascending: true }),
      ]);

      if (!alive) return;
      if (gRes.error || oRes.error) { setLoadError("Error al cargar opciones."); setLoading(false); return; }

      const map: Record<string, ModOption[]> = {};
      for (const o of (oRes.data ?? []) as ModOption[]) {
        if (!map[o.group_id]) map[o.group_id] = [];
        map[o.group_id].push(o);
      }
      setGroups((gRes.data ?? []) as ModGroup[]);
      setOptsByGroup(map);
      setLoading(false);
    })();

    return () => { alive = false; };
  }, [product.id, restaurantId]);

  // ── Selección ────────────────────────────────────────────────────────────────
  const toggle = (group: ModGroup, optId: string) => {
    setSelected(prev => {
      const cur = prev[group.id] ?? [];
      const on  = cur.includes(optId);
      if (group.max_select === 1) return { ...prev, [group.id]: on ? [] : [optId] };
      if (on)  return { ...prev, [group.id]: cur.filter(id => id !== optId) };
      if (cur.length >= group.max_select) return prev;
      return { ...prev, [group.id]: [...cur, optId] };
    });
  };

  // ── Derivados ────────────────────────────────────────────────────────────────
  const selMods = useMemo((): SelectedModifier[] => {
    const out: SelectedModifier[] = [];
    for (const g of groups) {
      for (const id of selected[g.id] ?? []) {
        const o = (optsByGroup[g.id] ?? []).find(x => x.id === id);
        if (o) out.push({ group_id: g.id, group_name: g.name, option_id: o.id, option_name: o.name, price: +o.price });
      }
    }
    return out;
  }, [groups, selected, optsByGroup]);

  const extrasTotal = useMemo(() => selMods.reduce((s, m) => s + m.price, 0), [selMods]);
  const unitPrice   = +product.price + extrasTotal;

  const groupErrors = useMemo(() => {
    const e: Record<string, string | null> = {};
    for (const g of groups) {
      const n = (selected[g.id] ?? []).length;
      e[g.id] = n < g.min_select
        ? (g.min_select === 1 ? "Elige una opción" : `Mínimo ${g.min_select}`)
        : null;
    }
    return e;
  }, [groups, selected]);

  const isValid = useMemo(() => Object.values(groupErrors).every(e => e === null), [groupErrors]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const handleConfirm = () => {
    setAttempted(true);
    if (!isValid) return;
    onConfirm({ product_id: product.id, name: product.name, base_price: +product.price, qty, modifiers: selMods, extras_total: extrasTotal, unit_price: unitPrice, notes });
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      onClick={onClose}
      role="presentation"
      style={{
        position: "fixed", inset: 0, zIndex: 1100,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.78)",
        padding: 16, fontFamily: BODY,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Personalizar: ${product.name}`}
        style={{
          width: "100%", maxWidth: 680,
          maxHeight: "min(800px, calc(100vh - 32px))",
          display: "flex", flexDirection: "column",
          background: C.panel,
          borderRadius: 16,
          border: `1px solid ${C.border}`,
          boxShadow: "0 32px 80px rgba(0,0,0,0.85)",
          overflow: "hidden",
        }}
      >
        {/* ══ HEADER ══ */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px",
          borderBottom: `1px solid ${C.border}`,
          background: C.bg,
          flexShrink: 0, gap: 12,
        }}>
          <p style={{
            fontFamily: DISPLAY, fontWeight: 800, fontSize: 26,
            color: C.text, margin: 0, lineHeight: 1,
            textTransform: "uppercase", letterSpacing: "0.03em",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            flex: 1, minWidth: 0,
          }}>
            {product.name}
          </p>
          {/* Precio vivo */}
          <div style={{
            background: C.accentBg,
            border: `2px solid ${C.accent}`,
            borderRadius: 10, padding: "7px 16px",
            fontFamily: DISPLAY, fontWeight: 800, fontSize: 22,
            color: C.accent, letterSpacing: "0.04em", flexShrink: 0,
          }}>
            {fmtEur(unitPrice)}
          </div>
          <button
            onClick={onClose}
            style={{
              width: 36, height: 36, borderRadius: 8, flexShrink: 0,
              background: C.surface, border: `1px solid ${C.border}`,
              color: C.textSub, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: BODY, fontSize: 20, lineHeight: 1, fontWeight: 400,
            }}
          >
            ×
          </button>
        </div>

        {/* ══ BODY ══ */}
        <div style={{
          flex: 1, overflowY: "auto",
          padding: "14px 18px 12px",
          display: "flex", flexDirection: "column", gap: 12,
        }}>

          {loading && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 120 }}>
              <p style={{ color: C.textSub, fontSize: 14, fontFamily: BODY }}>Cargando…</p>
            </div>
          )}

          {loadError && (
            <div style={{ background: C.errorBg, borderRadius: 10, padding: "12px 16px", color: C.error, fontSize: 14 }}>
              {loadError}
            </div>
          )}

          {!loading && !loadError && groups.length === 0 && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 120 }}>
              <p style={{ color: C.textSub, fontSize: 14 }}>Sin opciones para este producto</p>
            </div>
          )}

          {/* ── Grupos de modificadores ── */}
          {!loading && !loadError && groups.map(group => {
            const opts     = optsByGroup[group.id] ?? [];
            const selIds   = selected[group.id] ?? [];
            const atMax    = selIds.length >= group.max_select;
            const err      = attempted ? groupErrors[group.id] : null;
            const required = group.min_select > 0;
            const selCount = selIds.length;
            const twoCol   = opts.length > 3;

            return (
              <div key={group.id} style={{
                borderRadius: 12,
                border: `1.5px solid ${err ? C.error + "90" : C.border}`,
                overflow: "hidden",
                flexShrink: 0,
              }}>
                {/* Cabecera del grupo */}
                <div style={{
                  display: "flex", alignItems: "center",
                  padding: "9px 14px",
                  background: C.bg,
                  borderBottom: `1px solid ${C.border}`,
                  gap: 10,
                }}>
                  <span style={{
                    fontFamily: DISPLAY, fontWeight: 700, fontSize: 14,
                    color: C.text, textTransform: "uppercase", letterSpacing: "0.1em",
                    flex: 1,
                  }}>
                    {group.name}
                  </span>

                  {/* Obligatorio / Opcional */}
                  <span style={{
                    fontSize: 10, fontWeight: 700, fontFamily: BODY,
                    textTransform: "uppercase", letterSpacing: "0.08em",
                    padding: "3px 8px", borderRadius: 20,
                    background: required ? `${C.accent}20` : `${C.textMuted}40`,
                    color: required ? C.accent : C.textSub,
                    border: `1px solid ${required ? C.accent + "45" : C.border}`,
                  }}>
                    {required ? "Obligatorio" : "Opcional"}
                  </span>

                  {/* Contador X/max — solo cuando max > 1 */}
                  {group.max_select > 1 && (
                    <div style={{
                      display: "flex", alignItems: "center", gap: 3,
                      background: atMax ? `${C.accent}22` : C.surface,
                      border: `1px solid ${atMax ? C.accent + "60" : C.border}`,
                      borderRadius: 8, padding: "2px 9px",
                    }}>
                      <span style={{
                        fontFamily: DISPLAY, fontWeight: 700, fontSize: 14,
                        color: atMax ? C.accent : C.textSub, letterSpacing: "0.04em",
                      }}>
                        {selCount}<span style={{ color: C.textMuted }}>/{group.max_select}</span>
                      </span>
                    </div>
                  )}

                  {err && (
                    <span style={{ fontSize: 11, color: C.error, fontWeight: 600, fontFamily: BODY }}>
                      ↑ {err}
                    </span>
                  )}
                </div>

                {/* Opciones */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: twoCol ? "1fr 1fr" : "1fr",
                  gap: 1,
                  background: C.border,
                }}>
                  {opts.map(opt => {
                    const isOn    = selIds.includes(opt.id);
                    const blocked = !isOn && atMax && group.max_select !== 1;
                    const price   = +opt.price;

                    return (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={blocked}
                        onClick={() => toggle(group, opt.id)}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "0 16px",
                          minHeight: 52,
                          background: isOn ? C.accent : C.surface,
                          cursor: blocked ? "not-allowed" : "pointer",
                          border: "none",
                          opacity: blocked ? 0.3 : 1,
                          transition: "background 0.1s",
                          gap: 12,
                          userSelect: "none",
                        }}
                      >
                        {/* Indicador + nombre */}
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{
                            width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            background: isOn ? "rgba(0,0,0,0.25)" : C.surfaceHi,
                            border: `2px solid ${isOn ? "rgba(0,0,0,0.2)" : C.borderHi}`,
                          }}>
                            {isOn && <Check size={13} color={C.accent} strokeWidth={3.5} />}
                          </div>
                          <span style={{
                            fontFamily: BODY, fontWeight: isOn ? 600 : 400, fontSize: 15,
                            color: isOn ? C.accentText : C.text,
                            lineHeight: 1.2,
                          }}>
                            {opt.name}
                          </span>
                        </div>
                        {/* Precio */}
                        {price > 0 && (
                          <span style={{
                            fontFamily: DISPLAY, fontWeight: 700, fontSize: 14,
                            color: isOn ? "rgba(0,0,0,0.55)" : C.textSub,
                            letterSpacing: "0.02em", flexShrink: 0,
                          }}>
                            +{fmtEur(price)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* ── Notas (colapsadas por defecto) ── */}
          {!loading && !loadError && (
            <div style={{ flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => setNotesOpen(o => !o)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: "transparent", border: "none", cursor: "pointer",
                  color: notesOpen ? C.textSub : C.textMuted,
                  fontFamily: BODY, fontSize: 13, fontWeight: 500,
                  padding: "6px 0",
                  transition: "color 0.15s",
                }}
              >
                <MessageSquare size={14} />
                <span>{notesOpen ? "Ocultar nota de cocina" : "Añadir nota de cocina"}</span>
                <ChevronDown
                  size={13}
                  style={{ transition: "transform 0.2s", transform: notesOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                />
              </button>
              {notesOpen && (
                <textarea
                  autoFocus
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Sin cebolla, más picante, alérgico a…"
                  rows={2}
                  style={{
                    marginTop: 6,
                    width: "100%", boxSizing: "border-box",
                    background: C.bg, border: `1.5px solid ${C.borderHi}`,
                    borderRadius: 10, padding: "10px 14px",
                    color: C.text, fontSize: 14, fontFamily: BODY, lineHeight: 1.5,
                    resize: "none", outline: "none",
                  }}
                />
              )}
            </div>
          )}
        </div>

        {/* ══ FOOTER ══ */}
        <div style={{
          display: "flex", alignItems: "stretch",
          borderTop: `2px solid ${C.border}`,
          background: C.bg,
          flexShrink: 0,
          height: 70,
        }}>
          {/* Cantidad */}
          <div style={{
            display: "flex", alignItems: "center",
            borderRight: `1px solid ${C.border}`,
            flexShrink: 0,
          }}>
            <button
              type="button"
              onClick={() => setQty(q => Math.max(1, q - 1))}
              style={{
                width: 56, height: "100%",
                cursor: qty <= 1 ? "not-allowed" : "pointer",
                background: "transparent", border: "none",
                color: qty <= 1 ? C.textMuted : C.textSub,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <Minus size={19} strokeWidth={2.5} />
            </button>
            <span style={{
              width: 38, textAlign: "center",
              fontFamily: DISPLAY, fontWeight: 800, fontSize: 26,
              color: C.text, letterSpacing: "0.02em",
            }}>
              {qty}
            </span>
            <button
              type="button"
              onClick={() => setQty(q => Math.min(20, q + 1))}
              style={{
                width: 56, height: "100%", cursor: "pointer",
                background: "transparent", border: "none",
                color: C.textSub,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <Plus size={19} strokeWidth={2.5} />
            </button>
          </div>

          {/* Cancelar */}
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 82, background: "transparent", border: "none",
              borderRight: `1px solid ${C.border}`,
              color: C.textSub, fontSize: 13, fontFamily: BODY, fontWeight: 500,
              cursor: "pointer", flexShrink: 0,
            }}
          >
            Cancelar
          </button>

          {/* Añadir */}
          <button
            type="button"
            onClick={handleConfirm}
            style={{
              flex: 1,
              display: "flex", alignItems: "center", justifyContent: "center",
              gap: 10, border: "none", cursor: "pointer",
              background: attempted && !isValid ? C.surfaceHi : C.accent,
              color: attempted && !isValid ? C.textMuted : C.accentText,
              transition: "background 0.12s, color 0.12s",
            }}
          >
            <ShoppingCart size={20} strokeWidth={2.5} />
            <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 21, letterSpacing: "0.06em" }}>
              AÑADIR
            </span>
            <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 21, opacity: 0.85 }}>
              · {fmtEur(unitPrice * qty)}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
