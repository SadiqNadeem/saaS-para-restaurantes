import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  buildOrderConfirmationMessage,
  DEFAULT_WHATSAPP_TEMPLATE,
} from "../../lib/whatsapp/whatsappService";
import { useAdminMembership } from "../components/AdminMembershipContext";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../../restaurant/RestaurantContext";

// ─── Local UI primitives ──────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => { if (!disabled) onChange(!checked); }}
      style={{
        width: 52,
        height: 30,
        borderRadius: 999,
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        background: checked ? "var(--brand-primary)" : "#d1d5db",
        position: "relative",
        flexShrink: 0,
        transition: "background 0.2s",
        opacity: disabled ? 0.55 : 1,
        padding: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: checked ? 25 : 3,
          width: 24,
          height: 24,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.18s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          display: "block",
        }}
      />
    </button>
  );
}

function SaveButton({
  onClick,
  saving,
  disabled,
  label = "Guardar cambios",
}: {
  onClick: () => void;
  saving: boolean;
  disabled: boolean;
  label?: string;
}) {
  const isDisabled = disabled || saving;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      style={{
        background: isDisabled ? "#9ca3af" : "var(--brand-primary)",
        color: "#fff",
        border: "none",
        borderRadius: 10,
        padding: "9px 16px",
        fontWeight: 700,
        fontSize: 14,
        cursor: isDisabled ? "not-allowed" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        transition: "background 0.15s",
      }}
    >
      {saving && (
        <span
          style={{
            width: 13,
            height: 13,
            border: "2px solid rgba(255,255,255,0.35)",
            borderTop: "2px solid #fff",
            borderRadius: "50%",
            display: "inline-block",
            animation: "settings-spin 0.8s linear infinite",
          }}
        />
      )}
      {saving ? "Guardando..." : label}
    </button>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <article
      style={{
        background: "#fff",
        border: "1px solid #dbe5ef",
        borderRadius: 16,
        boxShadow: "0 10px 22px rgba(15,23,42,0.07)",
        padding: "20px 20px",
        display: "grid",
        gap: 18,
      }}
    >
      <div>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--admin-text-primary)" }}>
          {title}
        </h3>
        {subtitle && (
          <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--admin-text-secondary)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </article>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-text-primary)" }}>
        {label}
        {hint && (
          <span style={{ fontWeight: 400, color: "var(--admin-text-secondary)", marginLeft: 5 }}>
            — {hint}
          </span>
        )}
      </span>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--admin-card-border)",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 14,
  color: "var(--admin-text-primary)",
  background: "#fff",
  width: "100%",
  boxSizing: "border-box",
  outline: "none",
};

// ─── Toast ────────────────────────────────────────────────────────────────────

