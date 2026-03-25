import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ProductModifiersModal from "./components/ProductModifiersModal";
import CheckoutPage from "./features/checkout/ui/CheckoutPage";
import type { CartItem } from "./features/checkout/types";
import { supabase } from "./lib/supabase";
import { useRestaurant } from "./restaurant/RestaurantContext";
import { useAnimatedPresence } from "./hooks/useAnimatedPresence";
import { RestaurantHead } from "./components/RestaurantHead";

type Category = {
  id: string;
  name: string;
  sort_order: number;
};

type Product = {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  sort_order: number;
  is_upsell: boolean;
};

type ModifierGroupRow = {
  id: string;
  modifier_group_id: string;
  modifier_groups:
    | {
        id: string;
        name: string | null;
        min_select: number | null;
        max_select: number | null;
        is_active: boolean | null;
      }
    | {
        id: string;
        name: string | null;
        min_select: number | null;
        max_select: number | null;
        is_active: boolean | null;
      }[]
    | null;
};

type ModifierOptionRow = {
  id: string;
  group_id: string;
  name: string | null;
  price: number | null;
  is_active: boolean | null;
  position: number | null;
};

type ProductModifierGroup = {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  options: {
    id: string;
    name: string;
    price: number;
  }[];
};

type ActiveModifierGroup = {
  id: string;
  name: string | null;
  min_select: number | null;
  max_select: number | null;
  is_active: boolean | null;
};

type AddToCartPayload = {
  productId: string;
  productName: string;
  basePrice: number;
  extraPrice: number;
  finalUnitPrice: number;
  extras?: CartItem["extras"];
  selectedModifiers?: NonNullable<CartItem["selectedModifiers"]>;
};

type RestaurantHourRow = {
  day_of_week: number;
  is_open: boolean;
  open_time: string | null;
  close_time: string | null;
};

type WebSettingsRow = {
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  button_color: string | null;
  header_title: string | null;
  header_subtitle: string | null;
  helper_text: string | null;
  banner_url: string | null;
  banner_title: string | null;
  banner_subtitle: string | null;
  chip_1: string | null;
  chip_2: string | null;
  chip_3: string | null;
  add_button_text: string | null;
  add_button_variant: string | null;
};

function formatEUR(n: number) {
  const value = Number(n) || 0;
  return `${value.toFixed(2)} EUR`;
}

function buildCartKey(
  productId: string,
  extras: CartItem["extras"],
  selectedModifiers?: NonNullable<CartItem["selectedModifiers"]>
) {
  const extrasKey = (extras ?? [])
    .map((extra) => extra.ingredientId)
    .filter(Boolean)
    .sort()
    .join("|");

  const modifiersKey = (selectedModifiers ?? [])
    .map((group) => {
      const optionIds = group.options.map((option) => option.optionId).sort().join(",");
      return `${group.groupId}:${optionIds}`;
    })
    .sort()
    .join("|");

  return `${productId}__${extrasKey}__${modifiersKey}`;
}

function toTimeMinutes(value: string | null | undefined): number | null {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{2}):(\d{2})/);
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function toHourText(value: string | null | undefined): string | null {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{2}):(\d{2})/);
  if (!match) return null;
  return `${match[1]}:${match[2]}`;
}

function getIsOpenNow(rows: RestaurantHourRow[]): boolean | null {
  if (rows.length === 0) return null;
  const now = new Date();
  const day = now.getDay();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const todayRows = rows.filter((row) => row.day_of_week === day && row.is_open);
  if (todayRows.length === 0) return false;

  for (const row of todayRows) {
    const open = toTimeMinutes(row.open_time);
    const close = toTimeMinutes(row.close_time);
    if (open === null || close === null) continue;
    if (open <= close) {
      if (nowMinutes >= open && nowMinutes < close) return true;
    } else if (nowMinutes >= open || nowMinutes < close) {
      return true;
    }
  }

  return false;
}

function getNextOpeningText(rows: RestaurantHourRow[]): string | null {
  if (rows.length === 0) return null;
  const now = new Date();
  const nowDay = now.getDay();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  for (let offset = 0; offset < 8; offset += 1) {
    const day = (nowDay + offset) % 7;
    const dayRows = rows.filter((row) => row.day_of_week === day && row.is_open);
    if (dayRows.length === 0) continue;

    const slots = dayRows
      .map((row) => ({ minutes: toTimeMinutes(row.open_time), text: toHourText(row.open_time) }))
      .filter((entry): entry is { minutes: number; text: string } => entry.minutes !== null && Boolean(entry.text))
      .sort((a, b) => a.minutes - b.minutes);

    if (slots.length === 0) continue;

    if (offset === 0) {
      const laterToday = slots.find((slot) => slot.minutes > nowMinutes);
      if (laterToday) return `Proxima apertura hoy a las ${laterToday.text}.`;
      continue;
    }

    const dayLabel = new Intl.DateTimeFormat("es-ES", { weekday: "long" }).format(
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset)
    );
    return `Proxima apertura: ${dayLabel} ${slots[0].text}.`;
  }

  return null;
}

