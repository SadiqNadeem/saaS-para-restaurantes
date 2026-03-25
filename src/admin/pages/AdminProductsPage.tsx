import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AdminEmptyState } from "../components/AdminEmptyState";
import { HelpTooltip } from "../components/HelpTooltip";
import { FeatureTour } from "../components/FeatureTour";
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
import { prepareImageWebp } from "../../lib/images/prepareImageWebp";
import { uploadProductImage } from "../../lib/images/uploadProductImage";
import { useAnimatedValue } from "../../hooks/useAnimatedValue";

type CategoryRow = {
  id: string;
  name: string;
  sort_order: number | null;
  is_active: boolean;
};

type ModifierGroupRow = {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number | null;
};

type IngredientRow = {
  id: string;
  name: string;
  is_available: boolean;
};

type ProductRow = {
  id: string;
  restaurant_id: string;
  category_id: string | null;
  name: string;
  price: number;
  description: string | null;
  image_url: string | null;
  sort_order: number | null;
  is_active: boolean;
  created_at: string | null;
  track_stock: boolean;
  stock_quantity: number;
  is_upsell: boolean;
};

type Toast = {
  id: number;
  type: "success" | "error";
  message: string;
};

type ProductModalState =
  | { mode: "create" }
  | { mode: "edit"; productId: string }
  | null;

type ProductDraft = {
  name: string;
  price: string;
  description: string;
  image_url: string;
  category_id: string;
  track_stock: boolean;
  stock_quantity: string;
  is_upsell: boolean;
};

const EMPTY_DRAFT: ProductDraft = {
  name: "",
  price: "",
  description: "",
  image_url: "",
  category_id: "",
  track_stock: false,
  stock_quantity: "0",
  is_upsell: false,
};

type ParsedRow = {
  rowIndex: number;
  name: string;
  description: string;
  price: number;
  categoryName: string;
  categoryId: string;
  is_active: boolean;
  is_upsell: boolean;
  image_url: string;
  errors: string[];
};

function escapeCsvField(value: string): string {
  if (value.includes(";") || value.includes('"') || value.includes("\n")) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function parseBoolField(raw: string | undefined): boolean {
  const v = (raw ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "sí" || v === "si" || v === "yes";
}

function parseCsvLine(line: string): string[] {
  const cols: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuote) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQuote = false; }
      else { cur += c; }
    } else if (c === '"') {
      inQuote = true;
    } else if (c === ";") {
      cols.push(cur); cur = "";
    } else {
      cur += c;
    }
  }
  cols.push(cur);
  return cols;
}

type SortableProductCardProps = {
  row: ProductRow;
  disabled: boolean;
  isSaving: boolean;
  adminPath: string;
  onEdit: (row: ProductRow) => void;
  onDelete: (row: ProductRow) => void;
  onToggle: (row: ProductRow) => void;
  onManageModifiers: (row: ProductRow) => void;
};

function SortableProductCard({
  row,
  disabled,
  isSaving,
  adminPath,
  onEdit,
  onDelete,
  onToggle,
  onManageModifiers,
}: SortableProductCardProps) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: row.id,
    disabled,
  });

  void adminPath; // used via onManageModifiers callback

  return (
    <article
      className="ui-list-item ui-soft-border"
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.72 : 1,
        border: "1px solid #e2e8f0",
        borderRadius: 16,
        padding: 16,
        display: "grid",
        gap: 14,
        background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
        boxShadow: isDragging ? "0 10px 24px rgba(15, 23, 42, 0.12)" : "0 3px 10px rgba(15, 23, 42, 0.06)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, minWidth: 0 }}>
          {row.image_url ? (
            <img
              src={row.image_url}
              alt={row.name}
              style={{
                width: 62,
                height: 62,
                objectFit: "cover",
                borderRadius: 12,
                flexShrink: 0,
                border: "1px solid #e2e8f0",
              }}
            />
          ) : (
            <div
              style={{
                width: 62,
                height: 62,
                borderRadius: 12,
                background: "#f1f5f9",
                border: "1px solid #dbe2ea",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>IMG</span>
            </div>
          )}

          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 16, lineHeight: 1.25 }}>{row.name}</div>
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
              {!row.image_url && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "3px 10px",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                    border: "1px solid #fecaca",
                    background: "#fef2f2",
                    color: "#991b1b",
                  }}
                >
                  Sin imagen
                </span>
              )}
            </div>
            <div style={{ marginTop: 4, color: "#0f172a", fontSize: 15, fontWeight: 600 }}>{row.price.toFixed(2)} EUR</div>
            {row.description ? (
              <div style={{ marginTop: 6, color: "#64748b", fontSize: 13, lineHeight: 1.4 }}>{row.description}</div>
            ) : null}
            {row.track_stock && (
              <div
                style={{
                  marginTop: 8,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "3px 9px",
                  borderRadius: 20,
                  background: row.stock_quantity > 0 ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.1)",
                  color: row.stock_quantity > 0 ? "#15803d" : "#dc2626",
                }}
              >
                {row.stock_quantity > 0 ? `En stock (${row.stock_quantity})` : "Sin stock"}
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          {...attributes}
          {...listeners}
          disabled={disabled}
          style={{
            border: "1px solid #d1d5db",
            background: "#ffffff",
            borderRadius: 10,
            padding: "8px 12px",
            cursor: disabled ? "not-allowed" : "grab",
            flexShrink: 0,
            color: "#334155",
            fontSize: 12,
            fontWeight: 600,
            minHeight: 36,
          }}
        >
          Arrastrar
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
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
            minHeight: 38,
          }}
        >
          <input
            type="checkbox"
            checked={row.is_active}
            disabled={disabled || isSaving}
            onChange={() => onToggle(row)}
          />
          Visible en tienda
        </label>

        <button
          type="button"
          onClick={() => onEdit(row)}
          disabled={disabled || isSaving}
          style={{
            border: "1px solid #d1d5db",
            background: "#ffffff",
            borderRadius: 10,
            padding: "8px 14px",
            cursor: disabled || isSaving ? "not-allowed" : "pointer",
            minHeight: 38,
            fontSize: 13,
            fontWeight: 600,
            color: "#334155",
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
            padding: "8px 14px",
            cursor: disabled || isSaving ? "not-allowed" : "pointer",
            minHeight: 38,
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          Eliminar
        </button>

        <button
          type="button"
          onClick={() => onManageModifiers(row)}
          disabled={disabled || isSaving}
          style={{
            border: "1px solid #bfdbfe",
            background: "#eff6ff",
            color: "#1d4ed8",
            borderRadius: 10,
            padding: "8px 14px",
            cursor: disabled || isSaving ? "not-allowed" : "pointer",
            fontSize: 13,
            fontWeight: 700,
            minHeight: 38,
          }}
        >
          Modificadores
        </button>
      </div>
    </article>
  );
}

