import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useAdminMembership } from "../components/AdminMembershipContext";
import { buildTicketHtml, type TicketMode } from "../../features/printing/ticketTemplates";
import { supabase } from "../../lib/supabase";
import { printOrder } from "../../lib/printing/printOrder";
import { ALL_ORDER_STATUSES, isOrderStatus, type OrderStatus } from "../../constants/orderStatus";
import { useRestaurant } from "../../restaurant/RestaurantContext";

type OrderRow = Record<string, unknown> & {
  id: string;
  created_at?: string;
  total?: number;
  print_count?: number | null;
  printed_at?: string | null;
  last_print_error?: string | null;
  status?: OrderStatus;
  order_type?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  street?: string | null;
  number?: string | null;
  address_line?: string | null;
  address_text?: string | null;
  is_building?: boolean | null;
  portal?: string | null;
  floor?: string | null;
  door?: string | null;
  block?: string | null;
  stair?: string | null;
  instructions?: string | null;
  payment_method?: string | null;
  cash_given?: number | null;
  change_due?: number | null;
  address_notes?: unknown;
};

type OrderItemRow = {
  id: string;
  qty: number;
  unit_price: number;
  base_price: number;
  product_id: string;
};

type ProductRow = {
  id: string;
  name: string;
  price?: number | null;
};

type ItemIngredientLink = {
  order_item_id: string;
  ingredient_id: string;
};

type IngredientRow = {
  id: string;
  name: string;
  price?: number | null;
};

type ItemModifierOptionRow = {
  order_item_id: string;
  option_name: string | null;
  price: number | null;
};

const STATUS_OPTIONS: OrderStatus[] = [...ALL_ORDER_STATUSES];

const STATUS_LABELS: Record<string, string> = {
  pending: "pendiente",
  accepted: "aceptado",
  preparing: "preparando",
  ready: "listo",
  out_for_delivery: "en reparto",
  delivered: "entregado",
  cancelled: "cancelado",
};

const currency = (value: number | null | undefined) =>
  `${Number(value ?? 0).toFixed(2)} EUR`;

const currencyOrDash = (value: number | null | undefined) =>
  value === null || value === undefined ? "-" : currency(value);

function toStatusLabel(status: OrderStatus) {
  return STATUS_LABELS[status] ?? status;
}

function toPaymentMethodLabel(method: string | null | undefined) {
  if (method === "cash") return "Efectivo";
  if (method === "card_on_delivery") return "Tarjeta (datafono)";
  if (method === "card_online") return "Tarjeta online (Stripe)";
  return method ?? "-";
}

type DeliverySnapshot = {
  isBuilding?: boolean | null;
  portal?: string | null;
  floor?: string | null;
  door?: string | null;
  block?: string | null;
  stair?: string | null;
  instructions?: string | null;
};

function getDeliverySnapshot(notes: unknown): DeliverySnapshot | null {
  if (!notes || typeof notes !== "object") {
    return null;
  }

  const maybeDelivery = (notes as { delivery?: unknown }).delivery;
  if (!maybeDelivery || typeof maybeDelivery !== "object") {
    return null;
  }

  return maybeDelivery as DeliverySnapshot;
}

