import { useCallback, useEffect, useRef, useState } from "react";
import { useAdminMembership } from "../components/AdminMembershipContext";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../../restaurant/RestaurantContext";

type IngredientRow = {
  id: string;
  name: string;
  is_available: boolean;
  product_count: number;
};

type Toast = { id: number; type: "success" | "error"; message: string };

export default function AdminIngredientsPage() {
  const { restaurantId } = useRestaurant();
  const { canManage } = useAdminMembership();

  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);

  // Create form state
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete confirm state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Toggling availability
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const pushToast = useCallback((type: Toast["type"], message: string) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Load stock ingredients (group_id IS NULL) with product count
    const { data, error: err } = await supabase
      .from("ingredients")
      .select("id, name, is_available")
      .eq("restaurant_id", restaurantId)
      .is("group_id", null)
      .order("name", { ascending: true });

    if (err) {
      setError(err.message || "No se pudieron cargar los ingredientes.");
      setLoading(false);
      return;
    }

    const rows = data ?? [];

    // Count products per ingredient via product_ingredients
    const ids = rows.map((r) => r.id as string);
    let counts: Record<string, number> = {};
    if (ids.length > 0) {
      const { data: piData } = await supabase
        .from("product_ingredients")
        .select("ingredient_id")
        .eq("restaurant_id", restaurantId)
        .in("ingredient_id", ids);

      for (const row of piData ?? []) {
        const iid = String(row.ingredient_id);
        counts[iid] = (counts[iid] ?? 0) + 1;
      }
    }

    setIngredients(
      rows.map((r) => ({
        id: String(r.id),
        name: String(r.name ?? ""),
        is_available: r.is_available !== false,
        product_count: counts[String(r.id)] ?? 0,
      }))
    );
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Create ─────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setCreating(true);
    const { error: err } = await supabase.from("ingredients").insert({
      restaurant_id: restaurantId,
      name: trimmed,
      is_available: true,
      group_id: null,
    });
    setCreating(false);
    if (err) {
      pushToast("error", err.message || "No se pudo crear el ingrediente.");
      return;
    }
    setNewName("");
    pushToast("success", "Ingrediente creado.");
    await load();
  };

  // ── Toggle availability ────────────────────────────────────────────────
  const handleToggle = async (ingredient: IngredientRow) => {
    if (togglingId) return;
    setTogglingId(ingredient.id);
    const prev = ingredients;
    setIngredients((list) =>
      list.map((i) => (i.id === ingredient.id ? { ...i, is_available: !i.is_available } : i))
    );
    const { error: err } = await supabase
      .from("ingredients")
      .update({ is_available: !ingredient.is_available })
      .eq("restaurant_id", restaurantId)
      .eq("id", ingredient.id);
    setTogglingId(null);
    if (err) {
      setIngredients(prev);
      pushToast("error", err.message || "No se pudo actualizar.");
    }
  };

  // ── Inline edit ────────────────────────────────────────────────────────
  const startEdit = (ingredient: IngredientRow) => {
    setEditingId(ingredient.id);
    setEditName(ingredient.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
  };

  const saveEdit = async () => {
    const trimmed = editName.trim();
    if (!trimmed || !editingId) return;
    setSavingEdit(true);
    const prev = ingredients;
    setIngredients((list) =>
      list.map((i) => (i.id === editingId ? { ...i, name: trimmed } : i))
    );
    const { error: err } = await supabase
      .from("ingredients")
      .update({ name: trimmed })
      .eq("restaurant_id", restaurantId)
      .eq("id", editingId);
    setSavingEdit(false);
    if (err) {
      setIngredients(prev);
      pushToast("error", err.message || "No se pudo guardar el nombre.");
      return;
    }
    setEditingId(null);
    setEditName("");
    pushToast("success", "Nombre actualizado.");
  };

  // ── Delete ─────────────────────────────────────────────────────────────
  const handleDeleteConfirm = async () => {
    if (!confirmDeleteId) return;
    setDeleting(true);
    const { error: err } = await supabase
      .from("ingredients")
      .delete()
      .eq("restaurant_id", restaurantId)
      .eq("id", confirmDeleteId);
    setDeleting(false);
    setConfirmDeleteId(null);
    if (err) {
      pushToast("error", err.message || "No se pudo eliminar el ingrediente.");
      return;
    }
    setIngredients((list) => list.filter((i) => i.id !== confirmDeleteId));
    pushToast("success", "Ingrediente eliminado.");
  };

  const ingredientToDelete = ingredients.find((i) => i.id === confirmDeleteId);

  return (
    <div style={{ maxWidth: 700 }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: 20 }}>
        <h1 className="admin-panel" style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>
          Ingredientes
        </h1>
        <p style={{ margin: "4px 0 0", color: "var(--admin-text-secondary)", fontSize: 13 }}>
          Gestiona los ingredientes de tu restaurante y su disponibilidad en stock.
        </p>
      </div>

      {/* ── Create form ── */}
      {canManage && (
        <div
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
            borderRadius: "var(--admin-radius-md)",
            padding: "14px 16px",
            marginBottom: 16,
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <input
            type="text"
            placeholder="Nombre del ingrediente (ej. Tomate, Queso, Carne...)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); }}
            disabled={creating}
            style={{
              flex: 1,
              borderRadius: 8,
              border: "1px solid #d1d5db",
              padding: "9px 12px",
              fontSize: 14,
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating || !newName.trim()}
            style={{
              borderRadius: 8,
              border: "1px solid var(--brand-primary)",
              background: "var(--brand-primary)",
              color: "#fff",
              padding: "9px 16px",
              fontSize: 14,
              fontWeight: 600,
              cursor: creating || !newName.trim() ? "not-allowed" : "pointer",
              opacity: creating || !newName.trim() ? 0.6 : 1,
              whiteSpace: "nowrap",
            }}
          >
            {creating ? "Creando..." : "+ Añadir"}
          </button>
        </div>
      )}

      {/* ── Content ── */}
      {loading ? (
        <div style={{ color: "var(--admin-text-secondary)", fontSize: 14, padding: "24px 0" }}>
          Cargando ingredientes...
        </div>
      ) : error ? (
        <div
          style={{
            color: "#dc2626",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 10,
            padding: "10px 14px",
            fontSize: 14,
          }}
        >
          {error}
        </div>
      ) : ingredients.length === 0 ? (
        <div
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
            borderRadius: "var(--admin-radius-md)",
            padding: 32,
            textAlign: "center",
            color: "var(--admin-text-secondary)",
            fontSize: 14,
          }}
        >
          No hay ingredientes todavía. Crea el primero usando el formulario de arriba.
        </div>
      ) : (
        <div
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
            borderRadius: "var(--admin-radius-md)",
            overflow: "hidden",
          }}
        >
          {ingredients.map((ingredient, idx) => (
            <div
              key={ingredient.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "11px 16px",
                borderTop: idx > 0 ? "1px solid #f3f4f6" : "none",
              }}
            >
              {/* Availability toggle */}
              <button
                type="button"
                title={ingredient.is_available ? "Disponible — clic para marcar agotado" : "Agotado — clic para marcar disponible"}
                onClick={() => canManage && void handleToggle(ingredient)}
                disabled={!canManage || togglingId === ingredient.id}
                style={{
                  flexShrink: 0,
                  width: 38,
                  height: 22,
                  borderRadius: 11,
                  border: "none",
                  background: ingredient.is_available ? "var(--brand-primary)" : "#d1d5db",
                  cursor: canManage ? "pointer" : "default",
                  position: "relative",
                  transition: "background 0.18s ease",
                  opacity: togglingId === ingredient.id ? 0.6 : 1,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 3,
                    left: ingredient.is_available ? 18 : 3,
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    background: "#fff",
                    transition: "left 0.18s ease",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }}
                />
              </button>

              {/* Name — inline edit */}
              {editingId === ingredient.id ? (
                <div style={{ flex: 1, display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    autoFocus
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void saveEdit();
                      if (e.key === "Escape") cancelEdit();
                    }}
                    disabled={savingEdit}
                    style={{
                      flex: 1,
                      borderRadius: 6,
                      border: "1px solid var(--brand-primary)",
                      padding: "5px 8px",
                      fontSize: 14,
                      outline: "none",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void saveEdit()}
                    disabled={savingEdit || !editName.trim()}
                    style={{
                      borderRadius: 6,
                      border: "1px solid var(--brand-primary)",
                      background: "var(--brand-primary)",
                      color: "#fff",
                      padding: "5px 10px",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {savingEdit ? "..." : "Guardar"}
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={savingEdit}
                    style={{
                      borderRadius: 6,
                      border: "1px solid #d1d5db",
                      background: "#fff",
                      color: "#374151",
                      padding: "5px 10px",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: ingredient.is_available
                        ? "var(--admin-text-primary)"
                        : "var(--admin-text-muted)",
                      textDecoration: ingredient.is_available ? "none" : "line-through",
                    }}
                  >
                    {ingredient.name}
                  </span>
                  {!ingredient.is_available && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#ef4444",
                        background: "#fef2f2",
                        border: "1px solid #fecaca",
                        borderRadius: 4,
                        padding: "1px 5px",
                      }}
                    >
                      AGOTADO
                    </span>
                  )}
                </div>
              )}

              {/* Product count badge */}
              {editingId !== ingredient.id && (
                <span
                  title={`Usado en ${ingredient.product_count} producto${ingredient.product_count !== 1 ? "s" : ""}`}
                  style={{
                    flexShrink: 0,
                    fontSize: 11,
                    fontWeight: 700,
                    color: ingredient.product_count > 0 ? "var(--brand-primary)" : "var(--admin-text-muted)",
                    background: ingredient.product_count > 0
                      ? "var(--brand-primary-soft)"
                      : "#f3f4f6",
                    borderRadius: 20,
                    padding: "2px 8px",
                    border: `1px solid ${ingredient.product_count > 0 ? "var(--brand-primary-border)" : "#e5e7eb"}`,
                  }}
                >
                  {ingredient.product_count} prod.
                </span>
              )}

              {/* Actions */}
              {canManage && editingId !== ingredient.id && (
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => startEdit(ingredient)}
                    title="Editar nombre"
                    style={{
                      borderRadius: 6,
                      border: "1px solid #e5e7eb",
                      background: "#fff",
                      color: "#374151",
                      padding: "4px 9px",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(ingredient.id)}
                    title="Eliminar ingrediente"
                    style={{
                      borderRadius: 6,
                      border: "1px solid #fecaca",
                      background: "#fff",
                      color: "#dc2626",
                      padding: "4px 9px",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    🗑️
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Delete confirm modal ── */}
      {confirmDeleteId && ingredientToDelete && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => !deleting && setConfirmDeleteId(null)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 14,
              padding: 24,
              maxWidth: 420,
              width: "100%",
              boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700, color: "#111827" }}>
              Eliminar ingrediente
            </h3>
            {ingredientToDelete.product_count > 0 ? (
              <p style={{ margin: "0 0 16px", fontSize: 14, color: "#374151" }}>
                <strong>{ingredientToDelete.name}</strong> está asociado a{" "}
                <strong>{ingredientToDelete.product_count} producto{ingredientToDelete.product_count !== 1 ? "s" : ""}</strong>.
                Al eliminar se quitará de todos ellos. ¿Continuar?
              </p>
            ) : (
              <p style={{ margin: "0 0 16px", fontSize: 14, color: "#374151" }}>
                ¿Eliminar <strong>{ingredientToDelete.name}</strong>? Esta acción no se puede deshacer.
              </p>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                disabled={deleting}
                style={{
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  color: "#374151",
                  padding: "8px 16px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteConfirm()}
                disabled={deleting}
                style={{
                  borderRadius: 8,
                  border: "1px solid #dc2626",
                  background: "#dc2626",
                  color: "#fff",
                  padding: "8px 16px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: deleting ? "not-allowed" : "pointer",
                  opacity: deleting ? 0.7 : 1,
                }}
              >
                {deleting ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toasts ── */}
      <div
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 3000,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              background: t.type === "success" ? "#16a34a" : "#dc2626",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              maxWidth: 320,
            }}
          >
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
