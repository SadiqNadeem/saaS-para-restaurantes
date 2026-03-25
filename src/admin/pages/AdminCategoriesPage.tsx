import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminEmptyState } from "../components/AdminEmptyState";
import { CardSkeleton } from "../components/AdminSkeleton";
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
import { useAnimatedValue } from "../../hooks/useAnimatedValue";

type CategoryRow = {
  id: string;
  name: string;
  sort_order: number | null;
  is_active: boolean;
  created_at: string | null;
};

type Toast = {
  id: number;
  type: "success" | "error";
  message: string;
};

type ModalState =
  | { mode: "create" }
  | { mode: "edit"; categoryId: string }
  | null;

type SortableCategoryItemProps = {
  row: CategoryRow;
  disabled: boolean;
  onEdit: (row: CategoryRow) => void;
  onDelete: (row: CategoryRow) => void;
  onToggle: (row: CategoryRow) => void;
  isSaving: boolean;
  productCount: number;
};

function SortableCategoryItem({
  row,
  disabled,
  onEdit,
  onDelete,
  onToggle,
  isSaving,
  productCount,
}: SortableCategoryItemProps) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: row.id,
    disabled,
  });
  const actionsDisabled = disabled || isSaving;
  const actionButtonBase = {
    borderRadius: 10,
    padding: "8px 12px",
    cursor: actionsDisabled ? "not-allowed" : "pointer",
    fontSize: 13,
    fontWeight: 600,
    minHeight: 36,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    whiteSpace: "nowrap" as const,
  };

  return (
    <article
      className="ui-list-item ui-soft-border"
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.72 : 1,
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        padding: 14,
        background: "#fff",
        display: "grid",
        gap: 12,
        boxShadow: isDragging ? "0 10px 26px rgba(17,24,39,0.14)" : "0 4px 14px rgba(17,24,39,0.06)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0, display: "grid", gap: 6 }}>
          <div
            style={{
              fontWeight: 800,
              fontSize: 15,
              lineHeight: 1.2,
              color: "#111827",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {row.name}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                background: "#f9fafb",
                padding: "3px 8px",
                fontSize: 12,
                color: "#374151",
                fontWeight: 600,
              }}
            >
              {productCount} producto{productCount !== 1 ? "s" : ""}
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                borderRadius: 999,
                border: row.is_active ? "1px solid #bbf7d0" : "1px solid #e5e7eb",
                background: row.is_active ? "#f0fdf4" : "#f9fafb",
                color: row.is_active ? "#166534" : "#6b7280",
                padding: "3px 8px",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {row.is_active ? "Activa" : "Inactiva"}
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
            padding: "7px 11px",
            cursor: disabled ? "not-allowed" : "grab",
            fontSize: 12,
            fontWeight: 600,
            color: "#374151",
            flexShrink: 0,
          }}
        >
          Arrastrar
        </button>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
          paddingTop: 10,
          borderTop: "1px solid #f3f4f6",
        }}
      >
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            color: "#374151",
            fontSize: 13,
            minHeight: 36,
            padding: "4px 2px",
            cursor: actionsDisabled ? "not-allowed" : "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={row.is_active}
            disabled={actionsDisabled}
            onChange={() => onToggle(row)}
            style={{
              position: "absolute",
              opacity: 0,
              pointerEvents: "none",
              width: 0,
              height: 0,
            }}
          />
          <span
            aria-hidden
            style={{
              width: 40,
              height: 22,
              borderRadius: 999,
              background: row.is_active ? "#22c55e" : "#d1d5db",
              border: row.is_active ? "1px solid #16a34a" : "1px solid #cbd5e1",
              padding: 2,
              display: "inline-flex",
              alignItems: "center",
              transition: "background 0.18s ease, border-color 0.18s ease",
              opacity: actionsDisabled ? 0.7 : 1,
              flexShrink: 0,
            }}
          >
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: 999,
                background: "#fff",
                boxShadow: "0 1px 3px rgba(17,24,39,0.25)",
                transform: row.is_active ? "translateX(18px)" : "translateX(0)",
                transition: "transform 0.18s ease",
              }}
            />
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <strong style={{ fontSize: 13, color: "#111827", fontWeight: 700 }}>
              {row.is_active ? "Activa" : "Inactiva"}
            </strong>
            <span style={{ color: "#6b7280" }}>en menú</span>
          </span>
        </label>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginLeft: "auto" }}>
          <button
            type="button"
            onClick={() => onEdit(row)}
            disabled={actionsDisabled}
            style={{
              ...actionButtonBase,
              border: "1px solid #d1d5db",
              background: "#fff",
              color: "#374151",
              opacity: actionsDisabled ? 0.7 : 1,
            }}
          >
            Editar
          </button>

          <button
            type="button"
            onClick={() => onDelete(row)}
            disabled={actionsDisabled}
            style={{
              ...actionButtonBase,
              border: "1px solid #fecaca",
              background: "#fef2f2",
              color: "#991b1b",
              opacity: actionsDisabled ? 0.7 : 1,
            }}
          >
            Eliminar
          </button>
        </div>
      </div>
    </article>
  );
}
export default function AdminCategoriesPage() {
  const { restaurantId } = useRestaurant();
  const { canManage } = useAdminMembership();
  const sensors = useSensors(useSensor(PointerSensor));

  const [rows, setRows] = useState<CategoryRow[]>([]);
  const [productCounts, setProductCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [submittingModal, setSubmittingModal] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const animatedModal = useAnimatedValue(modal, 220);

  const pushToast = useCallback((type: Toast["type"], message: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, type, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3200);
  }, []);

  const loadCategories = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [categoriesResult, productsResult] = await Promise.all([
      supabase
        .from("categories")
        .select("id, name, sort_order, is_active, created_at")
        .eq("restaurant_id", restaurantId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("products")
        .select("category_id")
        .eq("restaurant_id", restaurantId),
    ]);

    if (categoriesResult.error) {
      setError(categoriesResult.error.message || "No se pudieron cargar las categorias.");
      setRows([]);
      setLoading(false);
      return;
    }

    const normalized = (categoriesResult.data ?? []).map((item) => ({
      id: String(item.id),
      name: String(item.name ?? ""),
      sort_order: typeof item.sort_order === "number" ? item.sort_order : null,
      is_active: item.is_active !== false,
      created_at: item.created_at ? String(item.created_at) : null,
    }));

    setRows(normalized);

    const counts: Record<string, number> = {};
    for (const p of productsResult.data ?? []) {
      if (p.category_id) {
        const key = String(p.category_id);
        counts[key] = (counts[key] ?? 0) + 1;
      }
    }
    setProductCounts(counts);

    setLoading(false);
  }, [restaurantId]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  const rowIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const isBusy = reordering || submittingModal || Boolean(savingId);
  const activeCount = useMemo(() => rows.filter((row) => row.is_active).length, [rows]);
  const inactiveCount = rows.length - activeCount;

  const openCreateModal = () => {
    setNameDraft("");
    setModal({ mode: "create" });
  };

  const openEditModal = (row: CategoryRow) => {
    setNameDraft(row.name);
    setModal({ mode: "edit", categoryId: row.id });
  };

  const closeModal = () => {
    if (submittingModal) return;
    setModal(null);
    setNameDraft("");
  };

  const submitModal = async () => {
    if (!canManage || !modal || submittingModal) return;

    const trimmedName = nameDraft.trim();
    if (!trimmedName) {
      pushToast("error", "El nombre es obligatorio.");
      return;
    }

    setSubmittingModal(true);
    setError(null);

    if (modal.mode === "create") {
      const maxSort = rows.reduce((max, row) => {
        const value = typeof row.sort_order === "number" ? row.sort_order : -1;
        return value > max ? value : max;
      }, -1);

      const { error: insertError } = await supabase.from("categories").insert({
        restaurant_id: restaurantId,
        name: trimmedName,
        sort_order: maxSort + 1,
        is_active: true,
      });

      if (insertError) {
        pushToast("error", insertError.message || "No se pudo crear la categoria.");
        setSubmittingModal(false);
        return;
      }

      pushToast("success", "Categoria creada.");
      await loadCategories();
      setSubmittingModal(false);
      closeModal();
      return;
    }

    const { error: updateError } = await supabase
      .from("categories")
      .update({ name: trimmedName })
      .eq("restaurant_id", restaurantId)
      .eq("id", modal.categoryId);

    if (updateError) {
      pushToast("error", updateError.message || "No se pudo actualizar la categoria.");
      setSubmittingModal(false);
      return;
    }

    setRows((prev) =>
      prev.map((row) => (row.id === modal.categoryId ? { ...row, name: trimmedName } : row))
    );
    pushToast("success", "Categoria actualizada.");
    setSubmittingModal(false);
    closeModal();
  };

  const toggleActive = async (row: CategoryRow) => {
    if (!canManage || isBusy) return;

    const previous = row.is_active;
    const next = !previous;
    setSavingId(row.id);
    setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, is_active: next } : item)));

    const { error: toggleError } = await supabase
      .from("categories")
      .update({ is_active: next })
      .eq("restaurant_id", restaurantId)
      .eq("id", row.id);

    if (toggleError) {
      setRows((prev) =>
        prev.map((item) => (item.id === row.id ? { ...item, is_active: previous } : item))
      );
      pushToast("error", toggleError.message || "No se pudo actualizar visibilidad.");
      setSavingId(null);
      return;
    }

    pushToast("success", next ? "Categoria visible." : "Categoria oculta.");
    setSavingId(null);
  };

  const deleteCategory = async (row: CategoryRow) => {
    if (!canManage || isBusy) return;

    const count = productCounts[row.id] ?? 0;
    const msg =
      count > 0
        ? `La categoria "${row.name}" tiene ${count} producto(s). ¿Eliminarla de todas formas?`
        : `¿Eliminar categoria "${row.name}"?`;
    if (!window.confirm(msg)) return;

    setSavingId(row.id);
    const previous = rows;
    setRows((prev) => prev.filter((r) => r.id !== row.id));

    const { error: deleteError } = await supabase
      .from("categories")
      .delete()
      .eq("restaurant_id", restaurantId)
      .eq("id", row.id);

    if (deleteError) {
      setRows(previous);
      pushToast("error", deleteError.message || "No se pudo eliminar la categoria.");
      setSavingId(null);
      return;
    }

    pushToast("success", "Categoria eliminada.");
    setSavingId(null);
    await loadCategories();
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    if (!canManage || isBusy) return;

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const fromIndex = rows.findIndex((row) => row.id === String(active.id));
    const toIndex = rows.findIndex((row) => row.id === String(over.id));
    if (fromIndex < 0 || toIndex < 0) return;

    const previousRows = rows;
    const reordered = arrayMove(rows, fromIndex, toIndex).map((row, index) => ({
      ...row,
      sort_order: index,
    }));

    setRows(reordered);
    setReordering(true);

    const orderedIds = reordered.map((row) => row.id);
    const { error: reorderError } = await supabase.rpc("admin_reorder_categories", {
      p_restaurant_id: restaurantId,
      p_category_ids: orderedIds,
    });

    if (reorderError) {
      setRows(previousRows);
      pushToast("error", reorderError.message || "No se pudo reordenar categorias.");
      setReordering(false);
      return;
    }

    pushToast("success", "Orden de categorias actualizado.");
    await loadCategories();
    setReordering(false);
  };

  return (
    <section
      style={{
        width: "100%",
        maxWidth: 1120,
        margin: "0 auto",
        display: "grid",
        gap: 18,
      }}
    >
      <header
        style={{
          display: "grid",
          gap: 14,
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: "16px clamp(14px, 2vw, 22px)",
          background:
            "linear-gradient(135deg, rgba(255,255,255,1) 0%, rgba(249,250,251,1) 60%, rgba(243,244,246,1) 100%)",
          boxShadow: "0 8px 28px rgba(17,24,39,0.04)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                width: "fit-content",
                padding: "4px 10px",
                borderRadius: 999,
                background: "rgba(17,24,39,0.06)",
                color: "#374151",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.02em",
              }}
            >
              MENÚ
            </span>
            <h1
              style={{
                margin: 0,
                fontSize: "clamp(1.45rem, 2.4vw, 1.9rem)",
                lineHeight: 1.15,
                color: "#111827",
                fontWeight: 800,
                letterSpacing: "-0.01em",
              }}
            >
              Categorías
            </h1>
            <p
              style={{
                margin: 0,
                color: "#4b5563",
                maxWidth: 680,
                fontSize: 14,
                lineHeight: 1.45,
              }}
            >
              Organiza la carta por bloques para que el menú público y el panel se mantengan claros,
              ordenados y fáciles de navegar.
            </p>
          </div>

          <button
            type="button"
            onClick={openCreateModal}
            disabled={!canManage || isBusy}
            style={{
              height: 40,
              borderRadius: 10,
              border: "1px solid var(--brand-primary)",
              background: "var(--brand-primary)",
              color: "var(--brand-white)",
              padding: "0 14px",
              fontWeight: 700,
              fontSize: 14,
              cursor: !canManage || isBusy ? "not-allowed" : "pointer",
              opacity: !canManage || isBusy ? 0.6 : 1,
              boxShadow: "0 6px 18px rgba(17,24,39,0.14)",
              whiteSpace: "nowrap",
              alignSelf: "flex-start",
            }}
          >
            + Categoría
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[
            { label: "Total", value: rows.length },
            { label: "Activas", value: activeCount },
            { label: "Ocultas", value: inactiveCount },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                minWidth: 112,
                borderRadius: 11,
                border: "1px solid #e5e7eb",
                background: "#fff",
                padding: "9px 11px",
                display: "grid",
                gap: 2,
              }}
            >
              <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 600 }}>{stat.label}</span>
              <strong style={{ fontSize: 17, lineHeight: 1.1, color: "#111827" }}>{stat.value}</strong>
            </div>
          ))}
        </div>
      </header>

      {error ? (
        <div className="admin-error-banner" role="alert">
          <span>No se pudieron cargar las categorías. Inténtalo de nuevo.</span>
          <button
            type="button"
            className="admin-btn-secondary"
            style={{ padding: "6px 12px", fontSize: 13 }}
            onClick={() => void loadCategories()}
          >
            Reintentar
          </button>
        </div>
      ) : null}

      {loading ? (
        <CardSkeleton count={3} />
      ) : null}

      {!loading && rows.length === 0 ? (
        <div className="admin-card" style={{ minHeight: 280, display: "grid", alignItems: "center" }}>
          <AdminEmptyState
            icon=""
            title="Sin categorías todavía"
            description="Las categorías agrupan tus productos. Crea una para empezar: Principales, Bebidas, Postres..."
            actionLabel="+ Crear categoría"
            onAction={openCreateModal}
          />
        </div>
      ) : null}

      {!loading && rows.length > 0 ? (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 14,
            background: "#fff",
            padding: "12px clamp(10px, 1.8vw, 18px) 14px",
            display: "grid",
            gap: 10,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              padding: "2px 4px 8px",
              borderBottom: "1px solid #f3f4f6",
            }}
          >
            <strong style={{ color: "#111827", fontSize: 14 }}>Listado de categorías</strong>
            <span style={{ color: "#6b7280", fontSize: 12 }}>
              Arrastra para reordenar la visualización del menú
            </span>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
              <div style={{ display: "grid", gap: 10 }}>
                {rows.map((row) => (
                  <SortableCategoryItem
                    key={row.id}
                    row={row}
                    disabled={!canManage || isBusy}
                    onEdit={openEditModal}
                    onDelete={(item) => void deleteCategory(item)}
                    onToggle={(item) => void toggleActive(item)}
                    isSaving={savingId === row.id}
                    productCount={productCounts[row.id] ?? 0}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      ) : null}

      {animatedModal.mounted && animatedModal.displayValue ? (
        <div
          className="ui-overlay"
          data-state={animatedModal.visible ? "open" : "closed"}
          role="presentation"
          onClick={closeModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(17, 24, 39, 0.45)",
            display: "grid",
            placeItems: "center",
            zIndex: 1500,
          }}
        >
          <div
            className="ui-modal-panel"
            data-state={animatedModal.visible ? "open" : "closed"}
            role="dialog"
            aria-modal="true"
            aria-label={animatedModal.displayValue.mode === "create" ? "Crear categoria" : "Editar categoria"}
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(520px, calc(100vw - 32px))",
              background: "#fff",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              padding: 16,
              display: "grid",
              gap: 12,
            }}
          >
            <h3 style={{ margin: 0 }}>{animatedModal.displayValue.mode === "create" ? "Nueva categoria" : "Editar categoria"}</h3>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#374151" }}>Nombre</span>
              <input
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                placeholder="Ej: Kebabs"
                disabled={submittingModal}
                autoFocus
                style={{
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  padding: "9px 10px",
                }}
              />
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={closeModal}
                disabled={submittingModal}
                style={{
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  color: "#374151",
                  padding: "8px 12px",
                  cursor: submittingModal ? "not-allowed" : "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void submitModal()}
                disabled={submittingModal}
                style={{
                  borderRadius: 8,
                  border: "1px solid var(--brand-primary)",
                  background: "var(--brand-primary)",
                  color: "var(--brand-white)",
                  padding: "8px 12px",
                  cursor: submittingModal ? "not-allowed" : "pointer",
                }}
              >
                {submittingModal ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          display: "grid",
          gap: 8,
          zIndex: 1600,
        }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            style={{
              border: `1px solid ${toast.type === "error" ? "#fecaca" : "var(--brand-primary-border)"}`,
              background: toast.type === "error" ? "#fef2f2" : "var(--brand-primary-soft)",
              color: toast.type === "error" ? "#991b1b" : "var(--brand-hover)",
              borderRadius: 10,
              padding: "10px 12px",
              minWidth: 220,
              maxWidth: 320,
              boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
            }}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </section>
  );
}
