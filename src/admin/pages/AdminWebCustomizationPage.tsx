import { useCallback, useEffect, useState } from "react";
import type { CSSProperties, ChangeEvent } from "react";

import { WebCustomizationForm } from "../components/webCustomization/WebCustomizationForm";
import { WebPreview } from "../components/webCustomization/WebPreview";
import {
  DEFAULT_WEB_CUSTOMIZATION_DRAFT,
  type WebCustomizationDraft,
} from "../components/webCustomization/types";
import {
  loadRestaurantWebSettings,
  mapDbRowToDraft,
  saveRestaurantWebSettings,
  toSettingsPayload,
} from "../services/webCustomizationSettings";
import { useRestaurant } from "../../restaurant/RestaurantContext";
import { supabase } from "../../lib/supabase";
import { IMAGE_PRESETS, optimizeImageForUpload } from "../../lib/images/optimizeImageUpload";

type SaveStatus = "idle" | "uploading" | "saving" | "success" | "error";

const STORAGE_BUCKET = "restaurant-assets";

async function uploadWebImage(
  restaurantId: string,
  file: File,
  kind: "logo" | "banner"
): Promise<string> {
  const preset = kind === "logo" ? IMAGE_PRESETS.logo : IMAGE_PRESETS.banner;
  const { blob } = await optimizeImageForUpload(file, preset);
  const path = `${restaurantId}/${kind}.webp`;

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, blob, { upsert: true, contentType: "image/webp" });

  if (uploadError) {
    throw new Error(uploadError.message || `Error al subir ${kind}.`);
  }

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}

