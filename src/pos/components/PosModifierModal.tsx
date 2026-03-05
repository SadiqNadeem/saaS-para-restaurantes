import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

import { supabase } from "../../lib/supabase";

// ─── Exported types (used by PosCajaPage) ────────────────────────────────────

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

// ─── Internal types ───────────────────────────────────────────────────────────

type ModGroup = {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  sort_order: number;
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
  onConfirm: (payload: ModalConfirmPayload) => void;
  onClose: () => void;
};

// ─── Helper ───────────────────────────────────────────────────────────────────

function fmtEur(n: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(n);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PosModifierModal({ product, onConfirm, onClose }: Props) {
  const [groups, setGroups] = useState<ModGroup[]>([]);
  const [optionsByGroup, setOptionsByGroup] = useState<Record<string, ModOption[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // selected[group_id] = [option_id, ...]
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");
  const [attempted, setAttempted] = useState(false);

  // ── Load modifier groups + options ──
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError(null);
    setGroups([]);
    setOptionsByGroup({});
    setSelected({});
    setQty(1);
    setNotes("");
    setAttempted(false);

    const load = async () => {
      // Step 1: which groups are linked to this product (with their display order)
      const { data: pmgData, error: pmgErr } = await supabase
        .from("product_modifier_groups")
        .select("group_id, sort_order")
        .eq("product_id", product.id)
        .order("sort_order", { ascending: true });

      if (!alive) return;
      if (pmgErr) {
        setLoadError(pmgErr.message);
        setLoading(false);
        return;
      }

      const pmgRows = (pmgData ?? []) as Array<{ group_id: string; sort_order: number }>;
      const groupIds = pmgRows.map((r) => r.group_id);
      const sortMap: Record<string, number> = {};
      for (const r of pmgRows) sortMap[r.group_id] = r.sort_order;

      if (groupIds.length === 0) {
        setLoading(false);
        return;
      }

      // Step 2+3: groups + options in parallel
      const [groupRes, optRes] = await Promise.all([
        supabase
          .from("modifier_groups")
          .select("id, name, min_select, max_select")
          .in("id", groupIds)
          .eq("is_active", true),
        supabase
          .from("modifier_options")
          .select("id, group_id, name, price, position")
          .in("group_id", groupIds)
          .eq("is_active", true)
          .order("position", { ascending: true }),
      ]);

      if (!alive) return;

      if (groupRes.error) {
        setLoadError(groupRes.error.message);
        setLoading(false);
        return;
      }

      type RawGroup = { id: string; name: string; min_select: number; max_select: number };
      const rawGroups = (groupRes.data ?? []) as RawGroup[];

      // Sort groups by the sort_order from product_modifier_groups
      const sortedGroups: ModGroup[] = rawGroups
        .map((g) => ({ ...g, sort_order: sortMap[g.id] ?? 0 }))
        .sort((a, b) => a.sort_order - b.sort_order);

      const rawOptions = (optRes.data ?? []) as ModOption[];
      const optsMap: Record<string, ModOption[]> = {};
      for (const opt of rawOptions) {
        if (!optsMap[opt.group_id]) optsMap[opt.group_id] = [];
        optsMap[opt.group_id].push(opt);
      }

      setGroups(sortedGroups);
      setOptionsByGroup(optsMap);
      setLoading(false);
    };

    void load();
    return () => {
      alive = false;
    };
  }, [product.id]);

  // ── Toggle option ──
  const toggleOption = (group: ModGroup, optId: string) => {
    setSelected((prev) => {
      const current = prev[group.id] ?? [];
      const exists = current.includes(optId);

      if (group.max_select === 1) {
        // Radio: same click deselects, different click replaces
        return { ...prev, [group.id]: exists ? [] : [optId] };
      }

      // Checkbox
      if (exists) {
        return { ...prev, [group.id]: current.filter((id) => id !== optId) };
      }
      if (current.length >= group.max_select) return prev; // at max, ignore
      return { ...prev, [group.id]: [...current, optId] };
    });
  };

  // ── Derived: flat list of selected modifiers ──
  const selectedModifiers = useMemo((): SelectedModifier[] => {
    const out: SelectedModifier[] = [];
    for (const group of groups) {
      const optIds = selected[group.id] ?? [];
      const options = optionsByGroup[group.id] ?? [];
      for (const optId of optIds) {
        const opt = options.find((o) => o.id === optId);
        if (opt) {
          out.push({
            group_id: group.id,
            group_name: group.name,
            option_id: opt.id,
            option_name: opt.name,
            price: Number(opt.price),
          });
        }
      }
    }
    return out;
  }, [groups, selected, optionsByGroup]);

  const extrasTotal = useMemo(
    () => selectedModifiers.reduce((sum, m) => sum + m.price, 0),
    [selectedModifiers]
  );

  const unitPrice = Number(product.price) + extrasTotal;

  // ── Validation ──
  const groupErrors = useMemo((): Record<string, string | null> => {
    const errs: Record<string, string | null> = {};
    for (const g of groups) {
      const cnt = (selected[g.id] ?? []).length;
      if (cnt < g.min_select) {
        errs[g.id] =
          g.min_select === 1 ? "Elige una opción" : `Elige al menos ${g.min_select}`;
      } else if (cnt > g.max_select) {
        errs[g.id] = `Máximo ${g.max_select} opciones`;
      } else {
        errs[g.id] = null;
      }
    }
    return errs;
  }, [groups, selected]);

  const isValid = useMemo(
    () => Object.values(groupErrors).every((e) => e === null),
    [groupErrors]
  );

  // ── Escape key closes modal ──
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // ── Confirm ──
  const handleConfirm = () => {
    setAttempted(true);
    if (!isValid) return;
    onConfirm({
      product_id: product.id,
      name: product.name,
      base_price: Number(product.price),
      qty,
      modifiers: selectedModifiers,
      extras_total: extrasTotal,
      unit_price: unitPrice,
      notes,
    });
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      style={m.backdrop}
      role="presentation"
      onClick={onClose}
    >
      <div
        style={m.modal}
        role="dialog"
        aria-modal="true"
        aria-label={`Opciones: ${product.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div style={m.header}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={m.productName}>{product.name}</div>
            <div style={m.priceLine}>
              Base {fmtEur(Number(product.price))}
              {extrasTotal > 0 && (
                <>
                  {" · "}Extras {fmtEur(extrasTotal)}
                  {" · "}
                  <strong style={{ color: "#4ade80" }}>
                    Total {fmtEur(unitPrice)}
                  </strong>
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            style={m.closeBtn}
            onClick={onClose}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* ── Body (scrollable) ── */}
        <div style={m.body}>
          {loading && (
            <div style={m.centeredMsg}>Cargando opciones...</div>
          )}

          {loadError && (
            <div style={m.errorBox}>{loadError}</div>
          )}

          {!loading && !loadError && groups.length === 0 && (
            <div style={m.centeredMsg}>Sin opciones configuradas.</div>
          )}

          {/* Modifier groups */}
          {!loading &&
            !loadError &&
            groups.map((group) => {
              const options = optionsByGroup[group.id] ?? [];
              const selectedIds = selected[group.id] ?? [];
              const isRadio = group.max_select === 1;
              const error = attempted ? groupErrors[group.id] : null;

              const sublabel = isRadio
                ? group.min_select > 0
                  ? "Obligatorio · Elige 1"
                  : "Opcional · Elige 1"
                : group.min_select > 0
                ? `Obligatorio · ${group.min_select}–${group.max_select} opciones`
                : `Opcional · máx ${group.max_select}`;

              return (
                <div key={group.id} style={m.groupCard}>
                  {/* Group header */}
                  <div style={m.groupHeader}>
                    <div style={m.groupName}>{group.name}</div>
                    <div style={m.groupSublabel}>{sublabel}</div>
                  </div>

                  {/* Options */}
                  <div style={m.optionsList}>
                    {options.map((opt) => {
                      const isSelected = selectedIds.includes(opt.id);
                      const isAtMax =
                        !isRadio &&
                        !isSelected &&
                        selectedIds.length >= group.max_select;

                      return (
                        <button
                          key={opt.id}
                          type="button"
                          disabled={isAtMax}
                          onClick={() => toggleOption(group, opt.id)}
                          style={{
                            ...m.optionBtn,
                            ...(isSelected ? m.optionBtnSelected : {}),
                            opacity: isAtMax ? 0.38 : 1,
                          }}
                        >
                          {/* Indicator */}
                          <span
                            style={
                              isSelected ? m.indicatorOn : m.indicatorOff
                            }
                          >
                            {isRadio
                              ? isSelected
                                ? "●"
                                : "○"
                              : isSelected
                              ? "✓"
                              : "□"}
                          </span>

                          <span style={m.optionName}>{opt.name}</span>

                          <span style={m.optionPrice}>
                            {Number(opt.price) === 0
                              ? "Gratis"
                              : `+${fmtEur(Number(opt.price))}`}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Inline validation error (only after attempt) */}
                  {error && <div style={m.groupError}>{error}</div>}
                </div>
              );
            })}

          {/* Notes */}
          {!loading && !loadError && (
            <div style={m.groupCard}>
              <div style={m.groupHeader}>
                <div style={m.groupName}>Notas</div>
                <div style={m.groupSublabel}>Opcional</div>
              </div>
              <textarea
                rows={2}
                placeholder="Notas para cocina..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={m.notesInput}
              />
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={m.footer}>
          {/* Qty selector */}
          <div style={m.qtyRow}>
            <span style={m.qtyLabel}>Cantidad</span>
            <div style={m.qtyCtrl}>
              <button
                type="button"
                style={m.qtyBtn}
                onClick={() => setQty((q) => Math.max(1, q - 1))}
              >
                −
              </button>
              <span style={m.qtyVal}>{qty}</span>
              <button
                type="button"
                style={m.qtyBtn}
                onClick={() => setQty((q) => Math.min(10, q + 1))}
              >
                +
              </button>
            </div>
          </div>

          {/* Action buttons */}
          <div style={m.actions}>
            <button type="button" style={m.cancelBtn} onClick={onClose}>
              Cancelar
            </button>
            <button
              type="button"
              style={isValid || !attempted ? m.confirmBtn : m.confirmBtnInvalid}
              onClick={handleConfirm}
            >
              Añadir{qty > 1 ? ` ×${qty}` : ""} · {fmtEur(unitPrice * qty)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const G = "#4ade80";
const BG = "#0f172a";
const PANEL = "#1e293b";
const PANEL2 = "#263555";
const BORDER = "#334155";
const MUTED = "#64748b";
const TEXT = "#f1f5f9";
const SEC = "#94a3b8";
const ERR = "#f87171";

// ─── Styles ───────────────────────────────────────────────────────────────────

const m: Record<string, CSSProperties> = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.72)",
    zIndex: 1100,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },

  modal: {
    width: "min(540px, 100%)",
    maxHeight: "90dvh",
    display: "flex",
    flexDirection: "column",
    background: PANEL,
    borderRadius: 16,
    border: `1px solid ${BORDER}`,
    boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
    overflow: "hidden",
    fontFamily: "system-ui, -apple-system, sans-serif",
    color: TEXT,
  },

  // Header
  header: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "16px 18px",
    borderBottom: `1px solid ${BORDER}`,
    flexShrink: 0,
  },
  productName: {
    fontSize: 18,
    fontWeight: 800,
    color: TEXT,
    lineHeight: 1.2,
  },
  priceLine: {
    marginTop: 4,
    fontSize: 13,
    color: SEC,
  },
  closeBtn: {
    border: `1px solid ${BORDER}`,
    background: "transparent",
    color: SEC,
    borderRadius: 8,
    width: 36,
    height: 36,
    cursor: "pointer",
    fontSize: 14,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  // Body
  body: {
    flex: 1,
    overflowY: "auto",
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  centeredMsg: {
    padding: "32px 0",
    textAlign: "center",
    color: MUTED,
    fontSize: 14,
  },
  errorBox: {
    padding: "10px 14px",
    borderRadius: 8,
    background: "rgba(248,113,113,0.10)",
    border: `1px solid ${ERR}`,
    color: ERR,
    fontSize: 13,
  },

  // Modifier group card
  groupCard: {
    border: `1px solid ${BORDER}`,
    borderRadius: 12,
    overflow: "hidden",
  },
  groupHeader: {
    padding: "10px 14px",
    background: BG,
    borderBottom: `1px solid ${BORDER}`,
  },
  groupName: {
    fontSize: 14,
    fontWeight: 700,
    color: TEXT,
  },
  groupSublabel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    color: MUTED,
  },
  groupError: {
    padding: "7px 14px",
    fontSize: 12,
    fontWeight: 600,
    color: ERR,
    background: "rgba(248,113,113,0.07)",
    borderTop: `1px solid rgba(248,113,113,0.20)`,
  },

  // Options list
  optionsList: {
    display: "flex",
    flexDirection: "column",
    gap: 0,
  },
  optionBtn: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "13px 14px",
    border: "none",
    borderBottom: `1px solid rgba(51,65,85,0.5)`,
    background: PANEL,
    color: TEXT,
    cursor: "pointer",
    fontSize: 14,
    textAlign: "left",
    minHeight: 52,
    transition: "background 0.1s",
  },
  optionBtnSelected: {
    background: "rgba(74,222,128,0.09)",
  },

  // Radio/checkbox indicator
  indicatorOff: {
    fontSize: 17,
    color: BORDER,
    flexShrink: 0,
    width: 20,
    textAlign: "center",
  },
  indicatorOn: {
    fontSize: 17,
    color: G,
    flexShrink: 0,
    width: 20,
    textAlign: "center",
  },
  optionName: {
    flex: 1,
    fontWeight: 500,
    color: TEXT,
  },
  optionPrice: {
    fontSize: 13,
    fontWeight: 700,
    color: SEC,
    flexShrink: 0,
  },

  // Notes textarea
  notesInput: {
    width: "100%",
    padding: "12px 14px",
    border: "none",
    background: PANEL,
    color: TEXT,
    fontSize: 14,
    resize: "none",
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box",
  },

  // Footer
  footer: {
    flexShrink: 0,
    borderTop: `1px solid ${BORDER}`,
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    background: BG,
  },

  // Qty row
  qtyRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  qtyLabel: {
    fontSize: 13,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    color: MUTED,
  },
  qtyCtrl: {
    display: "flex",
    alignItems: "center",
    border: `1px solid ${BORDER}`,
    borderRadius: 10,
    overflow: "hidden",
  },
  qtyBtn: {
    border: "none",
    background: PANEL2,
    color: TEXT,
    cursor: "pointer",
    fontSize: 20,
    width: 44,
    height: 44,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    minHeight: 44,
  },
  qtyVal: {
    fontSize: 16,
    fontWeight: 800,
    color: TEXT,
    minWidth: 40,
    textAlign: "center",
  },

  // Action buttons
  actions: {
    display: "flex",
    gap: 10,
  },
  cancelBtn: {
    flex: "0 0 auto",
    padding: "14px 18px",
    borderRadius: 10,
    border: `1px solid ${BORDER}`,
    background: "transparent",
    color: SEC,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
    minHeight: 52,
  },
  confirmBtn: {
    flex: 1,
    padding: "14px 18px",
    borderRadius: 10,
    border: "none",
    background: G,
    color: "#052e16",
    cursor: "pointer",
    fontSize: 15,
    fontWeight: 800,
    minHeight: 52,
    letterSpacing: "0.04em",
  },
  confirmBtnInvalid: {
    flex: 1,
    padding: "14px 18px",
    borderRadius: 10,
    border: "none",
    background: "#1a2540",
    color: BORDER,
    cursor: "not-allowed",
    fontSize: 15,
    fontWeight: 800,
    minHeight: 52,
    letterSpacing: "0.04em",
  },
};
