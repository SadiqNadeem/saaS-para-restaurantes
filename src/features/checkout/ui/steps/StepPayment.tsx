import { useEffect, useMemo, useState } from "react";

import { useCheckoutStore } from "../../checkoutStore";
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

type StripeRestaurantConfig = {
  stripe_connected?: boolean | null;
  stripe_charges_enabled?: boolean | null;
  online_payment_enabled?: boolean | null;
};

type OnlineAvailabilityState = {
  loading: boolean;
  visible: boolean;
  enabled: boolean;
  unavailableReason: string | null;
  configError: string | null;
};

const RESTAURANT_CLOSED_FRIENDLY = "Restaurante cerrado ahora. Vuelve en el proximo horario.";
const STRIPE_PLATFORM_ENABLED =
  import.meta.env.VITE_STRIPE_ENABLED === "true" &&
  String(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "").trim().length > 0;

const VALID_PAYMENT_METHODS = new Set(["cash", "card_on_delivery", "stripe_online", "card_online"]);

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isMissingColumnError(message: string | undefined): boolean {
  return String(message ?? "").toLowerCase().includes("column");
}

export default function StepPayment({
  totalCarrito,
  cart,
  onOrderError,
  onContinue,
  disabledContinue = false,
  primaryErrors = [],
}: Props) {
  const { restaurantId } = useRestaurant();
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
  const [cashFocused, setCashFocused] = useState(false);
  const [onlineAvailability, setOnlineAvailability] = useState<OnlineAvailabilityState>({
    loading: true,
    visible: false,
    enabled: false,
    unavailableReason: null,
    configError: null,
  });

  const rawPaymentMethod = (payment as { method?: string } | null | undefined)?.method;
  const paymentMethod = VALID_PAYMENT_METHODS.has(String(rawPaymentMethod))
    ? (rawPaymentMethod as "cash" | "card_on_delivery" | "stripe_online" | "card_online")
    : "cash";
  const selectedPaymentMethod = paymentMethod === "card_online" ? "stripe_online" : paymentMethod;
  const cashGiven = payment.method === "cash" ? payment.cashGiven : 0;
  const distanceKm = Number(draft.delivery?.distanceKm ?? 0);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoadingSettings(true);
      setOnlineAvailability((prev) => ({ ...prev, loading: true }));

      const [byRestaurantSettings, byRestaurantStripe] = await Promise.all([
        supabase
          .from("restaurant_settings")
          .select(
            "allow_cash, allow_card, delivery_fee_mode, delivery_fee_fixed, delivery_fee_per_km"
          )
          .eq("restaurant_id", restaurantId)
          .limit(1)
          .maybeSingle(),
        supabase
          .from("restaurants")
          .select("stripe_connected, stripe_charges_enabled, online_payment_enabled")
          .eq("id", restaurantId)
          .limit(1)
          .maybeSingle<StripeRestaurantConfig>(),
      ]);

      if (!alive) return;

      if (byRestaurantSettings.error) {
        console.error(byRestaurantSettings.error);
        await logEvent("error", "checkout", "load_payment_settings_error", {
          restaurantId,
          error: byRestaurantSettings.error.message,
        });
        setSettingsError(`No se pudieron cargar ajustes de pago: ${byRestaurantSettings.error.message}`);
        setLoadingSettings(false);
        setOnlineAvailability({
          loading: false,
          visible: false,
          enabled: false,
          unavailableReason: null,
          configError: null,
        });
        return;
      }

      const row = (byRestaurantSettings.data as PaymentSettings | null) ?? null;
      setSettings(row);
      setSettingsError(null);
      setLoadingSettings(false);

      if (byRestaurantStripe.error) {
        if (isMissingColumnError(byRestaurantStripe.error.message)) {
          setOnlineAvailability({
            loading: false,
            visible: false,
            enabled: false,
            unavailableReason: "Pago online aun no disponible en este entorno.",
            configError: null,
          });
        } else {
          setOnlineAvailability({
            loading: false,
            visible: false,
            enabled: false,
            unavailableReason: null,
            configError: `Error de configuracion Stripe: ${byRestaurantStripe.error.message}`,
          });
        }
        return;
      }

      const stripe = byRestaurantStripe.data ?? {};
      const stripeConnected = stripe.stripe_connected === true;
      const stripeChargesEnabled = stripe.stripe_charges_enabled === true;
      const onlinePaymentEnabled = stripe.online_payment_enabled === true;
      const restaurantStripeReady = stripeConnected && stripeChargesEnabled && onlinePaymentEnabled;

      if (!restaurantStripeReady) {
        setOnlineAvailability({
          loading: false,
          visible: false,
          enabled: false,
          unavailableReason: "Pago online no disponible para este restaurante.",
          configError: null,
        });
        return;
      }

      if (!STRIPE_PLATFORM_ENABLED) {
        setOnlineAvailability({
          loading: false,
          visible: true,
          enabled: false,
          unavailableReason: "Pago online aun no disponible.",
          configError: null,
        });
        return;
      }

      setOnlineAvailability({
        loading: false,
        visible: true,
        enabled: true,
        unavailableReason: null,
        configError: null,
      });
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
  const stripeOptionEnabled = onlineAvailability.enabled && cardAllowed;

  const status = useMemo(() => {
    if (selectedPaymentMethod !== "cash") {
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
  }, [estimatedTotal, selectedPaymentMethod, cashGiven]);

  useEffect(() => {
    if (!rawPaymentMethod) {
      setPayment({ method: "cash", cashGiven: cashGiven > 0 ? cashGiven : 0 });
    }
  }, [cashGiven, rawPaymentMethod, setPayment]);

  useEffect(() => {
    if (draft.orderType === "pickup" && selectedPaymentMethod === "card_on_delivery") {
      setPayment({ method: "cash", cashGiven: cashGiven > 0 ? cashGiven : 0 });
    }
  }, [cashGiven, draft.orderType, selectedPaymentMethod, setPayment]);

  useEffect(() => {
    if (selectedPaymentMethod === "stripe_online" && !stripeOptionEnabled) {
      setPayment({ method: "cash", cashGiven: cashGiven > 0 ? cashGiven : 0 });
    }
  }, [cashGiven, selectedPaymentMethod, setPayment, stripeOptionEnabled]);

  const canContinue =
    (selectedPaymentMethod === "cash" && cashAllowed && cashGiven > 0 && cashGiven >= estimatedTotal) ||
    (selectedPaymentMethod === "card_on_delivery" && draft.orderType === "delivery" && cardAllowed);

  const handleContinue = () => {
    if (onContinue) {
      onContinue();
      return;
    }

    next();
  };

  const handleStripeCheckout = async () => {
    if (!cart || cart.length === 0) {
      setCardError("No puedes crear un pedido vacio");
      return;
    }

    if (processingCard) {
      return;
    }

    if (selectedPaymentMethod !== "stripe_online") {
      return;
    }

    if (!stripeOptionEnabled) {
      const unavailableMessage = onlineAvailability.unavailableReason ?? "Pago online aun no disponible";
      setCardError(unavailableMessage);
      onOrderError(unavailableMessage);
      return;
    }

    setProcessingCard(true);
    setCardError(null);
    setRestaurantClosedByBackend(false);

    try {
      const pendingMessage = "Pago online aun no disponible";
      await logEvent("info", "checkout", "stripe_online_pending_integration", {
        restaurantId,
        clientOrderKey,
      });
      setCardError(pendingMessage);
      onOrderError(pendingMessage);
      setProcessingCard(false);
      return;
    } catch (checkoutError) {
      console.error(checkoutError);
      const rawMessage = String(
        (checkoutError as { message?: unknown })?.message ??
          "No se pudo iniciar el pago online."
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
            checked={selectedPaymentMethod === "cash"}
            disabled={!cashAllowed}
            onChange={() =>
              setPayment({
                method: "cash",
                cashGiven: selectedPaymentMethod === "cash" ? cashGiven : 0,
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
              checked={selectedPaymentMethod === "card_on_delivery"}
              disabled={!cardAllowed}
              onChange={() => setPayment({ method: "card_on_delivery" })}
            />
            <span>Tarjeta al repartidor (datafono)</span>
          </label>
        )}

        {onlineAvailability.visible && (
          <label
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              opacity: stripeOptionEnabled ? 1 : 0.65,
            }}
          >
            <input
              type="radio"
              name="paymentMethod"
              checked={selectedPaymentMethod === "stripe_online"}
              disabled={!stripeOptionEnabled}
              onChange={() => setPayment({ method: "stripe_online" })}
            />
            <span>Pago online (Stripe)</span>
          </label>
        )}
      </div>

      {selectedPaymentMethod === "cash" && (
        <div style={{ display: "grid", gap: 6 }}>
          <label
            htmlFor="cash-given"
            style={{ fontSize: 13, fontWeight: 700, color: "#cbd5e1" }}
          >
            Con cuanto pagas
          </label>
          <input
            id="cash-given"
            type="number"
            min={0}
            step="0.01"
            value={Number.isFinite(cashGiven) ? cashGiven : 0}
            onFocus={() => setCashFocused(true)}
            onBlur={() => setCashFocused(false)}
            onChange={(event) =>
              setPayment({
                method: "cash",
                cashGiven: Number(event.target.value),
              })
            }
            style={{
              height: 44,
              borderRadius: 12,
              border: cashFocused
                ? "1px solid var(--brand-primary)"
                : "1px solid rgba(148,163,184,0.42)",
              background: "rgba(15,23,42,0.55)",
              color: "#f8fafc",
              padding: "0 12px",
              outline: "none",
              boxShadow: cashFocused ? "0 0 0 3px rgba(78,197,128,0.22)" : "none",
            }}
          />

          {status && (
            <p
              style={{
                margin: 0,
                color: status.kind === "error" ? "#fecaca" : "#86efac",
                border:
                  status.kind === "error"
                    ? "1px solid rgba(248,113,113,0.35)"
                    : "1px solid rgba(74,222,128,0.32)",
                background:
                  status.kind === "error"
                    ? "rgba(127,29,29,0.22)"
                    : "rgba(6,95,70,0.2)",
                borderRadius: 9,
                padding: "7px 9px",
                fontSize: 13,
              }}
            >
              {status.text}
            </p>
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
            processingCard ||
            loadingSettings
          }
        >
          Continuar
        </button>
      </div>

      {selectedPaymentMethod === "stripe_online" && onlineAvailability.visible && (
        <button
          type="button"
          onClick={handleStripeCheckout}
          disabled={processingCard || !stripeOptionEnabled || loadingSettings || restaurantClosedByBackend}
        >
          {processingCard ? "Procesando..." : "Pagar online"}
        </button>
      )}

      {cardError && (
        <p style={{ color: "#fecaca", background: "rgba(127,29,29,0.22)", border: "1px solid rgba(248,113,113,0.35)", borderRadius: 9, padding: "7px 9px", margin: 0 }}>
          {cardError}
        </p>
      )}
      {settingsError && (
        <p style={{ color: "#fecaca", background: "rgba(127,29,29,0.22)", border: "1px solid rgba(248,113,113,0.35)", borderRadius: 9, padding: "7px 9px", margin: 0 }}>
          {settingsError}
        </p>
      )}
      {onlineAvailability.loading && (
        <p style={{ color: "#cbd5e1", margin: 0 }}>
          Cargando disponibilidad de pago online...
        </p>
      )}
      {onlineAvailability.configError && (
        <p style={{ color: "#fecaca", background: "rgba(127,29,29,0.22)", border: "1px solid rgba(248,113,113,0.35)", borderRadius: 9, padding: "7px 9px", margin: 0 }}>
          {onlineAvailability.configError}
        </p>
      )}
      {!onlineAvailability.loading && onlineAvailability.unavailableReason && (
        <p style={{ color: "#fde68a", background: "rgba(120,53,15,0.25)", border: "1px solid rgba(251,191,36,0.35)", borderRadius: 9, padding: "7px 9px", margin: 0 }}>
          {onlineAvailability.unavailableReason}
        </p>
      )}
      {selectedPaymentMethod === "stripe_online" && stripeOptionEnabled && (
        <p style={{ color: "#bfdbfe", background: "rgba(30,64,175,0.2)", border: "1px solid rgba(96,165,250,0.4)", borderRadius: 9, padding: "7px 9px", margin: 0 }}>
          Integracion pendiente: aqui se conectara Stripe Checkout o Stripe Elements en la siguiente fase.
        </p>
      )}
      {!cashAllowed && (
        <p style={{ color: "#fecaca", background: "rgba(127,29,29,0.22)", border: "1px solid rgba(248,113,113,0.35)", borderRadius: 9, padding: "7px 9px", margin: 0 }}>
          Pago en efectivo no disponible.
        </p>
      )}
      {!cardAllowed && (
        <p style={{ color: "#fecaca", background: "rgba(127,29,29,0.22)", border: "1px solid rgba(248,113,113,0.35)", borderRadius: 9, padding: "7px 9px", margin: 0 }}>
          Pago con tarjeta no disponible.
        </p>
      )}
      {draft.orderType === "delivery" && (
        <p>
          Total estimado con envio: {estimatedTotal.toFixed(2)} EUR
        </p>
      )}

      {primaryErrors.length > 0 && (
        <div
          style={{
            color: "#fecaca",
            border: "1px solid rgba(248,113,113,0.35)",
            background: "rgba(127,29,29,0.22)",
            borderRadius: 10,
            padding: "8px 10px",
            display: "grid",
            gap: 4,
          }}
        >
          {primaryErrors.map((message, index) => (
            <div key={`${message}-${index}`}>{message}</div>
          ))}
        </div>
      )}
    </section>
  );
}