export default function AdminWebCustomizationPage() {
  const { restaurantId } = useRestaurant();
  const [draft, setDraft] = useState<WebCustomizationDraft>(DEFAULT_WEB_CUSTOMIZATION_DRAFT);
  const [savedDraft, setSavedDraft] = useState<WebCustomizationDraft>(DEFAULT_WEB_CUSTOMIZATION_DRAFT);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setInitialLoading(true);
      setLoadingError(null);

      try {
        const row = await loadRestaurantWebSettings(restaurantId);
        if (!alive) return;

        const hydrated = mapDbRowToDraft(DEFAULT_WEB_CUSTOMIZATION_DRAFT, row);
        setDraft(hydrated);
        setSavedDraft(hydrated);
      } catch (error) {
        if (!alive) return;
        const message = error instanceof Error ? error.message : "No se pudo cargar la configuracion.";
        setLoadingError(message);
        setDraft(DEFAULT_WEB_CUSTOMIZATION_DRAFT);
        setSavedDraft(DEFAULT_WEB_CUSTOMIZATION_DRAFT);
      } finally {
        if (alive) setInitialLoading(false);
      }
    };

    void load();
    return () => {
      alive = false;
    };
  }, [restaurantId]);

  const patchDraft = useCallback((patch: Partial<WebCustomizationDraft>) => {
    setSaveStatus("idle");
    setSaveMessage(null);
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  const onLogoFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setSaveStatus("uploading");
      setSaveMessage("Subiendo logo...");
      try {
        const publicUrl = await uploadWebImage(restaurantId, file, "logo");
        setSaveStatus("idle");
        setSaveMessage(null);
        setDraft((prev) => ({ ...prev, logoUrl: publicUrl }));
      } catch (err) {
        setSaveStatus("error");
        setSaveMessage(err instanceof Error ? err.message : "Error al subir el logo.");
      }
    },
    [restaurantId]
  );

  const onBannerFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setSaveStatus("uploading");
      setSaveMessage("Subiendo banner...");
      try {
        const publicUrl = await uploadWebImage(restaurantId, file, "banner");
        setSaveStatus("idle");
        setSaveMessage(null);
        setDraft((prev) => ({ ...prev, bannerUrl: publicUrl }));
      } catch (err) {
        setSaveStatus("error");
        setSaveMessage(err instanceof Error ? err.message : "Error al subir el banner.");
      }
    },
    [restaurantId]
  );

  const hasChanges = JSON.stringify(toSettingsPayload(draft)) !== JSON.stringify(toSettingsPayload(savedDraft));
  const isBusy = saveStatus === "saving" || saveStatus === "uploading";

  const handleSave = async () => {
    if (!hasChanges || isBusy) return;
    setSaveStatus("saving");
    setSaveMessage(null);
    try {
      await saveRestaurantWebSettings(restaurantId, draft);
      setSavedDraft(draft);
      setSaveStatus("success");
      setSaveMessage("Cambios guardados.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al guardar.";
      setSaveStatus("error");
      setSaveMessage(message);
    }
  };

  const handleCancel = () => {
    setDraft(savedDraft);
    setSaveStatus("idle");
    setSaveMessage(null);
  };

  const resetDemo = () => {
    setDraft(DEFAULT_WEB_CUSTOMIZATION_DRAFT);
    setSaveStatus("idle");
    setSaveMessage(null);
  };

  if (initialLoading) {
    return (
      <section style={pageStyle}>
        <header style={headerStyle}>
          <div style={{ display: "grid", gap: 6 }}>
            <h2 style={titleStyle}>Personalizar web</h2>
            <p style={subtitleStyle}>Cargando configuracion guardada...</p>
          </div>
        </header>
      </section>
    );
  }

  return (
    <section style={pageStyle}>
      <style>{`
        .awc-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(380px, 500px);
          gap: 20px;
          align-items: start;
        }
        .awc-preview-sticky {
          position: sticky;
          top: 86px;
        }
        @media (max-width: 1080px) {
          .awc-layout {
            grid-template-columns: 1fr;
          }
          .awc-preview-sticky {
            position: static;
            top: auto;
          }
        }
      `}</style>

      <header style={headerStyle}>
        <div style={{ display: "grid", gap: 6 }}>
          <h2 style={titleStyle}>Personalizar web</h2>
          <p style={subtitleStyle}>Ajusta branding y textos de tu web publica.</p>
        </div>
        <div style={actionsWrapStyle}>
          <button type="button" onClick={resetDemo} style={secondaryButtonStyle} disabled={isBusy}>
            Restaurar demo
          </button>
          <button type="button" onClick={handleCancel} style={secondaryButtonStyle} disabled={!hasChanges || isBusy}>
            Cancelar
          </button>
          <button type="button" onClick={() => void handleSave()} style={primaryButtonStyle} disabled={!hasChanges || isBusy}>
            {saveStatus === "saving" ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </header>

      {loadingError ? (
        <div role="alert" style={errorAlertStyle}>
          {loadingError} Se han cargado valores por defecto.
        </div>
      ) : null}

      {saveMessage ? (
        <div
          role={saveStatus === "error" ? "alert" : "status"}
          style={
            saveStatus === "error"
              ? errorAlertStyle
              : saveStatus === "uploading"
                ? infoAlertStyle
                : successAlertStyle
          }
        >
          {saveMessage}
        </div>
      ) : null}

      <div className="awc-layout">
        <WebCustomizationForm
          value={draft}
          onPatch={patchDraft}
          onLogoFileChange={onLogoFileChange}
          onBannerFileChange={onBannerFileChange}
        />
        <div className="awc-preview-sticky">
          <WebPreview value={draft} />
        </div>
      </div>
    </section>
  );
}

const pageStyle: CSSProperties = {
  display: "grid",
  gap: 18,
  width: "100%",
  maxWidth: 1420,
  margin: "0 auto",
  padding: "4px 0 14px",
};

const headerStyle: CSSProperties = {
  border: "1px solid #dbe5ef",
  borderRadius: 18,
  padding: "16px 18px",
  background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 72%)",
  boxShadow: "0 10px 26px rgba(15, 23, 42, 0.08)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: "clamp(1.32rem, 2vw, 1.75rem)",
  lineHeight: 1.15,
  color: "#0f172a",
};

const subtitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: "#64748b",
  lineHeight: 1.42,
};

const secondaryButtonStyle: CSSProperties = {
  borderRadius: 11,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#374151",
  fontWeight: 700,
  fontSize: 13,
  padding: "8px 13px",
  cursor: "pointer",
};

const primaryButtonStyle: CSSProperties = {
  borderRadius: 11,
  border: "1px solid var(--brand-primary, #22c55e)",
  background: "var(--brand-primary, #22c55e)",
  color: "#fff",
  fontWeight: 700,
  fontSize: 13,
  padding: "8px 14px",
  cursor: "pointer",
};

const actionsWrapStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const successAlertStyle: CSSProperties = {
  border: "1px solid #bbf7d0",
  background: "#f0fdf4",
  color: "#14532d",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 13,
  fontWeight: 600,
};

const infoAlertStyle: CSSProperties = {
  border: "1px solid #bfdbfe",
  background: "#eff6ff",
  color: "#1e40af",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 13,
  fontWeight: 600,
};

const errorAlertStyle: CSSProperties = {
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#991b1b",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 13,
  fontWeight: 600,
};
