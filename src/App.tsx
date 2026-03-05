import { useEffect, useMemo, useState } from "react";

import ProductModifiersModal from "./components/ProductModifiersModal";
import CheckoutPage from "./features/checkout/ui/CheckoutPage";
import type { CartItem } from "./features/checkout/types";
import { supabase } from "./lib/supabase";
import { useRestaurant } from "./restaurant/RestaurantContext";

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
};

type ModifierGroupRow = {
  id: string;
  position: number | null;
  group_id: string;
  modifier_groups:
    | {
        id: string;
        name: string | null;
        min_select: number | null;
        max_select: number | null;
        is_active: boolean | null;
        position: number | null;
      }
    | {
        id: string;
        name: string | null;
        min_select: number | null;
        max_select: number | null;
        is_active: boolean | null;
        position: number | null;
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
  position: number | null;
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
  const { restaurantId } = useRestaurant();
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

  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [isCartButtonHovered, setIsCartButtonHovered] = useState(false);

  const [orderOkMsg, setOrderOkMsg] = useState<string | null>(null);
  const [orderErrMsg, setOrderErrMsg] = useState<string | null>(null);
  const [isRestaurantClosed, setIsRestaurantClosed] = useState(false);
  const [nextOpeningText, setNextOpeningText] = useState<string | null>(null);
  const [contactPhone, setContactPhone] = useState<string | null>(null);

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

  useEffect(() => {
    let alive = true;

    (async () => {
      setError(null);

      const { data: cats, error: catErr } = await supabase
        .from("categories")
        .select("id,name,sort_order")
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (!alive) {
        return;
      }

      if (catErr) {
        setError(catErr.message);
        return;
      }

      const catList = (cats ?? []) as Category[];
      setCategories(catList);

      const { data: prods, error: prodErr } = await supabase
        .from("products")
        .select("id,category_id,name,description,price,image_url,sort_order")
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (!alive) {
        return;
      }

      if (prodErr) {
        setError(prodErr.message);
        return;
      }

      const list = (prods ?? []) as Product[];

      const grouped: Record<string, Product[]> = {};
      for (const product of list) {
        if (!product.category_id) {
          continue;
        }

        if (!grouped[product.category_id]) {
          grouped[product.category_id] = [];
        }

        grouped[product.category_id].push(product);
      }

      setProductsByCat(grouped);
    })();

    return () => {
      alive = false;
    };
  }, [restaurantId]);

  useEffect(() => {
    let alive = true;

    const loadAvailability = async () => {
      const [hoursResult, settingsResult] = await Promise.all([
        supabase
          .from("restaurant_hours")
          .select("day_of_week,is_open,open_time,close_time")
          .eq("restaurant_id", restaurantId),
        supabase
          .from("restaurant_settings")
          .select("business_phone")
          .eq("restaurant_id", restaurantId)
          .limit(1)
          .maybeSingle(),
      ]);

      if (!alive) return;

      const phone = String((settingsResult.data as { business_phone?: unknown } | null)?.business_phone ?? "").trim();
      setContactPhone(phone || null);

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

    setOrderOkMsg(null);
    setOrderErrMsg(null);
  };

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
        "id, position, group_id, modifier_groups ( id, name, min_select, max_select, is_active, position )"
      )
      .eq("product_id", product.id)
      .eq("modifier_groups.restaurant_id", restaurantId)
      .order("position", { ascending: true });

    if (assignedError) {
      console.error(assignedError);
      setModifiersError(assignedError.message);
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
      console.error(optionsError);
      setModifiersError(optionsError.message);
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

  const closedMessage = "No se pueden hacer pedidos porque el restaurante esta cerrado";

  return (
    <div
      style={{
        padding: 20,
        fontFamily: "system-ui",
        maxWidth: 900,
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <h1 style={{ marginBottom: 10 }}>Kebab SaaS V1</h1>

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

      {categories.map((category) => (
        <section key={category.id} style={{ marginTop: 24 }}>
          <h2 style={{ margin: "0 0 12px" }}>{category.name}</h2>

          {(productsByCat[category.id]?.length ?? 0) === 0 ? (
            <p style={{ opacity: 0.7 }}>No hay productos en esta categoria.</p>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {productsByCat[category.id].map((product) => (
                <div
                  key={product.id}
                  style={{
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 12,
                    padding: 12,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 10 }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 72,
                          height: 72,
                          borderRadius: 10,
                          border: "1px solid rgba(255,255,255,0.25)",
                          display: "grid",
                          placeItems: "center",
                          fontSize: 12,
                          opacity: 0.75,
                        }}
                      >
                        Sin imagen
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{product.name}</div>
                      {product.description && (
                        <div style={{ opacity: 0.75, marginTop: 4 }}>{product.description}</div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ fontWeight: 700 }}>{Number(product.price).toFixed(2)} EUR</div>

                    <button
                      style={{
                        padding: "9px 14px",
                        borderRadius: 10,
                        border: "1px solid var(--brand-primary-border)",
                        background: "var(--brand-primary)",
                        color: "var(--brand-white)",
                        cursor: "pointer",
                        fontWeight: 700,
                        boxShadow: "0 8px 18px rgba(0, 0, 0, 0.14)",
                        transition: "background-color 0.18s ease, transform 0.12s ease",
                      }}
                      disabled={isRestaurantClosed}
                      title={isRestaurantClosed ? closedMessage : undefined}
                      onClick={() => onAddClick(product)}
                      onMouseEnter={(event) => {
                        event.currentTarget.style.background = "var(--brand-hover)";
                      }}
                      onMouseLeave={(event) => {
                        event.currentTarget.style.background = "var(--brand-primary)";
                      }}
                    >
                      Añadir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ))}

      <button
        disabled={isRestaurantClosed}
        title={isRestaurantClosed ? closedMessage : undefined}
        onClick={() => setCartOpen((value) => !value)}
        onMouseEnter={() => setIsCartButtonHovered(true)}
        onMouseLeave={() => setIsCartButtonHovered(false)}
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          borderRadius: 14,
          padding: "12px 14px",
          border: "1px solid var(--brand-primary-border)",
          background: isRestaurantClosed
            ? "var(--brand-primary)"
            : isCartButtonHovered
            ? "var(--brand-hover)"
            : "var(--brand-primary)",
          color: "var(--brand-white)",
          cursor: isRestaurantClosed ? "not-allowed" : "pointer",
          opacity: isRestaurantClosed ? 0.6 : 1,
          boxShadow: "0 10px 24px rgba(0, 0, 0, 0.18)",
          fontWeight: 700,
          transition: "background-color 0.18s ease, box-shadow 0.18s ease, transform 0.12s ease",
          zIndex: 70,
        }}
      >
        Carrito: <b>{cartCount}</b> - <b>{formatEUR(cartTotal)}</b>
      </button>

      {cartOpen && (
        <div
          onClick={() => setCartOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 60,
            display: "flex",
            justifyContent: "flex-end",
            minWidth: 0,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(420px, 100vw)",
              maxWidth: "100vw",
              height: "100dvh",
              background: "#0f0f0f",
              borderLeft: "1px solid rgba(255,255,255,0.12)",
              padding: 14,
              color: "white",
              boxSizing: "border-box",
              overflowY: "hidden",
              overflowX: "hidden",
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontSize: 18, fontWeight: 900 }}>Tu carrito</div>
              <button
                onClick={() => setCartOpen(false)}
                style={{
                  border: "1px solid rgba(255,255,255,0.18)",
                  background: "transparent",
                  color: "white",
                  borderRadius: 10,
                  padding: "6px 10px",
                  cursor: "pointer",
                }}
              >
                X
              </button>
            </div>

            <div
              style={{
                marginTop: 10,
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                overflowX: "hidden",
              }}
            >
              {orderOkMsg && (
                <div
                  style={{
                    marginTop: 10,
                    padding: 10,
                    borderRadius: 12,
                    background: "rgba(0,255,120,0.12)",
                    border: "1px solid rgba(0,255,120,0.25)",
                  }}
                >
                  {orderOkMsg}
                </div>
              )}

              {orderErrMsg && (
                <div
                  style={{
                    marginTop: 10,
                    padding: 10,
                    borderRadius: 12,
                    background: "rgba(255,0,0,0.10)",
                    border: "1px solid rgba(255,0,0,0.25)",
                    color: "salmon",
                  }}
                >
                  {orderErrMsg}
                </div>
              )}

              {cart.length === 0 && !orderOkMsg ? (
                <p style={{ marginTop: 14, opacity: 0.75 }}>Aun no has anadido nada.</p>
              ) : (
                <>
                  {cart.length > 0 && (
                    <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
                      {cart.map((item) => (
                        <div
                          key={item.id}
                          style={{
                            border: "1px solid rgba(255,255,255,0.12)",
                            borderRadius: 14,
                            padding: 12,
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
                                border: "1px solid rgba(255,255,255,0.18)",
                                background: "transparent",
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
                                  border: "1px solid rgba(255,255,255,0.18)",
                                  background: "transparent",
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
                                  border: "1px solid rgba(255,255,255,0.18)",
                                  background: "transparent",
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
                      marginTop: 14,
                      paddingTop: 12,
                      borderTop: "1px solid rgba(255,255,255,0.12)",
                      display: "grid",
                      gap: 10,
                    }}
                  >
                    {cart.length > 0 && (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <div style={{ opacity: 0.85 }}>Total</div>
                          <div style={{ fontWeight: 900 }}>{formatEUR(cartTotal)}</div>
                        </div>

                        <button
                          onClick={clearCart}
                          style={{
                            border: "1px solid rgba(255,255,255,0.18)",
                            background: "transparent",
                            color: "white",
                            borderRadius: 12,
                            padding: "10px 12px",
                            cursor: "pointer",
                          }}
                        >
                          Vaciar
                        </button>
                      </>
                    )}

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
                    />
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
  );
}
