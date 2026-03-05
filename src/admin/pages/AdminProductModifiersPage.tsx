import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
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

import SupabaseError from "../components/SupabaseError";
import { useAdminMembership } from "../components/AdminMembershipContext";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../../restaurant/RestaurantContext";

type ProductRow = {
  id: string;
  name: string | null;
};

type ModifierGroupRow = {
  id: string;
  name: string | null;
  min_select: number | null;
  max_select: number | null;
  is_active: boolean | null;
  position: number | null;
  [key: string]: unknown;
};

type ProductModifierGroupRow = {
  id: string;
  product_id: string;
  group_id: string;
  position: number | null;
  modifier_groups: ModifierGroupRow | ModifierGroupRow[] | null;
};

function getJoinedGroup(row: ProductModifierGroupRow): ModifierGroupRow | null {
  const joined = row.modifier_groups;
  if (!joined) return null;
  if (Array.isArray(joined)) return joined[0] ?? null;
  return joined;
}

type SortableAssignedCardProps = {
  row: ProductModifierGroupRow;
  disabled: boolean;
  onRemove: (id: string) => void;
};

function SortableAssignedCard({ row, disabled, onRemove }: SortableAssignedCardProps) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: row.id,
    disabled,
  });

  const group = getJoinedGroup(row);

  return (
    <article
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.65 : 1,
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 12,
        background: "#fff",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: "#111827" }}>{group?.name ?? row.group_id}</div>
        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
          min: {group?.min_select ?? "-"} | max: {group?.max_select ?? "-"}
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
          borderRadius: 8,
          padding: "6px 10px",
          cursor: disabled ? "not-allowed" : "grab",
          flexShrink: 0,
        }}
      >
        Arrastrar
      </button>

      <button
        type="button"
        onClick={() => onRemove(row.id)}
        disabled={disabled}
        style={{
          border: "1px solid #fecaca",
          background: "#fef2f2",
          color: "#991b1b",
          borderRadius: 8,
          padding: "6px 10px",
          cursor: disabled ? "not-allowed" : "pointer",
          flexShrink: 0,
        }}
      >
        Quitar
      </button>
    </article>
  );
}

