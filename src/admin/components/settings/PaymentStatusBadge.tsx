import type { CSSProperties } from "react";

export type PaymentStatusTone = "neutral" | "warning" | "success" | "error";

type PaymentStatusBadgeProps = {
  label: string;
  tone?: PaymentStatusTone;
};

const TONE_STYLES: Record<PaymentStatusTone, CSSProperties> = {
  neutral: {
    background: "#eef2ff",
    color: "#3730a3",
    border: "1px solid #c7d2fe",
  },
  warning: {
    background: "#fff7ed",
    color: "#9a3412",
    border: "1px solid #fed7aa",
  },
  success: {
    background: "#ecfdf5",
    color: "#065f46",
    border: "1px solid #a7f3d0",
  },
  error: {
    background: "#fef2f2",
    color: "#991b1b",
    border: "1px solid #fecaca",
  },
};

export function PaymentStatusBadge({ label, tone = "neutral" }: PaymentStatusBadgeProps) {
  return (
    <span
      style={{
        ...TONE_STYLES[tone],
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 999,
        padding: "4px 10px",
        fontSize: 12,
        fontWeight: 700,
        lineHeight: 1.1,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}
