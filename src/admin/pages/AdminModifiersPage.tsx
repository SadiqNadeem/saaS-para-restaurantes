
import { useCallback, useEffect, useMemo, useState } from "react";
import { HelpTooltip } from "../components/HelpTooltip";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { useAdminMembership } from "../components/AdminMembershipContext";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../../restaurant/RestaurantContext";

type ModifierGroupRow = {
  id: string;
  restaurant_id: string;
  name: string;
  min_select: number;
  max_select: number | null;
  sort_order: number | null;
  is_active: boolean;
  created_at: string | null;
};

type ModifierOptionRow = {
  id: string;
  group_id: string;
  name: string;
  price: number;
  sort_order: number | null;
  is_active: boolean;
  created_at: string | null;
};

type ProductBasic = { id: string; name: string };

type Toast = { id: number; type: "success" | "error"; message: string };
type GroupModalState = { mode: "create" } | { mode: "edit"; groupId: string } | null;
type OptionModalState = { mode: "create" } | { mode: "edit"; optionId: string } | null;
type GroupDraft = { name: string; min_select: string; max_select: string };
type OptionDraft = { name: string; price: string };

const EMPTY_GROUP_DRAFT: GroupDraft = { name: "", min_select: "0", max_select: "0" };
const EMPTY_OPTION_DRAFT: OptionDraft = { name: "", price: "0" };

type SortableGroupCardProps = {
  row: ModifierGroupRow;
  selected: boolean;
  disabled: boolean;
  isSaving: boolean;
  products: ProductBasic[];
  onSelect: (row: ModifierGroupRow) => void;
  onEdit: (row: ModifierGroupRow) => void;
  onDelete: (row: ModifierGroupRow) => void;
  onToggle: (row: ModifierGroupRow) => void;
};

function SortableGroupCard({ row, selected, disabled, isSaving, products, onSelect, onEdit, onDelete, onToggle }: SortableGroupCardProps) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: row.id, disabled });
  return (
    <article
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.72 : 1,
        border: selected ? "1px solid #0f172a" : "1px solid #e2e8f0",
        borderRadius: 16,
        padding: 14,
        background: selected ? "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)" : "#fff",
        boxShadow: isDragging
          ? "0 10px 24px rgba(15, 23, 42, 0.12)"
          : selected
            ? "0 8px 18px rgba(15, 23, 42, 0.08)"
            : "0 2px 8px rgba(15, 23, 42, 0.05)",
        display: "grid",
        gap: 12,
      }}
    >
      <button
        type="button"
        onClick={() => onSelect(row)}
        style={{ border: "none", background: "transparent", textAlign: "left", padding: 0, cursor: "pointer", minWidth: 0 }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 15, lineHeight: 1.25 }}>{row.name}</div>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "3px 10px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              border: row.is_active ? "1px solid #86efac" : "1px solid #fecaca",
              background: row.is_active ? "#f0fdf4" : "#fef2f2",
              color: row.is_active ? "#166534" : "#991b1b",
            }}
          >
            {row.is_active ? "Activo" : "Inactivo"}
          </span>
        </div>
        <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#475569", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 999, padding: "3px 9px", fontWeight: 600 }}>
            min: {row.min_select}
          </span>
          <span style={{ fontSize: 12, color: "#475569", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 999, padding: "3px 9px", fontWeight: 600 }}>
            max: {row.max_select === null ? "Sin limite" : row.max_select}
          </span>
        </div>
      </button>

      {products.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {products.map((p) => (
            <span
              key={p.id}
              style={{
                background: "#eef2ff",
                color: "#3730a3",
                border: "1px solid #c7d2fe",
                borderRadius: 999,
                padding: "3px 8px",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {p.name}
            </span>
          ))}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          {...attributes}
          {...listeners}
          disabled={disabled}
          style={{
            border: "1px solid #d1d5db",
            background: "#fff",
            borderRadius: 10,
            padding: "8px 12px",
            cursor: disabled ? "not-allowed" : "grab",
            fontSize: 12,
            fontWeight: 600,
            color: "#334155",
            minHeight: 36,
          }}
        >
          Arrastrar
        </button>
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            color: "#334155",
            fontSize: 13,
            fontWeight: 600,
            padding: "8px 12px",
            border: "1px solid #dbe2ea",
            borderRadius: 10,
            background: "#ffffff",
            minHeight: 36,
          }}
        >
          <input type="checkbox" checked={row.is_active} disabled={disabled || isSaving} onChange={() => onToggle(row)} />
          Activo
        </label>
        <button
          type="button"
          onClick={() => onEdit(row)}
          disabled={disabled || isSaving}
          style={{
            border: "1px solid #d1d5db",
            background: "#fff",
            borderRadius: 10,
            padding: "8px 12px",
            cursor: disabled || isSaving ? "not-allowed" : "pointer",
            fontSize: 13,
            fontWeight: 600,
            color: "#334155",
            minHeight: 36,
          }}
        >
          Editar
        </button>
        <button
          type="button"
          onClick={() => onDelete(row)}
          disabled={disabled || isSaving}
          style={{
            border: "1px solid #fca5a5",
            background: "#fef2f2",
            color: "#991b1b",
            borderRadius: 10,
            padding: "8px 12px",
            cursor: disabled || isSaving ? "not-allowed" : "pointer",
            fontSize: 13,
            fontWeight: 700,
            minHeight: 36,
          }}
        >
          Eliminar
        </button>
      </div>
    </article>
  );
}