export default function AdminOrderDetailPage() {
  const { canManage } = useAdminMembership();
  const { restaurantId, adminPath } = useRestaurant();
  const { id } = useParams<{ id: string }>();

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [items, setItems] = useState<OrderItemRow[]>([]);
  const [productsById, setProductsById] = useState<Record<string, ProductRow>>(
    {}
  );
  const [ingredientsById, setIngredientsById] = useState<
    Record<string, IngredientRow>
  >({});
  const [ingredientIdsByItemId, setIngredientIdsByItemId] = useState<
    Record<string, string[]>
  >({});
  const [modifiersByItemId, setModifiersByItemId] = useState<
    Record<string, { option_name: string; price: number }[]>
  >({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusDraft, setStatusDraft] = useState<OrderStatus | "">("");
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [ticketPreviewMode, setTicketPreviewMode] = useState<TicketMode | null>(null);
  const [printingMode, setPrintingMode] = useState<TicketMode | null>(null);
  const [printNotice, setPrintNotice] = useState<string | null>(null);

  // Evita que el polling te pise el select mientras cambias estado
  const lastServerStatusRef = useRef<OrderStatus | "">("");

  const loadOrderData = useCallback(async () => {
    if (!id) {
      setError("Pedido no encontrado");
      setLoading(false);
      return;
    }

    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", id)
      .eq("restaurant_id", restaurantId)
      .single();

    if (orderError || !orderData) {
      setError(orderError?.message ?? "No se pudo cargar el pedido");
      setLoading(false);
      return;
    }

    const typedOrder = orderData as OrderRow;

    const { data: orderItemsData, error: itemsError } = await supabase
      .from("order_items")
      .select("id, qty, unit_price, base_price, product_id")
      .eq("order_id", id)
      .eq("restaurant_id", restaurantId);

    if (itemsError) {
      setError(itemsError.message);
      setLoading(false);
      return;
    }

    const typedItems = (orderItemsData ?? []) as OrderItemRow[];

    const productIds = Array.from(
      new Set(typedItems.map((item) => item.product_id))
    ).filter(Boolean);

    let productsMap: Record<string, ProductRow> = {};

    if (productIds.length > 0) {
      const { data: productRows, error: productsError } = await supabase
        .from("products")
        .select("id, name, price")
        .eq("restaurant_id", restaurantId)
        .in("id", productIds);

      if (productsError) {
        setError(productsError.message);
        setLoading(false);
        return;
      }

      for (const product of (productRows ?? []) as ProductRow[]) {
        productsMap[product.id] = product;
      }
    }

    const itemIds = typedItems.map((item) => item.id);
    let links: ItemIngredientLink[] = [];
    let modifierRows: ItemModifierOptionRow[] = [];

    if (itemIds.length > 0) {
      const { data: linksData, error: linksError } = await supabase
        .from("order_item_ingredients")
        .select("order_item_id, ingredient_id")
        .in("order_item_id", itemIds);

      if (linksError) {
        setError(linksError.message);
        setLoading(false);
        return;
      }

      links = (linksData ?? []) as ItemIngredientLink[];

      const { data: modifiersData, error: modifiersError } = await supabase
        .from("order_item_modifier_options")
        .select("order_item_id, option_name, price")
        .eq("restaurant_id", restaurantId)
        .in("order_item_id", itemIds)
        .order("created_at", { ascending: true });

      if (modifiersError) {
        setError(modifiersError.message);
        setLoading(false);
        return;
      }

      modifierRows = (modifiersData ?? []) as ItemModifierOptionRow[];
    }

    const ingredientIds = Array.from(
      new Set(links.map((link) => link.ingredient_id))
    ).filter(Boolean);

    let ingredientsMap: Record<string, IngredientRow> = {};

    if (ingredientIds.length > 0) {
      const { data: ingredientRows, error: ingredientsError } = await supabase
        .from("ingredients")
        .select("id, name, price")
        .in("id", ingredientIds);

      if (ingredientsError) {
        setError(ingredientsError.message);
        setLoading(false);
        return;
      }

      for (const ingredient of (ingredientRows ?? []) as IngredientRow[]) {
        ingredientsMap[ingredient.id] = ingredient;
      }
    }

    const groupedIngredientIds: Record<string, string[]> = {};
    for (const link of links) {
      if (!groupedIngredientIds[link.order_item_id]) {
        groupedIngredientIds[link.order_item_id] = [];
      }
      groupedIngredientIds[link.order_item_id].push(link.ingredient_id);
    }

    const groupedModifiers: Record<string, { option_name: string; price: number }[]> = {};
    for (const modifier of modifierRows) {
      if (!groupedModifiers[modifier.order_item_id]) {
        groupedModifiers[modifier.order_item_id] = [];
      }

      groupedModifiers[modifier.order_item_id].push({
        option_name: modifier.option_name ?? "Opcion",
        price: Number(modifier.price ?? 0),
      });
    }

    // Solo setear statusDraft cuando:
    // - aún no hay statusDraft (primera carga), o
    // - el usuario NO está editando (statusDraft coincide con el último server status)
    const serverStatus = typedOrder.status ?? "";
    const lastServerStatus = lastServerStatusRef.current;
    const shouldSyncDraft =
      !statusDraft || statusDraft === lastServerStatus || statusDraft === serverStatus;

    lastServerStatusRef.current = serverStatus;

    setOrder(typedOrder);
    setItems(typedItems);
    setProductsById(productsMap);
    setIngredientsById(ingredientsMap);
    setIngredientIdsByItemId(groupedIngredientIds);
    setModifiersByItemId(groupedModifiers);

    if (shouldSyncDraft) {
      setStatusDraft(serverStatus);
    }

    setError(null);
    setLoading(false);
  }, [id, restaurantId, statusDraft]);

  useEffect(() => {
    setLoading(true);
    loadOrderData();
  }, [loadOrderData]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      loadOrderData();
    }, 10000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadOrderData]);

  const availableStatuses = useMemo<OrderStatus[]>(() => {
    const current = order?.status ?? "";
    if (!current) return STATUS_OPTIONS;
    if (STATUS_OPTIONS.includes(current)) return STATUS_OPTIONS;
    return isOrderStatus(current) ? [current, ...STATUS_OPTIONS] : STATUS_OPTIONS;
  }, [order?.status]);

  const ticketOrder = useMemo(() => {
    if (!order) {
      return null;
    }

    const deliverySnapshot = getDeliverySnapshot(order.notes);
    const itemRows = items.map((item) => {
      const product = productsById[item.product_id];
      const extras = (ingredientIdsByItemId[item.id] ?? []).map((ingredientId) => {
        const ingredient = ingredientsById[ingredientId];
        return {
          name: ingredient?.name ?? ingredientId,
          price: Number(ingredient?.price ?? 0),
        };
      });
      const modifiers = (modifiersByItemId[item.id] ?? []).map((modifier) => ({
        name: modifier.option_name,
        price: modifier.price,
      }));

      return {
        quantity: Number(item.qty ?? 1),
        name: product?.name ?? item.product_id,
        unitPrice: Number(item.unit_price ?? 0),
        extras,
        modifiers,
      };
    });

    const instructions =
      order.instructions ??
      deliverySnapshot?.instructions ??
      (typeof order.address_notes === "string" ? order.address_notes : null);

    return {
      id: order.id,
      createdAt: order.created_at ?? null,
      orderType: order.order_type ?? null,
      customerName: order.customer_name ?? null,
      customerPhone: order.customer_phone ?? null,
      address: {
        line: order.address_line ?? order.address_text ?? null,
        street: order.street ?? null,
        number: order.number ?? null,
        portal: order.portal ?? deliverySnapshot?.portal ?? null,
        floor: order.floor ?? deliverySnapshot?.floor ?? null,
        door: order.door ?? deliverySnapshot?.door ?? null,
        block: order.block ?? deliverySnapshot?.block ?? null,
        stair: order.stair ?? deliverySnapshot?.stair ?? null,
        notes: instructions,
      },
      items: itemRows,
      total: Number(order.total ?? 0),
    };
  }, [ingredientsById, ingredientIdsByItemId, items, modifiersByItemId, order, productsById]);

  const ticketPreviewHtml = useMemo(() => {
    if (!ticketOrder || !ticketPreviewMode) {
      return "";
    }

    return buildTicketHtml(ticketOrder, ticketPreviewMode);
  }, [ticketOrder, ticketPreviewMode]);

  const updateStatus = async () => {
    if (!canManage || !order || !statusDraft || updatingStatus) return;

    setUpdatingStatus(true);
    setError(null);

    const { error: updateError } = await supabase.rpc("set_order_status_safe", {
      p_order_id: order.id,
      p_status: statusDraft,
    });

    if (updateError) {
      setError(updateError.message);
    } else {
      setOrder({ ...order, status: statusDraft });
      lastServerStatusRef.current = statusDraft;
      await loadOrderData();
    }

    setUpdatingStatus(false);
  };

  const printTicket = async (mode: TicketMode) => {
    if (!order || printingMode) return;

    if (order.printed_at) {
      const ok = window.confirm("Ya se imprimio. ¿Reimprimir?");
      if (!ok) return;
    }

    setPrintingMode(mode);
    setPrintNotice(null);

    const result = await printOrder({
      orderId: order.id,
      restaurantId,
      mode,
      retryCount: 1,
    });

    if (!result.ok) {
      setPrintNotice(`Error al imprimir: ${result.errorMessage ?? "Error desconocido"}`);
    } else {
      setPrintNotice("Impreso OK");
    }

    await loadOrderData();
    setPrintingMode(null);
  };

  if (loading) {
    return <p style={{ padding: 20 }}>Cargando pedido...</p>;
  }

  if (error) {
    return (
      <section style={{ padding: 20 }}>
        <Link to={`${adminPath}/orders`}>Volver</Link>
        <p style={{ color: "crimson" }}>{error}</p>
      </section>
    );
  }

  if (!order) {
    return (
      <section style={{ padding: 20 }}>
        <Link to={`${adminPath}/orders`}>Volver</Link>
        <p>Pedido no encontrado.</p>
      </section>
    );
  }

  return (
    <section style={{ padding: 20, display: "grid", gap: 12 }}>
      <Link to={`${adminPath}/orders`}>Volver a pedidos</Link>

      <h1>Pedido #{order.id.slice(0, 8)}</h1>

      <div>
        <strong>Fecha:</strong>{" "}
        {order.created_at ? new Date(order.created_at).toLocaleString() : "-"}
      </div>
      <div>
        <strong>Cliente:</strong> {order.customer_name ?? "-"} (
        {order.customer_phone ?? "-"})
      </div>
      <div>
        <strong>Tipo:</strong> {order.order_type ?? "-"}
      </div>
      {order.order_type === "delivery" && (
        <div>
          <strong>Address line:</strong> {order.address_line ?? order.address_text ?? "-"}
        </div>
      )}
      {order.order_type === "delivery" && (() => {
        const deliverySnapshot = getDeliverySnapshot(order.notes);
        const isBuilding = Boolean(order.is_building ?? deliverySnapshot?.isBuilding);
        const portal = order.portal ?? deliverySnapshot?.portal ?? null;
        const floor = order.floor ?? deliverySnapshot?.floor ?? null;
        const door = order.door ?? deliverySnapshot?.door ?? null;
        const block = order.block ?? deliverySnapshot?.block ?? null;
        const stair = order.stair ?? deliverySnapshot?.stair ?? null;
        const hasBuilding =
          isBuilding && portal && floor && door;

        return hasBuilding ? (
          <div>
            <strong>Edificio:</strong> Portal {portal}, Piso {floor}, Puerta {door}
            {block ? `, Bloque ${block}` : ""}
            {stair ? `, Escalera ${stair}` : ""}
          </div>
        ) : null;
      })()}
      {order.order_type === "delivery" && (() => {
        const deliverySnapshot = getDeliverySnapshot(order.notes);
        const instructions =
          order.instructions ??
          deliverySnapshot?.instructions ??
          (typeof order.address_notes === "string" ? order.address_notes : null);

        return instructions ? (
          <div>
            <strong>Instrucciones:</strong> {instructions}
          </div>
        ) : null;
      })()}
      {order.order_type === "delivery" && typeof order.address_notes === "string" && order.address_notes && (
        <div>
          <strong>Notas:</strong> {String(order.address_notes)}
        </div>
      )}
      <div>
        <strong>Pago:</strong> {toPaymentMethodLabel(order.payment_method ?? null)}
        {order.payment_method === "cash" && (
          <>
            {" "}
            | <strong>Entrega:</strong> {currencyOrDash(order.cash_given)} |{" "}
            <strong>Cambio:</strong> {currencyOrDash(order.change_due)}
          </>
        )}
      </div>
      <div>
        <strong>Total:</strong> {currencyOrDash(order.total)}
      </div>
      <div>
        <strong>Impresiones:</strong> {Number(order.print_count ?? 0)} |{" "}
        <strong>Ultima impresion:</strong>{" "}
        {order.printed_at ? new Date(order.printed_at).toLocaleString() : "-"}
      </div>
      {order.last_print_error ? (
        <div style={{ color: "crimson" }}>
          <strong>Ultimo error impresion:</strong> {order.last_print_error}
        </div>
      ) : null}
      {printNotice ? (
        <div style={{ color: printNotice.includes("Error") ? "crimson" : "var(--brand-hover)" }}>
          {printNotice}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label htmlFor="status">Estado</label>
        <select
          id="status"
          value={statusDraft}
          onChange={(event) => {
            const value = event.target.value;
            setStatusDraft(isOrderStatus(value) ? value : "");
          }}
        >
          {availableStatuses.map((status) => (
            <option key={status} value={status}>
              {toStatusLabel(status)}
            </option>
          ))}
        </select>
        <button onClick={updateStatus} disabled={!canManage || updatingStatus || !statusDraft}>
          {updatingStatus ? "Guardando..." : "Actualizar"}
        </button>
        <button onClick={() => void printTicket("customer")} disabled={Boolean(printingMode)}>
          {printingMode === "customer" ? "Imprimiendo..." : "Imprimir"}
        </button>
        <button onClick={() => setTicketPreviewMode("kitchen")}>Ver ticket cocina</button>
        <button onClick={() => setTicketPreviewMode("customer")}>Ver ticket cliente</button>
        <button onClick={() => void printTicket("kitchen")} disabled={Boolean(printingMode)}>
          {printingMode === "kitchen" ? "Imprimiendo cocina..." : "Imprimir cocina"}
        </button>
        <button onClick={() => void printTicket("customer")} disabled={Boolean(printingMode)}>
          {printingMode === "customer" ? "Imprimiendo cliente..." : "Imprimir cliente"}
        </button>
      </div>

      {ticketPreviewMode && ticketOrder && (
        <section style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>Preview ticket ({ticketPreviewMode === "kitchen" ? "cocina" : "cliente"})</strong>
            <button onClick={() => setTicketPreviewMode(null)}>Cerrar preview</button>
          </div>
          <div
            style={{
              padding: 12,
              border: "1px solid #ccc",
              borderRadius: 8,
              background: "#fff",
              color: "#111",
            }}
            dangerouslySetInnerHTML={{ __html: ticketPreviewHtml }}
          />
        </section>
      )}

      <h2>Items</h2>
      {items.length === 0 ? (
        <p>Sin items.</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {items.map((item) => {
            const product = productsById[item.product_id];
            const productName = product?.name ?? item.product_id;
            const subtotal = Number(item.unit_price) * Number(item.qty);
            const ingredientNames = (ingredientIdsByItemId[item.id] ?? []).map(
              (ingredientId) => ingredientsById[ingredientId]?.name ?? ingredientId
            );
            const modifierOptions = modifiersByItemId[item.id] ?? [];

            return (
              <article
                key={item.id}
                style={{ border: "1px solid #ccc", borderRadius: 8, padding: 10 }}
              >
                <div>
                  <strong>{productName}</strong> x {item.qty}
                </div>
                <div>Unitario: {currency(item.unit_price)}</div>
                <div>Subtotal: {currency(subtotal)}</div>

                {ingredientNames.length > 0 && (
                  <div>
                    <strong>Extras:</strong>
                    <ul>
                      {ingredientNames.map((ingredientName, index) => (
                        <li key={`${item.id}-${index}`}>{ingredientName}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {modifierOptions.length > 0 && (
                  <div>
                    <div>Modificadores:</div>
                    <ul>
                      {modifierOptions.map((modifier, index) => (
                        <li key={`${item.id}-modifier-${index}`}>
                          {modifier.option_name}
                          {modifier.price > 0 ? ` (+${modifier.price}€)` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
