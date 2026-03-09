import type { CSSProperties } from "react";

import { PaymentStatusBadge } from "./PaymentStatusBadge";

export type StripeConnectUiStatus =
  | "platform_not_configured"
  | "not_connected"
  | "connected"
  | "onboarding_pending"
  | "connected_not_chargeable"
  | "active";

type StripeConnectCardProps = {
  status: StripeConnectUiStatus;
  disabled?: boolean;
  pending?: boolean;
  platformMessage?: string;
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
};

const STATUS_META: Record<
  StripeConnectUiStatus,
  { label: string; tone: "neutral" | "warning" | "success" | "error"; detail: string; cta: string }
> = {
  platform_not_configured: {
    label: "No configurado",
    tone: "warning",
    detail: "Stripe aun no esta configurado por la plataforma en este entorno.",
    cta: "Pendiente de configuracion",
  },
  not_connected: {
    label: "Stripe no conectado",
    tone: "neutral",
    detail: "Conecta tu cuenta Stripe para empezar a aceptar pagos online.",
    cta: "Conectar Stripe",
  },
  connected: {
    label: "Cuenta conectada",
    tone: "neutral",
    detail: "La cuenta esta conectada. Revisa el estado para activar cobros.",
    cta: "Revisar conexion",
  },
  onboarding_pending: {
    label: "Onboarding pendiente",
    tone: "warning",
    detail: "Faltan pasos en Stripe para terminar la configuracion.",
    cta: "Continuar configuracion",
  },
  connected_not_chargeable: {
    label: "Conectada sin cobros",
    tone: "warning",
    detail: "La cuenta esta conectada, pero Stripe aun no permite cobrar.",
    cta: "Revisar conexion",
  },
  active: {
    label: "Activo",
    tone: "success",
    detail: "Stripe esta listo para cobrar pagos online en tu web.",
    cta: "Revisar conexion",
  },
};

export function StripeConnectCard({
  status,
  disabled = false,
  pending = false,
  platformMessage,
  onPrimaryAction,
  onSecondaryAction,
}: StripeConnectCardProps) {
  const meta = STATUS_META[status];
  const showSecondary = status !== "platform_not_configured" && status !== "not_connected";

  return (
    <section style={sectionStyle}>
      <div style={headerStyle}>
        <div style={logoWrapStyle} aria-hidden>
          S
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Pagos online con Stripe</div>
          <div style={{ fontSize: 12, color: "#475569" }}>
            El dinero de los pagos online ira directamente a la cuenta Stripe del restaurante.
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Estado:</span>
        <PaymentStatusBadge label={meta.label} tone={meta.tone} />
      </div>

      <p style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.45 }}>
        {status === "platform_not_configured" && platformMessage ? platformMessage : meta.detail}
      </p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onPrimaryAction}
          disabled={disabled || pending || status === "platform_not_configured"}
          style={{
            ...primaryButtonStyle,
            opacity: disabled || pending || status === "platform_not_configured" ? 0.6 : 1,
            cursor: disabled || pending || status === "platform_not_configured" ? "not-allowed" : "pointer",
          }}
        >
          {pending ? "Procesando..." : meta.cta}
        </button>

        {showSecondary && (
          <button
            type="button"
            onClick={onSecondaryAction}
            disabled={disabled || pending}
            style={{
              ...secondaryButtonStyle,
              opacity: disabled || pending ? 0.6 : 1,
              cursor: disabled || pending ? "not-allowed" : "pointer",
            }}
          >
            Desconectar cuenta
          </button>
        )}
      </div>
    </section>
  );
}

const sectionStyle: CSSProperties = {
  border: "1px solid #dbe5ef",
  borderRadius: 12,
  background: "#ffffff",
  boxShadow: "0 4px 14px rgba(15,23,42,0.05)",
  padding: "16px 14px",
  display: "grid",
  gap: 12,
};

const headerStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "36px minmax(0, 1fr)",
  gap: 10,
  alignItems: "start",
};

const logoWrapStyle: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 10,
  display: "grid",
  placeItems: "center",
  background: "linear-gradient(180deg, #e0f2fe 0%, #dbeafe 100%)",
  color: "#1d4ed8",
  fontWeight: 800,
  border: "1px solid #bfdbfe",
};

const primaryButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: 9,
  padding: "8px 14px",
  background: "#0f172a",
  color: "#fff",
  fontSize: 13,
  fontWeight: 700,
};

const secondaryButtonStyle: CSSProperties = {
  border: "1px solid #fecaca",
  borderRadius: 9,
  padding: "8px 14px",
  background: "#fff",
  color: "#b91c1c",
  fontSize: 13,
  fontWeight: 700,
};