type SortableOptionCardProps = {
  row: ModifierOptionRow;
  disabled: boolean;
  isSaving: boolean;
  onEdit: (row: ModifierOptionRow) => void;
  onDelete: (row: ModifierOptionRow) => void;
  onToggle: (row: ModifierOptionRow) => void;
};

function SortableOptionCard({ row, disabled, isSaving, onEdit, onDelete, onToggle }: SortableOptionCardProps) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: row.id, disabled });
  const hasExtraPrice = Number(row.price) > 0;
  return (
    <article
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.72 : 1,
        border: "1px solid #e2e8f0",
        borderRadius: 14,
        padding: 14,
        display: "grid",
        gap: 12,
        background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
        boxShadow: isDragging ? "0 10px 24px rgba(15, 23, 42, 0.12)" : "0 2px 8px rgba(15, 23, 42, 0.05)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 15 }}>{row.name}</div>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "3px 10px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                border: row.is_active ? "1px solid #86efac" : "1px solid #fecaca",
                background: row.is_active ? "#f0fdf4" : "#fef2f2",
                color: row.is_active ? "#166534" : "#991b1b",
              }}
            >
              {row.is_active ? "Activa" : "Inactiva"}
            </span>
          </div>
          <div style={{ marginTop: 6 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                borderRadius: 999,
                padding: "4px 10px",
                fontSize: 12,
                fontWeight: 700,
                border: hasExtraPrice ? "1px solid #bfdbfe" : "1px solid #dbe2ea",
                color: hasExtraPrice ? "#1d4ed8" : "#475569",
                background: hasExtraPrice ? "#eff6ff" : "#f8fafc",
              }}
            >
              {hasExtraPrice ? `+${row.price.toFixed(2)} EUR` : "Sin precio extra"}
            </span>
          </div>
        </div>
        <button
          type="button"
          {...attributes}
          {...listeners}
          disabled={disabled}
          style={{
            border: "1px solid #d1d5db",
            background: "#fff",
            borderRadius: 10,
            padding: "8px 12px",
            cursor: disabled ? "not-allowed" : "grab",
            fontSize: 12,
            fontWeight: 600,
            color: "#334155",
            minHeight: 36,
            flexShrink: 0,
          }}
        >
          Arrastrar
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#334155", fontSize: 13, fontWeight: 600, padding: "8px 12px", border: "1px solid #dbe2ea", borderRadius: 10, background: "#fff", minHeight: 36 }}>
          <input type="checkbox" checked={row.is_active} disabled={disabled || isSaving} onChange={() => onToggle(row)} />
          Visible
        </label>
        <button type="button" onClick={() => onEdit(row)} disabled={disabled || isSaving} style={{ border: "1px solid #d1d5db", background: "#fff", borderRadius: 10, padding: "8px 12px", cursor: disabled || isSaving ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, color: "#334155", minHeight: 36 }}>Editar</button>
        <button type="button" onClick={() => onDelete(row)} disabled={disabled || isSaving} style={{ border: "1px solid #fca5a5", background: "#fef2f2", color: "#991b1b", borderRadius: 10, padding: "8px 12px", cursor: disabled || isSaving ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700, minHeight: 36 }}>Eliminar</button>
      </div>
    </article>
  );
}

