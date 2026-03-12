import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

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
};

type ProductModifierGroupRow = {
  id: string;
  product_id: string;
  modifier_group_id: string;
  modifier_groups: ModifierGroupRow | ModifierGroupRow[] | null;
};

const LOAD_ERROR_TEXT = "No se pudieron cargar los modificadores.";

function getJoinedGroup(row: ProductModifierGroupRow): ModifierGroupRow | null {
  const joined = row.modifier_groups;
  if (!joined) return null;
  if (Array.isArray(joined)) return joined[0] ?? null;
  return joined;
}

export default function AdminProductModifiersPage() {
  const { canManage } = useAdminMembership();
  const { restaurantId, adminPath } = useRestaurant();
  const { id: productId } = useParams<{ id: string }>();

  const [product, setProduct] = useState<ProductRow | null>(null);
  const [availableGroups, setAvailableGroups] = useState<ModifierGroupRow[]>([]);
  const [assignedGroups, setAssignedGroups] = useState<ProductModifierGroupRow[]>([]);

  const [loadingProduct, setLoadingProduct] = useState(true);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingAssigned, setLoadingAssigned] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadProduct = useCallback(async () => {
    if (!productId) {
      setProduct(null);
      setLoadingProduct(false);
      return;
    }

    setLoadingProduct(true);

    const { data, error } = await supabase
      .from("products")
      .select("id,name")
      .eq("id", productId)
      .eq("restaurant_id", restaurantId)
      .single();

    if (error) {
      if (import.meta.env.DEV) console.error("[modifiers] loadProduct", error);
      setProduct(null);
      setLoadingError(LOAD_ERROR_TEXT);
    } else {
      setProduct((data ?? null) as ProductRow | null);
    }

    setLoadingProduct(false);
  }, [productId, restaurantId]);

  const loadGroups = useCallback(async () => {
    setLoadingGroups(true);

    const { data, error } = await supabase
      .from("modifier_groups")
      .select("id,name,min_select,max_select,is_active")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: true });

    if (error) {
      if (import.meta.env.DEV) console.error("[modifiers] loadGroups", error);
      setAvailableGroups([]);
      setLoadingError(LOAD_ERROR_TEXT);
    } else {
      const next = (data ?? []) as ModifierGroupRow[];
      setAvailableGroups(next);
      setSelectedGroupId((prev) => prev || next[0]?.id || "");
    }

    setLoadingGroups(false);
  }, [restaurantId]);

  const loadAssigned = useCallback(async () => {
    if (!productId) {
      setAssignedGroups([]);
      setLoadingAssigned(false);
      return;
    }

    setLoadingAssigned(true);

    const { data, error } = await supabase
      .from("product_modifier_groups")
      .select(
        "id, product_id, modifier_group_id, modifier_groups!product_modifier_groups_modifier_group_id_fkey ( id, name, min_select, max_select, is_active )"
      )
      .eq("restaurant_id", restaurantId)
      .eq("product_id", productId)
      .eq("modifier_groups.restaurant_id", restaurantId);

    if (error) {
      if (import.meta.env.DEV) console.error("[modifiers] loadAssigned", error);
      setAssignedGroups([]);
      setLoadingError(LOAD_ERROR_TEXT);
    } else {
      setAssignedGroups((data ?? []) as ProductModifierGroupRow[]);
    }

    setLoadingAssigned(false);
  }, [productId, restaurantId]);

  useEffect(() => {
    setLoadingError(null);
    loadProduct();
    loadGroups();
    loadAssigned();
  }, [loadProduct, loadGroups, loadAssigned]);

  const onAssign = async () => {
    if (!canManage || !productId || !selectedGroupId || assigning || removingId) return;

    const alreadyAssigned = assignedGroups.some((row) => row.modifier_group_id === selectedGroupId);
    if (alreadyAssigned) return;

    setAssigning(true);

    const { error } = await supabase.from("product_modifier_groups").upsert(
      {
        restaurant_id: restaurantId,
        product_id: productId,
        modifier_group_id: selectedGroupId,
      },
      { onConflict: "product_id,modifier_group_id", ignoreDuplicates: true }
    );

    if (error) {
      if (import.meta.env.DEV) console.error("[modifiers] assign", error);
      setLoadingError(LOAD_ERROR_TEXT);
      setAssigning(false);
      return;
    }

    await loadAssigned();
    setAssigning(false);
  };

  const onRemove = async (id: string) => {
    if (!canManage || assigning || removingId) return;
    setRemovingId(id);

    const { error } = await supabase
      .from("product_modifier_groups")
      .delete()
      .eq("id", id)
      .eq("restaurant_id", restaurantId)
      .eq("product_id", productId ?? "");

    if (error) {
      if (import.meta.env.DEV) console.error("[modifiers] remove", error);
      setLoadingError(LOAD_ERROR_TEXT);
      setRemovingId(null);
      return;
    }

    await loadAssigned();
    setRemovingId(null);
  };

  const isBusy = assigning || removingId !== null;
  const pageLoading = loadingProduct || loadingGroups || loadingAssigned;
  const alreadyAssignedGroupIds = useMemo(
    () => new Set(assignedGroups.map((row) => row.modifier_group_id)),
    [assignedGroups]
  );

  return (
    <section style={{ display: "grid", gap: 16 }}>
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
            Volver a productos
          </a>
          <h2 style={{ margin: 0 }}>
            Modificadores: {product?.name ?? (loadingProduct ? "..." : "-")}
          </h2>
        </div>
      </header>

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
        <h3 style={{ margin: 0, fontSize: 15 }}>Grupos asignados ({assignedGroups.length})</h3>

        {!loadingAssigned && assignedGroups.length === 0 ? (
          <p style={{ color: "#6b7280", margin: 0 }}>No hay grupos asignados a este producto.</p>
        ) : null}

        {assignedGroups.length > 0 ? (
          <div style={{ display: "grid", gap: 8 }}>
            {assignedGroups.map((row) => {
              const group = getJoinedGroup(row);
              return (
                <article
                  key={row.id}
                  style={{
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
                    <div style={{ fontWeight: 700, color: "#111827" }}>
                      {group?.name ?? row.modifier_group_id}
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                      min: {group?.min_select ?? "-"} | max: {group?.max_select ?? "-"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void onRemove(row.id)}
                    disabled={!canManage || isBusy}
                    style={{
                      border: "1px solid #fecaca",
                      background: "#fef2f2",
                      color: "#991b1b",
                      borderRadius: 8,
                      padding: "6px 10px",
                      cursor: !canManage || isBusy ? "not-allowed" : "pointer",
                      flexShrink: 0,
                    }}
                  >
                    Quitar
                  </button>
                </article>
              );
            })}
          </div>
        ) : null}
      </div>

      {pageLoading && <p style={{ color: "#6b7280", margin: 0 }}>Cargando...</p>}
      {loadingError ? <p style={{ color: "#991b1b", margin: 0 }}>{loadingError}</p> : null}
    </section>
  );
}
