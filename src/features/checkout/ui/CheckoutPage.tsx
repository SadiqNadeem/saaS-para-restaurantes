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
  const paymentLabel = useMemo(() => {
    if (draft.payment.method === "cash") return "Efectivo";
    if (draft.payment.method === "card_on_delivery") return "Tarjeta (datafono)";
    if (draft.payment.method === "stripe_online" || draft.payment.method === "card_online") {
      return "Tarjeta online (Stripe)";
    }
    return "Tarjeta online (Stripe)";
  }, [draft.payment.method]);
  const activeStepIndex = useMemo(
    () => Math.max(0, STEPS.findIndex((item) => item.key === step)),
    [step]
  );

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
    <section style={{ display: "grid", gap: 14 }}>
      <h2 style={{ margin: 0, fontSize: 22, color: "#e2e8f0" }}>Checkout</h2>

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
          padding: 12,
          border: "1px solid rgba(148,163,184,0.28)",
          borderRadius: 14,
          background: "rgba(15,23,42,0.76)",
          display: "grid",
          gap: 10,
          boxShadow: "0 12px 28px rgba(2,6,23,0.28)",
        }}
      >
        <strong style={{ fontSize: 14, color: "#e2e8f0" }}>Resumen</strong>
        <div style={{ display: "grid", gap: 7, fontSize: 13 }}>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#cbd5e1" }}>
            <span>Subtotal</span>
            <span style={{ fontWeight: 700 }}>{cartTotal.toFixed(2)} EUR</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#cbd5e1" }}>
            <span>Envio</span>
            <span style={{ fontWeight: 700 }}>
              {draft.orderType === "pickup"
                ? "0.00 EUR"
                : isFreeDelivery
                ? "Envio gratis"
                : `${deliveryFee.toFixed(2)} EUR`}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#cbd5e1" }}>
            <span>Pago</span>
            <span style={{ fontWeight: 700 }}>{paymentLabel}</span>
          </div>
          {draft.payment.method === "cash" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#cbd5e1" }}>
                <span>Pagas con</span>
                <span style={{ fontWeight: 700 }}>{cashGiven.toFixed(2)} EUR</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#cbd5e1" }}>
                <span>Cambio</span>
                <span style={{ fontWeight: 700, color: "#86efac" }}>{change.toFixed(2)} EUR</span>
              </div>
            </>
          )}
        </div>
        <div
          style={{
            borderTop: "1px solid rgba(148,163,184,0.26)",
            paddingTop: 9,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 13, color: "#cbd5e1" }}>Total final</span>
          <span style={{ fontSize: 20, fontWeight: 900, color: "#f8fafc" }}>
            {totalFinal.toFixed(2)} EUR
          </span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 8 }}>
        {STEPS.map((item, index) => {
          const active = item.key === step;
          const disabledByType = draft.orderType === "pickup" && item.key === "delivery";
          const completed = !disabledByType && index < activeStepIndex;

          return (
            <div
              key={item.key}
              style={{
                border: `1px solid ${
                  active
                    ? "rgba(78,197,128,0.5)"
                    : completed
                    ? "rgba(96,165,250,0.45)"
                    : "rgba(148,163,184,0.3)"
                }`,
                borderRadius: 12,
                padding: "7px 8px",
                textAlign: "center",
                fontSize: 12,
                fontWeight: active ? 800 : 700,
                background: active
                  ? "rgba(78,197,128,0.2)"
                  : completed
                  ? "rgba(59,130,246,0.15)"
                  : "rgba(15,23,42,0.45)",
                color: disabledByType ? "rgba(148,163,184,0.7)" : "#e2e8f0",
                opacity: disabledByType ? 0.58 : 1,
                boxShadow: active ? "0 8px 18px rgba(78,197,128,0.2)" : "none",
                display: "grid",
                gap: 3,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 800 }}>
                {completed ? "OK" : index + 1}
              </span>
              <span>{item.label}</span>
            </div>
          );
        })}
      </div>

      {step === "customer" && (
        <StepCustomer
          onContinue={handleNext}
          disabledContinue={isSubmitting}
          primaryErrors={[]}
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

    </section>
  );
}

