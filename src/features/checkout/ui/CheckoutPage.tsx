import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { canProceed, type CheckoutState } from "../checkoutValidation";
import { useCheckoutStore } from "../checkoutStore";
import { supabase } from "../../../lib/supabase";
import { useRestaurant } from "../../../restaurant/RestaurantContext";
import {
  getOrCreateCartSessionId,
  markCartRecovered,
  saveAbandonedCart,
} from "../services/abandonedCartService";
import StepCustomer from "./steps/StepCustomer";
import StepDelivery from "./steps/StepDelivery";
import StepPayment from "./steps/StepPayment";
import StepReview from "./steps/StepReviewPage";
import StepType from "./steps/StepType";

type CartExtra = {
  ingredientId: string;
  name: string;
  price: number;
};

type CartItem = {
  id: string;
  productId: string;
  name: string;
  qty: number;
  basePrice: number;
  unitPrice: number;
  extras: CartExtra[];
};

type CheckoutPageProps = {
  cart: CartItem[];
  cartTotal: number;
  onOrderSuccess: (orderId: string) => void;
  onOrderError: (message: string) => void;
  onClose?: () => void;
  restaurantClosed?: boolean;
  restaurantClosedMessage?: string;
  nextOpeningText?: string | null;
  contactPhone?: string | null;
};

const STEPS: Array<{ key: "customer" | "type" | "delivery" | "payment" | "review"; label: string }> = [
  { key: "customer", label: "Cliente" },
  { key: "type", label: "Tipo" },
  { key: "delivery", label: "Entrega" },
  { key: "payment", label: "Pago" },
  { key: "review", label: "Resumen" },
];

