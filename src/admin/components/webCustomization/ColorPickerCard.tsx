import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

type ColorPickerCardProps = {
  label: string;
  value: string;
  onChange: (next: string) => void;
};

function normalizeHex(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("#")) return `#${trimmed}`;
  return trimmed;
}

function isValidHex(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function ensureColor(value: string): string {
  return isValidHex(value) ? value : "#111111";
}

export function ColorPickerCard({ label, value, onChange }: ColorPickerCardProps) {
  const [hexValue, setHexValue] = useState(value);

  useEffect(() => {
    setHexValue(value);
  }, [value]);

  const safeColor = ensureColor(value);

  return (
    <article style={cardStyle}>
      <div style={swatchStyle}>
        <span style={{ ...swatchColorStyle, background: safeColor }} />
      </div>
      <div style={contentStyle}>
        <strong style={{ fontSize: 13, color: "#0f172a" }}>{label}</strong>
        <div style={inputsRowStyle}>
          <input
            type="color"
            value={safeColor}
            onChange={(event) => onChange(event.target.value)}
            aria-label={`${label} picker`}
            style={pickerStyle}
          />
          <input
            type="text"
            value={hexValue}
            onChange={(event) => setHexValue(event.target.value)}
            onBlur={() => {
              const normalized = normalizeHex(hexValue);
              if (isValidHex(normalized)) {
                onChange(normalized.toLowerCase());
                setHexValue(normalized.toLowerCase());
              } else {
                setHexValue(value);
              }
            }}
            placeholder="#d11d1d"
            aria-label={`${label} hex`}
            style={hexInputStyle}
          />
        </div>
      </div>
    </article>
  );
}

const cardStyle: CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  background: "#fff",
  display: "flex",
  gap: 10,
  alignItems: "stretch",
  padding: 10,
};

const swatchStyle: CSSProperties = {
  width: 54,
  borderRadius: 10,
  border: "1px solid #d1d5db",
  overflow: "hidden",
  flexShrink: 0,
};

const swatchColorStyle: CSSProperties = {
  display: "block",
  width: "100%",
  height: "100%",
  minHeight: 48,
};

const contentStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  flex: 1,
};

const inputsRowStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  gridTemplateColumns: "66px minmax(0, 1fr)",
};

const pickerStyle: CSSProperties = {
  width: "100%",
  height: 36,
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  cursor: "pointer",
  padding: 3,
  background: "#fff",
};

const hexInputStyle: CSSProperties = {
  width: "100%",
  borderRadius: 9,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#0f172a",
  fontSize: 13,
  padding: "8px 10px",
  fontWeight: 700,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace",
};
