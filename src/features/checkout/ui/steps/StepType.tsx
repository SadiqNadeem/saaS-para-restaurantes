import { useCheckoutStore } from "../../checkoutStore";

type StepTypeProps = {
  onContinue?: () => void;
  disabledContinue?: boolean;
  primaryErrors?: string[];
};

export default function StepType({
  onContinue,
  disabledContinue = false,
  primaryErrors = [],
}: StepTypeProps) {
  const orderType = useCheckoutStore((s) => s.draft.orderType);
  const setOrderType = useCheckoutStore((s) => s.setOrderType);
  const next = useCheckoutStore((s) => s.next);
  const back = useCheckoutStore((s) => s.back);

  const handleContinue = () => {
    if (onContinue) {
      onContinue();
      return;
    }

    next();
  };

  return (
    <section style={{ display: "grid", gap: 10 }}>
      <p>Selecciona el tipo de pedido</p>

      <div style={{ display: "grid", gap: 8 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="radio"
            name="orderType"
            checked={orderType === "pickup"}
            onChange={() => setOrderType("pickup")}
          />
          <span>Recoger</span>
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="radio"
            name="orderType"
            checked={orderType === "delivery"}
            onChange={() => setOrderType("delivery")}
          />
          <span>Domicilio</span>
        </label>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={back}>Atras</button>
        <button onClick={handleContinue} disabled={disabledContinue}>
          Continuar
        </button>
      </div>

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