type ToastType = "success" | "error";
type Toast = { id: number; type: ToastType; message: string };

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminWhatsAppPage() {
  const { restaurantId, name: restaurantName } = useRestaurant();
  const { canManage } = useAdminMembership();
  const canSave = canManage;

  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [whatsappTemplate, setWhatsappTemplate] = useState(DEFAULT_WHATSAPP_TEMPLATE);
  const [whatsappProvider, setWhatsappProvider] = useState<"link" | "twilio" | "360dialog">("link");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeqRef = useRef(0);

  const pushToast = useCallback((type: ToastType, message: string) => {
    toastSeqRef.current += 1;
    const id = toastSeqRef.current;
    setToasts((prev) => [...prev, { id, type, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("restaurant_settings")
        .select("whatsapp_enabled, whatsapp_phone, whatsapp_message_template, whatsapp_provider")
        .eq("restaurant_id", restaurantId)
        .maybeSingle();

      if (error) {
        pushToast("error", `Error cargando ajustes: ${error.message}`);
      } else if (data) {
        setWhatsappEnabled(data.whatsapp_enabled === true);
        setWhatsappPhone(data.whatsapp_phone ?? "");
        setWhatsappTemplate(
          data.whatsapp_message_template?.trim()
            ? data.whatsapp_message_template
            : DEFAULT_WHATSAPP_TEMPLATE
        );
        setWhatsappProvider(
          data.whatsapp_provider === "twilio"
            ? "twilio"
            : data.whatsapp_provider === "360dialog"
              ? "360dialog"
              : "link"
        );
      }
      setLoading(false);
    })();
  }, [restaurantId, pushToast]);

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    const { error } = await supabase
      .from("restaurant_settings")
      .upsert(
        {
          restaurant_id: restaurantId,
          whatsapp_enabled: whatsappEnabled,
          whatsapp_phone: whatsappPhone.trim() || null,
          whatsapp_message_template: whatsappTemplate.trim() || DEFAULT_WHATSAPP_TEMPLATE,
          whatsapp_provider: whatsappProvider,
        },
        { onConflict: "restaurant_id" }
      );
    if (error) pushToast("error", `Error: ${error.message}`);
    else pushToast("success", "Configuración de WhatsApp guardada.");
    setSaving(false);
  };

  return (
    <div style={{ maxWidth: 760 }}>
      <style>{`@keyframes settings-spin { to { transform: rotate(360deg); } }`}</style>

      {/* Toasts */}
      <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8 }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              background: t.type === "success" ? "#22c55e" : "#ef4444",
              boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
              animation: "none",
            }}
          >
            {t.message}
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 20 }}>
        <h1 className="admin-panel" style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
          Chatbot de WhatsApp
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--admin-text-secondary)" }}>
          Configura notificaciones por WhatsApp para confirmar pedidos con tus clientes
        </p>
      </div>

      {loading ? (
        <div style={{ color: "var(--admin-text-secondary)", fontSize: 14 }}>Cargando...</div>
      ) : (
        <Card title="Chatbot de WhatsApp" subtitle="Configura notificaciones por WhatsApp para confirmar pedidos con tus clientes">
          <Field label="Activar notificaciones WhatsApp">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Toggle checked={whatsappEnabled} onChange={setWhatsappEnabled} disabled={!canSave} />
              <span style={{ fontSize: 13, color: "var(--admin-text-secondary)" }}>
                {whatsappEnabled
                  ? "Activo — los clientes verán el botón de WhatsApp al finalizar su pedido"
                  : "Inactivo"}
              </span>
            </div>
          </Field>

          {whatsappEnabled && (
            <>
              <Field
                label="Número de WhatsApp del restaurante"
                hint="Con código de país, sin espacios (ej. +34612345678)"
              >
                <input
                  style={inputStyle}
                  type="tel"
                  value={whatsappPhone}
                  onChange={(e) => setWhatsappPhone(e.target.value)}
                  placeholder="+34 612 345 678"
                  disabled={!canSave}
                />
                <span style={{ fontSize: 12, color: "var(--admin-text-secondary)", marginTop: 4, display: "block" }}>
                  Los clientes verán este número para confirmar pedidos
                </span>
              </Field>

              <Field label="Plantilla de mensaje al cliente">
                <textarea
                  style={{ ...inputStyle, resize: "vertical", minHeight: 110, fontFamily: "monospace", fontSize: 13 }}
                  value={whatsappTemplate}
                  onChange={(e) => setWhatsappTemplate(e.target.value)}
                  disabled={!canSave}
                />
                <div style={{ fontSize: 12, color: "var(--admin-text-secondary)", marginTop: 4, lineHeight: 1.6 }}>
                  Variables disponibles:{" "}
                  {["{order_number}", "{customer_name}", "{total}", "{estimated_time}", "{restaurant_name}", "{items_list}", "{order_type}"].map((v) => (
                    <code
                      key={v}
                      style={{
                        background: "#f3f4f6",
                        borderRadius: 4,
                        padding: "1px 5px",
                        fontSize: 11,
                        fontFamily: "monospace",
                        marginRight: 4,
                      }}
                    >
                      {v}
                    </code>
                  ))}
                </div>
              </Field>

              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Vista previa del mensaje
                </div>
                <div
                  style={{
                    background: "#dcf8c6",
                    border: "1px solid #b5e7a0",
                    borderRadius: 12,
                    borderBottomRightRadius: 2,
                    padding: "10px 14px",
                    maxWidth: 340,
                    fontSize: 13,
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                    color: "#1a1a1a",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
                  }}
                >
                  {buildOrderConfirmationMessage(
                    {
                      id: "demo-order-abc123",
                      customer_name: "María García",
                      items: [
                        { name: "Kebab mixto", quantity: 2 },
                        { name: "Fanta naranja", quantity: 1 },
                      ],
                      total: 18.5,
                      order_type: "delivery",
                      estimated_minutes: 30,
                    },
                    restaurantName || "Mi Restaurante",
                    whatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE
                  )}
                </div>
              </div>

              <Field label="Proveedor de envío">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {(
                    [
                      { value: "link" as const, label: "WhatsApp Link", desc: "Activo — el cliente pulsa el botón", active: true },
                      { value: "twilio" as const, label: "Twilio", desc: "Próximamente — requiere configuración", active: false },
                      { value: "360dialog" as const, label: "360dialog", desc: "Próximamente — requiere configuración", active: false },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => { if (canSave && opt.active) setWhatsappProvider(opt.value); }}
                      style={{
                        border: `2px solid ${whatsappProvider === opt.value ? "var(--brand-primary)" : "var(--admin-card-border)"}`,
                        borderRadius: 10,
                        padding: "10px 12px",
                        textAlign: "left",
                        cursor: opt.active && canSave ? "pointer" : "not-allowed",
                        background: whatsappProvider === opt.value
                          ? "var(--brand-primary-soft)"
                          : opt.active ? "#fff" : "#f9fafb",
                        opacity: opt.active ? 1 : 0.55,
                        transition: "all 0.15s",
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 13, color: "var(--admin-text-primary)" }}>{opt.label}</div>
                      <div style={{ fontSize: 11, color: "var(--admin-text-secondary)", marginTop: 3, lineHeight: 1.4 }}>{opt.desc}</div>
                    </button>
                  ))}
                </div>
                {whatsappProvider === "link" && (
                  <div style={{ fontSize: 12, color: "var(--admin-text-secondary)", marginTop: 8, padding: "8px 12px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e5e7eb", lineHeight: 1.5 }}>
                    Con <strong>WhatsApp Link</strong> el cliente debe pulsar el botón para enviar el mensaje.{" "}
                    Con <strong>API</strong> el mensaje se envía automáticamente (requiere cuenta Twilio o 360dialog).
                  </div>
                )}
              </Field>

              {whatsappPhone.trim() && (
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      const msg = buildOrderConfirmationMessage(
                        {
                          id: "test-order-abc123",
                          customer_name: "Cliente de prueba",
                          items: [],
                          total: 15.0,
                          order_type: "pickup",
                          estimated_minutes: 20,
                        },
                        restaurantName || "Mi Restaurante",
                        whatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE
                      );
                      window.open(
                        `https://wa.me/${whatsappPhone.replace(/[\s\-\(\)]/g, "")}?text=${encodeURIComponent(msg)}`,
                        "_blank",
                        "noopener,noreferrer"
                      );
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      background: "#25d366",
                      color: "#fff",
                      border: "none",
                      borderRadius: 10,
                      padding: "9px 16px",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                    </svg>
                    Probar configuración
                  </button>
                  <span style={{ fontSize: 12, color: "var(--admin-text-muted)", marginLeft: 10 }}>
                    Abre WhatsApp con un mensaje de prueba al número configurado
                  </span>
                </div>
              )}
            </>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <SaveButton onClick={() => { void handleSave(); }} saving={saving} disabled={!canSave} />
          </div>
        </Card>
      )}
    </div>
  );
}
