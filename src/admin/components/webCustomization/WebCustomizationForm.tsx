import { useMemo, useState } from "react";
import type { CSSProperties, ChangeEvent, ReactNode } from "react";

import { ColorPickerCard } from "./ColorPickerCard";
import { CustomizeTabs, type CustomizeTabItem } from "./CustomizeTabs";
import { ImageUploaderCard } from "./ImageUploaderCard";
import type { AddButtonVariant, WebCustomizationDraft } from "./types";

type WebCustomizationFormProps = {
  value: WebCustomizationDraft;
  onPatch: (patch: Partial<WebCustomizationDraft>) => void;
  onLogoFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onBannerFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

type EditorTab = "branding" | "cover" | "colors" | "cta";

const TAB_ITEMS: Array<CustomizeTabItem<EditorTab>> = [
  { id: "branding", label: "Branding", description: "Logo y nombre" },
  { id: "cover", label: "Portada", description: "Banner y titulares" },
  { id: "colors", label: "Colores", description: "Paleta de marca" },
  { id: "cta", label: "Boton CTA", description: "Texto y estilo" },
];

const COLOR_PRESETS = [
  { name: "Rojo kebab", primaryColor: "#d11d1d", secondaryColor: "#111827", buttonColor: "#b91c1c" },
  { name: "Negro premium", primaryColor: "#111111", secondaryColor: "#030712", buttonColor: "#1f2937" },
  { name: "Verde fresh", primaryColor: "#22c55e", secondaryColor: "#0f172a", buttonColor: "#16a34a" },
  { name: "Azul moderno", primaryColor: "#0ea5e9", secondaryColor: "#1e293b", buttonColor: "#0284c7" },
];

export function WebCustomizationForm({
  value,
  onPatch,
  onLogoFileChange,
  onBannerFileChange,
}: WebCustomizationFormProps) {
  const [activeTab, setActiveTab] = useState<EditorTab>("branding");
  const activeMeta = useMemo(() => TAB_ITEMS.find((item) => item.id === activeTab) ?? TAB_ITEMS[0], [activeTab]);

  return (
    <section style={panelStyle}>
      <header style={{ display: "grid", gap: 6 }}>
        <h3 style={{ margin: 0, fontSize: 20, color: "#0f172a" }}>Editor de configuracion</h3>
        <p style={{ margin: 0, fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
          Ajusta branding y contenido visual por bloques. La preview de la derecha se actualiza al instante.
        </p>
      </header>

      <CustomizeTabs items={TAB_ITEMS} activeTab={activeTab} onChange={setActiveTab} />

      <section style={tabContentStyle}>
        <header style={{ display: "grid", gap: 4 }}>
          <h4 style={{ margin: 0, fontSize: 16, color: "#0f172a" }}>{activeMeta.label}</h4>
          <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>{activeMeta.description}</p>
        </header>

        {activeTab === "branding" ? (
          <>
            <ImageUploaderCard
              title="Logo"
              hint="Visible en la cabecera de la web publica."
              imageUrl={value.logoUrl}
              imageAlt="Logo del restaurante"
              fileInputId="logo-file-input"
              urlInputId="logo-url-input"
              urlValue={value.logoUrl}
              onFileChange={onLogoFileChange}
              onUrlChange={(next) => onPatch({ logoUrl: next })}
            />

            <EditorCard title="Identidad de marca" hint="Textos del encabezado principal.">
              <div style={grid3Style}>
                <LabeledTextInput
                  id="header-name"
                  label="Nombre visible"
                  placeholder="Kebab Central"
                  value={value.headerName}
                  onChange={(text) => onPatch({ headerName: text })}
                />
                <LabeledTextInput
                  id="header-subtitle"
                  label="Subtitulo"
                  placeholder="Doner y durum"
                  value={value.headerSubtitle}
                  onChange={(text) => onPatch({ headerSubtitle: text })}
                />
                <LabeledTextInput
                  id="header-helper"
                  label="Texto auxiliar"
                  placeholder="Pedido online"
                  value={value.headerHelper}
                  onChange={(text) => onPatch({ headerHelper: text })}
                />
              </div>
            </EditorCard>
          </>
        ) : null}

        {activeTab === "cover" ? (
          <>
            <ImageUploaderCard
              title="Banner portada"
              hint="Imagen principal de la portada del restaurante."
              imageUrl={value.bannerUrl}
              imageAlt="Banner del restaurante"
              fileInputId="banner-file-input"
              urlInputId="banner-url-input"
              urlValue={value.bannerUrl}
              onFileChange={onBannerFileChange}
              onUrlChange={(next) => onPatch({ bannerUrl: next })}
              isBanner
            />

            <EditorCard title="Contenido portada" hint="Titular, subtitulo y chips destacados.">
              <div style={grid2Style}>
                <LabeledTextInput
                  id="banner-title-input"
                  label="Titulo principal"
                  placeholder="Tu kebab favorito"
                  value={value.bannerTitle}
                  onChange={(text) => onPatch({ bannerTitle: text })}
                />
                <LabeledTextInput
                  id="banner-subtitle-input"
                  label="Subtitulo"
                  placeholder="Ingredientes frescos"
                  value={value.bannerSubtitle}
                  onChange={(text) => onPatch({ bannerSubtitle: text })}
                />
              </div>

              <div style={grid3Style}>
                <LabeledTextInput
                  id="banner-chip-1"
                  label="Chip destacado 1"
                  placeholder="20-30 min"
                  value={value.bannerChip1}
                  onChange={(text) => onPatch({ bannerChip1: text })}
                />
                <LabeledTextInput
                  id="banner-chip-2"
                  label="Chip destacado 2"
                  placeholder="Comida rapida"
                  value={value.bannerChip2}
                  onChange={(text) => onPatch({ bannerChip2: text })}
                />
                <LabeledTextInput
                  id="banner-chip-3"
                  label="Chip destacado 3"
                  placeholder="Recogida y entrega"
                  value={value.bannerChip3}
                  onChange={(text) => onPatch({ bannerChip3: text })}
                />
              </div>
            </EditorCard>
          </>
        ) : null}

        {activeTab === "colors" ? (
          <>
            <EditorCard title="Colores de marca" hint="Ajusta color principal, secundario y CTA.">
              <div style={grid3Style}>
                <ColorPickerCard
                  label="Color principal"
                  value={value.primaryColor}
                  onChange={(next) => onPatch({ primaryColor: next })}
                />
                <ColorPickerCard
                  label="Color secundario"
                  value={value.secondaryColor}
                  onChange={(next) => onPatch({ secondaryColor: next })}
                />
                <ColorPickerCard
                  label="Color boton"
                  value={value.buttonColor}
                  onChange={(next) => onPatch({ buttonColor: next })}
                />
              </div>
            </EditorCard>

            <EditorCard title="Presets rapidos" hint="Aplicar paleta completa en un clic.">
              <div style={presetsGridStyle}>
                {COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() =>
                      onPatch({
                        primaryColor: preset.primaryColor,
                        secondaryColor: preset.secondaryColor,
                        buttonColor: preset.buttonColor,
                      })
                    }
                    style={presetButtonStyle}
                  >
                    <strong style={{ fontSize: 13, color: "#0f172a" }}>{preset.name}</strong>
                    <span style={presetSwatchesStyle}>
                      <i style={{ ...presetSwatchStyle, background: preset.primaryColor }} />
                      <i style={{ ...presetSwatchStyle, background: preset.secondaryColor }} />
                      <i style={{ ...presetSwatchStyle, background: preset.buttonColor }} />
                    </span>
                  </button>
                ))}
              </div>
            </EditorCard>
          </>
        ) : null}

        {activeTab === "cta" ? (
          <EditorCard title="Boton principal CTA" hint="Configura texto y variante visual del boton.">
            <div style={grid2Style}>
              <LabeledTextInput
                id="add-button-text"
                label="Texto boton"
                placeholder="Anadir"
                value={value.addButtonText}
                onChange={(text) => onPatch({ addButtonText: text })}
              />

              <div style={{ display: "grid", gap: 6 }}>
                <label style={fieldLabelStyle} htmlFor="add-button-variant">
                  Estilo visual
                </label>
                <select
                  id="add-button-variant"
                  value={value.addButtonVariant}
                  onChange={(event) => onPatch({ addButtonVariant: event.target.value as AddButtonVariant })}
                  style={inputStyle}
                >
                  <option value="solid">Solido</option>
                  <option value="soft">Suave</option>
                  <option value="outline">Borde</option>
                </select>
              </div>
            </div>

            <div style={ctaPreviewStyle}>
              <span style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>Vista previa CTA</span>
              <button type="button" style={buildPreviewButtonStyle(value)}>
                {value.addButtonText || "Anadir"}
              </button>
            </div>
          </EditorCard>
        ) : null}
      </section>
    </section>
  );
}

