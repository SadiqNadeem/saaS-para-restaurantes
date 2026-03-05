import { useState } from "react";

import { customerSchema } from "../../schema";
import { useCheckoutStore } from "../../checkoutStore";

type CustomerErrors = {
  name?: string;
  phone?: string;
};

type StepCustomerProps = {
  onContinue?: () => void;
  disabledContinue?: boolean;
  primaryErrors?: string[];
};

export default function StepCustomer({
  onContinue,
  disabledContinue = false,
  primaryErrors = [],
}: StepCustomerProps) {
  const customer = useCheckoutStore((s) => s.draft.customer);
  const setCustomer = useCheckoutStore((s) => s.setCustomer);
  const next = useCheckoutStore((s) => s.next);

  const [errors, setErrors] = useState<CustomerErrors>({});

  const parsed = customerSchema.safeParse(customer);
  const canContinue = parsed.success;

  const handleContinue = () => {
    const result = customerSchema.safeParse(customer);

    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      setErrors({
        name: fieldErrors.name?.[0],
        phone: fieldErrors.phone?.[0],
      });
      return;
    }

    setErrors({});
    if (onContinue) {
      onContinue();
      return;
    }

    next();
  };

  return (
    <section style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "grid", gap: 4 }}>
        <label htmlFor="checkout-name">Nombre</label>
        <input
          id="checkout-name"
          value={customer.name}
          onChange={(event) => {
            setCustomer({ ...customer, name: event.target.value });
            if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
          }}
        />
        {errors.name && <small style={{ color: "crimson" }}>{errors.name}</small>}
      </div>

      <div style={{ display: "grid", gap: 4 }}>
        <label htmlFor="checkout-phone">Telefono</label>
        <input
          id="checkout-phone"
          value={customer.phone}
          onChange={(event) => {
            setCustomer({ ...customer, phone: event.target.value });
            if (errors.phone) setErrors((prev) => ({ ...prev, phone: undefined }));
          }}
        />
        {errors.phone && <small style={{ color: "crimson" }}>{errors.phone}</small>}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button disabled style={{ opacity: 0.6, cursor: "not-allowed" }}>
          Atras
        </button>
        <button onClick={handleContinue} disabled={!canContinue || disabledContinue}>
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
