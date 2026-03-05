import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { useCheckoutStore } from "../../checkoutStore";
import { createOrderFromCheckout } from "../../services/orderService";
import { logEvent } from "../../../../lib/logging/logEvent";
import { supabase } from "../../../../lib/supabase";
import { useRestaurant } from "../../../../restaurant/RestaurantContext";

type CartExtra = {
  ingredientId: string;
};

type CartItem = {
  productId: string;
  qty: number;
  basePrice: number;
  unitPrice: number;
  extras: CartExtra[];
};

type Props = {
  cart: CartItem[];
  cartTotal: number;
  onOrderSuccess: (orderId: string) => void;
  onOrderError: (message: string) => void;
  onBack?: () => void;
  onClose?: () => void;
  externalBlockingMessage?: string | null;
  forceDisableSubmit?: boolean;
};

type RestaurantHourRow = {
  day_of_week: number;
  is_open: boolean;
  open_time: string | null;
  close_time: string | null;
};

const RESTAURANT_CLOSED_FRIENDLY = "Restaurante cerrado ahora. Vuelve en el proximo horario.";

function getFriendlyErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "No pudimos enviar tu pedido. Intentalo de nuevo.";
  }

  const maybeCode = String((error as { code?: unknown }).code ?? "");
  const rawMessage = String((error as { message?: unknown }).message ?? "");
  const rawDetails = String((error as { details?: unknown }).details ?? "");
  const rawHint = String((error as { hint?: unknown }).hint ?? "");
  const minDeliverySubtotalPattern = /MIN_DELIVERY_SUBTOTAL_NOT_MET:([0-9]+(?:[.,][0-9]+)?)/i;
  const minDeliverySubtotalMatch =
    rawMessage.match(minDeliverySubtotalPattern) ??
    rawDetails.match(minDeliverySubtotalPattern) ??
    rawHint.match(minDeliverySubtotalPattern);
  if (minDeliverySubtotalMatch) {
    const rawAmount = String(minDeliverySubtotalMatch[1] ?? "").trim().replace(",", ".");
    const parsedAmount = Number(rawAmount);
    const amountText = Number.isFinite(parsedAmount)
      ? parsedAmount.toFixed(2).replace(/\.00$/, "")
      : rawAmount;
    return `Pedido mínimo para envío: ${amountText} EUR. Añade más productos para continuar.`;
  }
  if (rawMessage.trim() && rawMessage.trim() !== "No se pudo crear el pedido.") {
    return rawMessage.trim();
  }
  if (rawDetails.trim()) {
    return rawDetails.trim();
  }
  if (rawHint.trim()) {
    return rawHint.trim();
  }
  const message = rawMessage.toLowerCase();
  const codeOrMessage = `${maybeCode} ${rawMessage}`.toUpperCase();
  if (codeOrMessage.includes("TOTAL_MISMATCH")) {
    return "TOTAL_MISMATCH";
  }
  if (codeOrMessage.includes("PRODUCT_INACTIVE")) {
    return "PRODUCT_INACTIVE";
  }
  if (codeOrMessage.includes("PRODUCT_NOT_FOUND")) {
    return "PRODUCT_NOT_FOUND";
  }

  if (codeOrMessage.includes("OUT_OF_DELIVERY_RADIUS")) {
    return "Fuera del radio de entrega";
  }

  if (codeOrMessage.includes("MIN_ORDER_NOT_REACHED")) {
    return "No llegas al pedido minimo";
  }

  if (codeOrMessage.includes("DELIVERY_GEO_MISSING")) {
    return "Selecciona una direccion valida";
  }

  if (codeOrMessage.includes("PAYMENT_NOT_ALLOWED")) {
    return "Metodo de pago no disponible";
  }

  if (codeOrMessage.includes("RESTAURANT_CLOSED")) {
    return RESTAURANT_CLOSED_FRIENDLY;
  }
  if (codeOrMessage.includes("RESTAURANT IS CLOSED")) {
    return RESTAURANT_CLOSED_FRIENDLY;
  }

  if (message.includes("carrito") || message.includes("vacio")) {
    return "Tu carrito esta vacio. Anade productos antes de finalizar.";
  }

  if (message.includes("telefono") || message.includes("nombre")) {
    return "Completa los datos del cliente antes de continuar.";
  }

  if (message.includes("direccion") || message.includes("radio")) {
    return "Revisa la direccion de entrega y valida que este dentro del radio.";
  }

  if (message.includes("cerrado")) {
    return "El restaurante esta cerrado en este momento.";
  }
  if (message.includes("restaurant is closed")) {
    return RESTAURANT_CLOSED_FRIENDLY;
  }

  if (message.includes("pedido minimo")) {
    return rawMessage;
  }

  if (message.includes("total_mismatch") || message.includes("precio ha cambiado")) {
    return "El precio ha cambiado. Actualiza y prueba otra vez.";
  }

  if (message.includes("no esta permitido")) {
    return rawMessage;
  }

  if (message.includes("efectivo") || message.includes("importe")) {
    return "Revisa el importe en efectivo. Debe cubrir el total del pedido.";
  }

  if (message.includes("client_order_key")) {
    return "Falta una migracion en base de datos para evitar pedidos duplicados.";
  }

  if (maybeCode === "42501") {
    return "No tienes permisos para realizar esta accion.";
  }

  if (maybeCode === "23503") {
    return "Hay un dato relacionado que no existe (producto o ingrediente).";
  }

  if (message.includes("failed to fetch") || message.includes("network")) {
    return "No hay conexion con el servidor. Revisa internet e intentalo de nuevo.";
  }

  if (rawMessage.trim()) {
    return rawMessage;
  }

  return "No pudimos enviar tu pedido. Intentalo de nuevo.";
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
    } else {
      if (nowMinutes >= open || nowMinutes < close) return true;
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

function getBlockingReason(errorMessage: string | null): string | null {
  const message = String(errorMessage ?? "").trim();
  if (!message) return null;
  const lower = message.toLowerCase();

  const blockingKeys = [
    "restaurante cerrado",
    "cerrado en este momento",
    "fuera del radio",
    "pedido minimo",
    "metodo de pago no disponible",
    "selecciona una direccion valida",
    "no esta permitido",
    "efectivo",
    "cash_given_required",
  ];

  if (blockingKeys.some((key) => lower.includes(key))) {
    return message;
  }

  return null;
}

function isRestaurantClosedError(error: unknown): boolean {
  const message = String((error as { message?: unknown } | null | undefined)?.message ?? "").toUpperCase();
  return message.includes("RESTAURANT_CLOSED") || message.includes("RESTAURANT IS CLOSED");
}

export default function StepReview({
  cart,
  cartTotal,
  onOrderSuccess,
  onOrderError,
  onBack,
  onClose,
  externalBlockingMessage = null,
  forceDisableSubmit = false,
}: Props) {
  const { restaurantId, menuPath } = useRestaurant();
  const draft = useCheckoutStore((s) => s.draft);
  const setPayment = useCheckoutStore((s) => s.setPayment);
  const setTip = useCheckoutStore((s) => s.setTip);
  const clientOrderKey = useCheckoutStore((s) => s.clientOrderKey);
  const back = useCheckoutStore((s) => s.back);
  const reset = useCheckoutStore((s) => s.reset);
  const regenerateOrderKey = useCheckoutStore((s) => s.regenerateOrderKey);
  const [customTip, setCustomTip] = useState("");

  // Loyalty state
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false);
  const [loyaltyPointsPerEur, setLoyaltyPointsPerEur] = useState(0);

  // Coupon state
  const [couponInput, setCouponInput] = useState("");
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [couponStatus, setCouponStatus] = useState<"idle" | "checking" | "applied" | "error">("idle");
  const [couponMessage, setCouponMessage] = useState<string | null>(null);

  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successOrderId, setSuccessOrderId] = useState<string | null>(null);
  const [isRestaurantClosed, setIsRestaurantClosed] = useState<boolean>(false);
  const [nextOpeningText, setNextOpeningText] = useState<string | null>(null);
  const [estMins, setEstMins] = useState<number | null>(null);

  const tipAmount = draft.tipAmount ?? 0;
  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.qty ?? 0) * Number(item.unitPrice ?? 0), 0),
    [cart]
  );
  const deliveryFee = useMemo(() => Math.max(0, cartTotal - subtotal), [cartTotal, subtotal]);
  const totalAfterDiscount = Math.max(0, cartTotal - discountAmount);
  const totalWithTip = totalAfterDiscount + tipAmount;
  const changeDue = useMemo(() => {
    if (draft.payment.method !== "cash") return 0;
    return Math.max(0, draft.payment.cashGiven - totalWithTip);
  }, [draft.payment, totalWithTip]);
  const blockingReason = useMemo(() => getBlockingReason(error), [error]);
  const checkoutErrorMessage = useMemo(() => {
    if (isRestaurantClosed) return null;
    if (externalBlockingMessage) return externalBlockingMessage;
    if (blockingReason) return blockingReason;
    if (error) return error;
    return null;
  }, [blockingReason, error, externalBlockingMessage, isRestaurantClosed]);

  useEffect(() => {
    let alive = true;

    const loadRestaurantData = async () => {
      const [hoursRes, settingsRes] = await Promise.all([
        supabase
          .from("restaurant_hours")
          .select("day_of_week,is_open,open_time,close_time")
          .eq("restaurant_id", restaurantId),
        supabase
          .from("restaurant_settings")
          .select("estimated_delivery_minutes,estimated_pickup_minutes,loyalty_enabled,loyalty_points_per_eur")
          .eq("restaurant_id", restaurantId)
          .maybeSingle(),
      ]);

      if (!alive) return;

      if (!hoursRes.error && Array.isArray(hoursRes.data)) {
        const rows = (hoursRes.data as RestaurantHourRow[]).filter(
          (row) => row.day_of_week >= 0 && row.day_of_week <= 6
        );
        const openNow = getIsOpenNow(rows);
        if (openNow !== null) {
          const closed = !openNow;
          setIsRestaurantClosed(closed);
          setNextOpeningText(closed ? getNextOpeningText(rows) : null);
        }
      }

      if (!settingsRes.error && settingsRes.data) {
        const s = settingsRes.data as {
          estimated_delivery_minutes?: number | null;
          estimated_pickup_minutes?: number | null;
          loyalty_enabled?: boolean | null;
          loyalty_points_per_eur?: number | null;
        };
        const mins =
          draft.orderType === "delivery"
            ? (s.estimated_delivery_minutes ?? 30)
            : (s.estimated_pickup_minutes ?? 15);
        setEstMins(mins);
        if (s.loyalty_enabled) {
          setLoyaltyEnabled(true);
          setLoyaltyPointsPerEur(Number(s.loyalty_points_per_eur ?? 10));
        }
      }
    };

    void loadRestaurantData();
    return () => {
      alive = false;
    };
  }, [restaurantId, draft.orderType]);

  const applyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;

    setCouponStatus("checking");
    setCouponMessage(null);

    const { data, error: err } = await supabase
      .from("coupons")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .eq("code", code)
      .eq("is_active", true)
      .maybeSingle();

    if (err || !data) {
      setCouponStatus("error");
      setCouponMessage("Código de descuento no válido.");
      setDiscountAmount(0);
      setCouponCode(null);
      return;
    }

    const coupon = data as {
      code: string;
      discount_type: "percent" | "fixed";
      discount_value: number;
      min_order_amount: number;
      max_uses: number | null;
      uses_count: number;
      valid_from: string | null;
      valid_until: string | null;
    };

    const now = new Date();
    if (coupon.valid_from && new Date(coupon.valid_from) > now) {
      setCouponStatus("error");
      setCouponMessage("Este cupón todavía no es válido.");
      setDiscountAmount(0);
      setCouponCode(null);
      return;
    }
    if (coupon.valid_until && new Date(coupon.valid_until) < now) {
      setCouponStatus("error");
      setCouponMessage("Este cupón ha caducado.");
      setDiscountAmount(0);
      setCouponCode(null);
      return;
    }
    if (coupon.max_uses !== null && coupon.uses_count >= coupon.max_uses) {
      setCouponStatus("error");
      setCouponMessage("Este cupón ha alcanzado el límite de usos.");
      setDiscountAmount(0);
      setCouponCode(null);
      return;
    }
    if (cartTotal < coupon.min_order_amount) {
      setCouponStatus("error");
      setCouponMessage(`Pedido mínimo para este cupón: ${coupon.min_order_amount.toFixed(2)} €.`);
      setDiscountAmount(0);
      setCouponCode(null);
      return;
    }

    const discount =
      coupon.discount_type === "percent"
        ? Math.min(cartTotal, (cartTotal * coupon.discount_value) / 100)
        : Math.min(cartTotal, coupon.discount_value);

    setCouponCode(code);
    setDiscountAmount(Math.round(discount * 100) / 100);
    setCouponStatus("applied");
    setCouponMessage(`¡Cupón aplicado! -${discount.toFixed(2)} €`);
  };

  const removeCoupon = () => {
    setCouponInput("");
    setCouponCode(null);
    setDiscountAmount(0);
    setCouponStatus("idle");
    setCouponMessage(null);
  };

  const onSubmit = async () => {
    const cartItems = cart;
    if (!cartItems || cartItems.length === 0) {
      setError("Tu carrito está vacío. Añade productos antes de continuar.");
      return;
    }

    if (submittingRef.current || successOrderId) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);

    try {
      const rawPaymentMethod = (draft.payment as { method?: string } | null | undefined)?.method;
      const paymentMethod = rawPaymentMethod ?? "cash";

      if (!rawPaymentMethod) {
        setPayment({
          method: "cash",
          cashGiven: draft.payment.method === "cash" ? draft.payment.cashGiven : 0,
        });
      }

      const draftForSubmit =
        paymentMethod === "cash"
          ? {
              ...draft,
              payment: {
                method: "cash" as const,
                cashGiven: draft.payment.method === "cash" ? draft.payment.cashGiven : 0,
              },
            }
          : {
              ...draft,
              payment:
                paymentMethod === "card_on_delivery"
                  ? { method: "card_on_delivery" as const }
                  : { method: "card_online" as const },
            };

      const result = await createOrderFromCheckout({
        draft: draftForSubmit,
        cart,
        cartTotal,
        clientOrderKey,
        restaurantId,
        couponCode: couponCode ?? undefined,
        discountAmount: discountAmount > 0 ? discountAmount : undefined,
        checkoutSummary: {
          subtotal,
          deliveryFee,
          total: totalWithTip,
        },
      });

      if (result.warningMessage) {
        setError(result.warningMessage);
        onOrderError(result.warningMessage);
      }

      setSuccessOrderId(result.orderId);
      onOrderSuccess(result.orderId);
      submittingRef.current = false;
      setSubmitting(false);

      return;
    } catch (submitError) {
      console.error(submitError);
      const message = getFriendlyErrorMessage(submitError);
      if (isRestaurantClosedError(submitError)) {
        setIsRestaurantClosed(true);
      }
      await logEvent("error", "checkout", "finalizar_pedido_error", {
        restaurantId,
        clientOrderKey,
        error: String((submitError as { message?: unknown })?.message ?? submitError),
      });
      setError(message);
      onOrderError(message);
      submittingRef.current = false;
      setSubmitting(false);
      return;
    }
  };

  const handleCloseSuccess = () => {
    reset();
    regenerateOrderKey();
    onClose?.();
  };

  const handleAnotherOrder = () => {
    reset();
    regenerateOrderKey();
    onClose?.();
  };

  const shortOrderId = successOrderId ? successOrderId.slice(0, 8).toUpperCase() : "";
  const paymentLabel =
    draft.payment.method === "cash"
      ? "Efectivo"
      : draft.payment.method === "card_on_delivery"
      ? "Tarjeta (datafono)"
      : "Tarjeta online (Stripe)";
  const formattedAddress =
    draft.orderType === "delivery"
      ? [
          draft.delivery?.addressText ?? "",
          draft.delivery?.portal ? `Portal ${draft.delivery.portal}` : "",
          draft.delivery?.floor ? `Piso ${draft.delivery.floor}` : "",
          draft.delivery?.door ? `Puerta ${draft.delivery.door}` : "",
        ]
          .filter(Boolean)
          .join(", ")
      : "";

  if (successOrderId) {
    return (
      <section style={{ display: "grid", gap: 10 }}>
        <h3>Pedido enviado</h3>
        <div>Te lo confirmamos en seguida</div>
        <div>Numero: #{shortOrderId}</div>
        <div>Estado: pending</div>
        <div>Tipo: {draft.orderType}</div>
        {estMins !== null && (
          <div>
            <strong>{draft.orderType === "delivery" ? "Entrega estimada:" : "Listo en:"}</strong>
            {" ~"}{estMins} min
          </div>
        )}
        <div>Pago: {paymentLabel}</div>
        {discountAmount > 0 && <div>Descuento ({couponCode}): -{discountAmount.toFixed(2)} EUR</div>}
        {tipAmount > 0 && <div>Propina: {tipAmount.toFixed(2)} EUR</div>}
        <div>Total: {totalWithTip.toFixed(2)} EUR</div>
        {loyaltyEnabled && loyaltyPointsPerEur > 0 && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "rgba(78,197,128,0.12)",
              border: "1px solid rgba(78,197,128,0.4)",
              borderRadius: 8,
              padding: "6px 12px",
              fontSize: 13,
              color: "var(--brand-hover, #2e8b57)",
              fontWeight: 600,
            }}
          >
            ★ Has ganado {Math.round(totalWithTip * loyaltyPointsPerEur)} puntos
          </div>
        )}
        {draft.orderType === "delivery" && <div>Direccion: {formattedAddress}</div>}
        {draft.orderType === "delivery" && typeof draft.delivery?.distanceKm === "number" && (
          <div>Distancia: {draft.delivery.distanceKm.toFixed(2)} km</div>
        )}
        {draft.payment.method === "cash" && (
          <div>
            <div>Pagas con: {draft.payment.cashGiven.toFixed(2)} EUR</div>
            <div>Cambio: {changeDue.toFixed(2)} EUR</div>
          </div>
        )}
        {successOrderId && (
          <Link
            to={`${menuPath}/pedido/${successOrderId}`}
            style={{ color: "var(--brand-hover, #2e8b57)", fontWeight: 600, textDecoration: "none" }}
          >
            Seguir tu pedido →
          </Link>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={handleCloseSuccess}>
            Cerrar
          </button>
          <button type="button" onClick={handleAnotherOrder}>
            Hacer otro pedido
          </button>
        </div>
      </section>
    );
  }

  return (
    <section style={{ display: "grid", gap: 10 }}>
      <h3>Resumen</h3>

      <div>
        <strong>Cliente:</strong> {draft.customer.name} ({draft.customer.phone})
      </div>

      <div>
        <strong>Tipo:</strong> {draft.orderType}
      </div>

      {estMins !== null && (
        <div>
          <strong>{draft.orderType === "delivery" ? "Entrega estimada:" : "Listo en:"}</strong>
          {" ~"}{estMins} min
        </div>
      )}

      {draft.orderType === "delivery" && draft.delivery && (
        <div>
          <div>
            <strong>Direccion:</strong> {draft.delivery.addressText}
          </div>
          {typeof draft.delivery.distanceKm === "number" && (
            <div>
              <strong>Distancia:</strong> {draft.delivery.distanceKm.toFixed(2)} km
            </div>
          )}
        </div>
      )}

      <div>
        <strong>Pago:</strong> {paymentLabel}
      </div>

      {draft.payment.method === "cash" && (
        <div>
          <div>
            <strong>Entrega:</strong> {draft.payment.cashGiven.toFixed(2)} EUR
          </div>
          <div>
            <strong>Cambio:</strong> {changeDue.toFixed(2)} EUR
          </div>
        </div>
      )}

      {/* Coupon */}
      <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 10, display: "grid", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>¿Tienes un código de descuento?</div>
        {couponStatus === "applied" ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(78,197,128,0.12)",
              border: "1px solid rgba(78,197,128,0.4)",
              borderRadius: 8,
              padding: "8px 12px",
            }}
          >
            <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--brand-hover, #2e8b57)", fontSize: 13 }}>
              {couponCode}
            </span>
            <span style={{ flex: 1, fontSize: 13, color: "var(--brand-hover, #2e8b57)" }}>
              {couponMessage}
            </span>
            <button
              type="button"
              onClick={removeCoupon}
              style={{
                border: "none",
                background: "transparent",
                color: "#6b7280",
                cursor: "pointer",
                fontSize: 16,
                lineHeight: 1,
                padding: "0 2px",
              }}
              aria-label="Quitar cupón"
            >
              ×
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 6 }}>
            <input
              type="text"
              value={couponInput}
              onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === "Enter") void applyCoupon(); }}
              placeholder="CÓDIGO"
              maxLength={30}
              style={{
                flex: 1,
                padding: "6px 10px",
                border: `1px solid ${couponStatus === "error" ? "#fca5a5" : "#d1d5db"}`,
                borderRadius: 8,
                fontSize: 13,
                fontFamily: "monospace",
                textTransform: "uppercase",
                background: "#fff",
                color: "#111827",
              }}
            />
            <button
              type="button"
              onClick={() => void applyCoupon()}
              disabled={couponStatus === "checking" || !couponInput.trim()}
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                border: "1px solid var(--brand-primary, #4ec580)",
                background: "var(--brand-primary, #4ec580)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {couponStatus === "checking" ? "..." : "Aplicar"}
            </button>
          </div>
        )}
        {couponStatus === "error" && couponMessage && (
          <div style={{ fontSize: 12, color: "#991b1b" }}>{couponMessage}</div>
        )}
      </div>

      {/* Tip selector */}
      <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 10, display: "grid", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>¿Quieres dejar propina?</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[0, 5, 10, 15].map((pct) => {
            const amt = pct === 0 ? 0 : Math.round(cartTotal * pct) / 100;
            const isSelected = pct === 0 ? tipAmount === 0 && customTip === "" : tipAmount === amt && customTip === "";
            return (
              <button
                key={pct}
                type="button"
                onClick={() => {
                  setTip(amt);
                  setCustomTip("");
                }}
                style={{
                  padding: "5px 12px",
                  borderRadius: 8,
                  border: `1px solid ${isSelected ? "var(--brand-primary, #4ec580)" : "#d1d5db"}`,
                  background: isSelected ? "var(--brand-primary-soft, rgba(78,197,128,0.14))" : "#fff",
                  color: isSelected ? "var(--brand-hover, #2e8b57)" : "#374151",
                  fontSize: 13,
                  fontWeight: isSelected ? 600 : 400,
                  cursor: "pointer",
                }}
              >
                {pct === 0 ? "Sin propina" : `${pct}% (${amt.toFixed(2)} €)`}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: "#6b7280" }}>Otra cantidad (€):</span>
          <input
            type="number"
            min={0}
            step={0.01}
            value={customTip}
            onChange={(e) => {
              setCustomTip(e.target.value);
              const val = parseFloat(e.target.value);
              setTip(Number.isFinite(val) && val >= 0 ? val : 0);
            }}
            style={{
              width: 80,
              padding: "4px 8px",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              fontSize: 13,
            }}
          />
        </div>
      </div>

      <div>
        <strong>Subtotal:</strong> {cartTotal.toFixed(2)} EUR
      </div>
      {discountAmount > 0 && (
        <div style={{ color: "var(--brand-hover, #2e8b57)", fontWeight: 600 }}>
          <strong>Descuento ({couponCode}):</strong> -{discountAmount.toFixed(2)} EUR
        </div>
      )}
      {tipAmount > 0 && (
        <div>
          <strong>Propina:</strong> {tipAmount.toFixed(2)} EUR
        </div>
      )}
      <div>
        <strong>Total:</strong> {totalWithTip.toFixed(2)} EUR
      </div>

      {loyaltyEnabled && loyaltyPointsPerEur > 0 && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "rgba(78,197,128,0.12)",
            border: "1px solid rgba(78,197,128,0.4)",
            borderRadius: 8,
            padding: "6px 12px",
            fontSize: 13,
            color: "var(--brand-hover, #2e8b57)",
            fontWeight: 600,
          }}
        >
          ★ Ganarás {Math.round(totalWithTip * loyaltyPointsPerEur)} puntos con este pedido
        </div>
      )}

      {checkoutErrorMessage ? (
        <div
          role="alert"
          style={{
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#991b1b",
            borderRadius: 10,
            padding: "10px 12px",
          }}
        >
          {checkoutErrorMessage}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onBack ?? back} disabled={submitting}>
          Atras
        </button>
        <button
          onClick={onSubmit}
          disabled={submitting || isRestaurantClosed || forceDisableSubmit || Boolean(blockingReason)}
        >
          {submitting ? "Enviando..." : "Finalizar pedido"}
        </button>
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
          }}
        >
          <strong>{RESTAURANT_CLOSED_FRIENDLY}</strong>
          {nextOpeningText ? <span>{nextOpeningText}</span> : null}
        </div>
      ) : null}
    </section>
  );
}
