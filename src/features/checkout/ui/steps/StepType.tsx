import { useEffect } from "react";
import { useCheckoutStore } from "../../checkoutStore";

type StepTypeProps = {
  onContinue?: () => void;
  disabledContinue?: boolean;
  primaryErrors?: string[];
  deliveryEnabled?: boolean;
  pickupEnabled?: boolean;
};

export default function StepType({
  onContinue,
  disabledContinue = false,
  primaryErrors = [],
  deliveryEnabled = true,
  pickupEnabled = true,
}: StepTypeProps) {
  const orderType = useCheckoutStore((s) => s.draft.orderType);
  const setOrderType = useCheckoutStore((s) => s.setOrderType);
  const next = useCheckoutStore((s) => s.next);
  const back = useCheckoutStore((s) => s.back);

  // Auto-select if only one mode is available
  useEffect(() => {
    if (deliveryEnabled && !pickupEnabled && orderType !== "delivery") {
      setOrderType("delivery");
    } else if (!deliveryEnabled && pickupEnabled && orderType !== "pickup") {
      setOrderType("pickup");
    }
  }, [deliveryEnabled, pickupEnabled, orderType, setOrderType]);

  const handleContinue = () => {
    if (onContinue) {
      onContinue();
      return;
    }
    next();
  };

  const neitherEnabled = !deliveryEnabled && !pickupEnabled;

  return (
    <section style={{ display: "grid", gap: 10 }}>
      <p style={{ margin: 0, fontWeight: 600, fontSize: 15 }}>
        Selecciona el tipo de pedido
      </p>

      {neitherEnabled ? (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 10,
            padding: "12px 16px",
            fontSize: 13,
            color: "#b91c1c",
          }}
        >
          El restaurante no tiene canales de pedido online disponibles en este momento.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {pickupEnabled && (
            <label
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                cursor: "pointer",
                padding: "10px 14px",
                border: `1px solid ${orderType === "pickup" ? "#1E3A8A" : "#e5e7eb"}`,
                borderRadius: 10,
                background: orderType === "pickup" ? "#eff6ff" : "#fff",
                transition: "border-color 0.15s, background 0.15s",
              }}
            >
              <input
                type="radio"
                name="orderType"
                checked={orderType === "pickup"}
                onChange={() => setOrderType("pickup")}
                style={{ accentColor: "#1E3A8A" }}
              />
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Recoger en local</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Pasa a buscar tu pedido</div>
              </div>
            </label>
          )}

          {deliveryEnabled && (
            <label
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                cursor: "pointer",
                padding: "10px 14px",
                border: `1px solid ${orderType === "delivery" ? "#1E3A8A" : "#e5e7eb"}`,
                borderRadius: 10,
                background: orderType === "delivery" ? "#eff6ff" : "#fff",
                transition: "border-color 0.15s, background 0.15s",
              }}
            >
              <input
                type="radio"
                name="orderType"
                checked={orderType === "delivery"}
                onChange={() => setOrderType("delivery")}
                style={{ accentColor: "#1E3A8A" }}
              />
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>A domicilio</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Te lo llevamos a tu dirección</div>
              </div>
            </label>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button
          type="button"
          onClick={back}
          style={{
            flex: 1,
            padding: "10px 0",
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            background: "#fff",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          Atrás
        </button>
        <button
          type="button"
          onClick={handleContinue}
          disabled={disabledContinue || neitherEnabled || !orderType}
          style={{
            flex: 2,
            padding: "10px 0",
            borderRadius: 8,
            border: "none",
            background: disabledContinue || neitherEnabled || !orderType ? "#d1d5db" : "#1E3A8A",
            color: "#fff",
            cursor: disabledContinue || neitherEnabled || !orderType ? "not-allowed" : "pointer",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          Continuar
        </button>
      </div>

      {primaryErrors.length > 0 && (
        <div style={{ color: "#b91c1c", fontSize: 13 }}>
          {primaryErrors.map((message, index) => (
            <div key={`${message}-${index}`}>{message}</div>
          ))}
        </div>
      )}
    </section>
  );
}