export default function CheckoutPage({
  cart,
  cartTotal,
  onOrderSuccess,
  onOrderError,
  onClose,
  restaurantClosed = false,
  restaurantClosedMessage = "No se pueden hacer pedidos porque el restaurante esta cerrado",
  nextOpeningText = null,
  contactPhone = null,
}: CheckoutPageProps) {
  const { restaurantId, menuPath } = useRestaurant();
  const step = useCheckoutStore((s) => s.step);
  const draft = useCheckoutStore((s) => s.draft);
  const next = useCheckoutStore((s) => s.next);
  const back = useCheckoutStore((s) => s.back);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isSubmitting] = useState(false);
  const [settings, setSettings] = useState<{
    min_order_subtotal?: number | null;
    free_delivery_over?: number | null;
    delivery_fee_mode?: string | null;
    delivery_fee_fixed?: number | null;
    delivery_fee_base?: number | null;
    delivery_fee_per_km?: number | null;
    delivery_fee_min?: number | null;
    delivery_fee_max?: number | null;
    is_accepting_orders?: boolean | null;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data } = await supabase
        .from("restaurant_settings")
        .select(
          "min_order_subtotal, free_delivery_over, delivery_fee_mode, delivery_fee_fixed, delivery_fee_base, delivery_fee_per_km, delivery_fee_min, delivery_fee_max, is_accepting_orders"
        )
        .eq("restaurant_id", restaurantId)
        .limit(1)
        .maybeSingle();
      if (!alive) return;
      setSettings(data ?? null);
    };
    void load();
    return () => {
      alive = false;
    };
  }, [restaurantId]);

  // Abandoned cart tracking
  const cartSessionId = useMemo(() => getOrCreateCartSessionId(), []);
  const lastSavedRef = useRef<string>("");

  useEffect(() => {
    const hasCustomerPhone = draft.customer.phone.trim().length > 0;
    if (!hasCustomerPhone || cart.length === 0) return;

    const payload = JSON.stringify({ cart, cartTotal, phone: draft.customer.phone });
    if (payload === lastSavedRef.current) return;
    lastSavedRef.current = payload;

    void saveAbandonedCart({
      restaurantId,
      sessionId: cartSessionId,
      customerName: draft.customer.name || undefined,
      customerPhone: draft.customer.phone || undefined,
      cart,
      cartTotal,
      orderType: draft.orderType,
    });
  }, [draft.customer.phone, draft.customer.name, draft.orderType, cart, cartTotal, restaurantId, cartSessionId]);

  useEffect(() => {
    const hasCustomerPhone = draft.customer.phone.trim().length > 0;
    if (!hasCustomerPhone || cart.length === 0) return;

    const intervalId = setInterval(() => {
      void saveAbandonedCart({
        restaurantId,
        sessionId: cartSessionId,
        customerName: draft.customer.name || undefined,
        customerPhone: draft.customer.phone || undefined,
        cart,
        cartTotal,
        orderType: draft.orderType,
      });
    }, 30_000);

    return () => clearInterval(intervalId);
  }, [draft.customer.phone, draft.customer.name, draft.orderType, cart, cartTotal, restaurantId, cartSessionId]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (cart.length === 0 || !draft.customer.phone.trim()) return;
      void saveAbandonedCart({
        restaurantId,
        sessionId: cartSessionId,
        customerName: draft.customer.name || undefined,
        customerPhone: draft.customer.phone || undefined,
        cart,
        cartTotal,
        orderType: draft.orderType,
      });
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [draft.customer.phone, draft.customer.name, draft.orderType, cart, cartTotal, restaurantId, cartSessionId]);

  const handleOrderSuccessWithRecovery = (orderId: string) => {
    void markCartRecovered(restaurantId, cartSessionId);
    onOrderSuccess(orderId);
  };

  const minOrderSubtotal = useMemo(() => {
    const value = Number(settings?.min_order_subtotal ?? 0);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }, [settings?.min_order_subtotal]);

  const freeDeliveryOver = useMemo(() => {
    const value = Number(settings?.free_delivery_over ?? 0);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }, [settings?.free_delivery_over]);

  const isBelowMinOrderSubtotal = useMemo(
    () => cartTotal < minOrderSubtotal,
    [cartTotal, minOrderSubtotal]
  );

  const isFreeDelivery = useMemo(
    () =>
      draft.orderType === "delivery" &&
      freeDeliveryOver > 0 &&
      cartTotal >= freeDeliveryOver,
    [cartTotal, draft.orderType, freeDeliveryOver]
  );

  const minOrderMessage = useMemo(() => {
    if (!isBelowMinOrderSubtotal) return null;
    const missing = Math.max(0, minOrderSubtotal - cartTotal);
    return `Pedido minimo: ${minOrderSubtotal.toFixed(2)} EUR. Te faltan ${missing.toFixed(
      2
    )} EUR para continuar.`;
  }, [cartTotal, isBelowMinOrderSubtotal, minOrderSubtotal]);

  const deliveryFee = useMemo(() => {
    if (draft.orderType !== "delivery") return 0;
    if (isFreeDelivery) return 0;
    const mode = String(settings?.delivery_fee_mode ?? "fixed");
    if (mode === "distance") {
      const distance = Number(draft.delivery?.distanceKm ?? 0);
      const base = Number(settings?.delivery_fee_base ?? 0);
      const perKm = Number(settings?.delivery_fee_per_km ?? 0);
      const min = settings?.delivery_fee_min === null || settings?.delivery_fee_min === undefined
        ? null
        : Number(settings.delivery_fee_min);
      const max = settings?.delivery_fee_max === null || settings?.delivery_fee_max === undefined
        ? null
        : Number(settings.delivery_fee_max);
      let fee = base + perKm * Math.max(0, distance);
      if (min !== null && Number.isFinite(min)) fee = Math.max(fee, min);
      if (max !== null && Number.isFinite(max)) fee = Math.min(fee, max);
      return Number.isFinite(fee) ? Math.max(0, fee) : 0;
    }
    const fixed = Number(settings?.delivery_fee_fixed ?? 0);
    return Number.isFinite(fixed) ? Math.max(0, fixed) : 0;
  }, [draft.delivery?.distanceKm, draft.orderType, isFreeDelivery, settings]);

  const totalFinal = useMemo(() => cartTotal + deliveryFee, [cartTotal, deliveryFee]);
  const cashGiven = draft.payment.method === "cash" ? Number(draft.payment.cashGiven ?? 0) : 0;
  const change = draft.payment.method === "cash" ? Math.max(0, cashGiven - totalFinal) : 0;

  const validation = useMemo(
    () => canProceed({ step, draft, cartTotal: totalFinal } as CheckoutState),
    [step, draft, totalFinal]
  );

  const primaryErrors = useMemo(() => Object.values(errors).slice(0, 2), [errors]);
  const bannerErrors = useMemo(() => {
    const currentErrors = Object.values(validation.errors);
    return Array.from(new Set(currentErrors)).slice(0, 2);
  }, [validation.errors]);
  const paymentLabel = useMemo(() => {
    if (draft.payment.method === "cash") return "Efectivo";
    if (draft.payment.method === "card_on_delivery") return "Tarjeta (datafono)";
    return "Tarjeta online (Stripe)";
  }, [draft.payment.method]);

  const handleNext = () => {
    if (isSubmitting) {
      return;
    }

    const result = canProceed({ step, draft, cartTotal: totalFinal });
    setErrors(result.errors);

    if (!result.ok) {
      const touchedFromErrors = Object.keys(result.errors).reduce<Record<string, boolean>>(
        (acc, key) => {
          acc[key] = true;
          return acc;
        },
        {}
      );
      setTouched((prev) => ({ ...prev, ...touchedFromErrors }));
      return;
    }

    next();
  };

  const isNotAccepting = settings !== null && settings.is_accepting_orders === false;
  const effectivelyClosed = restaurantClosed || isNotAccepting;
  const effectiveClosedMessage = isNotAccepting && !restaurantClosed
    ? "El restaurante no está aceptando pedidos en este momento."
    : restaurantClosedMessage;

  if (effectivelyClosed) {
    const phoneHref = contactPhone ? `tel:${contactPhone.replace(/\s+/g, "")}` : "";
    return (
      <section style={{ display: "grid", gap: 10 }}>
        <h2>Restaurante cerrado</h2>
        <p>{nextOpeningText ?? "Vuelve mas tarde"}</p>
        <div
          role="alert"
          style={{
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#991b1b",
            borderRadius: 10,
            padding: "10px 12px",
            fontSize: 14,
          }}
        >
          {effectiveClosedMessage}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link to={menuPath}>
            <button type="button">Volver al menu</button>
          </Link>
          {phoneHref ? (
            <a href={phoneHref}>
              <button type="button">Contactar</button>
            </a>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <h2>Checkout</h2>

      {bannerErrors.length > 0 && (
        <div style={{ color: "crimson" }}>
          {bannerErrors.map((message, index) => (
            <div key={`${message}-${index}`}>{message}</div>
          ))}
        </div>
      )}
      {minOrderMessage ? (
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
          {minOrderMessage}
        </div>
      ) : null}

      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 2,
          padding: 10,
          border: "1px solid rgba(255,255,255,0.2)",
          borderRadius: 10,
          background: "rgba(0,0,0,0.45)",
          display: "grid",
          gap: 4,
        }}
      >
        <strong>Resumen</strong>
        <div>Subtotal: {cartTotal.toFixed(2)} EUR</div>
        <div>
          Envio:{" "}
          {draft.orderType === "pickup"
            ? "0.00 EUR"
            : isFreeDelivery
            ? "Envío gratis (0.00 EUR)"
            : `${deliveryFee.toFixed(2)} EUR`}
        </div>
        <div>Total: {totalFinal.toFixed(2)} EUR</div>
        <div>Pago: {paymentLabel}</div>
        {draft.payment.method === "cash" && (
          <>
            <div>Pagas con: {cashGiven.toFixed(2)} EUR</div>
            <div>Cambio: {change.toFixed(2)} EUR</div>
          </>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 6 }}>
        {STEPS.map((item, index) => {
          const active = item.key === step;
          const disabledByType = draft.orderType === "pickup" && item.key === "delivery";

          return (
            <div
              key={item.key}
              style={{
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: 10,
                padding: "6px 8px",
                textAlign: "center",
                fontSize: 12,
                fontWeight: active ? 800 : 600,
                background: active ? "rgba(255,255,255,0.18)" : "transparent",
                opacity: disabledByType ? 0.5 : 1,
              }}
            >
              {index + 1}. {item.label}
            </div>
          );
        })}
      </div>

      {step === "customer" && (
        <StepCustomer
          onContinue={handleNext}
          disabledContinue={!validation.ok || isSubmitting}
          primaryErrors={touched.customerName || touched.customerPhone ? primaryErrors : []}
        />
      )}
      {step === "type" && (
        <StepType
          onContinue={handleNext}
          disabledContinue={!validation.ok || isSubmitting}
          primaryErrors={primaryErrors}
        />
      )}
      {step === "delivery" && (
        <StepDelivery
          onContinue={handleNext}
          disabledContinue={!validation.ok || isSubmitting}
          primaryErrors={primaryErrors}
        />
      )}
      {step === "payment" && (
        <StepPayment
          totalCarrito={cartTotal}
          cart={cart}
          onOrderError={onOrderError}
          onContinue={handleNext}
          disabledContinue={!validation.ok || isSubmitting}
          primaryErrors={touched.cashGiven ? primaryErrors : []}
        />
      )}
      {step === "review" && (
        <StepReview
          cart={cart}
          cartTotal={totalFinal}
          onOrderSuccess={handleOrderSuccessWithRecovery}
          onOrderError={onOrderError}
          onBack={back}
          onClose={onClose}
          externalBlockingMessage={minOrderMessage}
          forceDisableSubmit={isBelowMinOrderSubtotal}
        />
      )}

      {import.meta.env.DEV && <pre>{JSON.stringify(draft, null, 2)}</pre>}
    </section>
  );
}