export default function AdminProductsPage() {
  const { restaurantId, adminPath, name: restaurantName } = useRestaurant();
  const { canManage } = useAdminMembership();
  const navigate = useNavigate();
  const sensors = useSensors(useSensor(PointerSensor));

  const [showTour, setShowTour] = useState(() => {
    try { return !localStorage.getItem("tour_completed_products"); } catch { return true; }
  });
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [modifierGroups, setModifierGroups] = useState<ModifierGroupRow[]>([]);
  const [restaurantIngredients, setRestaurantIngredients] = useState<IngredientRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingProductId, setSavingProductId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [modal, setModal] = useState<ProductModalState>(null);
  const [draft, setDraft] = useState<ProductDraft>(EMPTY_DRAFT);
  const [submittingModal, setSubmittingModal] = useState(false);
  const [selectedModifierGroupIds, setSelectedModifierGroupIds] = useState<string[]>([]);
  const [selectedIngredientIds, setSelectedIngredientIds] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [localImageUrl, setLocalImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [categoryFocused, setCategoryFocused] = useState(false);
  const animatedModal = useAnimatedValue(modal, 220);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importParsed, setImportParsed] = useState<ParsedRow[]>([]);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);

  const pushToast = useCallback((type: Toast["type"], message: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, type, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3200);
  }, []);

  const handleExportCsv = () => {
    const headers = ["name", "description", "price", "category", "is_active", "is_upsell", "image_url"];
    const rows = products.map((p) => {
      const catName = categories.find((c) => c.id === p.category_id)?.name ?? "";
      return [
        escapeCsvField(p.name),
        escapeCsvField(p.description ?? ""),
        p.price.toFixed(2),
        escapeCsvField(catName),
        p.is_active ? "true" : "false",
        p.is_upsell ? "true" : "false",
        escapeCsvField(p.image_url ?? ""),
      ].join(";");
    });
    const csv = [headers.join(";"), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    const safeName = (restaurantName ?? "menu").replace(/[^a-z0-9_\-]/gi, "_");
    a.href = url;
    a.download = `menu_${safeName}_${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleParseImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) ?? "";
      const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
      if (lines.length < 2) {
        setImportParsed([]);
        return;
      }
      const headerCols = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase().replace(/"/g, ""));
      const idx = {
        name: headerCols.indexOf("name"),
        description: headerCols.indexOf("description"),
        price: headerCols.indexOf("price"),
        category: headerCols.indexOf("category"),
        is_active: headerCols.indexOf("is_active"),
        is_upsell: headerCols.indexOf("is_upsell"),
        image_url: headerCols.indexOf("image_url"),
      };
      const parsed: ParsedRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        const errors: string[] = [];
        const rowName = idx.name >= 0 ? (cols[idx.name] ?? "").trim() : "";
        if (!rowName) errors.push("Nombre vacío");
        const priceRaw = idx.price >= 0 ? (cols[idx.price] ?? "").trim().replace(",", ".") : "";
        const price = parseFloat(priceRaw);
        if (!Number.isFinite(price) || price < 0) errors.push(`Precio inválido: "${priceRaw}"`);
        const categoryName = idx.category >= 0 ? (cols[idx.category] ?? "").trim() : "";
        if (!categoryName) errors.push("Categoría vacía");
        const cat = categories.find((c) => c.name.toLowerCase() === categoryName.toLowerCase());
        if (categoryName && !cat) errors.push(`Categoría no encontrada: "${categoryName}"`);
        parsed.push({
          rowIndex: i,
          name: rowName,
          description: idx.description >= 0 ? (cols[idx.description] ?? "").trim() : "",
          price: Number.isFinite(price) ? price : 0,
          categoryName,
          categoryId: cat?.id ?? "",
          is_active: parseBoolField(idx.is_active >= 0 ? cols[idx.is_active] : "true"),
          is_upsell: parseBoolField(idx.is_upsell >= 0 ? cols[idx.is_upsell] : "false"),
          image_url: idx.image_url >= 0 ? (cols[idx.image_url] ?? "").trim() : "",
          errors,
        });
      }
      setImportParsed(parsed);
    };
    reader.readAsText(file, "utf-8");
  };

  const handleConfirmImport = async () => {
    const valid = importParsed.filter((r) => r.errors.length === 0);
    if (valid.length === 0) return;
    setImportProgress({ done: 0, total: valid.length });
    let done = 0;
    for (const row of valid) {
      const { data: existing } = await supabase
        .from("products")
        .select("id")
        .eq("restaurant_id", restaurantId)
        .eq("name", row.name)
        .maybeSingle();
      if (existing?.id) {
        await supabase.from("products").update({
          price: row.price,
          description: row.description || null,
          category_id: row.categoryId,
          is_active: row.is_active,
          is_upsell: row.is_upsell,
          image_url: row.image_url || null,
        }).eq("id", existing.id).eq("restaurant_id", restaurantId);
      } else {
        await supabase.from("products").insert({
          restaurant_id: restaurantId,
          name: row.name,
          price: row.price,
          description: row.description || null,
          category_id: row.categoryId,
          is_active: row.is_active,
          is_upsell: row.is_upsell,
          image_url: row.image_url || null,
          sort_order: 9999,
          track_stock: false,
          stock_quantity: 0,
        });
      }
      done++;
      setImportProgress({ done, total: valid.length });
    }
    await loadAll();
    setShowImportModal(false);
    setImportParsed([]);
    setImportProgress(null);
    pushToast("success", `${done} producto${done !== 1 ? "s" : ""} importado${done !== 1 ? "s" : ""}.`);
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [categoriesResult, productsResult, modifierGroupsResult, ingredientsResult] = await Promise.all([
      supabase
        .from("categories")
        .select("id, name, sort_order, is_active")
        .eq("restaurant_id", restaurantId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("products")
        .select("id, restaurant_id, category_id, name, price, description, image_url, sort_order, is_active, created_at, track_stock, stock_quantity, is_upsell")
        .eq("restaurant_id", restaurantId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("modifier_groups")
        .select("id, name, is_active, sort_order")
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("ingredients")
        .select("id, name, is_available")
        .eq("restaurant_id", restaurantId)
        .is("group_id", null)
        .order("name", { ascending: true }),
    ]);

    if (categoriesResult.error) {
      setError(categoriesResult.error.message || "No se pudieron cargar categorias.");
      setCategories([]);
      setProducts([]);
      setLoading(false);
      return;
    }

    if (modifierGroupsResult.error) {
      if (import.meta.env.DEV) console.error("[products] load modifier_groups", modifierGroupsResult.error);
      setError("No se pudieron cargar los modificadores.");
      setCategories([]);
      setProducts([]);
      setModifierGroups([]);
      setLoading(false);
      return;
    }

    if (productsResult.error) {
      setError(productsResult.error.message || "No se pudieron cargar productos.");
      setCategories([]);
      setProducts([]);
      setLoading(false);
      return;
    }

    const normalizedCategories: CategoryRow[] = (categoriesResult.data ?? []).map((item) => ({
      id: String(item.id),
      name: String(item.name ?? ""),
      sort_order: typeof item.sort_order === "number" ? item.sort_order : null,
      is_active: item.is_active !== false,
    }));

    const normalizedProducts: ProductRow[] = (productsResult.data ?? []).map((item) => ({
      id: String(item.id),
      restaurant_id: String(item.restaurant_id),
      category_id: item.category_id ? String(item.category_id) : null,
      name: String(item.name ?? ""),
      price: Number(item.price ?? 0),
      description: item.description ? String(item.description) : null,
      image_url: item.image_url ? String(item.image_url) : null,
      sort_order: typeof item.sort_order === "number" ? item.sort_order : null,
      is_active: item.is_active !== false,
      created_at: item.created_at ? String(item.created_at) : null,
      track_stock: item.track_stock === true,
      stock_quantity: typeof item.stock_quantity === "number" ? item.stock_quantity : 0,
      is_upsell: item.is_upsell === true,
    }));

    const normalizedModifierGroups: ModifierGroupRow[] = (modifierGroupsResult.data ?? []).map((item) => ({
      id: String(item.id),
      name: String(item.name ?? ""),
      is_active: item.is_active !== false,
      sort_order: typeof item.sort_order === "number" ? item.sort_order : null,
    }));

    const normalizedIngredients: IngredientRow[] = (ingredientsResult.data ?? []).map((item) => ({
      id: String(item.id),
      name: String(item.name ?? ""),
      is_available: item.is_available !== false,
    }));

    setCategories(normalizedCategories);
    setProducts(normalizedProducts);
    setModifierGroups(normalizedModifierGroups);
    setRestaurantIngredients(normalizedIngredients);

    if (
      selectedCategoryId &&
      !normalizedCategories.some((category) => category.id === selectedCategoryId)
    ) {
      setSelectedCategoryId("");
    }

    setLoading(false);
  }, [restaurantId, selectedCategoryId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const productsInSelectedCategory = useMemo(() => {
    return products
      .filter((product) => !selectedCategoryId || (product.category_id ?? "") === selectedCategoryId)
      .sort((a, b) => {
        const aSort = typeof a.sort_order === "number" ? a.sort_order : Number.MAX_SAFE_INTEGER;
        const bSort = typeof b.sort_order === "number" ? b.sort_order : Number.MAX_SAFE_INTEGER;
        if (aSort !== bSort) return aSort - bSort;
        return (a.created_at ?? "").localeCompare(b.created_at ?? "");
      });
  }, [products, selectedCategoryId]);

  // Cross-category search results (only active when query is non-empty)
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, searchQuery]);

  const productIds = useMemo(() => productsInSelectedCategory.map((product) => product.id), [productsInSelectedCategory]);

  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of categories) map.set(cat.id, cat.name);
    return map;
  }, [categories]);

  const productsByCategory = useMemo(() => {
    if (selectedCategoryId) return null;
    return categories
      .map((cat) => ({
        category: cat,
        items: products
          .filter((p) => p.category_id === cat.id)
          .sort((a, b) => {
            const aSort = typeof a.sort_order === "number" ? a.sort_order : Number.MAX_SAFE_INTEGER;
            const bSort = typeof b.sort_order === "number" ? b.sort_order : Number.MAX_SAFE_INTEGER;
            if (aSort !== bSort) return aSort - bSort;
            return (a.created_at ?? "").localeCompare(b.created_at ?? "");
          }),
      }))
      .filter((g) => g.items.length > 0);
  }, [categories, products, selectedCategoryId]);
  const isBusy = reordering || submittingModal || Boolean(savingProductId);

  const resetImageState = () => {
    if (localImageUrl) URL.revokeObjectURL(localImageUrl);
    setImageFile(null);
    setLocalImageUrl(null);
    setImageError(null);
  };

  const handleImageFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (localImageUrl) URL.revokeObjectURL(localImageUrl);
    setImageError(null);
    if (!file) {
      setImageFile(null);
      setLocalImageUrl(null);
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setImageError("La imagen no puede superar 2 MB. Elige una imagen más pequeña.");
      event.target.value = "";
      setImageFile(null);
      setLocalImageUrl(null);
      return;
    }
    setImageFile(file);
    setLocalImageUrl(URL.createObjectURL(file));
  };

  const openCreateModal = () => {
    setDraft({
      ...EMPTY_DRAFT,
      category_id: selectedCategoryId || categories[0]?.id || "",
    });
    setSelectedModifierGroupIds([]);
    setSelectedIngredientIds([]);
    resetImageState();
    setModal({ mode: "create" });
  };

  const openEditModal = async (row: ProductRow) => {
    setDraft({
      name: row.name,
      price: String(row.price),
      description: row.description ?? "",
      image_url: row.image_url ?? "",
      category_id: row.category_id ?? selectedCategoryId,
      track_stock: row.track_stock,
      stock_quantity: String(row.stock_quantity),
      is_upsell: row.is_upsell,
    });
    setSelectedModifierGroupIds([]);
    setSelectedIngredientIds([]);
    resetImageState();

    const [modifierBridgeResult, ingredientBridgeResult] = await Promise.all([
      supabase.from("product_modifier_groups").select("modifier_group_id").eq("product_id", row.id),
      supabase.from("product_ingredients").select("ingredient_id").eq("product_id", row.id),
    ]);

    if (modifierBridgeResult.error) {
      if (import.meta.env.DEV) console.error("[products] openEditModal product_modifier_groups", modifierBridgeResult.error);
      pushToast("error", "No se pudieron cargar los modificadores.");
    } else {
      const ids = (modifierBridgeResult.data ?? []).map((entry) => String(entry.modifier_group_id ?? "")).filter(Boolean);
      setSelectedModifierGroupIds(ids);
    }

    if (!ingredientBridgeResult.error) {
      const ids = (ingredientBridgeResult.data ?? []).map((entry) => String(entry.ingredient_id ?? "")).filter(Boolean);
      setSelectedIngredientIds(ids);
    }

    setModal({ mode: "edit", productId: row.id });
  };

  const closeModal = () => {
    if (submittingModal) return;
    resetImageState();
    setModal(null);
    setDraft(EMPTY_DRAFT);
    setSelectedModifierGroupIds([]);
    setSelectedIngredientIds([]);
  };

  const updateDraft = <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const toggleModifierSelection = (groupId: string) => {
    setSelectedModifierGroupIds((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]
    );
  };

  const toggleIngredientSelection = (ingredientId: string) => {
    setSelectedIngredientIds((prev) =>
      prev.includes(ingredientId) ? prev.filter((id) => id !== ingredientId) : [...prev, ingredientId]
    );
  };

  const syncProductModifierGroups = useCallback(
    async (productId: string, groupIds: string[]) => {
      const { error: deleteError } = await supabase
        .from("product_modifier_groups")
        .delete()
        .eq("product_id", productId);

      if (deleteError) {
        if (import.meta.env.DEV) console.error("[products] sync delete product_modifier_groups", deleteError);
        throw new Error("No se pudieron actualizar los modificadores.");
      }

      if (groupIds.length === 0) {
        return;
      }

      const rows = groupIds.map((groupId, index) => ({
        restaurant_id: restaurantId,
        product_id: productId,
        modifier_group_id: groupId,
        sort_order: index,
      }));

      const { error: insertError } = await supabase
        .from("product_modifier_groups")
        .insert(rows);
      if (insertError) {
        if (import.meta.env.DEV) console.error("[products] sync insert product_modifier_groups", insertError);
        throw new Error("No se pudieron actualizar los modificadores.");
      }
    },
    [restaurantId]
  );

  const syncProductIngredients = useCallback(
    async (productId: string, ingredientIds: string[]) => {
      const { error: deleteError } = await supabase
        .from("product_ingredients")
        .delete()
        .eq("product_id", productId);

      if (deleteError) {
        if (import.meta.env.DEV) console.error("[products] sync delete product_ingredients", deleteError);
        throw new Error("No se pudieron actualizar los ingredientes.");
      }

      if (ingredientIds.length === 0) return;

      const rows = ingredientIds.map((ingredientId) => ({
        restaurant_id: restaurantId,
        product_id: productId,
        ingredient_id: ingredientId,
      }));

      const { error: insertError } = await supabase.from("product_ingredients").insert(rows);
      if (insertError) {
        if (import.meta.env.DEV) console.error("[products] sync insert product_ingredients", insertError);
        throw new Error("No se pudieron actualizar los ingredientes.");
      }
    },
    [restaurantId]
  );

  const submitModal = async () => {
    if (!canManage || !modal || submittingModal) return;

    const trimmedName = draft.name.trim();
    const parsedPrice = Number(draft.price);
    if (!trimmedName) {
      pushToast("error", "El nombre es obligatorio.");
      return;
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      pushToast("error", "El precio debe ser un numero >= 0.");
      return;
    }
    if (!draft.category_id) {
      pushToast("error", "Selecciona una categoria.");
      return;
    }

    setSubmittingModal(true);
    setError(null);

    if (modal.mode === "create") {
      const maxSort = products
        .filter((product) => (product.category_id ?? "") === draft.category_id)
        .reduce((max, product) => {
          const value = typeof product.sort_order === "number" ? product.sort_order : -1;
          return value > max ? value : max;
        }, -1);

      const { data: createdProduct, error: insertError } = await supabase
        .from("products")
        .insert({
          restaurant_id: restaurantId,
          category_id: draft.category_id,
          name: trimmedName,
          price: parsedPrice,
          description: draft.description.trim() || null,
          image_url: draft.image_url.trim() || null,
          sort_order: maxSort + 1,
          is_active: true,
          track_stock: draft.track_stock,
          stock_quantity: draft.track_stock ? Math.max(0, parseInt(draft.stock_quantity, 10) || 0) : 0,
          is_upsell: draft.is_upsell,
        })
        .select("id")
        .single();

      if (insertError) {
        pushToast("error", insertError.message || "No se pudo crear producto.");
        setSubmittingModal(false);
        return;
      }

      if (createdProduct?.id && imageFile) {
        try {
          const blob = await prepareImageWebp(imageFile);
          const uploadedUrl = await uploadProductImage(
            supabase,
            restaurantId,
            String(createdProduct.id),
            blob
          );
          await supabase.from("products").update({ image_url: uploadedUrl }).eq("id", String(createdProduct.id));
        } catch (uploadErr) {
          pushToast("error", uploadErr instanceof Error ? uploadErr.message : "No se pudo subir la imagen.");
        }
      }

      if (createdProduct?.id) {
        try {
          await syncProductModifierGroups(String(createdProduct.id), selectedModifierGroupIds);
        } catch (syncError) {
          if (import.meta.env.DEV) console.error("[products] create sync modifiers", syncError);
          pushToast("error", "No se pudieron actualizar los modificadores.");
          setSubmittingModal(false);
          return;
        }
        try {
          await syncProductIngredients(String(createdProduct.id), selectedIngredientIds);
        } catch (syncError) {
          if (import.meta.env.DEV) console.error("[products] create sync ingredients", syncError);
          pushToast("error", "No se pudieron actualizar los ingredientes.");
          setSubmittingModal(false);
          return;
        }
      }

      pushToast("success", "Producto creado.");
      await loadAll();
      setSubmittingModal(false);
      closeModal();
      return;
    }

    // Edit mode
    const STORAGE_PREFIX = "https://ewxarutpvgelwdswjolz.supabase.co/storage/v1/object/public/product-images/";
    let finalImageUrl: string | null = draft.image_url.trim() || null;
    if (imageFile) {
      // Delete old image from Storage if it lives in our bucket
      if (draft.image_url && draft.image_url.startsWith(STORAGE_PREFIX)) {
        const oldPath = draft.image_url.slice(STORAGE_PREFIX.length);
        await supabase.storage.from("product-images").remove([oldPath]);
      }
      try {
        const blob = await prepareImageWebp(imageFile);
        finalImageUrl = await uploadProductImage(supabase, restaurantId, modal.productId, blob);
      } catch (uploadErr) {
        pushToast("error", uploadErr instanceof Error ? uploadErr.message : "No se pudo subir la imagen.");
        setSubmittingModal(false);
        return;
      }
    }

    const { error: updateError } = await supabase
      .from("products")
      .update({
        category_id: draft.category_id,
        name: trimmedName,
        price: parsedPrice,
        description: draft.description.trim() || null,
        image_url: finalImageUrl,
        track_stock: draft.track_stock,
        stock_quantity: draft.track_stock ? Math.max(0, parseInt(draft.stock_quantity, 10) || 0) : 0,
        is_upsell: draft.is_upsell,
      })
      .eq("restaurant_id", restaurantId)
      .eq("id", modal.productId);

    if (updateError) {
      pushToast("error", updateError.message || "No se pudo actualizar producto.");
      setSubmittingModal(false);
      return;
    }

    try {
      await syncProductModifierGroups(modal.productId, selectedModifierGroupIds);
    } catch (syncError) {
      if (import.meta.env.DEV) console.error("[products] edit sync modifiers", syncError);
      pushToast("error", "No se pudieron actualizar los modificadores.");
      setSubmittingModal(false);
      return;
    }

    try {
      await syncProductIngredients(modal.productId, selectedIngredientIds);
    } catch (syncError) {
      if (import.meta.env.DEV) console.error("[products] edit sync ingredients", syncError);
      pushToast("error", "No se pudieron actualizar los ingredientes.");
      setSubmittingModal(false);
      return;
    }

    pushToast("success", "Producto actualizado.");
    await loadAll();
    setSubmittingModal(false);
    closeModal();
  };

  const toggleActive = async (row: ProductRow) => {
    if (!canManage || isBusy) return;
    const previous = row.is_active;
    const next = !previous;
    setSavingProductId(row.id);
    setProducts((prev) => prev.map((item) => (item.id === row.id ? { ...item, is_active: next } : item)));

    const { error: toggleError } = await supabase
      .from("products")
      .update({ is_active: next })
      .eq("restaurant_id", restaurantId)
      .eq("id", row.id);

    if (toggleError) {
      setProducts((prev) =>
        prev.map((item) => (item.id === row.id ? { ...item, is_active: previous } : item))
      );
      pushToast("error", toggleError.message || "No se pudo actualizar estado.");
      setSavingProductId(null);
      return;
    }

    pushToast("success", next ? "Producto visible." : "Producto oculto.");
    setSavingProductId(null);
  };

  const deleteProduct = async (row: ProductRow) => {
    if (!canManage || isBusy) return;
    if (!window.confirm(`Eliminar producto "${row.name}"?`)) return;

    setSavingProductId(row.id);
    const previous = products;
    setProducts((prev) => prev.filter((item) => item.id !== row.id));

    const { error: deleteError } = await supabase
      .from("products")
      .delete()
      .eq("restaurant_id", restaurantId)
      .eq("id", row.id);

    if (deleteError) {
      setProducts(previous);
      pushToast("error", deleteError.message || "No se pudo eliminar producto.");
      setSavingProductId(null);
      return;
    }

    pushToast("success", "Producto eliminado.");
    setSavingProductId(null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    if (!canManage || isBusy || !selectedCategoryId) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const fromIndex = productsInSelectedCategory.findIndex((product) => product.id === String(active.id));
    const toIndex = productsInSelectedCategory.findIndex((product) => product.id === String(over.id));
    if (fromIndex < 0 || toIndex < 0) return;

    const reorderedCategoryProducts = arrayMove(productsInSelectedCategory, fromIndex, toIndex).map(
      (product, index) => ({ ...product, sort_order: index })
    );

    const previousProducts = products;
    const reorderedById = new Map(reorderedCategoryProducts.map((product) => [product.id, product]));
    setProducts((prev) =>
      prev.map((product) => reorderedById.get(product.id) ?? product)
    );

    setReordering(true);

    const orderedIds = reorderedCategoryProducts.map((product) => product.id);
    const { error: reorderError } = await supabase.rpc("admin_reorder_products", {
      p_restaurant_id: restaurantId,
      p_category_id: selectedCategoryId,
      p_product_ids: orderedIds,
    });

    if (reorderError) {
      setProducts(previousProducts);
      pushToast("error", reorderError.message || "No se pudo reordenar productos.");
      setReordering(false);
      return;
    }

    pushToast("success", "Orden de productos actualizado.");
    await loadAll();
    setReordering(false);
  };

  const priceWarn = useMemo(() => {
    if (!modal) return null;
    const p = Number(draft.price);
    return Number.isFinite(p) && p === 0 ? "Este producto tendrá precio 0 (será gratuito)." : null;
  }, [modal, draft.price]);

  const handleNavigateCategories = useCallback(() => {
    if (import.meta.env.DEV) {
      console.warn("[AI_DEBUG] navigate categories from AdminProductsPage empty-state action", {
        to: `${adminPath}/categories`,
      });
    }
    navigate(`${adminPath}/categories`);
  }, [adminPath, navigate]);

  const previewSrc = localImageUrl || draft.image_url || null;

  return (
    <section style={{ display: "grid", gap: 18, width: "100%" }}>
      {showTour && (
        <FeatureTour
          tourKey="products"
          steps={[
            {
              target: '[data-tour="new-product"]',
              title: "Crea tu primer producto",
              content: "Haz clic aquí para añadir un producto a tu carta. Necesitarás nombre, precio y categoría.",
            },
            {
              target: '[data-tour="category-filter"]',
              title: "Organiza por categorías",
              content: "Crea categorías como 'Principales', 'Bebidas' o 'Postres' para organizar tu carta.",
            },
            {
              target: '[data-tour="product-list"]',
              title: "Gestiona tus productos",
              content: "Desde aquí puedes editar, activar/desactivar o eliminar cualquier producto.",
            },
          ]}
          onComplete={() => setShowTour(false)}
        />
      )}
      <header
        style={{
          display: "grid",
          gap: 14,
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: 18,
          background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
          boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: "clamp(1.3rem, 2vw, 1.65rem)", lineHeight: 1.2, color: "#0f172a" }}>
              Productos
            </h2>
            <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 14, lineHeight: 1.4 }}>
              Gestiona menu por categoria
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={products.length === 0}
              style={{
                borderRadius: 10,
                border: "1px solid #e2e8f0",
                background: "#f8fafc",
                color: "#374151",
                padding: "8px 12px",
                fontSize: 13,
                fontWeight: 600,
                cursor: products.length === 0 ? "not-allowed" : "pointer",
                opacity: products.length === 0 ? 0.5 : 1,
              }}
            >
              ↓ Exportar CSV
            </button>
            <button
              type="button"
              onClick={() => { setImportParsed([]); setImportProgress(null); setShowImportModal(true); }}
              disabled={!canManage}
              style={{
                borderRadius: 10,
                border: "1px solid #e2e8f0",
                background: "#f8fafc",
                color: "#374151",
                padding: "8px 12px",
                fontSize: 13,
                fontWeight: 600,
                cursor: !canManage ? "not-allowed" : "pointer",
                opacity: !canManage ? 0.5 : 1,
              }}
            >
              ↑ Importar CSV
            </button>
            <button
              type="button"
              data-tour="new-product"
              onClick={openCreateModal}
              disabled={!canManage || isBusy}
              style={{
                borderRadius: 12,
                border: "1px solid #0f172a",
                background: "#0f172a",
                color: "#ffffff",
                padding: "10px 14px",
                fontSize: 14,
                fontWeight: 600,
                cursor: !canManage || isBusy ? "not-allowed" : "pointer",
                opacity: !canManage || isBusy ? 0.6 : 1,
                boxShadow: "0 8px 20px rgba(15, 23, 42, 0.18)",
              }}
            >
              + Producto
            </button>
            <button
              type="button"
              onClick={() => setShowTour(true)}
              style={{ background: "none", border: "none", color: "var(--brand-hover, #2e8b57)", cursor: "pointer", fontSize: 12, fontWeight: 600, textDecoration: "underline" }}
            >
              ¿Cómo funciona?
            </button>
          </div>
        </div>
      </header>

      <section
        style={{
          display: "grid",
          gap: 14,
          border: "1px solid #e2e8f0",
          borderRadius: 14,
          padding: 14,
          background: "#ffffff",
          boxShadow: "0 1px 2px rgba(15, 23, 42, 0.05)",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          alignItems: "end",
        }}
      >
        <div style={{ position: "relative", width: "100%" }}>
          <label
            htmlFor="products-search"
            style={{ display: "block", marginBottom: 6, color: "#334155", fontSize: 13, fontWeight: 600 }}
          >
            Buscar producto
          </label>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            style={{
              width: 16,
              height: 16,
              position: "absolute",
              left: 14,
              bottom: 12,
              color: "#64748b",
              pointerEvents: "none",
            }}
          >
            <path
              d="M11 4a7 7 0 1 0 4.4 12.4l4.1 4.1a1 1 0 0 0 1.4-1.4l-4.1-4.1A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z"
              fill="currentColor"
            />
          </svg>
          <input
            id="products-search"
            type="search"
            placeholder="Buscar productos por nombre (todas las categorias)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            style={{
              border: searchFocused ? "1px solid #0f172a" : "1px solid #cbd5e1",
              borderRadius: 12,
              padding: "10px 14px 10px 40px",
              fontSize: 14,
              width: "100%",
              boxSizing: "border-box",
              background: "#ffffff",
              boxShadow: searchFocused
                ? "0 0 0 3px rgba(15, 23, 42, 0.14)"
                : "0 1px 2px rgba(15, 23, 42, 0.06)",
              color: "#0f172a",
              outline: "none",
              minHeight: 42,
            }}
          />
        </div>

        <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
          <label htmlFor="products-category" style={{ color: "#334155", fontSize: 13, fontWeight: 600 }}>
            Categoria
          </label>
          <select
            id="products-category"
            data-tour="category-filter"
            value={selectedCategoryId}
            onChange={(event) => setSelectedCategoryId(event.target.value)}
            onFocus={() => setCategoryFocused(true)}
            onBlur={() => setCategoryFocused(false)}
            disabled={searchResults !== null}
            style={{
              borderRadius: 12,
              border: categoryFocused ? "1px solid #0f172a" : "1px solid #cbd5e1",
              padding: "10px 12px",
              width: "100%",
              minHeight: 42,
              maxWidth: 380,
              background: "#ffffff",
              color: "#0f172a",
              boxShadow: categoryFocused
                ? "0 0 0 3px rgba(15, 23, 42, 0.14)"
                : "0 1px 2px rgba(15, 23, 42, 0.06)",
              opacity: searchResults !== null ? 0.55 : 1,
              outline: "none",
            }}
          >
            <option value="">Todas las categorías</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      {error ? (
        <div className="admin-error-banner" role="alert">
          <span>No se pudieron cargar los productos. Inténtalo de nuevo.</span>
          <button
            type="button"
            className="admin-btn-secondary"
            style={{ padding: "6px 12px", fontSize: 13 }}
            onClick={() => void loadAll()}
          >
            Reintentar
          </button>
        </div>
      ) : null}

      {loading ? (
        <CardSkeleton count={3} />
      ) : null}

      {/* Search results mode */}
      {!loading && searchResults !== null ? (
        searchResults.length === 0 ? (
          <div className="admin-card">
            <AdminEmptyState
              icon=""
              title="Sin resultados"
              description={`No se encontraron productos con "${searchQuery}".`}
              actionLabel="Limpiar búsqueda"
              onAction={() => setSearchQuery("")}
            />
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: 12,
              border: "1px solid #e2e8f0",
              borderRadius: 14,
              padding: 14,
              background: "#ffffff",
              boxShadow: "0 1px 2px rgba(15, 23, 42, 0.05)",
            }}
          >
            <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
              {searchResults.length} resultado{searchResults.length !== 1 ? "s" : ""} para "{searchQuery}"
            </p>
            {searchResults.map((product) => {
              const catName = categoryMap.get(product.category_id ?? "");
              return (
                <div key={product.id}>
                  {catName ? (
                    <p style={{ margin: "0 0 5px", fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      {catName}
                    </p>
                  ) : null}
                  <SortableProductCard
                    row={product}
                    disabled={!canManage || isBusy}
                    isSaving={savingProductId === product.id}
                    adminPath={adminPath}
                    onEdit={(row) => { void openEditModal(row); }}
                    onDelete={(row) => void deleteProduct(row)}
                    onToggle={(row) => void toggleActive(row)}
                    onManageModifiers={(row) => navigate(`${adminPath}/products/${row.id}/modifiers`)}
                  />
                </div>
              );
            })}
          </div>
        )
      ) : null}

      {/* Category view mode (no search) */}
      {!loading && searchResults === null && categories.length === 0 ? (
        <div className="admin-card" style={{ minHeight: 280, display: "grid", alignItems: "center" }}>
          <AdminEmptyState
            icon=""
            title="Tu carta está vacía"
            description="Crea primero una categoría (como 'Principales', 'Bebidas' o 'Postres') y luego añade tus productos."
            actionLabel="Ir a Categorías"
            onAction={handleNavigateCategories}
          />
        </div>
      ) : null}

      {!loading && searchResults === null && categories.length > 0 && selectedCategoryId && productsInSelectedCategory.length === 0  ? (
        <div className="admin-card" style={{ minHeight: 280, display: "grid", alignItems: "center" }}>
          <AdminEmptyState
            icon=""
            title="Aún no tienes productos"
            description="Tu carta está vacía. Crea tu primer producto para que los clientes puedan hacer pedidos."
            actionLabel="+ Crear primer producto"
            onAction={openCreateModal}
          />
        </div>
      ) : null}

      {/* All-categories grouped view */}
      {!loading && searchResults === null && !selectedCategoryId && productsByCategory && productsByCategory.length > 0 ? (
        <div style={{ display: "grid", gap: 20 }}>
          {productsByCategory.map(({ category, items }) => (
            <div key={category.id}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 16px",
                  background: "#f1f5f9",
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  marginBottom: 10,
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 14, color: "#374151" }}>{category.name}</span>
                <span
                  style={{
                    fontSize: 12,
                    color: "#6b7280",
                    background: "#e5e7eb",
                    borderRadius: 999,
                    padding: "2px 10px",
                    fontWeight: 600,
                  }}
                >
                  {items.length} producto{items.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                {items.map((product) => (
                  <SortableProductCard
                    key={product.id}
                    row={product}
                    disabled={!canManage || isBusy}
                    isSaving={savingProductId === product.id}
                    adminPath={adminPath}
                    onEdit={(row) => { void openEditModal(row); }}
                    onDelete={(row) => void deleteProduct(row)}
                    onToggle={(row) => void toggleActive(row)}
                    onManageModifiers={(row) => navigate(`${adminPath}/products/${row.id}/modifiers`)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Single-category DnD view */}
      {!loading && searchResults === null && selectedCategoryId && productsInSelectedCategory.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={productIds} strategy={verticalListSortingStrategy}>
            <div
              data-tour="product-list"
              style={{
                display: "grid",
                gap: 12,
                border: "1px solid #e2e8f0",
                borderRadius: 14,
                padding: 14,
                background: "#ffffff",
                boxShadow: "0 1px 2px rgba(15, 23, 42, 0.05)",
              }}
            >
              {productsInSelectedCategory.map((product) => (
                <SortableProductCard
                  key={product.id}
                  row={product}
                  disabled={!canManage || isBusy}
                  isSaving={savingProductId === product.id}
                  adminPath={adminPath}
                  onEdit={(row) => { void openEditModal(row); }}
                  onDelete={(row) => void deleteProduct(row)}
                  onToggle={(row) => void toggleActive(row)}
                  onManageModifiers={(row) => navigate(`${adminPath}/products/${row.id}/modifiers`)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
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
            zIndex: 1600,
          }}
        >
          <div
            className="ui-modal-panel"
            data-state={animatedModal.visible ? "open" : "closed"}
            role="dialog"
            aria-modal="true"
            aria-label={animatedModal.displayValue.mode === "create" ? "Crear producto" : "Editar producto"}
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(620px, calc(100vw - 32px))",
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              background: "#fff",
              padding: 16,
              display: "grid",
              gap: 12,
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <h3 style={{ margin: 0 }}>{animatedModal.displayValue.mode === "create" ? "Nuevo producto" : "Editar producto"}</h3>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#374151" }}>Nombre *</span>
              <input
                value={draft.name}
                onChange={(event) => updateDraft("name", event.target.value)}
                disabled={submittingModal}
                autoFocus
                style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "9px 10px" }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#374151", display: "inline-flex", alignItems: "center" }}>
                Precio * <HelpTooltip text="El precio que verán los clientes. Ej: 8.50" />
              </span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={draft.price}
                onChange={(event) => updateDraft("price", event.target.value)}
                disabled={submittingModal}
                style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "9px 10px" }}
              />
              {priceWarn ? (
                <div style={{ border: "1px solid #fde68a", background: "#fffbeb", color: "#92400e", borderRadius: 8, padding: "6px 10px", fontSize: 12 }}>
                   {priceWarn}
                </div>
              ) : null}
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#374151" }}>Descripcion</span>
              <textarea
                value={draft.description}
                onChange={(event) => updateDraft("description", event.target.value)}
                disabled={submittingModal}
                rows={3}
                style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "9px 10px", resize: "vertical" }}
              />
            </label>

            <div style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#374151", display: "inline-flex", alignItems: "center" }}>
                Control de stock <HelpTooltip text="Activa esto para que el sistema descuente unidades automáticamente" />
              </span>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={draft.track_stock}
                  disabled={submittingModal}
                  onChange={(e) => updateDraft("track_stock", e.target.checked)}
                />
                <span style={{ fontSize: 13, color: "#374151" }}>Controlar stock de este producto</span>
              </label>
              {draft.track_stock && (
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>Unidades disponibles</span>
                  <input
                    type="number"
                    min={0}
                    value={draft.stock_quantity}
                    onChange={(e) => updateDraft("stock_quantity", e.target.value)}
                    disabled={submittingModal}
                    style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "9px 10px", width: 120 }}
                  />
                </label>
              )}
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#374151", display: "inline-flex", alignItems: "center" }}>
                Upsell en checkout <HelpTooltip text="Si activas esto, este producto aparece en el modal de upsell justo antes de confirmar el pedido (máx. 3 productos)" />
              </span>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={draft.is_upsell}
                  disabled={submittingModal}
                  onChange={(e) => updateDraft("is_upsell", e.target.checked)}
                />
                <span style={{ fontSize: 13, color: "#374151" }}>Sugerir este producto en el checkout</span>
              </label>
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#374151" }}>Imagen</span>
              {previewSrc ? (
                <img
                  src={previewSrc}
                  alt="Vista previa"
                  style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e7eb" }}
                />
              ) : null}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleImageFileChange}
                disabled={submittingModal}
                style={{ fontSize: 13 }}
              />
              {imageError ? (
                <div style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#991b1b", borderRadius: 8, padding: "6px 10px", fontSize: 12 }}>
                  {imageError}
                </div>
              ) : null}
              <input
                value={draft.image_url}
                onChange={(event) => updateDraft("image_url", event.target.value)}
                disabled={submittingModal}
                placeholder="https://... (o sube un archivo arriba)"
                style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "9px 10px" }}
              />
            </div>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#374151", display: "inline-flex", alignItems: "center" }}>
                Categoria <HelpTooltip text="Agrupa tus productos para que sean fáciles de encontrar" />
              </span>
              <select
                value={draft.category_id}
                onChange={(event) => updateDraft("category_id", event.target.value)}
                disabled={submittingModal}
                style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "9px 10px" }}
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>

            <section style={{ display: "grid", gap: 8 }}>
              <span style={{ fontSize: 13, color: "#374151" }}>Modificadores</span>
              {modifierGroups.length === 0 ? (
                <div style={{ color: "#6b7280", fontSize: 13 }}>No hay grupos activos.</div>
              ) : (
                <div
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: 10,
                    display: "grid",
                    gap: 6,
                    maxHeight: 180,
                    overflowY: "auto",
                  }}
                >
                  {modifierGroups.map((group) => (
                    <label
                      key={group.id}
                      style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#374151" }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedModifierGroupIds.includes(group.id)}
                        disabled={submittingModal}
                        onChange={() => toggleModifierSelection(group.id)}
                      />
                      <span>{group.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </section>

            <section style={{ display: "grid", gap: 8 }}>
              <span style={{ fontSize: 13, color: "#374151" }}>Ingredientes</span>
              {restaurantIngredients.length === 0 ? (
                <div style={{ color: "#6b7280", fontSize: 13 }}>
                  No hay ingredientes. Créalos en{" "}
                  <span style={{ color: "var(--brand-primary)", fontWeight: 600 }}>Menú → Ingredientes</span>.
                </div>
              ) : (
                <div
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: 10,
                    display: "grid",
                    gap: 6,
                    maxHeight: 180,
                    overflowY: "auto",
                  }}
                >
                  {restaurantIngredients.map((ingredient) => (
                    <label
                      key={ingredient.id}
                      style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#374151" }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIngredientIds.includes(ingredient.id)}
                        disabled={submittingModal}
                        onChange={() => toggleIngredientSelection(ingredient.id)}
                      />
                      <span style={{ flex: 1 }}>{ingredient.name}</span>
                      {!ingredient.is_available && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: "#ef4444",
                            background: "#fef2f2",
                            border: "1px solid #fecaca",
                            borderRadius: 4,
                            padding: "1px 4px",
                          }}
                        >
                          AGOTADO
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </section>

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
                  fontSize: 14,
                  fontWeight: 600,
                  padding: "8px 16px",
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

      {/* ── Import CSV Modal ───────────────────────────────────────────── */}
      {showImportModal && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 1800,
            background: "rgba(0,0,0,0.45)", display: "flex",
            alignItems: "center", justifyContent: "center", padding: 16,
          }}
          onClick={(e) => { if (e.target === e.currentTarget && !importProgress) setShowImportModal(false); }}
        >
          <div
            style={{
              background: "#fff", borderRadius: 16, padding: 24,
              width: "100%", maxWidth: 560, maxHeight: "85vh",
              overflow: "auto", display: "grid", gap: 16,
              boxShadow: "0 20px 48px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Importar productos (CSV)</h3>
              {!importProgress && (
                <button type="button" onClick={() => setShowImportModal(false)}
                  style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6b7280" }}>×</button>
              )}
            </div>

            <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
              El CSV debe usar <strong>;</strong> como separador. Columnas: <code>name;description;price;category;is_active;is_upsell;image_url</code>.
              Se hace upsert por <strong>name + restaurante</strong>. Las imágenes no se importan.
            </div>

            {!importProgress && (
              <div>
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) { handleParseImportFile(file); }
                  }}
                  style={{ fontSize: 13 }}
                />
              </div>
            )}

            {importProgress && (
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>
                  Importando… {importProgress.done}/{importProgress.total}
                </div>
                <div style={{ height: 8, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 4, background: "#4ec580",
                    width: `${(importProgress.done / importProgress.total) * 100}%`,
                    transition: "width 0.2s ease",
                  }} />
                </div>
              </div>
            )}

            {!importProgress && importParsed.length > 0 && (() => {
              const valid = importParsed.filter((r) => r.errors.length === 0);
              const invalid = importParsed.filter((r) => r.errors.length > 0);
              const preview = valid.slice(0, 5);
              return (
                <div style={{ display: "grid", gap: 12 }}>
                  <div style={{ fontSize: 13, color: "#374151" }}>
                    <strong>{valid.length}</strong> productos válidos · <strong style={{ color: invalid.length > 0 ? "#991b1b" : undefined }}>{invalid.length}</strong> con errores
                  </div>

                  {preview.length > 0 && (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", marginBottom: 6 }}>
                        Vista previa ({preview.length > 5 ? "primeros 5" : preview.length})
                      </div>
                      <div style={{ display: "grid", gap: 6 }}>
                        {preview.map((r) => (
                          <div key={r.rowIndex} style={{
                            border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px",
                            fontSize: 13, display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap",
                          }}>
                            <span style={{ fontWeight: 600, color: "#0f172a" }}>{r.name}</span>
                            <span style={{ color: "#64748b" }}>{r.categoryName}</span>
                            <span style={{ fontWeight: 600 }}>{r.price.toFixed(2)} €</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {invalid.length > 0 && (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#991b1b", textTransform: "uppercase", marginBottom: 6 }}>
                        Errores ({invalid.length} fila{invalid.length !== 1 ? "s" : ""} — se omitirán)
                      </div>
                      <div style={{ display: "grid", gap: 4, maxHeight: 160, overflow: "auto" }}>
                        {invalid.map((r) => (
                          <div key={r.rowIndex} style={{
                            border: "1px solid #fecaca", background: "#fef2f2",
                            borderRadius: 6, padding: "6px 10px", fontSize: 12,
                          }}>
                            <span style={{ fontWeight: 700 }}>Fila {r.rowIndex}:</span>{" "}
                            {r.errors.join(" · ")}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {valid.length > 0 && (
                    <button
                      type="button"
                      onClick={() => void handleConfirmImport()}
                      style={{
                        background: "#0f172a", color: "#fff", border: "none",
                        borderRadius: 10, padding: "10px 16px", fontSize: 14,
                        fontWeight: 700, cursor: "pointer", alignSelf: "start",
                      }}
                    >
                      Confirmar importación ({valid.length} producto{valid.length !== 1 ? "s" : ""})
                    </button>
                  )}
                </div>
              );
            })()}

            {!importProgress && importParsed.length === 0 && (
              <div style={{ fontSize: 13, color: "#9ca3af", textAlign: "center", padding: "12px 0" }}>
                Selecciona un archivo CSV para ver la vista previa.
              </div>
            )}
          </div>
        </div>
      )}

      <div
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          display: "grid",
          gap: 8,
          zIndex: 1700,
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
