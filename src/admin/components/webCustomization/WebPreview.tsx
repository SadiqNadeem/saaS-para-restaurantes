import { useState } from "react";
import type { CSSProperties } from "react";

import { PreviewFrame } from "./PreviewFrame";
import type { WebCustomizationDraft } from "./types";

type WebPreviewProps = {
  value: WebCustomizationDraft;
};

type PreviewMode = "mobile" | "desktop";

const MOCK_CATEGORIES = ["Populares", "Durum", "Pizzas", "Bebidas"];

const MOCK_PRODUCTS = [
  { id: "1", name: "Durum Mixto", description: "Pollo + ternera", price: "7,90 EUR" },
  { id: "2", name: "Menu Kebab", description: "Kebab + patatas + bebida", price: "9,50 EUR" },
  { id: "3", name: "Falafel", description: "Opcion vegetariana", price: "6,90 EUR" },
  { id: "4", name: "Patatas Deluxe", description: "Con salsa especial", price: "3,90 EUR" },
];

export function WebPreview({ value }: WebPreviewProps) {
  const [mode, setMode] = useState<PreviewMode>("mobile");
  const chips = [value.bannerChip1, value.bannerChip2, value.bannerChip3]
    .map((chip) => chip.trim())
    .filter((chip) => chip.length > 0);

  return (
    <PreviewFrame mode={mode} onModeChange={setMode}>
      <div style={previewCanvasStyle}>
        <div style={{ ...restaurantHeaderStyle, background: value.secondaryColor }}>
          <div style={headerRowStyle}>
            <div style={logoChipStyle}>{value.logoUrl ? <img src={value.logoUrl} alt="Logo del restaurante" style={logoImageStyle} /> : null}</div>
            <div style={{ minWidth: 0 }}>
              <div style={restaurantNameStyle}>{value.headerName || "Nombre del restaurante"}</div>
              <div style={restaurantSubtitleStyle}>{value.headerSubtitle || "Subtitulo"}</div>
            </div>
          </div>
          <div style={helperTextStyle}>{value.headerHelper || "Pedido online"}</div>
        </div>

        <div style={bannerBlockStyle}>
          {value.bannerUrl ? <img src={value.bannerUrl} alt="Banner del restaurante" style={bannerImageStyle} /> : null}
          <div style={bannerOverlayStyle} />
          <div style={bannerContentStyle}>
            <h4 style={bannerTitleStyle}>{value.bannerTitle || "Titulo principal"}</h4>
            <p style={bannerSubtitleStyle}>{value.bannerSubtitle || "Subtitulo"}</p>
            {chips.length > 0 ? (
              <div style={chipsWrapStyle}>
                {chips.map((chip) => (
                  <span key={chip} style={chipStyle}>
                    {chip}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div style={categoriesWrapStyle}>
          {MOCK_CATEGORIES.map((category, index) => (
            <span
              key={category}
              style={{
                ...categoryChipStyle,
                background: index === 0 ? value.primaryColor : "#eef2f7",
                color: index === 0 ? "#fff" : "#334155",
                borderColor: index === 0 ? value.primaryColor : "#d2dae5",
              }}
            >
              {category}
            </span>
          ))}
        </div>

        <div style={{ ...productsGridStyle, gridTemplateColumns: mode === "mobile" ? "1fr" : "repeat(2, minmax(0, 1fr))" }}>
          {MOCK_PRODUCTS.map((product) => (
            <article key={product.id} style={productCardStyle}>
              <div>
                <h5 style={productNameStyle}>{product.name}</h5>
                <p style={productDescriptionStyle}>{product.description}</p>
              </div>
              <div style={productFooterStyle}>
                <span style={productPriceStyle}>{product.price}</span>
                <button type="button" style={addButtonStyle(value)}>
                  {value.addButtonText || "Anadir"}
                </button>
              </div>
            </article>
          ))}
        </div>

        <button type="button" style={{ ...floatingCartStyle, background: value.buttonColor }}>
          Ver carrito - 2
        </button>
      </div>
    </PreviewFrame>
  );
}

function addButtonStyle(value: WebCustomizationDraft): CSSProperties {
  if (value.addButtonVariant === "soft") {
    return {
      ...addButtonBaseStyle,
      background: `${value.buttonColor}22`,
      color: value.buttonColor,
      border: `1px solid ${value.buttonColor}66`,
    };
  }

  if (value.addButtonVariant === "outline") {
    return {
      ...addButtonBaseStyle,
      background: "#fff",
      color: value.buttonColor,
      border: `1px solid ${value.buttonColor}`,
    };
  }

  return {
    ...addButtonBaseStyle,
    background: value.buttonColor,
    color: "#fff",
    border: `1px solid ${value.buttonColor}`,
  };
}

const previewCanvasStyle: CSSProperties = {
  position: "relative",
  overflow: "hidden",
  background: "#f8fafc",
  display: "grid",
  gap: 12,
  paddingBottom: 72,
};

const restaurantHeaderStyle: CSSProperties = {
  color: "#fff",
  padding: "11px 12px",
  display: "grid",
  gap: 7,
};

const headerRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const logoChipStyle: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 11,
  background: "rgba(255,255,255,0.24)",
  border: "1px solid rgba(255,255,255,0.35)",
  overflow: "hidden",
  flexShrink: 0,
};

const logoImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const restaurantNameStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 800,
  lineHeight: 1.2,
};

const restaurantSubtitleStyle: CSSProperties = {
  marginTop: 1,
  fontSize: 11,
  opacity: 0.92,
};

const helperTextStyle: CSSProperties = {
  display: "inline-flex",
  width: "fit-content",
  borderRadius: 999,
  background: "rgba(255,255,255,0.16)",
  border: "1px solid rgba(255,255,255,0.28)",
  padding: "4px 8px",
  fontSize: 11,
  fontWeight: 700,
};

const bannerBlockStyle: CSSProperties = {
  position: "relative",
  minHeight: 176,
  margin: "0 10px",
  borderRadius: 16,
  overflow: "hidden",
  border: "1px solid rgba(15,23,42,0.08)",
};

const bannerImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  position: "absolute",
  inset: 0,
};

const bannerOverlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "linear-gradient(180deg, rgba(15,23,42,0.2) 0%, rgba(15,23,42,0.72) 100%)",
};

const bannerContentStyle: CSSProperties = {
  position: "relative",
  zIndex: 1,
  height: "100%",
  padding: "14px 12px",
  color: "#fff",
  display: "grid",
  alignContent: "end",
  gap: 7,
};

const bannerTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 18,
  lineHeight: 1.2,
};

const bannerSubtitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  opacity: 0.95,
};

const chipsWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const chipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.4)",
  background: "rgba(255,255,255,0.2)",
  color: "#fff",
  fontSize: 11,
  fontWeight: 700,
  padding: "3px 9px",
};

const categoriesWrapStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  overflowX: "auto",
  padding: "0 10px",
};

const categoryChipStyle: CSSProperties = {
  borderRadius: 999,
  border: "1px solid #d1d5db",
  padding: "7px 12px",
  fontSize: 12,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const productsGridStyle: CSSProperties = {
  display: "grid",
  gap: 9,
  padding: "0 10px",
};

const productCardStyle: CSSProperties = {
  border: "1px solid #dbe5ef",
  background: "#fff",
  borderRadius: 12,
  padding: 10,
  display: "grid",
  gap: 8,
  boxShadow: "0 2px 6px rgba(15,23,42,0.08)",
};

const productNameStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontWeight: 700,
  color: "#111827",
};

const productDescriptionStyle: CSSProperties = {
  margin: "2px 0 0",
  fontSize: 12,
  color: "#6b7280",
};

const productFooterStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
};

const productPriceStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: "#0f172a",
};

const addButtonBaseStyle: CSSProperties = {
  borderRadius: 9,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const floatingCartStyle: CSSProperties = {
  position: "absolute",
  right: 14,
  bottom: 14,
  border: "none",
  borderRadius: 999,
  padding: "10px 14px",
  color: "#fff",
  fontSize: 12,
  fontWeight: 800,
  boxShadow: "0 10px 20px rgba(15,23,42,0.24)",
  cursor: "pointer",
};
