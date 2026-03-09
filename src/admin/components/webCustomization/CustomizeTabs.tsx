import type { CSSProperties } from "react";

export type CustomizeTabItem<T extends string> = {
  id: T;
  label: string;
  description: string;
};

type CustomizeTabsProps<T extends string> = {
  items: Array<CustomizeTabItem<T>>;
  activeTab: T;
  onChange: (tab: T) => void;
};

export function CustomizeTabs<T extends string>({ items, activeTab, onChange }: CustomizeTabsProps<T>) {
  return (
    <div style={tabsWrapStyle} role="tablist" aria-label="Secciones de personalizacion web">
      {items.map((item) => {
        const active = item.id === activeTab;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            style={{
              ...tabButtonStyle,
              borderColor: active ? "#111827" : "#e2e8f0",
              background: active ? "#111827" : "#fff",
              color: active ? "#fff" : "#334155",
              boxShadow: active ? "0 8px 18px rgba(17, 24, 39, 0.14)" : "none",
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.1 }}>{item.label}</span>
            <span style={{ fontSize: 11, opacity: active ? 0.9 : 0.8, lineHeight: 1.25 }}>{item.description}</span>
          </button>
        );
      })}
    </div>
  );
}

const tabsWrapStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
};

const tabButtonStyle: CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  background: "#fff",
  padding: "10px 12px",
  textAlign: "left",
  display: "grid",
  gap: 5,
  cursor: "pointer",
  transition: "all 0.16s ease",
};
