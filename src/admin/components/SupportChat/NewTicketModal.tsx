import { useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { useRestaurant } from "../../../restaurant/RestaurantContext";

// ── Types ─────────────────────────────────────────────────────────────────────

type TicketCategory = "pedidos" | "impresion" | "menu" | "delivery" | "pagos" | "mesas" | "otro";
type TicketPriority = "low" | "normal" | "high" | "urgent";

const CATEGORIES: { value: TicketCategory; label: string; icon: string }[] = [
  { value: "pedidos", label: "Pedidos", icon: "" },
  { value: "impresion", label: "Impresión", icon: "" },
  { value: "menu", label: "Menú y productos", icon: "" },
  { value: "delivery", label: "Delivery", icon: "" },
  { value: "pagos", label: "Pagos", icon: "" },
  { value: "mesas", label: "Mesas", icon: "" },
  { value: "otro", label: "Otro", icon: "" },
];

const PRIORITIES: { value: TicketPriority; label: string; color: string; sub: string }[] = [
  { value: "normal", label: "Normal", color: "#22c55e", sub: "" },
  { value: "high", label: "Alta", color: "#f59e0b", sub: "afecta a mi operativa" },
  { value: "urgent", label: "Urgente", color: "#ef4444", sub: "no puedo trabajar" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 13,
  color: "#111827",
  background: "#fff",
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

// ── Component ─────────────────────────────────────────────────────────────────

type Props = {
  onClose: () => void;
  onSuccess: () => void;
};

export function NewTicketModal({ onClose, onSuccess }: Props) {
  const { restaurantId } = useRestaurant();

  const [category, setCategory] = useState<TicketCategory>("pedidos");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setScreenshotFile(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setScreenshotPreview(url);
    } else {
      setScreenshotPreview(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) { setError("El título es obligatorio."); return; }
    if (description.trim().length < 20) { setError("La descripción debe tener al menos 20 caracteres."); return; }
    if (!restaurantId) { setError("No se pudo identificar el restaurante."); return; }

    setSubmitting(true);

    let screenshotUrl: string | null = null;

    // Upload screenshot if provided
    if (screenshotFile) {
      setUploading(true);
      const ext = screenshotFile.name.split(".").pop() ?? "png";
      const path = `${restaurantId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("support-screenshots")
        .upload(path, screenshotFile, { upsert: false });

      if (uploadError) {
        setError(`Error subiendo imagen: ${uploadError.message}`);
        setUploading(false);
        setSubmitting(false);
        return;
      }

      const { data: urlData } = supabase.storage
        .from("support-screenshots")
        .getPublicUrl(path);
      screenshotUrl = urlData.publicUrl;
      setUploading(false);
    }

    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id ?? null;

    const browserInfo = `${navigator.userAgent} | ${window.location.href}`;

    const { error: insertError } = await supabase.from("support_tickets").insert({
      restaurant_id: restaurantId,
      user_id: userId,
      title: title.trim(),
      description: description.trim(),
      category,
      priority,
      status: "open",
      screenshot_url: screenshotUrl,
      browser_info: browserInfo,
    });

    if (insertError) {
      setError(`Error al enviar: ${insertError.message}`);
      setSubmitting(false);
      return;
    }

    onSuccess();
  };

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(17, 24, 39, 0.45)",
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Nuevo ticket de soporte"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 520,
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
          border: "1px solid #e5e7eb",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          maxHeight: "calc(100vh - 48px)",
        }}
      >
        {/* Header */}
        <div
          style={{
            background: "var(--brand-primary)",
            color: "#fff",
            padding: "14px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}> Nuevo ticket de soporte</div>
            <div style={{ fontSize: 12, opacity: 0.82, marginTop: 2 }}>
              Te responderemos lo antes posible
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              background: "rgba(255,255,255,0.18)",
              border: "none",
              color: "#fff",
              borderRadius: 8,
              width: 30,
              height: 30,
              cursor: "pointer",
              fontSize: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ×
          </button>
        </div>

        {/* Form */}
        <form
          onSubmit={(e) => void handleSubmit(e)}
          style={{ overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}
        >
          {/* Category */}
          <div>
            <label style={{ display: "block", fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 6 }}>
              Categoría
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as TicketCategory)}
              style={{ ...inputStyle }}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.icon} {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label style={{ display: "block", fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 6 }}>
              Título <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 100))}
              placeholder="Describe brevemente el problema"
              maxLength={100}
              required
              style={inputStyle}
            />
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3, textAlign: "right" }}>
              {title.length}/100
            </div>
          </div>

          {/* Description */}
          <div>
            <label style={{ display: "block", fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 6 }}>
              Descripción <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 1000))}
              placeholder="Explica qué está pasando, cuándo ocurre y qué has intentado..."
              rows={4}
              style={{ ...inputStyle, resize: "vertical", minHeight: 90 }}
            />
            <div style={{ fontSize: 11, color: description.length < 20 && description.length > 0 ? "#ef4444" : "#9ca3af", marginTop: 3, textAlign: "right" }}>
              {description.length}/1000 {description.length < 20 && description.length > 0 ? "(mínimo 20)" : ""}
            </div>
          </div>

          {/* Priority */}
          <div>
            <label style={{ display: "block", fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 8 }}>
              Prioridad
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {PRIORITIES.map((p) => {
                const isSelected = priority === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPriority(p.value)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 14px",
                      borderRadius: 8,
                      border: `2px solid ${isSelected ? p.color : "#e5e7eb"}`,
                      background: isSelected ? `${p.color}18` : "#fff",
                      cursor: "pointer",
                      transition: "border-color 0.15s, background 0.15s",
                      flex: "1 1 auto",
                    }}
                  >
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
                    <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                      <span style={{ fontSize: 13, fontWeight: isSelected ? 700 : 500, color: "#111827" }}>{p.label}</span>
                      {p.sub && <span style={{ fontSize: 11, color: "#6b7280" }}>{p.sub}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Screenshot */}
          <div>
            <label style={{ display: "block", fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 6 }}>
              Captura de pantalla <span style={{ color: "#9ca3af", fontWeight: 400 }}>(opcional)</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
            {screenshotPreview ? (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <img
                  src={screenshotPreview}
                  alt="Preview"
                  style={{ width: 80, height: 60, objectFit: "cover", borderRadius: 6, border: "1px solid #e5e7eb" }}
                />
                <button
                  type="button"
                  onClick={() => { setScreenshotFile(null); setScreenshotPreview(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                  style={{
                    fontSize: 12,
                    color: "#6b7280",
                    background: "transparent",
                    border: "1px solid #e5e7eb",
                    borderRadius: 6,
                    padding: "4px 10px",
                    cursor: "pointer",
                  }}
                >
                  Quitar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: "100%",
                  border: "2px dashed #e5e7eb",
                  borderRadius: 8,
                  padding: "14px",
                  background: "#fafafa",
                  cursor: "pointer",
                  fontSize: 13,
                  color: "#6b7280",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  transition: "border-color 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--brand-primary)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e5e7eb"; }}
              >
                 Adjuntar imagen
              </button>
            )}
          </div>

          {/* Error */}
          {error && (
            <div
              role="alert"
              style={{
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#7f1d1d",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                padding: "9px 18px",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                background: "#fff",
                color: "#374151",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || uploading}
              style={{
                padding: "9px 20px",
                borderRadius: 8,
                border: "none",
                background: submitting || uploading ? "#d1d5db" : "var(--brand-primary)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                cursor: submitting || uploading ? "not-allowed" : "pointer",
              }}
            >
              {uploading ? "Subiendo imagen..." : submitting ? "Enviando..." : "Enviar ticket"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