export default function AdminModifiersPage() {
  const { restaurantId } = useRestaurant();
  const { canManage } = useAdminMembership();
  const sensors = useSensors(useSensor(PointerSensor));

  const [groups, setGroups] = useState<ModifierGroupRow[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [options, setOptions] = useState<ModifierOptionRow[]>([]);
  const [productsByGroup, setProductsByGroup] = useState<Record<string, ProductBasic[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optionError, setOptionError] = useState<string | null>(null);
  const [savingGroupId, setSavingGroupId] = useState<string | null>(null);
  const [savingOptionId, setSavingOptionId] = useState<string | null>(null);
  const [reorderingGroups, setReorderingGroups] = useState(false);
  const [reorderingOptions, setReorderingOptions] = useState(false);
  const [groupModal, setGroupModal] = useState<GroupModalState>(null);
  const [optionModal, setOptionModal] = useState<OptionModalState>(null);
  const [groupDraft, setGroupDraft] = useState<GroupDraft>(EMPTY_GROUP_DRAFT);
  const [optionDraft, setOptionDraft] = useState<OptionDraft>(EMPTY_OPTION_DRAFT);
  const [submittingGroupModal, setSubmittingGroupModal] = useState(false);
  const [submittingOptionModal, setSubmittingOptionModal] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = useCallback((type: Toast["type"], message: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, type, message }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((toast) => toast.id !== id)), 3200);
  }, []);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: queryError } = await supabase
      .from("modifier_groups")
      .select("id, restaurant_id, name, min_select, max_select, sort_order, is_active, created_at")
      .eq("restaurant_id", restaurantId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (queryError) {
      setError(queryError.message || "No se pudieron cargar grupos.");
      setGroups([]);
      setLoading(false);
      return;
    }

    const normalized: ModifierGroupRow[] = (data ?? []).map((item) => ({
      id: String(item.id),
      restaurant_id: String(item.restaurant_id),
      name: String(item.name ?? ""),
      min_select: Number(item.min_select ?? 0),
      max_select: item.max_select === null || item.max_select === undefined ? null : Number(item.max_select),
      sort_order: typeof item.sort_order === "number" ? item.sort_order : null,
      is_active: item.is_active !== false,
      created_at: item.created_at ? String(item.created_at) : null,
    }));

    setGroups(normalized);
    if (!selectedGroupId && normalized.length > 0) setSelectedGroupId(normalized[0].id);
    else if (selectedGroupId && !normalized.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(normalized[0]?.id ?? "");
    }
    setLoading(false);

    // Load which products use each group
    if (normalized.length > 0) {
      const ids = normalized.map((g) => g.id);
      const { data: pmgData } = await supabase
        .from("product_modifier_groups")
        .select("modifier_group_id, products!inner(id, name, restaurant_id)")
        .eq("restaurant_id", restaurantId)
        .eq("products.restaurant_id", restaurantId)
        .in("modifier_group_id", ids);

      type PmgJoinRow = {
        modifier_group_id: string | null;
        products:
          | { id: string; name: string | null; restaurant_id: string | null }
          | { id: string; name: string | null; restaurant_id: string | null }[]
          | null;
      };

      const map: Record<string, ProductBasic[]> = {};
      for (const row of (pmgData ?? []) as PmgJoinRow[]) {
        if (!row.modifier_group_id) continue;
        const gid = String(row.modifier_group_id);
        if (!map[gid]) map[gid] = [];
        const joined = row.products;
        if (!joined) continue;
        const items = Array.isArray(joined) ? joined : [joined];
        for (const item of items) {
          if (item.id && item.name) {
            map[gid].push({ id: String(item.id), name: String(item.name) });
          }
        }
      }
      setProductsByGroup(map);
    } else {
      setProductsByGroup({});
    }
  }, [restaurantId, selectedGroupId]);

  const loadOptions = useCallback(async (groupId: string) => {
    if (!groupId) {
      setOptions([]);
      setOptionError(null);
      return;
    }

    setLoadingOptions(true);
    setOptionError(null);
    const { data, error: queryError } = await supabase
      .from("modifier_options")
      .select("id, group_id, name, price, sort_order, is_active, created_at")
      .eq("group_id", groupId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (queryError) {
      setOptionError(queryError.message || "No se pudieron cargar opciones.");
      setOptions([]);
      setLoadingOptions(false);
      return;
    }

    const normalized: ModifierOptionRow[] = (data ?? []).map((item) => ({
      id: String(item.id),
      group_id: String(item.group_id),
      name: String(item.name ?? ""),
      price: Number(item.price ?? 0),
      sort_order: typeof item.sort_order === "number" ? item.sort_order : null,
      is_active: item.is_active !== false,
      created_at: item.created_at ? String(item.created_at) : null,
    }));

    setOptions(normalized);
    setLoadingOptions(false);
  }, []);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    void loadOptions(selectedGroupId);
  }, [loadOptions, selectedGroupId]);

  const selectedGroup = useMemo(() => groups.find((group) => group.id === selectedGroupId) ?? null, [groups, selectedGroupId]);
  const groupIds = useMemo(() => groups.map((group) => group.id), [groups]);
  const optionIds = useMemo(() => options.map((option) => option.id), [options]);
  const groupsBusy = reorderingGroups || submittingGroupModal || Boolean(savingGroupId);
  const optionsBusy = reorderingOptions || submittingOptionModal || Boolean(savingOptionId);

  const openCreateGroupModal = () => {
    setGroupDraft(EMPTY_GROUP_DRAFT);
    setGroupModal({ mode: "create" });
  };
  const openEditGroupModal = (row: ModifierGroupRow) => {
    setGroupDraft({ name: row.name, min_select: String(row.min_select), max_select: row.max_select === null ? "0" : String(row.max_select) });
    setGroupModal({ mode: "edit", groupId: row.id });
  };
  const closeGroupModal = () => {
    if (submittingGroupModal) return;
    setGroupModal(null);
    setGroupDraft(EMPTY_GROUP_DRAFT);
  };

  const openCreateOptionModal = () => {
    if (!selectedGroupId) return;
    setOptionDraft(EMPTY_OPTION_DRAFT);
    setOptionModal({ mode: "create" });
  };
  const openEditOptionModal = (row: ModifierOptionRow) => {
    setOptionDraft({ name: row.name, price: String(row.price) });
    setOptionModal({ mode: "edit", optionId: row.id });
  };
  const closeOptionModal = () => {
    if (submittingOptionModal) return;
    setOptionModal(null);
    setOptionDraft(EMPTY_OPTION_DRAFT);
  };

  const updateGroupDraft = <K extends keyof GroupDraft>(key: K, value: GroupDraft[K]) => setGroupDraft((prev) => ({ ...prev, [key]: value }));
  const updateOptionDraft = <K extends keyof OptionDraft>(key: K, value: OptionDraft[K]) => setOptionDraft((prev) => ({ ...prev, [key]: value }));

  const submitGroupModal = async () => {
    if (!canManage || !groupModal || submittingGroupModal) return;
    const trimmedName = groupDraft.name.trim();
    const parsedMin = Number(groupDraft.min_select);
    const parsedMax = Number(groupDraft.max_select);

    if (!trimmedName) return pushToast("error", "El nombre del grupo es obligatorio.");
    if (!Number.isFinite(parsedMin) || parsedMin < 0) return pushToast("error", "min_select debe ser >= 0.");
    if (!Number.isFinite(parsedMax) || parsedMax < 0) return pushToast("error", "max_select debe ser >= 0.");

    const finalMax = parsedMax === 0 ? null : parsedMax;
    if (finalMax !== null && finalMax < parsedMin) return pushToast("error", "max_select debe ser >= min_select.");

    setSubmittingGroupModal(true);
    setError(null);

    if (groupModal.mode === "create") {
      const maxSort = groups.reduce((max, group) => {
        const value = typeof group.sort_order === "number" ? group.sort_order : -1;
        return value > max ? value : max;
      }, -1);

      const { error: insertError } = await supabase.from("modifier_groups").insert({
        restaurant_id: restaurantId,
        name: trimmedName,
        min_select: parsedMin,
        max_select: finalMax,
        sort_order: maxSort + 1,
        is_active: true,
      });

      if (insertError) {
        pushToast("error", insertError.message || "No se pudo crear grupo.");
        setSubmittingGroupModal(false);
        return;
      }

      pushToast("success", "Grupo creado.");
      await loadGroups();
      setSubmittingGroupModal(false);
      closeGroupModal();
      return;
    }

    const { error: updateError } = await supabase
      .from("modifier_groups")
      .update({ name: trimmedName, min_select: parsedMin, max_select: finalMax })
      .eq("restaurant_id", restaurantId)
      .eq("id", groupModal.groupId);

    if (updateError) {
      pushToast("error", updateError.message || "No se pudo actualizar grupo.");
      setSubmittingGroupModal(false);
      return;
    }

    pushToast("success", "Grupo actualizado.");
    await loadGroups();
    setSubmittingGroupModal(false);
    closeGroupModal();
  };

  const submitOptionModal = async () => {
    if (!canManage || !optionModal || submittingOptionModal || !selectedGroupId) return;
    const trimmedName = optionDraft.name.trim();
    const parsedPrice = Number(optionDraft.price);
    if (!trimmedName) return pushToast("error", "El nombre de la opcion es obligatorio.");
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) return pushToast("error", "El precio debe ser >= 0.");

    setSubmittingOptionModal(true);
    setOptionError(null);

    if (optionModal.mode === "create") {
      const maxSort = options.reduce((max, option) => {
        const value = typeof option.sort_order === "number" ? option.sort_order : -1;
        return value > max ? value : max;
      }, -1);

      const { error: insertError } = await supabase.from("modifier_options").insert({
        restaurant_id: restaurantId,
        group_id: selectedGroupId,
        name: trimmedName,
        price: parsedPrice,
        sort_order: maxSort + 1,
        is_active: true,
      });

      if (insertError) {
        pushToast("error", insertError.message || "No se pudo crear opcion.");
        setSubmittingOptionModal(false);
        return;
      }

      pushToast("success", "Opcion creada.");
      await loadOptions(selectedGroupId);
      setSubmittingOptionModal(false);
      closeOptionModal();
      return;
    }

    const { error: updateError } = await supabase
      .from("modifier_options")
      .update({ name: trimmedName, price: parsedPrice })
      .eq("id", optionModal.optionId);

    if (updateError) {
      pushToast("error", updateError.message || "No se pudo actualizar opcion.");
      setSubmittingOptionModal(false);
      return;
    }

    pushToast("success", "Opcion actualizada.");
    await loadOptions(selectedGroupId);
    setSubmittingOptionModal(false);
    closeOptionModal();
  };

  const toggleGroup = async (row: ModifierGroupRow) => {
    if (!canManage || groupsBusy) return;
    const previous = row.is_active;
    const next = !previous;
    setSavingGroupId(row.id);
    setGroups((prev) => prev.map((group) => (group.id === row.id ? { ...group, is_active: next } : group)));

    const { error: toggleError } = await supabase
      .from("modifier_groups")
      .update({ is_active: next })
      .eq("restaurant_id", restaurantId)
      .eq("id", row.id);

    if (toggleError) {
      setGroups((prev) => prev.map((group) => (group.id === row.id ? { ...group, is_active: previous } : group)));
      pushToast("error", toggleError.message || "No se pudo actualizar grupo.");
      setSavingGroupId(null);
      return;
    }

    pushToast("success", next ? "Grupo activo." : "Grupo inactivo.");
    setSavingGroupId(null);
  };

  const toggleOption = async (row: ModifierOptionRow) => {
    if (!canManage || optionsBusy || !selectedGroupId) return;
    const previous = row.is_active;
    const next = !previous;
    setSavingOptionId(row.id);
    setOptions((prev) => prev.map((option) => (option.id === row.id ? { ...option, is_active: next } : option)));

    const { error: toggleError } = await supabase.from("modifier_options").update({ is_active: next }).eq("id", row.id);

    if (toggleError) {
      setOptions((prev) => prev.map((option) => (option.id === row.id ? { ...option, is_active: previous } : option)));
      pushToast("error", toggleError.message || "No se pudo actualizar opcion.");
      setSavingOptionId(null);
      return;
    }

    pushToast("success", next ? "Opcion activa." : "Opcion inactiva.");
    setSavingOptionId(null);
  };

  const deleteGroup = async (row: ModifierGroupRow) => {
    if (!canManage || groupsBusy) return;
    if (!window.confirm(`Eliminar grupo "${row.name}"?`)) return;
    setSavingGroupId(row.id);
    const previousGroups = groups;
    setGroups((prev) => prev.filter((group) => group.id !== row.id));

    const { error: deleteError } = await supabase
      .from("modifier_groups")
      .delete()
      .eq("restaurant_id", restaurantId)
      .eq("id", row.id);

    if (deleteError) {
      setGroups(previousGroups);
      pushToast("error", deleteError.message || "No se pudo eliminar grupo.");
      setSavingGroupId(null);
      return;
    }

    pushToast("success", "Grupo eliminado.");
    setSavingGroupId(null);
    await loadGroups();
  };

  const deleteOption = async (row: ModifierOptionRow) => {
    if (!canManage || optionsBusy || !selectedGroupId) return;
    if (!window.confirm(`Eliminar opcion "${row.name}"?`)) return;
    setSavingOptionId(row.id);
    const previousOptions = options;
    setOptions((prev) => prev.filter((option) => option.id !== row.id));

    const { error: deleteError } = await supabase.from("modifier_options").delete().eq("id", row.id);

    if (deleteError) {
      setOptions(previousOptions);
      pushToast("error", deleteError.message || "No se pudo eliminar opcion.");
      setSavingOptionId(null);
      return;
    }

    pushToast("success", "Opcion eliminada.");
    setSavingOptionId(null);
    await loadOptions(selectedGroupId);
  };

  const onGroupsDragEnd = async (event: DragEndEvent) => {
    if (!canManage || groupsBusy) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const fromIndex = groups.findIndex((group) => group.id === String(active.id));
    const toIndex = groups.findIndex((group) => group.id === String(over.id));
    if (fromIndex < 0 || toIndex < 0) return;

    const previous = groups;
    const reordered = arrayMove(groups, fromIndex, toIndex).map((group, index) => ({ ...group, sort_order: index }));
    setGroups(reordered);
    setReorderingGroups(true);

    const groupIdsOrdered = reordered.map((group) => group.id);
    const { error: reorderError } = await supabase.rpc("admin_reorder_modifier_groups", {
      p_restaurant_id: restaurantId,
      p_group_ids: groupIdsOrdered,
    });

    if (reorderError) {
      setGroups(previous);
      pushToast("error", reorderError.message || "No se pudo reordenar grupos.");
      setReorderingGroups(false);
      return;
    }

    pushToast("success", "Orden de grupos actualizado.");
    await loadGroups();
    setReorderingGroups(false);
  };

  const onOptionsDragEnd = async (event: DragEndEvent) => {
    if (!canManage || optionsBusy || !selectedGroupId) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const fromIndex = options.findIndex((option) => option.id === String(active.id));
    const toIndex = options.findIndex((option) => option.id === String(over.id));
    if (fromIndex < 0 || toIndex < 0) return;

    const previous = options;
    const reordered = arrayMove(options, fromIndex, toIndex).map((option, index) => ({ ...option, sort_order: index }));
    setOptions(reordered);
    setReorderingOptions(true);

    const optionIdsOrdered = reordered.map((option) => option.id);
    const { error: reorderError } = await supabase.rpc("admin_reorder_modifier_options", {
      p_restaurant_id: restaurantId,
      p_group_id: selectedGroupId,
      p_option_ids: optionIdsOrdered,
    });

    if (reorderError) {
      setOptions(previous);
      pushToast("error", reorderError.message || "No se pudo reordenar opciones.");
      setReorderingOptions(false);
      return;
    }

    pushToast("success", "Orden de opciones actualizado.");
    await loadOptions(selectedGroupId);
    setReorderingOptions(false);
  };

  return (
    <section style={{ display: "grid", gap: 18, width: "100%" }}>
      <header
        style={{
          display: "grid",
          gap: 8,
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: 18,
          background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
          boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06)",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "clamp(1.3rem, 2vw, 1.65rem)", lineHeight: 1.2, color: "#0f172a" }}>
          Modificadores
        </h2>
        <p style={{ margin: 0, color: "#64748b", fontSize: 14, lineHeight: 1.4 }}>
          Grupos y opciones de modificadores
        </p>
      </header>

      {error ? (
        <div role="alert" style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#991b1b", borderRadius: 10, padding: 12 }}>
          {error}
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 16,
          alignItems: "start",
        }}
      >
        <section
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: 14,
            padding: 14,
            display: "grid",
            gap: 14,
            background: "#ffffff",
            boxShadow: "0 1px 2px rgba(15, 23, 42, 0.05)",
            minHeight: 360,
            alignContent: "start",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <h3 style={{ margin: 0 }}>Grupos</h3>
            <button type="button" onClick={openCreateGroupModal} disabled={!canManage || groupsBusy} style={{ borderRadius: 12, border: "1px solid #0f172a", background: "#0f172a", color: "#fff", padding: "9px 14px", fontWeight: 700, fontSize: 13, boxShadow: "0 8px 20px rgba(15, 23, 42, 0.18)", cursor: !canManage || groupsBusy ? "not-allowed" : "pointer", opacity: !canManage || groupsBusy ? 0.6 : 1 }}>
              + Grupo
            </button>
          </div>

          {loading ? <div>Cargando grupos...</div> : null}
          {!loading && groups.length === 0 ? <div>No hay grupos.</div> : null}

          {!loading && groups.length > 0 ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onGroupsDragEnd}>
              <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
                <div style={{ display: "grid", gap: 12 }}>
                  {groups.map((group) => (
                    <SortableGroupCard
                      key={group.id}
                      row={group}
                      selected={group.id === selectedGroupId}
                      disabled={!canManage || groupsBusy}
                      isSaving={savingGroupId === group.id}
                      products={productsByGroup[group.id] ?? []}
                      onSelect={(row) => setSelectedGroupId(row.id)}
                      onEdit={openEditGroupModal}
                      onDelete={(row) => void deleteGroup(row)}
                      onToggle={(row) => void toggleGroup(row)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : null}
        </section>

        <section
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: 14,
            padding: 14,
            display: "grid",
            gap: 14,
            background: "#ffffff",
            boxShadow: "0 1px 2px rgba(15, 23, 42, 0.05)",
            minHeight: 360,
            alignContent: "start",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "grid", gap: 6 }}>
              <h3 style={{ margin: 0 }}>Opciones</h3>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  borderRadius: 999,
                  padding: "4px 10px",
                  fontSize: 12,
                  fontWeight: 700,
                  border: selectedGroup ? "1px solid #bfdbfe" : "1px solid #dbe2ea",
                  background: selectedGroup ? "#eff6ff" : "#f8fafc",
                  color: selectedGroup ? "#1d4ed8" : "#64748b",
                  width: "fit-content",
                  maxWidth: "100%",
                }}
              >
                Grupo: {selectedGroup?.name ?? "Sin seleccionar"}
              </div>
            </div>
            <button type="button" onClick={openCreateOptionModal} disabled={!canManage || optionsBusy || !selectedGroupId} style={{ borderRadius: 12, border: "1px solid #0f172a", background: "#0f172a", color: "#fff", padding: "9px 14px", fontWeight: 700, fontSize: 13, boxShadow: "0 8px 20px rgba(15, 23, 42, 0.18)", cursor: !canManage || optionsBusy || !selectedGroupId ? "not-allowed" : "pointer", opacity: !canManage || optionsBusy || !selectedGroupId ? 0.6 : 1 }}>
              + Opcion
            </button>
          </div>

          {optionError ? (
            <div role="alert" style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#991b1b", borderRadius: 10, padding: 12 }}>
              {optionError}
            </div>
          ) : null}

          {loadingOptions ? <div>Cargando opciones...</div> : null}
          {!loadingOptions && selectedGroupId && options.length === 0 ? (
            <div
              style={{
                border: "1px dashed #cbd5e1",
                borderRadius: 12,
                padding: 18,
                background: "#f8fafc",
                display: "grid",
                gap: 6,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>No hay opciones en este grupo</div>
              <div style={{ fontSize: 13, color: "#64748b" }}>Crea la primera opcion para este grupo desde el boton superior.</div>
            </div>
          ) : null}
          {!loadingOptions && !selectedGroupId ? (
            <div
              style={{
                border: "1px dashed #cbd5e1",
                borderRadius: 12,
                padding: 18,
                background: "#f8fafc",
                color: "#64748b",
                fontSize: 13,
              }}
            >
              Selecciona un grupo para ver opciones.
            </div>
          ) : null}

          {!loadingOptions && selectedGroupId && options.length > 0 ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onOptionsDragEnd}>
              <SortableContext items={optionIds} strategy={verticalListSortingStrategy}>
                <div style={{ display: "grid", gap: 12 }}>
                  {options.map((option) => (
                    <SortableOptionCard
                      key={option.id}
                      row={option}
                      disabled={!canManage || optionsBusy}
                      isSaving={savingOptionId === option.id}
                      onEdit={openEditOptionModal}
                      onDelete={(row) => void deleteOption(row)}
                      onToggle={(row) => void toggleOption(row)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : null}
        </section>
      </div>

      {groupModal ? (
        <div role="presentation" onClick={closeGroupModal} style={{ position: "fixed", inset: 0, background: "rgba(17, 24, 39, 0.45)", display: "grid", placeItems: "center", zIndex: 1600 }}>
          <div role="dialog" aria-modal="true" aria-label={groupModal.mode === "create" ? "Crear grupo" : "Editar grupo"} onClick={(event) => event.stopPropagation()} style={{ width: "min(560px, calc(100vw - 32px))", border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 16, display: "grid", gap: 12 }}>
            <h3 style={{ margin: 0 }}>{groupModal.mode === "create" ? "Nuevo grupo" : "Editar grupo"}</h3>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#374151" }}>Nombre *</span>
              <input value={groupDraft.name} onChange={(event) => updateGroupDraft("name", event.target.value)} disabled={submittingGroupModal} autoFocus style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "9px 10px" }} />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, color: "#374151", display: "inline-flex", alignItems: "center" }}>
                  Mínimo <HelpTooltip text="Número mínimo de opciones que el cliente debe elegir. 0 = opcional" />
                </span>
                <input type="number" min={0} value={groupDraft.min_select} onChange={(event) => updateGroupDraft("min_select", event.target.value)} disabled={submittingGroupModal} style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "9px 10px" }} />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, color: "#374151", display: "inline-flex", alignItems: "center" }}>
                  Máximo (0 = sin límite) <HelpTooltip text="Número máximo de opciones que el cliente puede elegir" />
                </span>
                <input type="number" min={0} value={groupDraft.max_select} onChange={(event) => updateGroupDraft("max_select", event.target.value)} disabled={submittingGroupModal} style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "9px 10px" }} />
              </label>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" onClick={closeGroupModal} disabled={submittingGroupModal} style={{ borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", padding: "8px 12px", cursor: submittingGroupModal ? "not-allowed" : "pointer" }}>Cancelar</button>
              <button type="button" onClick={() => void submitGroupModal()} disabled={submittingGroupModal} style={{ borderRadius: 8, border: "1px solid var(--brand-primary)", background: "var(--brand-primary)", color: "var(--brand-white)", padding: "8px 12px", cursor: submittingGroupModal ? "not-allowed" : "pointer" }}>{submittingGroupModal ? "Guardando..." : "Guardar"}</button>
            </div>
          </div>
        </div>
      ) : null}

      {optionModal ? (
        <div role="presentation" onClick={closeOptionModal} style={{ position: "fixed", inset: 0, background: "rgba(17, 24, 39, 0.45)", display: "grid", placeItems: "center", zIndex: 1600 }}>
          <div role="dialog" aria-modal="true" aria-label={optionModal.mode === "create" ? "Crear opcion" : "Editar opcion"} onClick={(event) => event.stopPropagation()} style={{ width: "min(520px, calc(100vw - 32px))", border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 16, display: "grid", gap: 12 }}>
            <h3 style={{ margin: 0 }}>{optionModal.mode === "create" ? "Nueva opcion" : "Editar opcion"}</h3>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#374151" }}>Nombre *</span>
              <input value={optionDraft.name} onChange={(event) => updateOptionDraft("name", event.target.value)} disabled={submittingOptionModal} autoFocus style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "9px 10px" }} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#374151" }}>Precio *</span>
              <input type="number" min={0} step="0.01" value={optionDraft.price} onChange={(event) => updateOptionDraft("price", event.target.value)} disabled={submittingOptionModal} style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "9px 10px" }} />
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" onClick={closeOptionModal} disabled={submittingOptionModal} style={{ borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", padding: "8px 12px", cursor: submittingOptionModal ? "not-allowed" : "pointer" }}>Cancelar</button>
              <button type="button" onClick={() => void submitOptionModal()} disabled={submittingOptionModal} style={{ borderRadius: 8, border: "1px solid var(--brand-primary)", background: "var(--brand-primary)", color: "var(--brand-white)", padding: "8px 12px", cursor: submittingOptionModal ? "not-allowed" : "pointer" }}>{submittingOptionModal ? "Guardando..." : "Guardar"}</button>
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ position: "fixed", right: 16, bottom: 16, display: "grid", gap: 8, zIndex: 1700 }}>
        {toasts.map((toast) => (
          <div key={toast.id} role="status" style={{ border: `1px solid ${toast.type === "error" ? "#fecaca" : "var(--brand-primary-border)"}`, background: toast.type === "error" ? "#fef2f2" : "var(--brand-primary-soft)", color: toast.type === "error" ? "#991b1b" : "var(--brand-hover)", borderRadius: 10, padding: "10px 12px", minWidth: 220, maxWidth: 320, boxShadow: "0 6px 18px rgba(0,0,0,0.12)" }}>
            {toast.message}
          </div>
        ))}
      </div>
    </section>
  );
}
