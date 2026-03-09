import type { CSSProperties } from "react";

export type SettingsTabId =
  | "general"
  | "delivery"
  | "payments"
  | "hours"
  | "zone"
  | "qr"
  | "seo"
  | "loyalty"
  | "printing"
  | "marketing";

export type SettingsTabItem = {
  id: SettingsTabId;
  label: string;
};

type SettingsTabsProps = {
  items: SettingsTabItem[];
  activeTab: SettingsTabId;
  onChange: (tab: SettingsTabId) => void;
};

export function SettingsTabs({ items, activeTab, onChange }: SettingsTabsProps) {
  return (
    <nav style={tabsWrapStyle} aria-label="Secciones de ajustes">
      {items.map((item) => {
        const active = item.id === activeTab;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            style={{
              ...tabButtonStyle,
              background: active ? "#111827" : "#fff",
              borderColor: active ? "#111827" : "#dbe5ef",
              color: active ? "#fff" : "#334155",
              boxShadow: active ? "0 10px 20px rgba(15, 23, 42, 0.12)" : "none",
            }}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

const tabsWrapStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
  gap: 8,
  border: "1px solid #dbe5ef",
  borderRadius: 16,
  background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
  padding: 8,
};

const tabButtonStyle: CSSProperties = {
  border: "1px solid #dbe5ef",
  borderRadius: 10,
  background: "#fff",
  color: "#334155",
  fontSize: 13,
  fontWeight: 700,
  padding: "9px 10px",
  cursor: "pointer",
  transition: "all 0.15s ease",
};
