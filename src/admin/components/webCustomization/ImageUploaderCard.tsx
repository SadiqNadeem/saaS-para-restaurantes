import type { CSSProperties, ChangeEvent } from "react";

type ImageUploaderCardProps = {
  title: string;
  hint: string;
  imageUrl: string;
  imageAlt: string;
  fileInputId: string;
  urlInputId: string;
  urlValue: string;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onUrlChange: (next: string) => void;
  isBanner?: boolean;
};

export function ImageUploaderCard({
  title,
  hint,
  imageUrl,
  imageAlt,
  fileInputId,
  urlInputId,
  urlValue,
  onFileChange,
  onUrlChange,
  isBanner = false,
}: ImageUploaderCardProps) {
  return (
    <article style={cardStyle}>
      <header style={{ display: "grid", gap: 4 }}>
        <h4 style={{ margin: 0, fontSize: 15, color: "#0f172a" }}>{title}</h4>
        <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.35 }}>{hint}</p>
      </header>

      <div style={{ ...previewWrapStyle, minHeight: isBanner ? 178 : 128 }}>
        {imageUrl ? (
          <img src={imageUrl} alt={imageAlt} style={isBanner ? bannerPreviewStyle : logoPreviewStyle} />
        ) : (
          <div style={placeholderStyle}>
            <strong style={{ fontSize: 12, color: "#334155" }}>Sin imagen</strong>
            <span style={{ fontSize: 11, color: "#94a3b8" }}>
              {isBanner ? "Sube un banner para tu portada" : "Sube un logo para cabecera"}
            </span>
          </div>
        )}
      </div>

      <div style={actionsStyle}>
        <label htmlFor={fileInputId} style={uploadButtonStyle}>
          Subir imagen
        </label>
        <input id={fileInputId} type="file" accept="image/*" onChange={onFileChange} style={hiddenInputStyle} />

        <button type="button" onClick={() => onUrlChange("")} style={ghostButtonStyle}>
          Eliminar
        </button>
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <label htmlFor={urlInputId} style={labelStyle}>
          URL opcional
        </label>
        <input
          id={urlInputId}
          type="url"
          value={urlValue}
          onChange={(event) => onUrlChange(event.target.value)}
          placeholder="https://..."
          style={urlInputStyle}
        />
      </div>
    </article>
  );
}

const cardStyle: CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  background: "#fff",
  padding: 14,
  display: "grid",
  gap: 12,
  boxShadow: "0 4px 18px rgba(15, 23, 42, 0.05)",
};

const previewWrapStyle: CSSProperties = {
  width: "100%",
  border: "1px dashed #cbd5e1",
  borderRadius: 14,
  overflow: "hidden",
  background: "linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)",
  display: "grid",
  placeItems: "center",
};

const placeholderStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  justifyItems: "center",
  padding: "16px 12px",
};

const logoPreviewStyle: CSSProperties = {
  width: 108,
  height: 108,
  objectFit: "cover",
  borderRadius: 18,
  border: "1px solid #dbe5ef",
  boxShadow: "0 12px 20px rgba(15,23,42,0.12)",
};

const bannerPreviewStyle: CSSProperties = {
  width: "100%",
  height: 188,
  objectFit: "cover",
};

const actionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const uploadButtonStyle: CSSProperties = {
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#334155",
  fontWeight: 700,
  fontSize: 12,
  padding: "8px 11px",
  cursor: "pointer",
};

const ghostButtonStyle: CSSProperties = {
  borderRadius: 10,
  border: "1px solid #fecaca",
  background: "#fff5f5",
  color: "#b91c1c",
  fontWeight: 700,
  fontSize: 12,
  padding: "8px 11px",
  cursor: "pointer",
};

const hiddenInputStyle: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  border: 0,
};

const labelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#334155",
};

const urlInputStyle: CSSProperties = {
  width: "100%",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#0f172a",
  fontSize: 13,
  padding: "9px 10px",
};
