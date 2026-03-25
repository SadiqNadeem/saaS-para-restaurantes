import { useRef, useState, useMemo } from "react";

// ─── Local types (subset of OrderDetail / OrderDetailItem) ───────────────────

export type SplitItem = {
  id: string;
  qty: number;
  snapshot_name: string | null;
  unit_price: number | null;
  line_total: number | null;
  order_item_modifier_options?: Array<{ option_name: string | null }> | null;
};

export type SplitOrderDetail = {
  id: string;
  total: number | null;
  subtotal: number | null;
  tip_amount: number | null;
  delivery_fee: number | null;
  order_items: SplitItem[];
};

export type SplitBillModalProps = {
  detail: SplitOrderDetail;
  onClose: () => void;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtEur(n: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(n);
}

function itemLineTotal(item: SplitItem): number {
  return item.line_total ?? (item.unit_price ?? 0) * item.qty;
}

type SplitMode = "equal" | "items";

// ─── Mode A — equal split ─────────────────────────────────────────────────────

function ModeEqualSplit({
  total,
  onDone,
}: {
  total: number;
  onDone: () => void;
}) {
  const [people, setPeople] = useState(2);
  const [paidParts, setPaidParts] = useState<Set<number>>(new Set());

  const perPerson = total / people;
  const allPaid = paidParts.size === people;

  return (
    <div style={m.body}>
      {/* People selector */}
      <div style={m.equalRow}>
        <span style={m.equalLabel}>¿Entre cuántas personas?</span>
        <div style={m.stepper}>
          <button
            type="button"
            style={m.stepBtn}
            disabled={people <= 2}
            onClick={() => {
              setPeople((p) => Math.max(2, p - 1));
              setPaidParts(new Set());
            }}
          >
            −
          </button>
          <span style={m.stepVal}>{people}</span>
          <button
            type="button"
            style={m.stepBtn}
            disabled={people >= 20}
            onClick={() => {
              setPeople((p) => Math.min(20, p + 1));
              setPaidParts(new Set());
            }}
          >
            +
          </button>
        </div>
      </div>

      {/* Per-person amount */}
      <div style={m.perPersonBox}>
        <span style={m.perPersonLabel}>Por persona</span>
        <span style={m.perPersonAmt}>{fmtEur(perPerson)}</span>
      </div>

      {/* Parts */}
      {!allPaid ? (
        <div style={m.partsGrid}>
          {Array.from({ length: people }, (_, i) => {
            const paid = paidParts.has(i);
            return (
              <button
                key={i}
                type="button"
                disabled={paid}
                onClick={() => setPaidParts((prev) => new Set([...prev, i]))}
                style={paid ? m.partBtnPaid : m.partBtn}
              >
                {paid ? (
                  <span style={m.partCheckmark}>✓</span>
                ) : null}
                <span style={m.partPersonLabel}>Persona {i + 1}</span>
                <span style={m.partAmt}>{fmtEur(perPerson)}</span>
                {!paid && (
                  <span style={m.partCobrarLabel}>Cobrar</span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div style={m.doneBox}>
          <span style={m.doneIcon}>✓</span>
          <span style={m.doneText}>Cuenta saldada — {people} personas × {fmtEur(perPerson)}</span>
          <button type="button" style={m.doneBtn} onClick={onDone}>
            Cerrar
          </button>
        </div>
      )}

      {/* Progress */}
      {!allPaid && (
        <div style={m.progressBar}>
          <div style={{ ...m.progressFill, width: `${(paidParts.size / people) * 100}%` }} />
        </div>
      )}
      {!allPaid && (
        <div style={m.progressText}>
          {paidParts.size} / {people} pagado{paidParts.size !== 1 ? "s" : ""} · Pendiente: {fmtEur(perPerson * (people - paidParts.size))}
        </div>
      )}
    </div>
  );
}

// ─── Mode B — split by items ──────────────────────────────────────────────────

type PaidGroup = {
  id: number;
  amount: number;
  label: string;
};

function ModeItemsSplit({
  items,
  total,
  onDone,
}: {
  items: SplitItem[];
  total: number;
  onDone: () => void;
}) {
  const nextId = useRef(1);

  // Map itemId → how much has been paid for it so far
  const [paidByItem, setPaidByItem] = useState<Map<string, number>>(new Map());
  // Current selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // For each selected item, how many people split it (default 1)
  const [splitAmong, setSplitAmong] = useState<Map<string, number>>(new Map());
  // Paid groups (history)
  const [paidGroups, setPaidGroups] = useState<PaidGroup[]>([]);

  const totalPaid = paidGroups.reduce((s, g) => s + g.amount, 0);
  const remaining = total - totalPaid;
  const allPaid = remaining < 0.005;

  const selectionTotal = useMemo(() => {
    let sum = 0;
    for (const id of selectedIds) {
      const item = items.find((it) => it.id === id);
      if (!item) continue;
      const n = splitAmong.get(id) ?? 1;
      sum += itemLineTotal(item) / n;
    }
    return sum;
  }, [selectedIds, splitAmong, items]);

  const toggleItem = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handlePayGroup = () => {
    if (selectedIds.size === 0 || selectionTotal < 0.005) return;

    const groupNum = paidGroups.length + 1;
    const newGroup: PaidGroup = {
      id: nextId.current++,
      amount: selectionTotal,
      label: `Persona ${groupNum}`,
    };

    setPaidGroups((prev) => [...prev, newGroup]);

    setPaidByItem((prev) => {
      const next = new Map(prev);
      for (const id of selectedIds) {
        const item = items.find((it) => it.id === id);
        if (!item) continue;
        const n = splitAmong.get(id) ?? 1;
        const contribution = itemLineTotal(item) / n;
        next.set(id, (next.get(id) ?? 0) + contribution);
      }
      return next;
    });

    setSelectedIds(new Set());
    setSplitAmong(new Map());
  };

  if (allPaid) {
    return (
      <div style={m.body}>
        <div style={m.doneBox}>
          <span style={m.doneIcon}>✓</span>
          <span style={m.doneText}>Cuenta saldada — {paidGroups.length} cobro{paidGroups.length !== 1 ? "s" : ""}</span>
          <div style={m.paidGroupList}>
            {paidGroups.map((g) => (
              <div key={g.id} style={m.paidGroupRow}>
                <span>{g.label}</span>
                <strong>{fmtEur(g.amount)}</strong>
              </div>
            ))}
          </div>
          <button type="button" style={m.doneBtn} onClick={onDone}>
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={m.body}>
      {/* Items list */}
      <div style={m.itemsListHeader}>
        <span style={m.sectionLabel}>Selecciona items para este cobro</span>
        {paidGroups.length > 0 && (
          <span style={m.remainingBadge}>Pendiente: {fmtEur(remaining)}</span>
        )}
      </div>

      <div style={m.itemsList}>
        {items.map((item) => {
          const lt = itemLineTotal(item);
          const paid = paidByItem.get(item.id) ?? 0;
          const fullyPaid = paid >= lt - 0.005;
          const isSelected = selectedIds.has(item.id);
          const n = splitAmong.get(item.id) ?? 1;
          const contribution = lt / n;
          const mods = (item.order_item_modifier_options ?? [])
            .map((m) => m.option_name)
            .filter(Boolean)
            .join(", ");

          return (
            <div
              key={item.id}
              style={{
                ...m.itemRow,
                ...(fullyPaid ? m.itemRowPaid : {}),
                ...(isSelected && !fullyPaid ? m.itemRowSelected : {}),
              }}
            >
              <button
                type="button"
                disabled={fullyPaid}
                style={m.itemCheckBtn}
                onClick={() => toggleItem(item.id)}
                aria-pressed={isSelected}
              >
                <span
                  style={{
                    ...m.checkbox,
                    ...(isSelected ? m.checkboxChecked : {}),
                    ...(fullyPaid ? m.checkboxPaid : {}),
                  }}
                >
                  {fullyPaid ? "✓" : isSelected ? "✓" : ""}
                </span>
              </button>

              <div style={m.itemInfo}>
                <span style={m.itemName}>
                  {item.qty}× {item.snapshot_name ?? "Producto"}
                </span>
                {mods ? <span style={m.itemMods}>{mods}</span> : null}
                {fullyPaid ? (
                  <span style={m.itemPaidTag}>Pagado</span>
                ) : paid > 0 ? (
                  <span style={m.itemPartialTag}>Parcial: {fmtEur(paid)} / {fmtEur(lt)}</span>
                ) : null}
              </div>

              <div style={m.itemRight}>
                {!fullyPaid && isSelected && (
                  <div style={m.splitControl}>
                    <span style={m.splitLabel}>÷</span>
                    <button
                      type="button"
                      style={m.splitStepBtn}
                      disabled={n <= 1}
                      onClick={() =>
                        setSplitAmong((prev) =>
                          new Map([...prev, [item.id, Math.max(1, n - 1)]])
                        )
                      }
                    >
                      −
                    </button>
                    <span style={m.splitN}>{n}</span>
                    <button
                      type="button"
                      style={m.splitStepBtn}
                      disabled={n >= 20}
                      onClick={() =>
                        setSplitAmong((prev) =>
                          new Map([...prev, [item.id, Math.min(20, n + 1)]])
                        )
                      }
                    >
                      +
                    </button>
                    <span style={m.splitContrib}>{fmtEur(contribution)}</span>
                  </div>
                )}
                {(!isSelected || fullyPaid) && (
                  <span style={fullyPaid ? m.itemTotalPaid : m.itemTotal}>{fmtEur(lt)}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Current selection subtotal + Cobrar button */}
      <div style={m.selectionFooter}>
        <div style={m.selectionInfo}>
          <span style={m.selectionLabel}>Esta selección</span>
          <span style={m.selectionAmt}>{fmtEur(selectionTotal)}</span>
        </div>
        <button
          type="button"
          disabled={selectedIds.size === 0 || selectionTotal < 0.005}
          style={
            selectedIds.size === 0 || selectionTotal < 0.005
              ? m.cobrarBtnDisabled
              : m.cobrarBtn
          }
          onClick={handlePayGroup}
        >
          Cobrar esta selección
        </button>
      </div>

      {/* Paid groups history */}
      {paidGroups.length > 0 && (
        <div style={m.paidGroupList}>
          {paidGroups.map((g) => (
            <div key={g.id} style={m.paidGroupRow}>
              <span style={m.paidGroupLabel}>✓ {g.label}</span>
              <strong style={m.paidGroupAmt}>{fmtEur(g.amount)}</strong>
            </div>
          ))}
          <div style={m.paidGroupTotal}>
            <span>Cobrado</span>
            <strong>{fmtEur(totalPaid)}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export default function SplitBillModal({ detail, onClose }: SplitBillModalProps) {
  const [mode, setMode] = useState<SplitMode>("equal");

  const total =
    detail.total ??
    (detail.subtotal ?? 0) + (detail.tip_amount ?? 0) + (detail.delivery_fee ?? 0);

  return (
    <div style={m.overlay} onClick={onClose}>
      <div style={m.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={m.head}>
          <div>
            <h3 style={m.title}>Dividir cuenta</h3>
            <span style={m.totalLabel}>Total: {fmtEur(total)}</span>
          </div>
          <button type="button" style={m.closeBtn} onClick={onClose}>
            ×
          </button>
        </div>

        {/* Mode tabs */}
        <div style={m.modeTabs}>
          <button
            type="button"
            style={mode === "equal" ? m.modeTabActive : m.modeTab}
            onClick={() => setMode("equal")}
          >
            A partes iguales
          </button>
          <button
            type="button"
            style={mode === "items" ? m.modeTabActive : m.modeTab}
            onClick={() => setMode("items")}
          >
            Por items
          </button>
        </div>

        {/* Content — key forces full reset when switching modes */}
        {mode === "equal" ? (
          <ModeEqualSplit key="equal" total={total} onDone={onClose} />
        ) : (
          <ModeItemsSplit key="items" items={detail.order_items} total={total} onDone={onClose} />
        )}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const m = {
  overlay: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10000,
    padding: 16,
  },
  modal: {
    background: "#1e293b",
    borderRadius: 14,
    width: "100%",
    maxWidth: 520,
    maxHeight: "90dvh",
    display: "flex",
    flexDirection: "column" as const,
    overflow: "hidden",
    boxShadow: "0 24px 60px rgba(0,0,0,0.7)",
    border: "1px solid #334155",
  },
  head: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    padding: "18px 20px 14px",
    borderBottom: "1px solid #334155",
    flexShrink: 0,
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
    color: "#f1f5f9",
  },
  totalLabel: {
    fontSize: 13,
    color: "#94a3b8",
    marginTop: 2,
    display: "block",
  },
  closeBtn: {
    background: "transparent",
    border: "none",
    color: "#64748b",
    fontSize: 22,
    cursor: "pointer",
    lineHeight: 1,
    padding: "0 4px",
    fontWeight: 700,
  },

  // Mode tabs
  modeTabs: {
    display: "flex",
    padding: "12px 20px 0",
    gap: 8,
    flexShrink: 0,
  },
  modeTab: {
    flex: 1,
    padding: "9px 12px",
    borderRadius: 8,
    border: "1px solid #334155",
    background: "transparent",
    color: "#64748b",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  modeTabActive: {
    flex: 1,
    padding: "9px 12px",
    borderRadius: 8,
    border: "1px solid #4ade80",
    background: "rgba(74,222,128,0.1)",
    color: "#4ade80",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },

  // Shared body
  body: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "16px 20px 20px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 16,
  },

  // Mode A — equal split
  equalRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  equalLabel: {
    fontSize: 14,
    color: "#cbd5e1",
    fontWeight: 600,
  },
  stepper: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    border: "1px solid #334155",
    background: "#0f172a",
    color: "#f1f5f9",
    fontSize: 18,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  stepVal: {
    minWidth: 28,
    textAlign: "center" as const,
    fontSize: 20,
    fontWeight: 800,
    color: "#f1f5f9",
  },
  perPersonBox: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 18px",
    background: "#0f172a",
    borderRadius: 10,
    border: "1px solid #334155",
  },
  perPersonLabel: {
    fontSize: 13,
    color: "#94a3b8",
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  },
  perPersonAmt: {
    fontSize: 24,
    fontWeight: 800,
    color: "#4ade80",
    fontVariantNumeric: "tabular-nums",
  },
  partsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
  },
  partBtn: {
    padding: "14px 12px",
    borderRadius: 10,
    border: "1px solid #334155",
    background: "#0f172a",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 4,
    transition: "border-color 0.15s",
  },
  partBtnPaid: {
    padding: "14px 12px",
    borderRadius: 10,
    border: "1px solid #4ade80",
    background: "rgba(74,222,128,0.08)",
    cursor: "default",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 4,
  },
  partCheckmark: {
    fontSize: 18,
    color: "#4ade80",
  },
  partPersonLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "#94a3b8",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  },
  partAmt: {
    fontSize: 16,
    fontWeight: 700,
    color: "#f1f5f9",
    fontVariantNumeric: "tabular-nums",
  },
  partCobrarLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "#4ade80",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    marginTop: 2,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    background: "#0f172a",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background: "#4ade80",
    borderRadius: 3,
    transition: "width 0.3s ease",
  },
  progressText: {
    fontSize: 12,
    color: "#64748b",
    textAlign: "center" as const,
    fontVariantNumeric: "tabular-nums",
  },

  // Done state
  doneBox: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 12,
    padding: "24px 16px",
  },
  doneIcon: {
    fontSize: 40,
    color: "#4ade80",
  },
  doneText: {
    fontSize: 15,
    fontWeight: 600,
    color: "#f1f5f9",
    textAlign: "center" as const,
  },
  doneBtn: {
    marginTop: 8,
    padding: "10px 28px",
    borderRadius: 8,
    border: "none",
    background: "#334155",
    color: "#f1f5f9",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },

  // Mode B — items
  sectionLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: "#94a3b8",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  },
  itemsListHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  remainingBadge: {
    fontSize: 12,
    fontWeight: 700,
    color: "#fbbf24",
    background: "rgba(251,191,36,0.12)",
    padding: "3px 8px",
    borderRadius: 6,
  },
  itemsList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
  },
  itemRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #334155",
    background: "#0f172a",
    transition: "border-color 0.15s",
  },
  itemRowSelected: {
    border: "1px solid #4ade80",
    background: "rgba(74,222,128,0.06)",
  },
  itemRowPaid: {
    border: "1px solid #475569",
    background: "#0f172a",
    opacity: 0.55,
  },
  itemCheckBtn: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: 0,
    flexShrink: 0,
  },
  checkbox: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 22,
    height: 22,
    borderRadius: 6,
    border: "2px solid #475569",
    fontSize: 13,
    fontWeight: 700,
    color: "transparent",
    background: "transparent",
    transition: "all 0.12s",
  },
  checkboxChecked: {
    border: "2px solid #4ade80",
    background: "#4ade80",
    color: "#0f172a",
  },
  checkboxPaid: {
    border: "2px solid #475569",
    background: "#475569",
    color: "#94a3b8",
  },
  itemInfo: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column" as const,
    gap: 2,
  },
  itemName: {
    fontSize: 13,
    fontWeight: 600,
    color: "#e2e8f0",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  itemMods: {
    fontSize: 11,
    color: "#64748b",
  },
  itemPaidTag: {
    fontSize: 11,
    fontWeight: 700,
    color: "#4ade80",
  },
  itemPartialTag: {
    fontSize: 11,
    fontWeight: 600,
    color: "#fbbf24",
    fontVariantNumeric: "tabular-nums",
  },
  itemRight: {
    display: "flex",
    alignItems: "center",
    flexShrink: 0,
  },
  itemTotal: {
    fontSize: 14,
    fontWeight: 700,
    color: "#f1f5f9",
    fontVariantNumeric: "tabular-nums",
  },
  itemTotalPaid: {
    fontSize: 14,
    fontWeight: 700,
    color: "#475569",
    fontVariantNumeric: "tabular-nums",
    textDecoration: "line-through",
  },
  splitControl: {
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  splitLabel: {
    fontSize: 13,
    color: "#64748b",
    marginRight: 2,
  },
  splitStepBtn: {
    width: 24,
    height: 24,
    borderRadius: 5,
    border: "1px solid #334155",
    background: "#1e293b",
    color: "#f1f5f9",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  },
  splitN: {
    minWidth: 20,
    textAlign: "center" as const,
    fontSize: 13,
    fontWeight: 700,
    color: "#f1f5f9",
  },
  splitContrib: {
    marginLeft: 4,
    fontSize: 13,
    fontWeight: 700,
    color: "#4ade80",
    fontVariantNumeric: "tabular-nums",
  },

  // Selection footer
  selectionFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "14px 16px",
    background: "#0f172a",
    borderRadius: 10,
    border: "1px solid #334155",
    flexShrink: 0,
  },
  selectionInfo: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 2,
  },
  selectionLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "#64748b",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  },
  selectionAmt: {
    fontSize: 20,
    fontWeight: 800,
    color: "#f1f5f9",
    fontVariantNumeric: "tabular-nums",
  },
  cobrarBtn: {
    padding: "11px 18px",
    borderRadius: 9,
    border: "none",
    background: "#4ade80",
    color: "#0f172a",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    flexShrink: 0,
  },
  cobrarBtnDisabled: {
    padding: "11px 18px",
    borderRadius: 9,
    border: "none",
    background: "#1e293b",
    color: "#475569",
    fontSize: 14,
    fontWeight: 700,
    cursor: "not-allowed",
    flexShrink: 0,
    border2: "1px solid #334155",
  },

  // Paid groups history
  paidGroupList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
    background: "#0f172a",
    borderRadius: 8,
    padding: "10px 12px",
    border: "1px solid #334155",
  },
  paidGroupRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  paidGroupLabel: {
    fontSize: 13,
    color: "#4ade80",
    fontWeight: 600,
  },
  paidGroupAmt: {
    fontSize: 13,
    color: "#4ade80",
    fontVariantNumeric: "tabular-nums",
  },
  paidGroupTotal: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
    paddingTop: 8,
    borderTop: "1px solid #334155",
    fontSize: 13,
    color: "#94a3b8",
    fontVariantNumeric: "tabular-nums",
  },
} as const;
