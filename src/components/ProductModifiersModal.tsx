import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

type ModifierOption = {
  id: string;
  name: string;
  price: number;
};

type ModifierGroup = {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  options: ModifierOption[];
};

type SelectedModifier = {
  group_id: string;
  group_name: string;
  options: {
    option_id: string;
    option_name: string;
    price: number;
  }[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  product: { id: string; name: string; price: number } | null;
  groups: ModifierGroup[];
  onConfirm: (payload: {
    selectedModifiers: SelectedModifier[];
    extraPrice: number;
    finalUnitPrice: number;
  }) => void;
};

function getGroupMessage(group: ModifierGroup, selectedCount: number): string | null {
  if (selectedCount < group.min_select) {
    return `faltan ${group.min_select - selectedCount} selecciones`;
  }

  if (selectedCount > group.max_select) {
    return `maximo ${group.max_select}`;
  }

  return null;
}

export default function ProductModifiersModal({ open, onClose, product, groups, onConfirm }: Props) {
  const [selectedByGroup, setSelectedByGroup] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (!open) {
      setSelectedByGroup({});
    }
  }, [open, product?.id]);

  const selectedModifiers = useMemo(() => {
    const result: SelectedModifier[] = [];

    for (const group of groups) {
      const selectedIds = selectedByGroup[group.id] ?? [];
      const selectedOptions = selectedIds
        .map((id) => group.options.find((option) => option.id === id))
        .filter(Boolean)
        .map((option) => ({
          option_id: (option as ModifierOption).id,
          option_name: (option as ModifierOption).name,
          price: Number((option as ModifierOption).price || 0),
        }));

      if (selectedOptions.length === 0) {
        continue;
      }

      result.push({
        group_id: group.id,
        group_name: group.name,
        options: selectedOptions,
      });
    }

    return result;
  }, [groups, selectedByGroup]);

  const extraPrice = useMemo(() => {
    return selectedModifiers.reduce((sum, group) => {
      return sum + group.options.reduce((subtotal, option) => subtotal + Number(option.price || 0), 0);
    }, 0);
  }, [selectedModifiers]);

  const finalUnitPrice = useMemo(() => {
    return Number(product?.price || 0) + extraPrice;
  }, [product?.price, extraPrice]);

  const validations = useMemo(() => {
    return groups.map((group) => {
      const count = (selectedByGroup[group.id] ?? []).length;
      return getGroupMessage(group, count);
    });
  }, [groups, selectedByGroup]);

  const canConfirm = validations.every((message) => message === null);

  const toggleOption = (group: ModifierGroup, optionId: string) => {
    setSelectedByGroup((prev) => {
      const current = prev[group.id] ?? [];
      const exists = current.includes(optionId);

      if (group.max_select === 1) {
        return { ...prev, [group.id]: exists ? [] : [optionId] };
      }

      if (exists) {
        return { ...prev, [group.id]: current.filter((id) => id !== optionId) };
      }

      if (current.length >= group.max_select) {
        return prev;
      }

      return { ...prev, [group.id]: [...current, optionId] };
    });
  };

  if (!open || !product) {
    return null;
  }

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={(event) => event.stopPropagation()}>
        <h3>{product.name}</h3>
        <p>
          Base: {Number(product.price).toFixed(2)} EUR | Extras: {extraPrice.toFixed(2)} EUR | Total:{" "}
          {finalUnitPrice.toFixed(2)} EUR
        </p>

        {groups.map((group, groupIndex) => {
          const current = selectedByGroup[group.id] ?? [];
          const message = validations[groupIndex];

          return (
            <div key={group.id}>
              <p>
                Grupo: {group.name} (min {group.min_select} / max {group.max_select})
              </p>

              {group.options.map((option) => {
                const checked = current.includes(option.id);
                const disabled =
                  !checked && group.max_select > 1 && current.length >= group.max_select;

                if (group.max_select === 1) {
                  return (
                    <label key={option.id} style={{ display: "block" }}>
                      <input
                        type="radio"
                        name={`group-${group.id}`}
                        checked={checked}
                        onChange={() => toggleOption(group, option.id)}
                      />
                      {option.name} {option.price > 0 ? `(+${option.price.toFixed(2)} EUR)` : ""}
                    </label>
                  );
                }

                return (
                  <label key={option.id} style={{ display: "block" }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleOption(group, option.id)}
                    />
                    {option.name} {option.price > 0 ? `(+${option.price.toFixed(2)} EUR)` : ""}
                  </label>
                );
              })}

              {message && <p>{message}</p>}
            </div>
          );
        })}

        <button type="button" onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          disabled={!canConfirm}
          onClick={() =>
            onConfirm({
              selectedModifiers,
              extraPrice,
              finalUnitPrice,
            })
          }
        >
          Confirmar
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 90,
  },
  modal: {
    width: "min(640px, 100%)",
    maxHeight: "85vh",
    overflow: "auto",
    background: "#111",
    color: "white",
    border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: 10,
    padding: 12,
  },
};
