import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  buildOrderConfirmationMessage,
  DEFAULT_WHATSAPP_TEMPLATE,
  DEFAULT_WHATSAPP_TEMPLATES,
  DEFAULT_WHATSAPP_TRIGGERS,
  type WhatsAppTemplateKey,
  type WhatsAppTemplates,
  type WhatsAppTriggers,
} from "../../lib/whatsapp/whatsappService";
import { useAdminMembership } from "../components/AdminMembershipContext";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../../restaurant/RestaurantContext";

// ─── UI primitives ────────────────────────────────────────────────────────────

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
        width: 52, height: 30, borderRadius: 999, border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        background: checked ? "var(--brand-primary)" : "#d1d5db",
        position: "relative", flexShrink: 0,
        transition: "background 0.2s", opacity: disabled ? 0.55 : 1, padding: 0,
      }}
    >
      <span style={{
        position: "absolute", top: 3, left: checked ? 25 : 3,
        width: 24, height: 24, borderRadius: "50%", background: "#fff",
        transition: "left 0.18s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", display: "block",
      }} />
    </button>
  );
}

function SaveButton({ onClick, saving, disabled, label = "Guardar cambios" }: {
  onClick: () => void; saving: boolean; disabled: boolean; label?: string;
}) {
  const isDisabled = disabled || saving;
  return (
    <button
      type="button" onClick={onClick} disabled={isDisabled}
      style={{
        background: isDisabled ? "#9ca3af" : "var(--brand-primary)",
        color: "#fff", border: "none", borderRadius: 10, padding: "9px 16px",
        fontWeight: 700, fontSize: 14, cursor: isDisabled ? "not-allowed" : "pointer",
        display: "inline-flex", alignItems: "center", gap: 8, transition: "background 0.15s",
      }}
    >
      {saving && (
        <span style={{
          width: 13, height: 13,
          border: "2px solid rgba(255,255,255,0.35)", borderTop: "2px solid #fff",
          borderRadius: "50%", display: "inline-block",
          animation: "wa-spin 0.8s linear infinite",
        }} />
      )}
      {saving ? "Guardando..." : label}
    </button>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <article style={{
      background: "#fff", border: "1px solid #dbe5ef", borderRadius: 16,
      boxShadow: "0 10px 22px rgba(15,23,42,0.07)", padding: "20px",
      display: "grid", gap: 18,
    }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--admin-text-primary)" }}>{title}</h3>
        {subtitle && <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--admin-text-secondary)" }}>{subtitle}</p>}
      </div>
      {children}
    </article>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-text-primary)" }}>
        {label}
        {hint && <span style={{ fontWeight: 400, color: "var(--admin-text-secondary)", marginLeft: 5 }}>— {hint}</span>}
      </span>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--admin-card-border)", borderRadius: 8,
  padding: "8px 10px", fontSize: 14, color: "var(--admin-text-primary)",
  background: "#fff", width: "100%", boxSizing: "border-box", outline: "none",
};

// ─── Template tab config ──────────────────────────────────────────────────────

type TemplateTab = {
  key: WhatsAppTemplateKey;
  label: string;
  triggerKey: keyof WhatsAppTriggers | null;
  previewStatus: string; // used to build demo order preview
};

const TEMPLATE_TABS: TemplateTab[] = [
  { key: "order_received", label: "Recibido", triggerKey: "on_order_received", previewStatus: "pending" },
  { key: "order_accepted", label: "Aceptado", triggerKey: "on_order_accepted", previewStatus: "accepted" },
  { key: "order_preparing", label: "Preparando", triggerKey: "on_order_preparing", previewStatus: "preparing" },
  { key: "order_ready", label: "Listo", triggerKey: "on_order_ready", previewStatus: "ready" },
  { key: "order_delivering",label: "En camino", triggerKey: "on_order_delivering", previewStatus: "out_for_delivery" },
  { key: "order_delivered", label: "Entregado", triggerKey: "on_order_delivered", previewStatus: "delivered" },
  { key: "order_cancelled", label: "Cancelado", triggerKey: "on_order_cancelled", previewStatus: "cancelled" },
];