function EditorCard({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <article style={cardStyle}>
      <header style={{ display: "grid", gap: 4 }}>
        <h5 style={{ margin: 0, fontSize: 14, color: "#0f172a" }}>{title}</h5>
        <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.4 }}>{hint}</p>
      </header>
      <div style={{ display: "grid", gap: 12 }}>{children}</div>
    </article>
  );
}

function LabeledTextInput({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={fieldLabelStyle} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        style={inputStyle}
      />
    </div>
  );
}

function buildPreviewButtonStyle(value: WebCustomizationDraft): CSSProperties {
  if (value.addButtonVariant === "soft") {
    return {
      ...ctaButtonBaseStyle,
      background: `${value.buttonColor}22`,
      color: value.buttonColor,
      border: `1px solid ${value.buttonColor}66`,
    };
  }
  if (value.addButtonVariant === "outline") {
    return {
      ...ctaButtonBaseStyle,
      background: "#fff",
      color: value.buttonColor,
      border: `1px solid ${value.buttonColor}`,
    };
  }
  return {
    ...ctaButtonBaseStyle,
    background: value.buttonColor,
    color: "#fff",
    border: `1px solid ${value.buttonColor}`,
  };
}

const panelStyle: CSSProperties = {
  border: "1px solid #dbe5ef",
  borderRadius: 18,
  background: "#fff",
  padding: 18,
  display: "grid",
  gap: 14,
  boxShadow: "0 12px 30px rgba(15,23,42,0.08)",
};

