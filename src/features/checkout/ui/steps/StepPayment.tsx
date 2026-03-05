import { useEffect, useMemo, useState } from "react";

import { useCheckoutStore } from "../../checkoutStore";
import { createOrderFromCheckout } from "../../services/orderService";
import { supabase } from "../../../../lib/supabase";
import { logEvent } from "../../../../lib/logging/logEvent";
import type { CartItem } from "../../types";
import { useRestaurant } from "../../../../restaurant/RestaurantContext";

type Props = {
  totalCarrito: number;
  cart: CartItem[];
  onOrderError: (message: string) => void;
  onContinue?: () => void;
  disabledContinue?: boolean;
  primaryErrors?: string[];
};

type PaymentSettings = {
  allow_cash?: boolean | null;
  allow_card?: boolean | null;
  delivery_fee_mode?: string | null;
  delivery_fee_fixed?: number | null;
  delivery_fee_per_km?: number | null;
};

const RESTAURANT_CLOSED_FRIENDLY = "Restaurante cerrado ahora. Vuelve en el proximo horario.";

const VALID_PAYMENT_METHODS = new Set(["cash", "card_on_delivery", "card_online"]);

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function StepPayment({
  totalCarrito,
  cart,
  onOrderError,
  onContinue,
  disabledContinue = false,
  primaryErrors = [],
}: Props) {
  const { restaurantId, slug } = useRestaurant();
  const draft = useCheckoutStore((s) => s.draft);
  const clientOrderKey = useCheckoutStore((s) => s.clientOrderKey);
  const payment = useCheckoutStore((s) => s.draft.payment);
  const setPayment = useCheckoutStore((s) => s.setPayment);
  const next = useCheckoutStore((s) => s.next);
  const back = useCheckoutStore((s) => s.back);
  const [processingCard, setProcessingCard] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [restaurantClosedByBackend, setRestaurantClosedByBackend] = useState(false);
  const stripeEnabled = import.meta.env.VITE_STRIPE_ENABLED === "true";

  const rawPaymentMethod = (payment as { method?: string } | null | undefined)?.method;
  const paymentMethod = VALID_PAYMENT_METHODS.has(String(rawPaymentMethod))
    ? (rawPaymentMethod as "cash" | "card_on_delivery" | "card_online")
    : "cash";
  const cashGiven = payment.method === "cash" ? payment.cashGiven : 0;
  const distanceKm = Number(draft.delivery?.distanceKm ?? 0);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoadingSettings(true);
      const byRestaurant = await supabase
        .from("restaurant_settings")
        .select(
          "allow_cash, allow_card, delivery_fee_mode, delivery_fee_fixed, delivery_fee_per_km"
        )
        .eq("restaurant_id", restaurantId)
        .limit(1)
        .maybeSingle();

      if (!alive) return;

      let row: PaymentSettings | null = null;
      if (byRestaurant.error) {
        console.error(byRestaurant.error);
        await logEvent("error", "checkout", "load_payment_settings_error", {
          restaurantId,
          error: byRestaurant.error.message,
        });
        setSettingsError(`No se pudieron cargar ajustes de pago: ${byRestaurant.error.message}`);
        setLoadingSettings(false);
        return;
      }
      row = (byRestaurant.data as PaymentSettings | null) ?? null;

      setSettings(row);
      setSettingsError(null);
      setLoadingSettings(false);
    };

    void load();
    return () => {
      alive = false;
    };
  }, [restaurantId]);

  const estimatedDeliveryFee = useMemo(() => {
    if (draft.orderType !== "delivery") {
      return 0;
    }
    if (!settings) {
      return 0;
    }

    const mode = String(settings.delivery_fee_mode ?? "fixed");
    if (mode === "distance") {
      const perKm = toNumber(settings.delivery_fee_per_km, 0);
      return Math.max(0, perKm * Math.max(0, distanceKm));
    }

    return Math.max(0, toNumber(settings.delivery_fee_fixed, 0));
  }, [distanceKm, draft.orderType, settings]);

  const estimatedTotal = useMemo(() => totalCarrito + estimatedDeliveryFee, [estimatedDeliveryFee, totalCarrito]);
  const cashAllowed = settings?.allow_cash !== false;
  const cardAllowed = settings?.allow_card !== false;

  const status = useMemo(() => {
    if (paymentMethod !== "cash") {
      return null;
    }

    if (!(cashGiven > 0)) {
      return { kind: "error" as const, text: "Introduce un importe mayor que 0" };
    }

    if (cashGiven < estimatedTotal) {
      return {
        kind: "error" as const,
        text: `Faltan ${(estimatedTotal - cashGiven).toFixed(2)} EUR`,
      };
    }

    return {
      kind: "ok" as const,
      text: `Cambio: ${(cashGiven - estimatedTotal).toFixed(2)} EUR`,
    };
  }, [estimatedTotal, paymentMethod, cashGiven]);

  useEffect(() => {
    if (!rawPaymentMethod) {
      setPayment({ method: "cash", cashGiven: cashGiven > 0 ? cashGiven : 0 });
    }
  }, [cashGiven, rawPaymentMethod, setPayment]);

  useEffect(() => {
    if (draft.orderType === "pickup" && paymentMethod === "card_on_delivery") {
      setPayment({ method: "cash", cashGiven: cashGiven > 0 ? cashGiven : 0 });
    }
  }, [cashGiven, draft.orderType, paymentMethod, setPayment]);

  const canContinue =
    (paymentMethod === "cash" && cashAllowed && cashGiven > 0 && cashGiven >= estimatedTotal) ||
    (paymentMethod === "card_on_delivery" && draft.orderType === "delivery" && cardAllowed) ||
    (paymentMethod === "card_online" && cardAllowed && stripeEnabled);

  const handleContinue = () => {
    if (onContinue) {
      onContinue();
      return;
    }

    next();
  };

  const handleStripeCheckout = async () => {
    const cartItems = cart;
    if (!cartItems || cartItems.length === 0) {
      alert("No puedes crear un pedido vacio");
      return;
    }

    if (processingCard) {
      return;
    }

    if (paymentMethod !== "card_online" || !stripeEnabled) {
      return;
    }

    setProcessingCard(true);
    setCardError(null);
    setRestaurantClosedByBackend(false);

    try {
      const orderResult = await createOrderFromCheckout({
        draft,
        cart,
        cartTotal: totalCarrito,
        clientOrderKey,
        restaurantId,
        checkoutSummary: {
          subtotal: totalCarrito,
          deliveryFee: estimatedDeliveryFee,
          total: estimatedTotal,
        },
      });

      const { data, error } = await supabase.functions.invoke("create-stripe-session", {
        body: { order_id: orderResult.orderId, slug },
      });

      if (error) {
        throw new Error(error.message);
      }

      const url = String((data as { url?: unknown })?.url ?? "");
      if (!url) {
        throw new Error("No se recibio URL de Stripe Checkout.");
      }

      window.location.assign(url);
      return;
    } catch (checkoutError) {
      console.error(checkoutError);
      const rawMessage = String(
        (checkoutError as { message?: unknown })?.message ??
          "No se pudo iniciar el pago con tarjeta."
      );
      const normalized = rawMessage.toUpperCase();
      const isClosed = normalized.includes("RESTAURANT_CLOSED") || normalized.includes("RESTAURANT IS CLOSED");
      const message = isClosed ? RESTAURANT_CLOSED_FRIENDLY : rawMessage;
      if (isClosed) {
        setRestaurantClosedByBackend(true);
      }
      await logEvent("error", "checkout", "stripe_checkout_error", {
        restaurantId,
        clientOrderKey,
        error: message,
      });
      setCardError(message);
      onOrderError(message);
      setProcessingCard(false);
      return;
    }
  };

  return (
    <section style={{ display: "grid", gap: 10 }}>
      <p>Selecciona metodo de pago</p>

      <div style={{ display: "grid", gap: 8 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="radio"
            name="paymentMethod"
            checked={paymentMethod === "cash"}
            disabled={!cashAllowed}
            onChange={() =>
              setPayment({
                method: "cash",
                cashGiven: paymentMethod === "cash" ? cashGiven : 0,
              })
            }
          />
          <span>Efectivo</span>
        </label>

        {draft.orderType === "delivery" && (
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="radio"
              name="paymentMethod"
              checked={paymentMethod === "card_on_delivery"}
              disabled={!cardAllowed}
              onChange={() => setPayment({ method: "card_on_delivery" })}
            />
            <span>Tarjeta al repartidor (datafono)</span>
          </label>
        )}

        <label style={{ display: "flex", gap: 8, alignItems: "center", opacity: stripeEnabled ? 1 : 0.65 }}>
          <input
            type="radio"
            name="paymentMethod"
            checked={paymentMethod === "card_online"}
            disabled={!cardAllowed || !stripeEnabled}
            onChange={() => setPayment({ method: "card_online" })}
          />
          <span>
            Tarjeta online (Stripe)
            {!stripeEnabled ? " - Proximamente" : ""}
          </span>
        </label>
      </div>

      {paymentMethod === "cash" && (
        <div style={{ display: "grid", gap: 6 }}>
          <label htmlFor="cash-given">Con cuanto pagas</label>
          <input
            id="cash-given"
            type="number"
            min={0}
            step="0.01"
            value={Number.isFinite(cashGiven) ? cashGiven : 0}
            onChange={(event) =>
              setPayment({
                method: "cash",
                cashGiven: Number(event.target.value),
              })
            }
          />

          {status && (
            <p style={{ color: status.kind === "error" ? "crimson" : "var(--brand-hover)" }}>{status.text}</p>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={back}>Atras</button>
        <button
          onClick={handleContinue}
          disabled={
            !canContinue ||
            disabledContinue ||
            paymentMethod === "card_online" ||
            processingCard ||
            loadingSettings
          }
        >
          Continuar
        </button>
      </div>

      {paymentMethod === "card_online" && stripeEnabled && (
        <button
          type="button"
          onClick={handleStripeCheckout}
          disabled={processingCard || !cardAllowed || loadingSettings || restaurantClosedByBackend}
        >
          {processingCard ? "Redirigiendo..." : "Pagar con tarjeta"}
        </button>
      )}

      {cardError && <p style={{ color: "crimson" }}>{cardError}</p>}
      {settingsError && <p style={{ color: "crimson" }}>{settingsError}</p>}
      {!cashAllowed && <p style={{ color: "crimson" }}>Pago en efectivo no disponible.</p>}
      {!cardAllowed && <p style={{ color: "crimson" }}>Pago con tarjeta no disponible.</p>}
      {paymentMethod === "card_online" && !stripeEnabled && (
        <p style={{ color: "crimson" }}>Tarjeta online disponible proximamente.</p>
      )}
      {draft.orderType === "delivery" && (
        <p>
          Total estimado con envio: {estimatedTotal.toFixed(2)} EUR
        </p>
      )}

      {primaryErrors.length > 0 && (
        <div style={{ color: "crimson" }}>
          {primaryErrors.map((message, index) => (
            <div key={`${message}-${index}`}>{message}</div>
          ))}
        </div>
      )}
    </section>
  );
}