const DEMO_ORDER = {
  id: "demo-order-abc123",
  customer_name: "María García",
  items: [{ name: "Kebab mixto", quantity: 2 }, { name: "Fanta naranja", quantity: 1 }],
  total: 18.5,
  order_type: "delivery",
  estimated_minutes: 30,
};

const ALL_VARIABLES = [
  "{order_number}", "{customer_name}", "{total}", "{estimated_time}",
  "{restaurant_name}", "{items_list}", "{order_type}",
  "{menu_url}", "{whatsapp_phone}", "{review_url}",
];

// ─── Toast ────────────────────────────────────────────────────────────────────

type ToastType = "success" | "error";
type Toast = { id: number; type: ToastType; message: string };

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminWhatsAppPage() {
  const { restaurantId, name: restaurantName } = useRestaurant();
  const { canManage } = useAdminMembership();

  // ── Basic settings
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [whatsappProvider, setWhatsappProvider] = useState<"link" | "twilio" | "360dialog">("link");

  // ── New: per-status templates
  const [templates, setTemplates] = useState<WhatsAppTemplates>({ ...DEFAULT_WHATSAPP_TEMPLATES });
  const [triggers, setTriggers] = useState<WhatsAppTriggers>({ ...DEFAULT_WHATSAPP_TRIGGERS });
  const [autoReply, setAutoReply] = useState(false);

  // ── Legacy single template (kept for backwards compat, shown in bot_menu_reply tab)
  const [activeTab, setActiveTab] = useState<WhatsAppTemplateKey>("order_received");

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeqRef = useRef(0);

  const pushToast = useCallback((type: ToastType, message: string) => {
    toastSeqRef.current += 1;
    const id = toastSeqRef.current;
    setToasts((prev) => [...prev, { id, type, message }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  // ── Load
  useEffect(() => {
    void (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("restaurant_settings")
        .select(
          "whatsapp_enabled, whatsapp_phone, whatsapp_message_template, whatsapp_provider, whatsapp_templates, whatsapp_auto_reply, whatsapp_triggers"
        )
        .eq("restaurant_id", restaurantId)
        .maybeSingle();

      if (error) {
        pushToast("error", `Error cargando ajustes: ${error.message}`);
      } else if (data) {
        setWhatsappEnabled(data.whatsapp_enabled === true);
        setWhatsappPhone(data.whatsapp_phone ?? "");
        setWhatsappProvider(
          data.whatsapp_provider === "twilio" ? "twilio"
          : data.whatsapp_provider === "360dialog" ? "360dialog"
          : "link"
        );
        setAutoReply(data.whatsapp_auto_reply === true);

        // Merge saved templates with defaults so new keys always have a value
        if (data.whatsapp_templates && typeof data.whatsapp_templates === "object") {
          setTemplates({ ...DEFAULT_WHATSAPP_TEMPLATES, ...(data.whatsapp_templates as WhatsAppTemplates) });
        }

        if (data.whatsapp_triggers && typeof data.whatsapp_triggers === "object") {
          setTriggers({ ...DEFAULT_WHATSAPP_TRIGGERS, ...(data.whatsapp_triggers as WhatsAppTriggers) });
        }
      }
      setLoading(false);
    })();
  }, [restaurantId, pushToast]);

  // ── Save
  const handleSave = async () => {
    if (!canManage || saving) return;
    setSaving(true);
    const { error } = await supabase
      .from("restaurant_settings")
      .upsert(
        {
          restaurant_id: restaurantId,
          whatsapp_enabled: whatsappEnabled,
          whatsapp_phone: whatsappPhone.trim() || null,
          whatsapp_provider: whatsappProvider,
          // legacy field — keep in sync with order_received template
          whatsapp_message_template: templates.order_received || DEFAULT_WHATSAPP_TEMPLATE,
          whatsapp_templates: templates,
          whatsapp_auto_reply: autoReply,
          whatsapp_triggers: triggers,
        },
        { onConflict: "restaurant_id" }
      );
    if (error) pushToast("error", `Error: ${error.message}`);
    else pushToast("success", "Configuración de WhatsApp guardada.");
    setSaving(false);
  };

  // ── Template helpers
  const updateTemplate = (key: WhatsAppTemplateKey, value: string) =>
    setTemplates((prev) => ({ ...prev, [key]: value }));

  const updateTrigger = (key: keyof WhatsAppTriggers, value: boolean) =>
    setTriggers((prev) => ({ ...prev, [key]: value }));

  const resetTemplate = (key: WhatsAppTemplateKey) =>
    setTemplates((prev) => ({ ...prev, [key]: DEFAULT_WHATSAPP_TEMPLATES[key] }));

  // ── Active tab data
  const currentTab = TEMPLATE_TABS.find((t) => t.key === activeTab) ?? TEMPLATE_TABS[0];
  const currentBody = templates[activeTab] ?? DEFAULT_WHATSAPP_TEMPLATES[activeTab];

  const previewText = buildOrderConfirmationMessage(
    { ...DEMO_ORDER },
    restaurantName || "Mi Restaurante",
    currentBody,
    {
      menuUrl: "https://mirestaurante.com/menu",
      whatsappPhone: whatsappPhone || "+34 600 000 000",
      reviewUrl: "https://g.page/r/mirestaurante",
    }
  );

  // ── Status badge color for tab
  const tabStatusColor: Record<WhatsAppTemplateKey, string> = {
    order_received: "#f59e0b",
    order_accepted: "#3b82f6",
    order_preparing: "#f97316",
    order_ready: "#8b5cf6",
    order_delivering:"#6366f1",
    order_delivered: "#22c55e",
    order_cancelled: "#ef4444",
    bot_menu_reply: "#25d366",
  };

  return (
    <div style={{ maxWidth: 820 }}>
      <style>{`
        @keyframes wa-spin { to { transform: rotate(360deg); } }
        .wa-tab { transition: all 0.15s; }
        .wa-tab:hover { background: #f3f4f6 !important; }
        .wa-tab-active { background: var(--brand-primary-soft) !important; border-color: var(--brand-primary) !important; }
      `}</style>

      {/* Toasts */}
      <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8 }}>
        {toasts.map((t) => (
          <div key={t.id} style={{
            padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600, color: "#fff",
            background: t.type === "success" ? "#16a34a" : "#ef4444",
            boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
          }}>
            {t.message}
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 20 }}>
        <h1 className="admin-panel" style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
          Chatbot de WhatsApp
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--admin-text-secondary)" }}>
          Configura notificaciones automáticas y plantillas de mensaje por estado de pedido
        </p>
      </div>

      {loading ? (
        <div style={{ color: "var(--admin-text-secondary)", fontSize: 14 }}>Cargando...</div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>

          {/* ── Card 1: Basic config ── */}
          <Card title="Configuración general" subtitle="Número, proveedor y activación del canal WhatsApp">
            <Field label="Activar notificaciones WhatsApp">
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Toggle checked={whatsappEnabled} onChange={setWhatsappEnabled} disabled={!canManage} />
                <span style={{ fontSize: 13, color: "var(--admin-text-secondary)" }}>
                  {whatsappEnabled ? "Activo — los clientes recibirán confirmaciones por WhatsApp" : "Inactivo"}
                </span>
              </div>
            </Field>

            {whatsappEnabled && (
              <>
                <Field label="Número de WhatsApp del restaurante" hint="Con código de país, sin espacios (ej. +34612345678)">
                  <input
                    style={inputStyle} type="tel"
                    value={whatsappPhone}
                    onChange={(e) => setWhatsappPhone(e.target.value)}
                    placeholder="+34 612 345 678"
                    disabled={!canManage}
                  />
                </Field>

                <Field label="Proveedor de envío">
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                    {([
                      { value: "link" as const, label: "WhatsApp Link", desc: "Activo — el cliente pulsa el botón", active: true },
                      { value: "twilio" as const, label: "Twilio", desc: "Próximamente — requiere configuración", active: false },
                      { value: "360dialog" as const, label: "360dialog", desc: "Próximamente — requiere configuración", active: false },
                    ]).map((opt) => (
                      <button
                        key={opt.value} type="button"
                        onClick={() => { if (canManage && opt.active) setWhatsappProvider(opt.value); }}
                        style={{
                          border: `2px solid ${whatsappProvider === opt.value ? "var(--brand-primary)" : "var(--admin-card-border)"}`,
                          borderRadius: 10, padding: "10px 12px", textAlign: "left",
                          cursor: opt.active && canManage ? "pointer" : "not-allowed",
                          background: whatsappProvider === opt.value ? "var(--brand-primary-soft)" : opt.active ? "#fff" : "#f9fafb",
                          opacity: opt.active ? 1 : 0.55, transition: "all 0.15s",
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 13, color: "var(--admin-text-primary)" }}>{opt.label}</div>
                        <div style={{ fontSize: 11, color: "var(--admin-text-secondary)", marginTop: 3, lineHeight: 1.4 }}>{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </Field>
              </>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <SaveButton onClick={() => { void handleSave(); }} saving={saving} disabled={!canManage} />
            </div>
          </Card>

          {/* ── Card 2: Triggers ── */}
          {whatsappEnabled && (
            <Card title="Notificaciones automáticas" subtitle="Elige en qué momentos se envía un mensaje al cliente">
              <div style={{ display: "grid", gap: 12 }}>
                {TEMPLATE_TABS.map((tab) => {
                  if (!tab.triggerKey) return null;
                  const isOn = triggers[tab.triggerKey];
                  return (
                    <div key={tab.key} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "10px 14px", borderRadius: 10,
                      border: `1px solid ${isOn ? "var(--brand-primary-border)" : "var(--admin-card-border)"}`,
                      background: isOn ? "var(--brand-primary-soft)" : "#fafafa",
                      transition: "all 0.15s",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{
                          width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                          background: tabStatusColor[tab.key],
                        }} />
                        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--admin-text-primary)" }}>
                          Pedido {tab.label.toLowerCase()}
                        </span>
                      </div>
                      <Toggle
                        checked={isOn}
                        onChange={(v) => updateTrigger(tab.triggerKey!, v)}
                        disabled={!canManage}
                      />
                    </div>
                  );
                })}
              </div>

              <div style={{ borderTop: "1px solid var(--admin-card-border)", paddingTop: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "var(--admin-text-primary)" }}>
                      Auto-respuesta al bot
                    </div>
                    <div style={{ fontSize: 12, color: "var(--admin-text-secondary)", marginTop: 2 }}>
                      Responde automáticamente cuando un cliente escribe al número del restaurante
                    </div>
                  </div>
                  <Toggle checked={autoReply} onChange={setAutoReply} disabled={!canManage} />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <SaveButton onClick={() => { void handleSave(); }} saving={saving} disabled={!canManage} />
              </div>
            </Card>
          )}

          {/* ── Card 3: Per-status templates ── */}
          {whatsappEnabled && (
            <Card
              title="Plantillas de mensaje por estado"
              subtitle="Personaliza el texto que recibe el cliente en cada momento del pedido"
            >
              {/* Tab bar */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {TEMPLATE_TABS.map((tab) => {
                  const isActive = activeTab === tab.key;
                  const triggerOn = tab.triggerKey ? triggers[tab.triggerKey] : false;
                  return (
                    <button
                      key={tab.key} type="button"
                      className={`wa-tab${isActive ? " wa-tab-active" : ""}`}
                      onClick={() => setActiveTab(tab.key)}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "5px 12px", borderRadius: 20, fontSize: 13, fontWeight: 500,
                        border: `1.5px solid ${isActive ? "var(--brand-primary)" : "var(--admin-card-border)"}`,
                        background: isActive ? "var(--brand-primary-soft)" : "#fff",
                        color: isActive ? "var(--brand-primary)" : "var(--admin-text-primary)",
                        cursor: "pointer",
                      }}
                    >
                      <span style={{
                        width: 7, height: 7, borderRadius: "50%",
                        background: triggerOn ? tabStatusColor[tab.key] : "#d1d5db",
                        flexShrink: 0,
                      }} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Trigger toggle for the active tab */}
              {currentTab.triggerKey && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 14px", borderRadius: 10,
                  border: "1px solid var(--admin-card-border)", background: "#f8fafc",
                }}>
                  <Toggle
                    checked={triggers[currentTab.triggerKey]}
                    onChange={(v) => updateTrigger(currentTab.triggerKey!, v)}
                    disabled={!canManage}
                  />
                  <span style={{ fontSize: 13, color: "var(--admin-text-secondary)" }}>
                    Enviar este mensaje cuando el pedido cambia a <strong>{currentTab.label.toLowerCase()}</strong>
                  </span>
                </div>
              )}

              {/* Template editor */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-text-primary)" }}>
                      Mensaje
                    </span>
                    <button
                      type="button"
                      onClick={() => resetTemplate(activeTab)}
                      disabled={!canManage}
                      style={{
                        fontSize: 12, color: "var(--admin-text-secondary)", background: "none",
                        border: "none", cursor: canManage ? "pointer" : "not-allowed", padding: 0,
                        textDecoration: "underline",
                      }}
                    >
                      Restaurar por defecto
                    </button>
                  </div>
                  <textarea
                    style={{ ...inputStyle, resize: "vertical", minHeight: 140, fontFamily: "monospace", fontSize: 13, lineHeight: 1.55 }}
                    value={currentBody}
                    onChange={(e) => updateTemplate(activeTab, e.target.value)}
                    disabled={!canManage}
                  />
                  {/* Variable chips */}
                  <div style={{ fontSize: 12, color: "var(--admin-text-secondary)", lineHeight: 2 }}>
                    Variables:{" "}
                    {ALL_VARIABLES.map((v) => (
                      <code
                        key={v}
                        onClick={() => {
                          if (!canManage) return;
                          updateTemplate(activeTab, currentBody + v);
                        }}
                        title="Clic para insertar al final"
                        style={{
                          background: "#f3f4f6", borderRadius: 4, padding: "1px 5px",
                          fontSize: 11, fontFamily: "monospace", marginRight: 4,
                          cursor: canManage ? "pointer" : "default",
                          border: "1px solid #e5e7eb",
                        }}
                      >
                        {v}
                      </code>
                    ))}
                  </div>
                </div>

                {/* Live preview */}
                <div style={{ display: "grid", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-text-primary)" }}>
                    Vista previa
                  </span>
                  {/* Phone mockup */}
                  <div style={{
                    background: "#e5ddd5",
                    backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='6' height='6' viewBox='0 0 6 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23c8bdb5' fill-opacity='0.4' fill-rule='evenodd'%3E%3Cpath d='M5 0h1L0 6V5zM6 5v1H5z'/%3E%3C/g%3E%3C/svg%3E\")",
                    borderRadius: 12, padding: "14px 10px", minHeight: 120,
                  }}>
                    <div style={{
                      background: "#dcf8c6", borderRadius: 12, borderBottomRightRadius: 2,
                      padding: "10px 14px", maxWidth: 280, marginLeft: "auto",
                      fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", color: "#1a1a1a",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
                    }}>
                      {previewText}
                    </div>
                    <div style={{
                      textAlign: "right", fontSize: 11, color: "#8c8c8c",
                      marginTop: 4, paddingRight: 4,
                    }}>
                      {new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })} ✓✓
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--admin-text-muted)", lineHeight: 1.4 }}>
                    Vista previa con datos de ejemplo. Los valores reales se sustituyen al enviar.
                  </div>
                </div>
              </div>

              {/* Test + Save */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                {whatsappPhone.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      const link = `https://wa.me/${whatsappPhone.replace(/[\s\-\(\)]/g, "")}?text=${encodeURIComponent(previewText)}`;
                      window.open(link, "_blank", "noopener,noreferrer");
                    }}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 8,
                      background: "#25d366", color: "#fff", border: "none",
                      borderRadius: 10, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer",
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                    </svg>
                    Probar en WhatsApp
                  </button>
                )}
                <SaveButton onClick={() => { void handleSave(); }} saving={saving} disabled={!canManage} />
              </div>
            </Card>
          )}

        </div>
      )}
    </div>
  );
}