export default function App() {
  const { restaurantId, name: restaurantName, slug } = useRestaurant();
  const [categories, setCategories] = useState<Category[]>([]);
  const [productsByCat, setProductsByCat] = useState<Record<string, Product[]>>(
    {}
  );
  const [error, setError] = useState<string | null>(null);

  const [modifiersOpen, setModifiersOpen] = useState(false);
  const [modifierGroups, setModifierGroups] = useState<ProductModifierGroup[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<{
    id: string;
    name: string;
    price: number;
  } | null>(null);
  const [modifiersLoading, setModifiersLoading] = useState(false);
  const [modifiersError, setModifiersError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const cartDrawerPresence = useAnimatedPresence(cartOpen, 220);
  const [isCartButtonHovered, setIsCartButtonHovered] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [recentlyAddedProductId, setRecentlyAddedProductId] = useState<string | null>(null);
  const [cartPulse, setCartPulse] = useState(false);

  const [orderOkMsg, setOrderOkMsg] = useState<string | null>(null);
  const [orderErrMsg, setOrderErrMsg] = useState<string | null>(null);
  const [isRestaurantClosed, setIsRestaurantClosed] = useState(false);

  // SEO meta data from restaurants table
  const [seoData, setSeoData] = useState<{
    metaTitle: string | null;
    metaDescription: string | null;
    ogImage: string | null;
    cuisineType: string | null;
    customDomain: string | null;
    customDomainVerified: boolean;
  }>({ metaTitle: null, metaDescription: null, ogImage: null, cuisineType: null, customDomain: null, customDomainVerified: false });
  const [nextOpeningText, setNextOpeningText] = useState<string | null>(null);
  const [contactPhone, setContactPhone] = useState<string | null>(null);
  const [restaurantLogoUrl, setRestaurantLogoUrl] = useState<string | null>(null);
  const [estimatedDeliveryMinutes, setEstimatedDeliveryMinutes] = useState<number | null>(null);
  const [webSettings, setWebSettings] = useState<WebSettingsRow | null>(null);

  const cartCount = useMemo(
    () => cart.reduce((sum, item) => sum + (Number(item.qty) || 0), 0),
    [cart]
  );

  const cartTotal = useMemo(
    () =>
      cart.reduce(
        (sum, item) =>
          sum + (Number(item.qty) || 0) * (Number(item.unitPrice) || 0),
        0
      ),
    [cart]
  );

  // Upsell products: is_upsell = true, max 3, filtered later by CheckoutPage to exclude cart items
  const upsellProducts = useMemo(() => {
    const all = Object.values(productsByCat).flat();
    return all.filter((p) => p.is_upsell).slice(0, 3);
  }, [productsByCat]);

  const handleAddUpsellProduct = (productId: string, name: string, price: number) => {
    addToCart({
      productId,
      productName: name,
      basePrice: price,
      extraPrice: 0,
      finalUnitPrice: price,
      extras: [],
      selectedModifiers: [],
    });
  };

  // Debounce del buscador
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const filteredProductsByCat = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return productsByCat;
    const result: Record<string, Product[]> = {};
    for (const [catId, products] of Object.entries(productsByCat)) {
      const filtered = products.filter((p) =>
        p.name.toLowerCase().includes(q)
      );
      if (filtered.length > 0) result[catId] = filtered;
    }
    return result;
  }, [productsByCat, debouncedQuery]);

  const searchHasResults =
    !debouncedQuery.trim() ||
    Object.keys(filteredProductsByCat).length > 0;

  const [menuUpdated, setMenuUpdated] = useState(false);
  const menuUpdatedTimerRef = useRef<number | null>(null);

  // ── Menu data fetch — never touches cart or other UI state ──────────────────
  const loadMenu = useCallback(async () => {
    const [catRes, prodRes] = await Promise.all([
      supabase
        .from("categories")
        .select("id,name,sort_order")
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("products")
        .select("id,category_id,name,description,price,image_url,sort_order,is_upsell")
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
    ]);

    if (catRes.error) { setError(catRes.error.message); return; }
    if (prodRes.error) { setError(prodRes.error.message); return; }

    setCategories((catRes.data ?? []) as Category[]);

    const grouped: Record<string, Product[]> = {};
    for (const product of (prodRes.data ?? []) as Product[]) {
      if (!product.category_id) continue;
      if (!grouped[product.category_id]) grouped[product.category_id] = [];
      grouped[product.category_id].push(product);
    }
    setProductsByCat(grouped);
  }, [restaurantId]);

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    setError(null);
    void loadMenu().catch((err) => {
      if (alive) setError(err instanceof Error ? err.message : "Error cargando menú");
    });
    return () => { alive = false; };
  }, [loadMenu]);

  // ── Realtime subscription: reload menu on any menu-table change ─────────────
  useEffect(() => {
    if (!restaurantId) return;
    let debounceTimer: number | null = null;

    const triggerReload = () => {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(async () => {
        await loadMenu();
        setMenuUpdated(true);
        if (menuUpdatedTimerRef.current !== null) clearTimeout(menuUpdatedTimerRef.current);
        menuUpdatedTimerRef.current = window.setTimeout(() => setMenuUpdated(false), 3000);
      }, 400);
    };

    const channel = supabase
      .channel(`sf-menu-${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "products",                filter: `restaurant_id=eq.${restaurantId}` }, triggerReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "categories",              filter: `restaurant_id=eq.${restaurantId}` }, triggerReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "modifier_groups",         filter: `restaurant_id=eq.${restaurantId}` }, triggerReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "modifier_options",        filter: `restaurant_id=eq.${restaurantId}` }, triggerReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "product_modifier_groups", filter: `restaurant_id=eq.${restaurantId}` }, triggerReload)
      .subscribe();

    return () => {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      if (menuUpdatedTimerRef.current !== null) clearTimeout(menuUpdatedTimerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [restaurantId, loadMenu]);

  useEffect(() => {
    let alive = true;

    const loadAvailability = async () => {
      const [hoursResult, settingsResult, webSettingsResult, restaurantSeoResult] = await Promise.all([
        supabase
          .from("restaurant_hours")
          .select("day_of_week,is_open,open_time,close_time")
          .eq("restaurant_id", restaurantId),
        supabase
          .from("restaurant_settings")
          .select("business_phone,logo_url,estimated_delivery_minutes,cuisine_type")
          .eq("restaurant_id", restaurantId)
          .limit(1)
          .maybeSingle(),
        supabase
          .from("restaurant_web_settings")
          .select("logo_url,primary_color,secondary_color,button_color,header_title,header_subtitle,helper_text,banner_url,banner_title,banner_subtitle,chip_1,chip_2,chip_3,add_button_text,add_button_variant")
          .eq("restaurant_id", restaurantId)
          .maybeSingle(),
        supabase
          .from("restaurants")
          .select("meta_title,meta_description,og_image_url,custom_domain,custom_domain_verified")
          .eq("id", restaurantId)
          .maybeSingle(),
      ]);

      if (!alive) return;

      const phone = String((settingsResult.data as { business_phone?: unknown } | null)?.business_phone ?? "").trim();
      const logo = String((settingsResult.data as { logo_url?: unknown } | null)?.logo_url ?? "").trim();
      const estimated = Number(
        (settingsResult.data as { estimated_delivery_minutes?: unknown } | null)?.estimated_delivery_minutes
      );
      setContactPhone(phone || null);
      setRestaurantLogoUrl(logo || null);
      setEstimatedDeliveryMinutes(Number.isFinite(estimated) && estimated > 0 ? estimated : null);
      setWebSettings((webSettingsResult.data as WebSettingsRow | null) ?? null);

      // SEO data from restaurants table
      type SeoRow = { meta_title?: string | null; meta_description?: string | null; og_image_url?: string | null; custom_domain?: string | null; custom_domain_verified?: boolean | null };
      type SettingsSeoRow = { cuisine_type?: string | null };
      const seoRow = restaurantSeoResult.data as SeoRow | null;
      const settingsSeoRow = settingsResult.data as SettingsSeoRow | null;
      setSeoData({
        metaTitle: seoRow?.meta_title ?? null,
        metaDescription: seoRow?.meta_description ?? null,
        ogImage: seoRow?.og_image_url ?? null,
        cuisineType: settingsSeoRow?.cuisine_type ?? null,
        customDomain: seoRow?.custom_domain ?? null,
        customDomainVerified: seoRow?.custom_domain_verified ?? false,
      });

      if (hoursResult.error || !Array.isArray(hoursResult.data)) {
        setIsRestaurantClosed(false);
        setNextOpeningText(null);
        return;
      }

      const rows = (hoursResult.data as RestaurantHourRow[]).filter(
        (row) => row.day_of_week >= 0 && row.day_of_week <= 6
      );
      const openNow = getIsOpenNow(rows);
      if (openNow === null) {
        setIsRestaurantClosed(false);
        setNextOpeningText(null);
        return;
      }

      const closed = !openNow;
      setIsRestaurantClosed(closed);
      setNextOpeningText(closed ? getNextOpeningText(rows) : null);
    };

    void loadAvailability();
    return () => {
      alive = false;
    };
  }, [restaurantId]);

  const addToCart = (payload: AddToCartPayload) => {
    if (!payload?.productId) {
      return;
    }

    setCart((previous) => {
      const key = buildCartKey(
        payload.productId,
        payload.extras ?? [],
        payload.selectedModifiers ?? []
      );
      const index = previous.findIndex((item) => item.id === key);

      if (index >= 0) {
        const next = [...previous];
        next[index] = { ...next[index], qty: next[index].qty + 1 };
        return next;
      }

      const newItem: CartItem = {
        id: key,
        productId: payload.productId,
        name: payload.productName ?? "Producto",
        qty: 1,
        basePrice: Number(payload.basePrice) || 0,
        unitPrice: Number(payload.finalUnitPrice) || 0,
        extras: payload.extras ?? [],
        extraPrice: Number(payload.extraPrice) || 0,
        selectedModifiers: payload.selectedModifiers ?? [],
      };

      return [...previous, newItem];
    });

    setModifiersOpen(false);
    setSelectedProduct(null);
    setModifierGroups([]);

    setCartOpen(true);
    setCartPulse(true);
    setRecentlyAddedProductId(payload.productId);

    setOrderOkMsg(null);
    setOrderErrMsg(null);
  };

  useEffect(() => {
    if (!categories.length) {
      setActiveCategoryId(null);
      return;
    }
    setActiveCategoryId((current) => current ?? categories[0].id);
  }, [categories]);

  useEffect(() => {
    if (!recentlyAddedProductId) {
      return;
    }
    const timer = window.setTimeout(() => {
      setRecentlyAddedProductId(null);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [recentlyAddedProductId]);

  useEffect(() => {
    if (!cartPulse) {
      return;
    }
    const timer = window.setTimeout(() => {
      setCartPulse(false);
    }, 420);
    return () => window.clearTimeout(timer);
  }, [cartPulse]);

  const onAddClick = async (product: Product) => {
    if (isRestaurantClosed) {
      setOrderErrMsg("No se pueden hacer pedidos porque el restaurante esta cerrado");
      setOrderOkMsg(null);
      return;
    }

    setModifiersError(null);
    setModifiersLoading(true);

    const { data: assignedData, error: assignedError } = await supabase
      .from("product_modifier_groups")
      .select(
        "id, modifier_group_id, sort_order, modifier_groups!product_modifier_groups_modifier_group_id_fkey ( id, name, min_select, max_select, is_active )"
      )
      .eq("restaurant_id", restaurantId)
      .eq("product_id", product.id)
      .eq("modifier_groups.restaurant_id", restaurantId)
      .order("sort_order", { ascending: true });

    if (assignedError) {
      if (import.meta.env.DEV) console.error("[storefront] load assigned modifiers", assignedError);
      setModifiersError("No se pudieron cargar los modificadores.");
      setModifiersLoading(false);
      return;
    }

    const assignedRows = (assignedData ?? []) as ModifierGroupRow[];
    const activeGroups: ActiveModifierGroup[] = assignedRows
      .map((row) => {
        const joined = Array.isArray(row.modifier_groups)
          ? row.modifier_groups[0] ?? null
          : row.modifier_groups;
        return joined;
      })
      .filter((group): group is ActiveModifierGroup => Boolean(group && !Array.isArray(group) && group.is_active));

    if (activeGroups.length === 0) {
      addToCart({
        productId: product.id,
        productName: product.name,
        basePrice: Number(product.price) || 0,
        extraPrice: 0,
        finalUnitPrice: Number(product.price) || 0,
        extras: [],
        selectedModifiers: [],
      });
      setModifiersLoading(false);
      return;
    }

    const groupIds = activeGroups.map((group) => group.id);

    const { data: optionsData, error: optionsError } = await supabase
      .from("modifier_options")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .in("group_id", groupIds)
      .order("position", { ascending: true });

    if (optionsError) {
      if (import.meta.env.DEV) console.error("[storefront] load modifier options", optionsError);
      setModifiersError("No se pudieron cargar los modificadores.");
      setModifiersLoading(false);
      return;
    }

    const optionsRows = ((optionsData ?? []) as ModifierOptionRow[]).filter(
      (option) => option.is_active
    );

    const groupsForModal: ProductModifierGroup[] = activeGroups.map((group) => ({
      id: group.id,
      name: group.name ?? group.id,
      min_select: Number(group.min_select ?? 0),
      max_select: Number(group.max_select ?? 1),
      options: optionsRows
        .filter((option) => option.group_id === group.id)
        .map((option) => ({
          id: option.id,
          name: option.name ?? option.id,
          price: Number(option.price ?? 0),
        })),
    }));

    setModifierGroups(groupsForModal);
    setSelectedProduct({
      id: product.id,
      name: product.name,
      price: Number(product.price),
    });
    setModifiersOpen(true);
    setModifiersLoading(false);
  };

  const incQty = (id: string) => {
    setCart((previous) =>
      previous.map((item) => (item.id === id ? { ...item, qty: item.qty + 1 } : item))
    );
  };

  const decQty = (id: string) => {
    setCart((previous) =>
      previous
        .map((item) => (item.id === id ? { ...item, qty: item.qty - 1 } : item))
        .filter((item) => item.qty > 0)
    );
  };

  const removeItem = (id: string) => {
    setCart((previous) => previous.filter((item) => item.id !== id));
  };

  const clearCart = () => {
    setCart([]);
    setOrderOkMsg(null);
    setOrderErrMsg(null);
  };

  // Rehidratar carrito desde localStorage al montar
  useEffect(() => {
    if (!restaurantId) return;
    try {
      const saved = localStorage.getItem(`sf_cart_${restaurantId}`);
      if (saved) {
        const parsed = JSON.parse(saved) as CartItem[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCart(parsed);
        }
      }
    } catch {
      // ignorar datos corruptos
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  // Persistir carrito en localStorage ante cada cambio
  useEffect(() => {
    if (!restaurantId) return;
    try {
      if (cart.length > 0) {
        localStorage.setItem(`sf_cart_${restaurantId}`, JSON.stringify(cart));
      } else {
        localStorage.removeItem(`sf_cart_${restaurantId}`);
      }
    } catch {
      // ignorar errores de storage
    }
  }, [cart, restaurantId]);

  useEffect(() => {
    if (cartOpen && cart.length === 0 && !orderOkMsg) {
      setCartOpen(false);
    }
  }, [cartOpen, cart.length, orderOkMsg]);

  const handleOrderSuccess = (orderId: string) => {
    clearCart();
    setOrderOkMsg(`Pedido enviado ? (#${orderId.slice(0, 8)})`);
  };

  const handleOrderError = (message: string) => {
    setOrderErrMsg(message);
    setOrderOkMsg(null);
  };

  useEffect(() => {
    const color = webSettings?.primary_color?.trim();
    if (color) {
      document.documentElement.style.setProperty("--brand-primary", color);
    } else {
      document.documentElement.style.removeProperty("--brand-primary");
    }
    const btnColor = webSettings?.button_color?.trim();
    document.documentElement.style.setProperty("--brand-button", btnColor || color || "#22c55e");
  }, [webSettings?.primary_color, webSettings?.button_color]);

  const closedMessage = "No se pueden hacer pedidos porque el restaurante esta cerrado";
  const restaurantInitial = restaurantName.trim().charAt(0).toUpperCase() || "R";
  const displayLogoUrl = webSettings?.logo_url?.trim() || restaurantLogoUrl;
  const displayName = webSettings?.header_title?.trim() || restaurantName;
  const deliveryEtaText = webSettings?.chip_1?.trim()
    || (estimatedDeliveryMinutes ? `${estimatedDeliveryMinutes}-${estimatedDeliveryMinutes + 10} min` : "20-30 min");
  const chip2Text = webSettings?.chip_2?.trim() || "Comida rapida";
  const serviceModeText = webSettings?.chip_3?.trim() || "Recogida y entrega";
  const addButtonText = webSettings?.add_button_text?.trim() || "Anadir";
  const headerSubtitle = webSettings?.header_subtitle?.trim() || "";
  const headerHelper = webSettings?.helper_text?.trim() || "Pedido online";
  const secondaryColor = webSettings?.secondary_color?.trim() || "#0f172a";
  const rawButtonColor = webSettings?.button_color?.trim() || "#22c55e";
  const addButtonVariant = webSettings?.add_button_variant?.trim() || "solid";
  const bannerUrl = webSettings?.banner_url?.trim() || "";
  const bannerTitle = webSettings?.banner_title?.trim() || "";
  const bannerSubtitle = webSettings?.banner_subtitle?.trim() || "";
  const chips = [deliveryEtaText, chip2Text, serviceModeText].filter(Boolean);

  const goToCategory = (categoryId: string) => {
    setActiveCategoryId(categoryId);
    const section = document.getElementById(`category-${categoryId}`);
    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Flatten products for JSON-LD
  const allProducts = Object.values(productsByCat).flat();

  return (
    <>
      <RestaurantHead
        restaurantName={restaurantName ?? "Restaurante"}
        slug={slug}
        cuisineType={seoData.cuisineType}
        metaTitle={seoData.metaTitle}
        metaDescription={seoData.metaDescription}
        ogImage={seoData.ogImage ?? (webSettings?.logo_url ?? restaurantLogoUrl ?? undefined)}
        customDomain={seoData.customDomain}
        customDomainVerified={seoData.customDomainVerified}
        products={allProducts}
      />
    <div className="sf-root">
      <header
        style={{
          borderRadius: "20px 20px 0 0",
          padding: "14px 18px",
          background: secondaryColor,
          color: "#fff",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                overflow: "hidden",
                background: "rgba(255,255,255,0.18)",
                border: "1px solid rgba(255,255,255,0.28)",
                flexShrink: 0,
                display: "grid",
                placeItems: "center",
              }}
            >
              {displayLogoUrl ? (
                <img
                  src={displayLogoUrl}
                  alt={`${displayName} logo`}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <span aria-hidden style={{ fontWeight: 800, fontSize: 20 }}>
                  {restaurantInitial}
                </span>
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.2 }}>{displayName}</div>
              {headerSubtitle ? (
                <div style={{ fontSize: 12, opacity: 0.88, marginTop: 2 }}>{headerSubtitle}</div>
              ) : null}
            </div>
          </div>
          <div
            style={{
              borderRadius: 999,
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 800,
              background: isRestaurantClosed ? "rgba(239,68,68,0.22)" : "rgba(255,255,255,0.16)",
              color: isRestaurantClosed ? "#fca5a5" : "#bbf7d0",
              border: `1px solid ${isRestaurantClosed ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.28)"}`,
              flexShrink: 0,
            }}
          >
            {isRestaurantClosed ? "Cerrado" : "Abierto"}
          </div>
        </div>
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span
            style={{
              display: "inline-flex",
              borderRadius: 999,
              background: "rgba(255,255,255,0.14)",
              border: "1px solid rgba(255,255,255,0.26)",
              padding: "5px 10px",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {headerHelper}
          </span>
          {contactPhone ? (
            <a
              href={`tel:${contactPhone}`}
              style={{
                fontSize: 12,
                fontWeight: 700,
                borderRadius: 999,
                padding: "5px 10px",
                color: "#fff",
                background: "rgba(255,255,255,0.14)",
                border: "1px solid rgba(255,255,255,0.26)",
                textDecoration: "none",
              }}
            >
              Tel. {contactPhone}
            </a>
          ) : null}
          {menuUpdated && (
            <span style={{
              fontSize: 11, fontWeight: 700,
              borderRadius: 999, padding: "4px 10px",
              background: "rgba(78,197,128,0.25)",
              border: "1px solid rgba(78,197,128,0.45)",
              color: "#bbf7d0",
              animation: "sfFadeIn 0.3s ease",
            }}>
              Menú actualizado
            </span>
          )}
        </div>
      </header>

      <div
        style={{
          position: "relative",
          borderRadius: "0 0 20px 20px",
          overflow: "hidden",
          minHeight: 200,
          marginBottom: 14,
          background: secondaryColor,
        }}
      >
        {bannerUrl ? (
          <img
            src={bannerUrl}
            alt="Banner del restaurante"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : null}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, rgba(15,23,42,0.18) 0%, rgba(15,23,42,0.72) 100%)",
          }}
        />
        <div
          style={{
            position: "relative",
            zIndex: 1,
            padding: "16px 18px 22px",
            color: "#fff",
            minHeight: 200,
            boxSizing: "border-box",
            display: "grid",
            alignContent: "end",
            gap: 8,
          }}
        >
          {bannerTitle ? (
            <h1
              style={{
                margin: 0,
                fontSize: "clamp(1.6rem, 3.5vw, 2.6rem)",
                lineHeight: 1.1,
                letterSpacing: -0.3,
              }}
            >
              {bannerTitle}
            </h1>
          ) : null}
          {bannerSubtitle ? (
            <p style={{ margin: 0, fontSize: 15, opacity: 0.9, lineHeight: 1.4 }}>{bannerSubtitle}</p>
          ) : null}
          {chips.length > 0 ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
              {chips.map((chip) => (
                <span
                  key={chip}
                  style={{
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.4)",
                    background: "rgba(255,255,255,0.18)",
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 700,
                    padding: "5px 11px",
                  }}
                >
                  {chip}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {isRestaurantClosed ? (
        <div
          role="alert"
          style={{
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#991b1b",
            borderRadius: 10,
            padding: "10px 12px",
            display: "grid",
            gap: 4,
            marginBottom: 12,
          }}
        >
          <strong>Cerrado ahora</strong>
          <span>{nextOpeningText ?? "Vuelve mas tarde"}</span>
        </div>
      ) : null}

      {error && (
        <p style={{ color: "crimson", fontWeight: 600 }}>Error: {error}</p>
      )}
      {modifiersError && <p style={{ color: "crimson", fontWeight: 600 }}>{modifiersError}</p>}
      {modifiersLoading && <p>Cargando modificadores...</p>}

      {categories.length > 1 ? (
        <nav
          style={{
            position: "sticky",
            top: 10,
            zIndex: 30,
            margin: "0 0 14px",
            padding: 8,
            borderRadius: 16,
            border: "1px solid rgba(15,23,42,0.08)",
            background: "rgba(255,255,255,0.92)",
            backdropFilter: "blur(8px)",
            boxShadow: "0 10px 24px rgba(15, 23, 42, 0.08)",
            display: "flex",
            gap: 8,
            overflowX: "auto",
          }}
        >
          {categories.map((category) => {
            const isActive = activeCategoryId === category.id;
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => goToCategory(category.id)}
                style={{
                  borderRadius: 999,
                  padding: "8px 14px",
                  border: `1px solid ${isActive ? "var(--brand-primary-border)" : "rgba(15,23,42,0.12)"}`,
                  background: isActive ? "var(--brand-primary-soft)" : "#fff",
                  color: isActive ? "var(--brand-hover)" : "#334155",
                  fontWeight: 700,
                  fontSize: 13,
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                  boxShadow: isActive ? "0 6px 14px rgba(78,197,128,0.18)" : "none",
                }}
              >
                {category.name}
              </button>
            );
          })}
        </nav>
      ) : null}

      <div className="sf-search-wrap">
        <input
          className="sf-search-input"
          type="search"
          placeholder="Buscar producto..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Buscar producto"
        />
      </div>

      {!searchHasResults && (
        <div
          style={{
            padding: "32px 12px",
            textAlign: "center",
            color: "#64748b",
            fontSize: 15,
          }}
        >
          No se encontró ningún producto para &ldquo;{debouncedQuery}&rdquo;
        </div>
      )}

      {categories.map((category) => {
        const products = filteredProductsByCat[category.id];
        if (!products || products.length === 0) return null;
        return (
        <section
          key={category.id}
          id={`category-${category.id}`}
          style={{ marginTop: 24, scrollMarginTop: 92 }}
        >
          <h2
            style={{
              margin: "0 0 14px",
              fontSize: "clamp(1.45rem, 2.6vw, 2rem)",
              lineHeight: 1.1,
              color: "#0f172a",
            }}
          >
            {category.name}
          </h2>

          <div className="sf-product-grid">
              {products.map((product) => (
                <div
                  key={product.id}
                  style={{
                    border: "1px solid rgba(15, 23, 42, 0.08)",
                    borderRadius: 20,
                    padding: 13,
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
                    boxShadow:
                      recentlyAddedProductId === product.id
                        ? "0 0 0 3px rgba(78,197,128,0.25), 0 16px 34px rgba(15, 23, 42, 0.12)"
                        : "0 10px 26px rgba(15, 23, 42, 0.08)",
                    minHeight: 330,
                    transition: "transform 0.18s ease, box-shadow 0.18s ease",
                  }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.transform = "translateY(-2px)";
                    if (recentlyAddedProductId !== product.id) {
                      event.currentTarget.style.boxShadow = "0 14px 32px rgba(15, 23, 42, 0.12)";
                    }
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.transform = "translateY(0)";
                    if (recentlyAddedProductId !== product.id) {
                      event.currentTarget.style.boxShadow = "0 10px 26px rgba(15, 23, 42, 0.08)";
                    }
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      height: 180,
                      borderRadius: 16,
                      overflow: "hidden",
                      border: "1px solid rgba(15, 23, 42, 0.08)",
                      background: "#f1f5f9",
                    }}
                  >
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <svg
                        viewBox="0 0 200 180"
                        xmlns="http://www.w3.org/2000/svg"
                        style={{ width: "100%", height: "100%", display: "block" }}
                        aria-hidden
                      >
                        <rect width="200" height="180" fill="#f1f5f9" />
                        <rect x="52" y="44" width="96" height="76" rx="10" fill="#e2e8f0" />
                        <circle cx="80" cy="70" r="10" fill="#cbd5e1" />
                        <polygon points="52,120 88,78 112,100 136,82 148,120" fill="#cbd5e1" />
                        <rect x="52" y="44" width="96" height="76" rx="10" fill="none" stroke="#cbd5e1" strokeWidth="2" />
                        <rect x="82" y="130" width="36" height="6" rx="3" fill="#cbd5e1" />
                        <rect x="74" y="141" width="52" height="5" rx="2.5" fill="#e2e8f0" />
                      </svg>
                    )}
                  </div>

                  <div style={{ display: "grid", gap: 7, flex: 1 }}>
                    <div style={{ fontSize: 19, fontWeight: 800, color: "#0f172a", lineHeight: 1.2 }}>
                      {product.name}
                    </div>
                    {product.description ? (
                      <div
                        style={{
                          color: "#64748b",
                          fontSize: 14,
                          lineHeight: 1.45,
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {product.description}
                      </div>
                    ) : null}
                  </div>

                  <div
                    style={{
                      marginTop: 2,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div style={{ fontWeight: 800, color: "#0f172a", fontSize: 20 }}>
                      {Number(product.price).toFixed(2)} EUR
                    </div>

                    <button
                      style={{
                        padding: "10px 17px",
                        borderRadius: 999,
                        border: addButtonVariant === "solid"
                          ? "none"
                          : `1px solid ${rawButtonColor}`,
                        background: addButtonVariant === "soft"
                          ? `${rawButtonColor}22`
                          : addButtonVariant === "outline"
                          ? "transparent"
                          : rawButtonColor,
                        color: addButtonVariant === "solid" ? "#fff" : rawButtonColor,
                        cursor: "pointer",
                        fontWeight: 800,
                        fontSize: 14,
                        letterSpacing: 0.15,
                        boxShadow: addButtonVariant === "solid" ? "0 12px 20px rgba(46, 139, 87, 0.24)" : "none",
                        transition: "opacity 0.15s ease, transform 0.12s ease",
                      }}
                      disabled={isRestaurantClosed}
                      title={isRestaurantClosed ? closedMessage : undefined}
                      onClick={() => onAddClick(product)}
                      onMouseEnter={(event) => {
                        event.currentTarget.style.opacity = "0.82";
                        event.currentTarget.style.transform = "translateY(-1.5px)";
                      }}
                      onMouseLeave={(event) => {
                        event.currentTarget.style.opacity = "1";
                        event.currentTarget.style.transform = "translateY(0)";
                      }}
                    >
                      {recentlyAddedProductId === product.id ? "Anadido" : `+ ${addButtonText}`}
                    </button>
                  </div>
                </div>
              ))}
            </div>
        </section>
        );
      })}

      <button
        disabled={isRestaurantClosed}
        title={isRestaurantClosed ? closedMessage : undefined}
        onClick={() => setCartOpen((value) => !value)}
        onMouseEnter={() => setIsCartButtonHovered(true)}
        onMouseLeave={() => setIsCartButtonHovered(false)}
        className="sf-cart-btn"
        style={{
          position: "fixed",
          right: 14,
          bottom: 14,
          borderRadius: 18,
          padding: "11px 14px",
          border: "none",
          background: isRestaurantClosed
            ? rawButtonColor
            : isCartButtonHovered
            ? rawButtonColor
            : rawButtonColor,
          color: "var(--brand-white)",
          cursor: isRestaurantClosed ? "not-allowed" : "pointer",
          opacity: isRestaurantClosed ? 0.6 : 1,
          boxShadow: cartPulse
            ? "0 0 0 4px rgba(78,197,128,0.28), 0 16px 30px rgba(0, 0, 0, 0.24)"
            : "0 14px 30px rgba(0, 0, 0, 0.2)",
          fontWeight: 700,
          transition: "background-color 0.18s ease, box-shadow 0.18s ease, transform 0.12s ease",
          zIndex: 70,
          minWidth: 220,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            background: "rgba(255,255,255,0.22)",
            border: "1px solid rgba(255,255,255,0.3)",
            fontSize: 13,
            fontWeight: 900,
          }}
        >
          {cartCount}
        </span>
        <span style={{ display: "grid", textAlign: "left", lineHeight: 1.1 }}>
          <span style={{ fontSize: 12, opacity: 0.95, fontWeight: 600 }}>Tu carrito</span>
          <span style={{ fontSize: 15, fontWeight: 900 }}>{formatEUR(cartTotal)}</span>
        </span>
        <span style={{ fontSize: 15, fontWeight: 900, lineHeight: 1 }}>+</span>
      </button>

      {cartDrawerPresence.mounted && (
        <div
          className="ui-overlay"
          data-state={cartDrawerPresence.visible ? "open" : "closed"}
          onClick={() => setCartOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2, 6, 23, 0.58)",
            zIndex: 60,
            display: "flex",
            justifyContent: "flex-end",
            minWidth: 0,
          }}
        >
          <div
            className="ui-drawer-panel"
            data-state={cartDrawerPresence.visible ? "open" : "closed"}
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(470px, 100vw)",
              maxWidth: "100vw",
              height: "100dvh",
              background: "linear-gradient(180deg, #020617 0%, #0f172a 100%)",
              borderLeft: "1px solid rgba(148, 163, 184, 0.25)",
              padding: 16,
              color: "white",
              boxSizing: "border-box",
              overflowY: "hidden",
              overflowX: "hidden",
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
              boxShadow: "-18px 0 42px rgba(2, 6, 23, 0.55)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                paddingBottom: 12,
                borderBottom: "1px solid rgba(148,163,184,0.22)",
              }}
            >
              <div style={{ display: "grid", gap: 2 }}>
                <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1.1 }}>Tu carrito</div>
                <div style={{ fontSize: 12, color: "rgba(226,232,240,0.78)" }}>
                  Revisa tu pedido y completa checkout
                </div>
              </div>
              <div
                style={{
                  minWidth: 30,
                  height: 30,
                  borderRadius: 999,
                  display: "grid",
                  placeItems: "center",
                  background: "rgba(78,197,128,0.22)",
                  border: "1px solid rgba(78,197,128,0.45)",
                  fontWeight: 800,
                }}
              >
                {cartCount}
              </div>
              <button
                onClick={() => setCartOpen(false)}
                style={{
                  border: "1px solid rgba(148,163,184,0.35)",
                  background: "rgba(15, 23, 42, 0.6)",
                  color: "white",
                  borderRadius: 12,
                  padding: "7px 10px",
                  cursor: "pointer",
                }}
              >
                X
              </button>
            </div>

            <div
              style={{
                marginTop: 12,
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                overflowX: "hidden",
                paddingRight: 2,
                display: "grid",
                gap: 12,
                alignContent: "start",
              }}
            >
              {orderOkMsg && (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: "rgba(34,197,94,0.14)",
                    border: "1px solid rgba(74,222,128,0.3)",
                    color: "#86efac",
                  }}
                >
                  {orderOkMsg}
                </div>
              )}

              {orderErrMsg && (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: "rgba(248,113,113,0.12)",
                    border: "1px solid rgba(248,113,113,0.28)",
                    color: "#fecaca",
                  }}
                >
                  {orderErrMsg}
                </div>
              )}

              {cart.length === 0 && !orderOkMsg ? (
                <div
                  style={{
                    border: "1px solid rgba(148,163,184,0.22)",
                    borderRadius: 14,
                    padding: "14px 12px",
                    background: "rgba(15,23,42,0.55)",
                  }}
                >
                  <p style={{ margin: 0, opacity: 0.82 }}>Aun no has anadido nada.</p>
                </div>
              ) : (
                <>
                  {cart.length > 0 && (
                    <div
                      style={{
                        border: "1px solid rgba(148,163,184,0.2)",
                        borderRadius: 16,
                        padding: 12,
                        background: "rgba(15,23,42,0.5)",
                        display: "grid",
                        gap: 12,
                      }}
                    >
                      <div style={{ display: "grid", gap: 2 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(203,213,225,0.95)" }}>
                          Productos del carrito
                        </div>
                        <div style={{ fontSize: 11, color: "rgba(148,163,184,0.9)" }}>
                          Ajusta cantidades y revisa extras
                        </div>
                      </div>
                      {cart.map((item) => (
                        <div
                          key={item.id}
                          style={{
                            border: "1px solid rgba(148,163,184,0.22)",
                            borderRadius: 14,
                            padding: 12,
                            background: "rgba(2,6,23,0.36)",
                          }}
                        >
                          <div
                            style={{ display: "flex", justifyContent: "space-between", gap: 10 }}
                          >
                            <div>
                              <div style={{ fontWeight: 900 }}>{item.name}</div>
                              <div style={{ opacity: 0.8, marginTop: 4 }}>
                                {formatEUR(item.unitPrice)} / ud
                              </div>
                            </div>

                            <button
                              onClick={() => removeItem(item.id)}
                              style={{
                                border: "1px solid rgba(148,163,184,0.32)",
                                background: "rgba(15,23,42,0.5)",
                                color: "white",
                                borderRadius: 10,
                                padding: "6px 10px",
                                cursor: "pointer",
                                height: 34,
                              }}
                            >
                              Eliminar
                            </button>
                          </div>

                          {item.extras.length > 0 && (
                            <div style={{ marginTop: 10, opacity: 0.85, fontSize: 13 }}>
                              Extras:
                              <ul style={{ margin: "6px 0 0 18px" }}>
                                {item.extras.map((extra) => (
                                  <li key={extra.ingredientId}>
                                    {extra.name}
                                    {extra.price > 0 ? ` (+${formatEUR(extra.price)})` : ""}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                            <div style={{ marginTop: 10, opacity: 0.85, fontSize: 13 }}>
                              Modificadores:
                              <ul style={{ margin: "6px 0 0 18px" }}>
                                {item.selectedModifiers.map((group) =>
                                  group.options.map((option) => (
                                    <li key={`${group.groupId}-${option.optionId}`}>
                                      {group.groupName}: {option.name}
                                      {option.price > 0 ? ` (+${formatEUR(option.price)})` : ""}
                                    </li>
                                  ))
                                )}
                              </ul>
                            </div>
                          )}

                          <div
                            style={{
                              marginTop: 10,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 10,
                            }}
                          >
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <button
                                onClick={() => decQty(item.id)}
                                style={{
                                  border: "1px solid rgba(148,163,184,0.32)",
                                  background: "rgba(15,23,42,0.5)",
                                  color: "white",
                                  borderRadius: 10,
                                  padding: "6px 10px",
                                  cursor: "pointer",
                                }}
                              >
                                -
                              </button>
                              <div style={{ minWidth: 26, textAlign: "center", fontWeight: 900 }}>
                                {item.qty}
                              </div>
                              <button
                                onClick={() => incQty(item.id)}
                                style={{
                                  border: "1px solid rgba(148,163,184,0.32)",
                                  background: "rgba(15,23,42,0.5)",
                                  color: "white",
                                  borderRadius: 10,
                                  padding: "6px 10px",
                                  cursor: "pointer",
                                }}
                              >
                                +
                              </button>
                            </div>

                            <div style={{ fontWeight: 900 }}>{formatEUR(item.qty * item.unitPrice)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div
                    style={{
                      display: "grid",
                      gap: 12,
                    }}
                  >
                    {cart.length > 0 && (
                      <div
                        style={{
                          border: "1px solid rgba(148,163,184,0.22)",
                          borderRadius: 14,
                          padding: "12px 12px",
                          background: "rgba(15,23,42,0.58)",
                          display: "grid",
                          gap: 10,
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(203,213,225,0.95)" }}>
                          Resumen
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <div style={{ opacity: 0.85 }}>Total</div>
                          <div style={{ fontWeight: 900 }}>{formatEUR(cartTotal)}</div>
                        </div>

                        <button
                          onClick={clearCart}
                          style={{
                            border: "1px solid rgba(148,163,184,0.35)",
                            background: "rgba(15,23,42,0.5)",
                            color: "white",
                            borderRadius: 12,
                            padding: "10px 12px",
                            cursor: "pointer",
                          }}
                        >
                          Vaciar
                        </button>
                      </div>
                    )}

                    <div
                      style={{
                        border: "1px solid rgba(148,163,184,0.24)",
                        borderRadius: 14,
                        padding: 12,
                        background: "rgba(15,23,42,0.6)",
                        display: "grid",
                        gap: 10,
                      }}
                    >
                      <div style={{ display: "grid", gap: 2 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(203,213,225,0.95)" }}>
                          Checkout
                        </div>
                        <div style={{ fontSize: 11, color: "rgba(148,163,184,0.9)" }}>
                          Pasos, formulario y confirmacion final
                        </div>
                      </div>

                      <CheckoutPage
                        cart={cart}
                        cartTotal={cartTotal}
                        onOrderSuccess={handleOrderSuccess}
                        onOrderError={handleOrderError}
                        onClose={() => setCartOpen(false)}
                        restaurantClosed={isRestaurantClosed}
                        restaurantClosedMessage={closedMessage}
                        nextOpeningText={nextOpeningText}
                        contactPhone={contactPhone}
                        upsellProducts={upsellProducts}
                        onAddUpsellProduct={handleAddUpsellProduct}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <ProductModifiersModal
        open={modifiersOpen}
        onClose={() => {
          setModifiersOpen(false);
          setSelectedProduct(null);
          setModifierGroups([]);
        }}
        product={selectedProduct}
        groups={modifierGroups}
        onConfirm={({ selectedModifiers, extraPrice, finalUnitPrice }) => {
          if (!selectedProduct) {
            return;
          }

          addToCart({
            productId: selectedProduct.id,
            productName: selectedProduct.name,
            basePrice: Number(selectedProduct.price) || 0,
            extraPrice,
            finalUnitPrice,
            extras: [],
            selectedModifiers: selectedModifiers.map((group) => ({
              groupId: group.group_id,
              groupName: group.group_name,
              options: group.options.map((option) => ({
                optionId: option.option_id,
                name: option.option_name,
                price: option.price,
              })),
            })),
          });
        }}
      />
    </div>
    </>
  );
}
