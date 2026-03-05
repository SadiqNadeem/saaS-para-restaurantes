import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { supabase } from "../lib/supabase";

type IngredientGroup = {
  id: string;
  product_id: string;
  name: string;
  min_select: number;
  max_select: number;
  sort_order: number;
};

type Ingredient = {
  id: string;
  group_id: string;
  name: string;
  price_delta: number;
  sort_order: number;
};

/** ✅ Lo usará App.tsx para pintar el carrito */
export type SelectedExtra = {
  ingredientId: string;
  name: string;
  price: number;
};

/** ✅ Payload que devuelve el modal a App.tsx */
export type ModalConfirmPayload = {
  productId: string;
  productName: string;
  basePrice: number;
  extras: SelectedExtra[];
  extrasTotal: number;
  finalUnitPrice: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  product: { id: string; name: string; price: number } | null;
  onConfirm: (payload: ModalConfirmPayload) => void;
};

export default function ProductCustomizerModal({
  open,
  onClose,
  product,
  onConfirm,
}: Props) {
  const [groups, setGroups] = useState<IngredientGroup[]>([]);
  const [ingredientsByGroup, setIngredientsByGroup] = useState<
    Record<string, Ingredient[]>
  >({});
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !product) return;

    setLoading(true);
    setError(null);
    setGroups([]);
    setIngredientsByGroup({});
    setSelected({});

    (async () => {
      const { data: g, error: gErr } = await supabase
        .from("ingredient_groups")
        .select("id,product_id,name,min_select,max_select,sort_order")
        .eq("product_id", product.id)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (gErr) {
        setError(gErr.message);
        setLoading(false);
        return;
      }

      const groupList = (g ?? []) as IngredientGroup[];
      setGroups(groupList);

      if (groupList.length === 0) {
        setLoading(false);
        return;
      }

      const groupIds = groupList.map((x) => x.id);

      const { data: ing, error: iErr } = await supabase
        .from("ingredients")
        .select("id,group_id,name,price_delta,sort_order")
        .in("group_id", groupIds)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (iErr) {
        setError(iErr.message);
        setLoading(false);
        return;
      }

      const ingList = (ing ?? []) as Ingredient[];

      const map: Record<string, Ingredient[]> = {};
      for (const item of ingList) {
        if (!map[item.group_id]) map[item.group_id] = [];
        map[item.group_id].push(item);
      }
      setIngredientsByGroup(map);

      setLoading(false);
    })();
  }, [open, product?.id]);

  const selectedExtras: SelectedExtra[] = useMemo(() => {
    const out: SelectedExtra[] = [];

    for (const gid of Object.keys(selected)) {
      const ids = selected[gid] ?? [];
      const list = ingredientsByGroup[gid] ?? [];

      for (const id of ids) {
        const ing = list.find((x) => x.id === id);
        if (!ing) continue;

        out.push({
          ingredientId: ing.id,
          name: ing.name,
          price: Number(ing.price_delta),
        });
      }
    }

    // orden opcional: primero los de 0€, luego los de pago
    out.sort((a, b) => a.price - b.price);
    return out;
  }, [selected, ingredientsByGroup]);

  const extrasTotal = useMemo(() => {
    return selectedExtras.reduce((sum, e) => sum + e.price, 0);
  }, [selectedExtras]);

  const finalUnitPrice = useMemo(() => {
    if (!product) return 0;
    return Number(product.price) + extrasTotal;
  }, [product, extrasTotal]);

  const rulesOk = useMemo(() => {
    for (const g of groups) {
      const count = (selected[g.id] ?? []).length;
      if (count < g.min_select) return false;
      if (count > g.max_select) return false;
    }
    return true;
  }, [groups, selected]);

  const toggleIngredient = (group: IngredientGroup, ingId: string) => {
    setSelected((prev) => {
      const current = prev[group.id] ?? [];
      const exists = current.includes(ingId);

      // max=1 => tipo radio
      if (group.max_select === 1) {
        return { ...prev, [group.id]: exists ? [] : [ingId] };
      }

      if (exists) {
        return { ...prev, [group.id]: current.filter((x) => x !== ingId) };
      }

      if (current.length >= group.max_select) return prev;

      return { ...prev, [group.id]: [...current, ingId] };
    });
  };

  if (!open || !product) return null;

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{product.name}</div>
            <div style={{ opacity: 0.75, marginTop: 4 }}>
              Base: {Number(product.price).toFixed(2)} € · Extras:{" "}
              {extrasTotal.toFixed(2)} € · Total: {finalUnitPrice.toFixed(2)} €
            </div>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        {loading && <p style={{ marginTop: 14 }}>Cargando ingredientes…</p>}
        {error && (
          <p style={{ marginTop: 14, color: "crimson", fontWeight: 700 }}>
            {error}
          </p>
        )}

        {!loading && !error && groups.length === 0 && (
          <p style={{ marginTop: 14, opacity: 0.75 }}>
            Este producto no tiene ingredientes configurados.
          </p>
        )}

        <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
          {groups.map((g) => {
            const list = ingredientsByGroup[g.id] ?? [];
            const current = selected[g.id] ?? [];

            return (
              <div key={g.id} style={styles.groupCard}>
                <div style={{ fontWeight: 800 }}>
                  {g.name}{" "}
                  <span style={{ opacity: 0.7, fontWeight: 600 }}>
                    (min {g.min_select} / max {g.max_select})
                  </span>
                </div>

                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  {list.map((ing) => {
                    const checked = current.includes(ing.id);
                    const disabled =
                      !checked && g.max_select !== 1 && current.length >= g.max_select;

                    return (
                      <button
                        key={ing.id}
                        onClick={() => toggleIngredient(g, ing.id)}
                        disabled={disabled}
                        style={{
                          ...styles.ingBtn,
                          opacity: disabled ? 0.5 : 1,
                          borderColor: checked
                            ? "rgba(255,255,255,0.55)"
                            : "rgba(255,255,255,0.14)",
                        }}
                      >
                        <span style={{ fontWeight: 700 }}>{ing.name}</span>
                        <span style={{ opacity: 0.8 }}>
                          {Number(ing.price_delta) > 0
                            ? `+${Number(ing.price_delta).toFixed(2)} €`
                            : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {g.min_select > 0 && (selected[g.id]?.length ?? 0) < g.min_select && (
                  <div style={{ marginTop: 8, color: "gold" }}>
                    Debes elegir al menos {g.min_select}.
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div
          style={{
            marginTop: 16,
            display: "flex",
            justifyContent: "flex-end",
            gap: 12,
          }}
        >
          <button style={styles.closeBtn} onClick={onClose}>
            Cancelar
          </button>
          <button
            style={{ ...styles.confirmBtn, opacity: rulesOk ? 1 : 0.5 }}
            disabled={!rulesOk}
            onClick={() => {
              onConfirm({
                productId: product.id,
                productName: product.name,
                basePrice: Number(product.price),
                extras: selectedExtras,
                extrasTotal,
                finalUnitPrice,
              });
              onClose();
            }}
          >
            Añadir ({finalUnitPrice.toFixed(2)} €)
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    zIndex: 50,
  },
  modal: {
    width: "min(720px, 100%)",
    maxHeight: "85vh",
    overflow: "auto",
    background: "#111",
    color: "white",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.12)",
    padding: 14,
  },
  closeBtn: {
    border: "1px solid rgba(255,255,255,0.18)",
    background: "transparent",
    color: "white",
    borderRadius: 10,
    padding: "8px 12px",
    cursor: "pointer",
  },
  groupCard: {
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 14,
    padding: 12,
  },
  ingBtn: {
    textAlign: "left",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "transparent",
    color: "white",
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    cursor: "pointer",
  },
  confirmBtn: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "white",
    color: "black",
    fontWeight: 900,
    cursor: "pointer",
  },
};