export default function AdminProductModifiersPage() {
  const { canManage } = useAdminMembership();
  const { restaurantId, adminPath } = useRestaurant();
  const { id: productId } = useParams<{ id: string }>();
  const sensors = useSensors(useSensor(PointerSensor));

  const [product, setProduct] = useState<ProductRow | null>(null);
  const [availableGroups, setAvailableGroups] = useState<ModifierGroupRow[]>([]);
  const [assignedGroups, setAssignedGroups] = useState<ProductModifierGroupRow[]>([]);

  const [loadingProduct, setLoadingProduct] = useState(true);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingAssigned, setLoadingAssigned] = useState(true);

  const [productError, setProductError] = useState<unknown>(null);
  const [groupsError, setGroupsError] = useState<unknown>(null);
  const [assignedError, setAssignedError] = useState<unknown>(null);

  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  const loadProduct = useCallback(async () => {
    if (!productId) {
      setProductError(new Error("Missing product id"));
      setProduct(null);
      setLoadingProduct(false);
      return;
    }

    setLoadingProduct(true);
    setProductError(null);

    const { data, error } = await supabase
      .from("products")
      .select("id,name")
      .eq("id", productId)
      .eq("restaurant_id", restaurantId)
      .single();

    if (error) {
      setProductError(error);
      setProduct(null);
    } else {
      setProduct((data ?? null) as ProductRow | null);
    }

    setLoadingProduct(false);
  }, [productId, restaurantId]);

  const loadGroups = useCallback(async () => {
    setLoadingGroups(true);
    setGroupsError(null);

    const { data, error } = await supabase
      .from("modifier_groups")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("position", { ascending: true });

    if (error) {
      setGroupsError(error);
      setAvailableGroups([]);
    } else {
      const next = (data ?? []) as ModifierGroupRow[];
      setAvailableGroups(next);
      setSelectedGroupId((prev) => prev || next[0]?.id || "");
    }

    setLoadingGroups(false);
  }, [restaurantId]);

  const loadAssigned = useCallback(async () => {
    if (!productId) {
      setAssignedError(new Error("Missing product id"));
      setAssignedGroups([]);
      setLoadingAssigned(false);
      return;
    }

    setLoadingAssigned(true);
    setAssignedError(null);

    const { data, error } = await supabase
      .from("product_modifier_groups")
      .select("id, product_id, group_id, position, modifier_groups ( id, name, min_select, max_select, is_active, position )")
      .eq("product_id", productId)
      .eq("modifier_groups.restaurant_id", restaurantId)
      .order("position", { ascending: true });

    if (error) {
      setAssignedError(error);
      setAssignedGroups([]);
    } else {
      setAssignedGroups((data ?? []) as ProductModifierGroupRow[]);
    }

    setLoadingAssigned(false);
  }, [productId, restaurantId]);

  useEffect(() => {
    loadProduct();
    loadGroups();
    loadAssigned();
  }, [loadProduct, loadGroups, loadAssigned]);

  const onAssign = async () => {
    if (!canManage || !productId || !selectedGroupId || assigning || removingId || movingId) {
      return;
    }

    const alreadyAssigned = assignedGroups.some((row) => row.group_id === selectedGroupId);
    if (alreadyAssigned) {
      setAssignedError(new Error("Este grupo ya está asignado a este producto."));
      return;
    }

    setAssigning(true);
    setAssignedError(null);

    const maxPosition = assignedGroups.reduce<number>((max, row) => {
      const value = row.position;
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return max;
      }
      return value > max ? value : max;
    }, -1);

    const nextPosition = maxPosition >= 0 ? maxPosition + 1 : 0;

    const { error } = await supabase.from("product_modifier_groups").insert({
      product_id: productId,
      group_id: selectedGroupId,
      position: nextPosition,
    });

    if (error) {
      setAssignedError(error);
      setAssigning(false);
      return;
    }

    await loadAssigned();
    setAssigning(false);
  };

  const onRemove = async (id: string) => {
    if (!canManage || assigning || removingId || movingId) {
      return;
    }

    setRemovingId(id);
    setAssignedError(null);

    const { error } = await supabase.from("product_modifier_groups").delete().eq("id", id);

    if (error) {
      setAssignedError(error);
      setRemovingId(null);
      return;
    }

    await loadAssigned();
    setRemovingId(null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    if (!canManage || assigning || removingId || movingId) return;

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const fromIndex = assignedGroups.findIndex((row) => row.id === String(active.id));
    const toIndex = assignedGroups.findIndex((row) => row.id === String(over.id));
    if (fromIndex < 0 || toIndex < 0) return;

    const reordered = arrayMove(assignedGroups, fromIndex, toIndex).map((row, idx) => ({
      ...row,
      position: idx,
    }));

    setMovingId(String(active.id));
    setAssignedGroups(reordered);
    setAssignedError(null);

    const updates = await Promise.all(
      reordered.map((row) =>
        supabase.from("product_modifier_groups").update({ position: row.position }).eq("id", row.id)
      )
    );

    const firstError = updates.find((r) => r.error);
    if (firstError?.error) {
      setAssignedError(firstError.error);
      await loadAssigned();
    }

    setMovingId(null);
  };

  const assignedGroupIds = useMemo(() => assignedGroups.map((row) => row.id), [assignedGroups]);

  const isBusy = assigning || removingId !== null || movingId !== null;

  const pageLoading = useMemo(
    () => loadingProduct || loadingGroups || loadingAssigned,
    [loadingProduct, loadingGroups, loadingAssigned]
  );

  const alreadyAssignedGroupIds = useMemo(
    () => new Set(assignedGroups.map((row) => row.group_id)),
    [assignedGroups]
  );

  return (
    <section style={{ display: "grid", gap: 16 }}>
      {/* Header */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div>
          <a
            href={`${adminPath}/products`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              color: "var(--brand-hover)",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
              marginBottom: 6,
            }}
          >
            ← Volver a productos
          </a>
          <h2 style={{ margin: 0 }}>
            Modificadores: {product?.name ?? (loadingProduct ? "…" : "-")}
          </h2>
          <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 13 }}>
            Product ID: {productId ?? "-"}
          </p>
        </div>
      </header>

      {/* Assign section */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 14,
          background: "#fff",
          display: "grid",
          gap: 10,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 15 }}>Asignar grupo de modificadores</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select
            value={selectedGroupId}
            onChange={(event) => setSelectedGroupId(event.target.value)}
            disabled={isBusy || loadingGroups}
            style={{
              borderRadius: 8,
              border: "1px solid #d1d5db",
              padding: "8px 10px",
              flex: "1 1 200px",
              maxWidth: 320,
            }}
          >
            <option value="">Seleccionar grupo</option>
            {availableGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name ?? group.id}
                {alreadyAssignedGroupIds.has(group.id) ? " (ya asignado)" : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void onAssign()}
            disabled={!canManage || !selectedGroupId || isBusy || alreadyAssignedGroupIds.has(selectedGroupId)}
            style={{
              borderRadius: 8,
              border: "1px solid var(--brand-primary)",
              background: "var(--brand-primary)",
              color: "var(--brand-white)",
              padding: "8px 14px",
              cursor:
                !canManage || !selectedGroupId || isBusy || alreadyAssignedGroupIds.has(selectedGroupId)
                  ? "not-allowed"
                  : "pointer",
              opacity:
                !canManage || !selectedGroupId || isBusy || alreadyAssignedGroupIds.has(selectedGroupId)
                  ? 0.6
                  : 1,
            }}
          >
            {assigning ? "Asignando..." : "Asignar"}
          </button>
        </div>
      </div>

      {/* Assigned groups list */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 14,
          background: "#fff",
          display: "grid",
          gap: 10,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 15 }}>
          Grupos asignados ({assignedGroups.length})
        </h3>

        {!loadingAssigned && assignedGroups.length === 0 ? (
          <p style={{ color: "#6b7280", margin: 0 }}>No hay grupos asignados a este producto.</p>
        ) : null}

        {assignedGroups.length > 0 ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={assignedGroupIds} strategy={verticalListSortingStrategy}>
              <div style={{ display: "grid", gap: 8 }}>
                {assignedGroups.map((row) => (
                  <SortableAssignedCard
                    key={row.id}
                    row={row}
                    disabled={!canManage || isBusy}
                    onRemove={(id) => void onRemove(id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : null}
      </div>

      {/* Status / errors */}
      {pageLoading && (
        <p style={{ color: "#6b7280", margin: 0 }}>Cargando...</p>
      )}
      {productError !== null && <SupabaseError title="Error producto" error={productError} />}
      {groupsError !== null && <SupabaseError title="Error grupos" error={groupsError} />}
      {assignedError !== null && <SupabaseError title="Error grupos asignados" error={assignedError} />}

      {import.meta.env.DEV && (
        <pre>{JSON.stringify({ product, availableGroups, assignedGroups }, null, 2)}</pre>
      )}
    </section>
  );
}
