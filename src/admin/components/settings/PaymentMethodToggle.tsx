import type { CSSProperties, ReactNode } from "react";

type PaymentMethodToggleProps = {
  icon: ReactNode;
  title: string;
  description: string;
  action: ReactNode;
  helperText?: string;
};

export function PaymentMethodToggle({
  icon,
  title,
  description,
  action,
  helperText,
}: PaymentMethodToggleProps) {
  return (
    <div style={cardStyle}>
      <div style={iconStyle}>{icon}</div>
      <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>{title}</div>
        <div style={{ fontSize: 12, color: "#64748b" }}>{description}</div>
        {helperText && (
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
            {helperText}
          </div>
        )}
      </div>
      <div>{action}</div>
    </div>
  );
}

const cardStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "32px minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 12,
  padding: "12px 14px",
  border: "1px solid #dbe5ef",
  borderRadius: 12,
  background: "#fff",
  boxShadow: "0 4px 14px rgba(15,23,42,0.05)",
};

const iconStyle: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 8,
  display: "grid",
  placeItems: "center",
  background: "#f1f5f9",
  border: "1px solid #dbe5ef",
  fontSize: 16,
};