const tabContentStyle: CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
  padding: 14,
  display: "grid",
  gap: 12,
};

const cardStyle: CSSProperties = {
  border: "1px solid #dbe5ef",
  borderRadius: 14,
  background: "#fff",
  padding: 12,
  display: "grid",
  gap: 10,
  boxShadow: "0 5px 14px rgba(15,23,42,0.05)",
};

const fieldLabelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#334155",
};

const inputStyle: CSSProperties = {
  width: "100%",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#111827",
  fontSize: 13,
  padding: "9px 10px",
};

const grid2Style: CSSProperties = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
};

const grid3Style: CSSProperties = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
};

const presetsGridStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
};

const presetButtonStyle: CSSProperties = {
  border: "1px solid #dbe5ef",
  borderRadius: 12,
  background: "#fff",
  cursor: "pointer",
  textAlign: "left",
  display: "grid",
  gap: 8,
  padding: "10px 12px",
};

const presetSwatchesStyle: CSSProperties = {
  display: "flex",
  gap: 7,
};

const presetSwatchStyle: CSSProperties = {
  width: 20,
  height: 20,
  borderRadius: 999,
  border: "1px solid rgba(15,23,42,0.16)",
};

const ctaPreviewStyle: CSSProperties = {
  border: "1px dashed #cbd5e1",
  borderRadius: 12,
  padding: "10px 12px",
  background: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
};

const ctaButtonBaseStyle: CSSProperties = {
  borderRadius: 10,
  fontSize: 12,
  fontWeight: 700,
  padding: "8px 12px",
  cursor: "pointer",
};
