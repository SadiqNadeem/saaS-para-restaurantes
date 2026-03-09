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
  const [focusedField, setFocusedField] = useState<"name" | "phone" | null>(null);
  const [touched, setTouched] = useState<{ name: boolean; phone: boolean }>({
    name: false,
    phone: false,
  });

  const validateSingleField = (field: "name" | "phone", force = false) => {
    const result = customerSchema.safeParse(customer);
    const fieldErrors = result.success ? {} : result.error.flatten().fieldErrors;
    const shouldShow = force || touched[field];
    if (!shouldShow) return;
    setErrors((prev) => ({
      ...prev,
      [field]: fieldErrors[field]?.[0],
    }));
  };

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
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <label
          htmlFor="checkout-name"
          style={{ fontSize: 13, fontWeight: 700, color: "#cbd5e1" }}
        >
          Nombre
        </label>
        <input
          id="checkout-name"
          value={customer.name}
          placeholder="Tu nombre"
          onFocus={() => setFocusedField("name")}
          onBlur={() => {
            setFocusedField(null);
            setTouched((prev) => ({ ...prev, name: true }));
            validateSingleField("name", true);
          }}
          onChange={(event) => {
            setCustomer({ ...customer, name: event.target.value });
            if (errors.name || touched.name) {
              const nextCustomer = { ...customer, name: event.target.value };
              const result = customerSchema.safeParse(nextCustomer);
              const fieldErrors = result.success ? {} : result.error.flatten().fieldErrors;
              setErrors((prev) => ({ ...prev, name: fieldErrors.name?.[0] }));
            }
          }}
          style={{
            height: 44,
            borderRadius: 12,
            border:
              focusedField === "name"
                ? "1px solid var(--brand-primary)"
                : errors.name
                ? "1px solid rgba(248,113,113,0.7)"
                : "1px solid rgba(148,163,184,0.42)",
            background: "rgba(15,23,42,0.55)",
            color: "#f8fafc",
            padding: "0 12px",
            outline: "none",
            boxShadow:
              focusedField === "name" ? "0 0 0 3px rgba(78,197,128,0.22)" : "none",
          }}
        />
        {errors.name && (
          <small
            style={{
              color: "#fecaca",
              background: "rgba(127,29,29,0.24)",
              border: "1px solid rgba(248,113,113,0.35)",
              borderRadius: 8,
              padding: "6px 8px",
            }}
          >
            {errors.name}
          </small>
        )}
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <label
          htmlFor="checkout-phone"
          style={{ fontSize: 13, fontWeight: 700, color: "#cbd5e1" }}
        >
          Telefono
        </label>
        <input
          id="checkout-phone"
          value={customer.phone}
          placeholder="Tu telefono"
          onFocus={() => setFocusedField("phone")}
          onBlur={() => {
            setFocusedField(null);
            setTouched((prev) => ({ ...prev, phone: true }));
            validateSingleField("phone", true);
          }}
          onChange={(event) => {
            setCustomer({ ...customer, phone: event.target.value });
            if (errors.phone || touched.phone) {
              const nextCustomer = { ...customer, phone: event.target.value };
              const result = customerSchema.safeParse(nextCustomer);
              const fieldErrors = result.success ? {} : result.error.flatten().fieldErrors;
              setErrors((prev) => ({ ...prev, phone: fieldErrors.phone?.[0] }));
            }
          }}
          style={{
            height: 44,
            borderRadius: 12,
            border:
              focusedField === "phone"
                ? "1px solid var(--brand-primary)"
                : errors.phone
                ? "1px solid rgba(248,113,113,0.7)"
                : "1px solid rgba(148,163,184,0.42)",
            background: "rgba(15,23,42,0.55)",
            color: "#f8fafc",
            padding: "0 12px",
            outline: "none",
            boxShadow:
              focusedField === "phone" ? "0 0 0 3px rgba(78,197,128,0.22)" : "none",
          }}
        />
        {errors.phone && (
          <small
            style={{
              color: "#fecaca",
              background: "rgba(127,29,29,0.24)",
              border: "1px solid rgba(248,113,113,0.35)",
              borderRadius: 8,
              padding: "6px 8px",
            }}
          >
            {errors.phone}
          </small>
        )}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button disabled style={{ opacity: 0.6, cursor: "not-allowed" }}>
          Atras
        </button>
        <button onClick={handleContinue} disabled={disabledContinue}>
          Continuar
        </button>
      </div>

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
