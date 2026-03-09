import type { CSSProperties, ReactNode } from "react";

type PreviewMode = "mobile" | "desktop";

type PreviewFrameProps = {
  mode: PreviewMode;
  onModeChange: (mode: PreviewMode) => void;
  children: ReactNode;
};

export function PreviewFrame({ mode, onModeChange, children }: PreviewFrameProps) {
  return (
    <section style={panelStyle}>
      <header style={headerStyle}>
        <div style={{ display: "grid", gap: 4 }}>
          <h3 style={{ margin: 0, fontSize: 17, color: "#0f172a" }}>Preview web</h3>
          <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
            Simulacion de la web publica con cambios en tiempo real.
          </p>
        </div>
        <div style={toggleWrapStyle}>
          <button
            type="button"
            onClick={() => onModeChange("mobile")}
            style={{ ...toggleButtonStyle, ...(mode === "mobile" ? toggleButtonActiveStyle : null) }}
          >
            Movil
          </button>
          <button
            type="button"
            onClick={() => onModeChange("desktop")}
            style={{ ...toggleButtonStyle, ...(mode === "desktop" ? toggleButtonActiveStyle : null) }}
          >
            Desktop
          </button>
        </div>
      </header>

      <div style={stageStyle}>
        <div style={{ ...frameStyle, width: mode === "mobile" ? 390 : "100%" }}>
          {mode === "mobile" ? <div style={notchStyle} /> : null}
          <div style={canvasStyle}>{children}</div>
        </div>
      </div>
    </section>
  );
}

const panelStyle: CSSProperties = {
  border: "1px solid #dbe5ef",
  borderRadius: 18,
  background: "#fff",
  padding: 14,
  display: "grid",
  gap: 12,
  boxShadow: "0 10px 24px rgba(15,23,42,0.07)",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  flexWrap: "wrap",
};

const toggleWrapStyle: CSSProperties = {
  display: "inline-flex",
  gap: 4,
  border: "1px solid #dbe5ef",
  borderRadius: 999,
  background: "#f8fafc",
  padding: 3,
};

const toggleButtonStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#475569",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  padding: "6px 11px",
  cursor: "pointer",
};

const toggleButtonActiveStyle: CSSProperties = {
  background: "#0f172a",
  color: "#fff",
};

const stageStyle: CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 12,
  background: "radial-gradient(circle at top right, #eff6ff 0%, #f8fafc 52%, #eef2ff 100%)",
  display: "grid",
  placeItems: "center",
};

const frameStyle: CSSProperties = {
  border: "1px solid #d3deec",
  borderRadius: 24,
  overflow: "hidden",
  background: "#fff",
  boxShadow: "0 24px 42px rgba(15,23,42,0.15)",
  transition: "width 0.15s ease",
};

const notchStyle: CSSProperties = {
  width: 110,
  height: 16,
  borderBottomLeftRadius: 10,
  borderBottomRightRadius: 10,
  background: "#0f172a",
  margin: "0 auto",
};

const canvasStyle: CSSProperties = {
  minHeight: 560,
  background: "#f8fafc",
};
