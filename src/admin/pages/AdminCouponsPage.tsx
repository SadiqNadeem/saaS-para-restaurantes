import { useEffect, useRef, useState } from "react";

import { HelpTooltip } from "../components/HelpTooltip";
import { useAdminMembership } from "../components/AdminMembershipContext";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../../restaurant/RestaurantContext";

type Coupon = {
  id: string;
  restaurant_id: string;
  code: string;
  description: string | null;
  discount_type: "percent" | "fixed";
  discount_value: number;
  min_order_amount: number;
  max_uses: number | null;
  uses_count: number;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  created_at: string;
};

type CouponForm = {
  code: string;
  description: string;
  discount_type: "percent" | "fixed";
  discount_value: string;
  min_order_amount: string;
  max_uses: string;
  valid_from: string;
  valid_until: string;
  is_active: boolean;
};

const EMPTY_FORM: CouponForm = {
  code: "",
  description: "",
  discount_type: "percent",
  discount_value: "",
  min_order_amount: "0",
  max_uses: "",
  valid_from: "",
  valid_until: "",
  is_active: true,
};

type ToastType = "success" | "error";
type Toast = { id: number; type: ToastType; message: string };

let toastSeq = 0;

function formatDate(value: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

function formatDiscountValue(coupon: Coupon): string {
  if (coupon.discount_type === "percent") {
    return `${coupon.discount_value}%`;
  }
  return `${Number(coupon.discount_value).toFixed(2)} €`;
}

function toLocalDateInput(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 16);
}

export default function AdminCouponsPage() {
  const { restaurantId } = useRestaurant();
  const { canManage } = useAdminMembership();

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CouponForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const codeInputRef = useRef<HTMLInputElement>(null);

  const pushToast = (type: ToastType, message: string) => {
    const id = ++toastSeq;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("coupons")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false });

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    setCoupons((data ?? []) as Coupon[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  useEffect(() => {
    if (showModal) {
      setTimeout(() => codeInputRef.current?.focus(), 50);
    }
  }, [showModal]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowModal(true);
  };

  const openEdit = (coupon: Coupon) => {
    setEditingId(coupon.id);
    setForm({
      code: coupon.code,
      description: coupon.description ?? "",
      discount_type: coupon.discount_type,
      discount_value: String(coupon.discount_value),
      min_order_amount: String(coupon.min_order_amount),
      max_uses: coupon.max_uses !== null ? String(coupon.max_uses) : "",
      valid_from: toLocalDateInput(coupon.valid_from),
      valid_until: toLocalDateInput(coupon.valid_until),
      is_active: coupon.is_active,
    });
    setFormError(null);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setFormError(null);
  };

  const handleCodeChange = (raw: string) => {
    setForm((prev) => ({ ...prev, code: raw.toUpperCase().replace(/\s/g, "") }));
  };

  const handleSave = async () => {
    setFormError(null);

    const code = form.code.trim();
    if (!code) { setFormError("El código es obligatorio."); return; }

    const discount_value = parseFloat(form.discount_value);
    if (!Number.isFinite(discount_value) || discount_value <= 0) {
      setFormError("El valor del descuento debe ser mayor que 0.");
      return;
    }
    if (form.discount_type === "percent" && discount_value > 100) {
      setFormError("El porcentaje no puede superar 100.");
      return;
    }

    const min_order_amount = parseFloat(form.min_order_amount) || 0;
    const max_uses = form.max_uses.trim() ? parseInt(form.max_uses, 10) : null;
    const valid_from = form.valid_from ? new Date(form.valid_from).toISOString() : null;
    const valid_until = form.valid_until ? new Date(form.valid_until).toISOString() : null;

    if (valid_from && valid_until && valid_until <= valid_from) {
      setFormError("La fecha fin debe ser posterior a la fecha inicio.");
      return;
    }

    setSaving(true);

    if (editingId) {
      const { error: err } = await supabase
        .from("coupons")
        .update({
          code,
          description: form.description.trim() || null,
          discount_type: form.discount_type,
          discount_value,
          min_order_amount,
          max_uses,
          valid_from,
          valid_until,
          is_active: form.is_active,
        })
        .eq("id", editingId)
        .eq("restaurant_id", restaurantId);

      if (err) {
        setFormError(err.message);
        setSaving(false);
        return;
      }
      pushToast("success", "Cupón actualizado.");
    } else {
      const { error: err } = await supabase
        .from("coupons")
        .insert({
          restaurant_id: restaurantId,
          code,
          description: form.description.trim() || null,
          discount_type: form.discount_type,
          discount_value,
          min_order_amount,
          max_uses,
          valid_from,
          valid_until,
          is_active: form.is_active,
        });

      if (err) {
        setFormError(err.message.includes("unique") ? "Ya existe un cupón con ese código." : err.message);
        setSaving(false);
        return;
      }
      pushToast("success", "Cupón creado.");
    }

    setSaving(false);
    closeModal();
    void load();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    const { error: err } = await supabase
      .from("coupons")
      .update({ is_active: false })
      .eq("id", deleteId)
      .eq("restaurant_id", restaurantId);

    setDeleting(false);
    setDeleteId(null);

    if (err) {
      pushToast("error", err.message);
      return;
    }
    pushToast("success", "Cupón desactivado.");
    void load();
  };

  const handleCopy = (code: string) => {
    void navigator.clipboard.writeText(code);
    pushToast("success", `Código "${code}" copiado.`);
  };

  // ── Styles ──────────────────────────────────────────────────────────────────

  const card: React.CSSProperties = {
    background: "var(--admin-card-bg, #fff)",
    border: "1px solid var(--admin-card-border, #e5e7eb)",
    borderRadius: "var(--admin-radius-md, 12px)",
    boxShadow: "var(--admin-card-shadow, 0 1px 3px rgba(0,0,0,0.06))",
    padding: "20px 20px",
  };

  const btnPrimary: React.CSSProperties = {
    background: "var(--brand-primary, #4ec580)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "8px 16px",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
  };

  const btnSecondary: React.CSSProperties = {
    background: "#fff",
    color: "#374151",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    padding: "8px 14px",
    fontWeight: 500,
    fontSize: 13,
    cursor: "pointer",
  };

  const btnDanger: React.CSSProperties = {
    ...btnSecondary,
    color: "#991b1b",
    borderColor: "#fca5a5",
  };

  const inputStyle: React.CSSProperties = {
    border: "1px solid #d1d5db",
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 14,
    width: "100%",
    boxSizing: "border-box",
    background: "#fff",
    color: "#111827",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: "#374151",
    marginBottom: 4,
    display: "block",
  };

  return (
    <section style={{ display: "grid", gap: 20 }}>
      {/* Toasts */}
      <div
        style={{
          position: "fixed",
          top: 16,
          right: 16,
          zIndex: 9999,
          display: "grid",
          gap: 8,
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              background: t.type === "success" ? "#166534" : "#7f1d1d",
              color: "#fff",
              borderRadius: 10,
              padding: "10px 16px",
              fontSize: 13,
              fontWeight: 600,
              boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
              pointerEvents: "auto",
            }}
          >
            {t.message}
          </div>
        ))}
      </div>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 className="admin-panel" style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Cupones</h1>
          <p style={{ margin: "4px 0 0", color: "var(--admin-text-secondary, #6b7280)", fontSize: 13 }}>
            Crea y gestiona códigos de descuento para tus clientes.
          </p>
        </div>
        {canManage && (
          <button type="button" onClick={openCreate} style={btnPrimary}>
            + Nuevo cupón
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div style={card}>
          <div style={{ display: "grid", gap: 12 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ height: 60, borderRadius: 8, background: "#f3f4f6", animation: "pulse 1.5s infinite" }} />
            ))}
          </div>
        </div>
      ) : error ? (
        <div
          role="alert"
          style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#991b1b", borderRadius: 10, padding: "12px 16px", fontSize: 13 }}
        >
          {error}
        </div>
      ) : coupons.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}></div>
          <div style={{ fontWeight: 700, color: "#111827", marginBottom: 4 }}>Sin cupones</div>
          <div style={{ color: "#6b7280", fontSize: 13, marginBottom: 16 }}>
            Crea tu primer cupón de descuento para atraer más clientes.
          </div>
          {canManage && (
            <button type="button" onClick={openCreate} style={btnPrimary}>
              + Nuevo cupón
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {coupons.map((coupon) => {
            const usageText =
              coupon.max_uses !== null
                ? `${coupon.uses_count}/${coupon.max_uses} usos`
                : `${coupon.uses_count} usos`;
            const isExpired =
              coupon.valid_until !== null && new Date(coupon.valid_until) < new Date();
            const isExhausted =
              coupon.max_uses !== null && coupon.uses_count >= coupon.max_uses;

            return (
              <div
                key={coupon.id}
                style={{
                  ...card,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 14,
                  flexWrap: "wrap",
                  opacity: (!coupon.is_active || isExpired || isExhausted) ? 0.65 : 1,
                }}
              >
                {/* Code badge */}
                <div
                  style={{
                    background: "var(--brand-primary-soft, rgba(78,197,128,0.14))",
                    border: "1px solid var(--brand-primary-border, rgba(78,197,128,0.45))",
                    borderRadius: 8,
                    padding: "6px 12px",
                    fontWeight: 900,
                    fontSize: 16,
                    color: "var(--brand-hover, #2e8b57)",
                    letterSpacing: "0.08em",
                    flexShrink: 0,
                    alignSelf: "center",
                    fontFamily: "monospace",
                  }}
                >
                  {coupon.code}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 3 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>
                      {formatDiscountValue(coupon)} de descuento
                    </span>
                    {coupon.min_order_amount > 0 && (
                      <span style={{ fontSize: 12, color: "#6b7280" }}>
                        · mín. {coupon.min_order_amount.toFixed(2)} €
                      </span>
                    )}
                    {/* Status chips */}
                    {!coupon.is_active && (
                      <span
                        style={{
                          background: "#fee2e2",
                          color: "#991b1b",
                          borderRadius: 999,
                          padding: "2px 8px",
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        Inactivo
                      </span>
                    )}
                    {coupon.is_active && isExpired && (
                      <span
                        style={{
                          background: "#f3f4f6",
                          color: "#374151",
                          borderRadius: 999,
                          padding: "2px 8px",
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        Caducado
                      </span>
                    )}
                    {coupon.is_active && !isExpired && isExhausted && (
                      <span
                        style={{
                          background: "#fef3c7",
                          color: "#92400e",
                          borderRadius: 999,
                          padding: "2px 8px",
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        Agotado
                      </span>
                    )}
                    {coupon.is_active && !isExpired && !isExhausted && (
                      <span
                        style={{
                          background: "var(--brand-primary-soft)",
                          color: "var(--brand-hover, #2e8b57)",
                          borderRadius: 999,
                          padding: "2px 8px",
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        Activo
                      </span>
                    )}
                  </div>

                  {coupon.description && (
                    <div style={{ fontSize: 13, color: "#6b7280" }}>{coupon.description}</div>
                  )}

                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: "#9ca3af" }}>
                    <span>{usageText}</span>
                    {coupon.valid_from && <span>Desde {formatDate(coupon.valid_from)}</span>}
                    {coupon.valid_until && <span>Hasta {formatDate(coupon.valid_until)}</span>}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 6, flexShrink: 0, alignSelf: "center" }}>
                  <button
                    type="button"
                    title="Copiar código"
                    onClick={() => handleCopy(coupon.code)}
                    style={{ ...btnSecondary, padding: "6px 10px", fontSize: 14 }}
                  >
                    ⎘
                  </button>
                  {canManage && (
                    <>
                      <button
                        type="button"
                        onClick={() => openEdit(coupon)}
                        style={{ ...btnSecondary, padding: "6px 10px" }}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteId(coupon.id)}
                        style={{ ...btnDanger, padding: "6px 10px" }}
                        disabled={!coupon.is_active}
                      >
                        Desactivar
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(17,24,39,0.45)",
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: "24px 24px",
              width: "100%",
              maxWidth: 500,
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
              display: "grid",
              gap: 16,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#111827" }}>
              {editingId ? "Editar cupón" : "Nuevo cupón"}
            </h2>

            {/* Code */}
            <div>
              <label style={labelStyle} htmlFor="coupon-code">Código *</label>
              <input
                ref={codeInputRef}
                id="coupon-code"
                style={{ ...inputStyle, textTransform: "uppercase", fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.06em" }}
                value={form.code}
                onChange={(e) => handleCodeChange(e.target.value)}
                maxLength={30}
                placeholder="VERANO20"
              />
            </div>

            {/* Description */}
            <div>
              <label style={labelStyle} htmlFor="coupon-desc">Descripción (opcional)</label>
              <input
                id="coupon-desc"
                style={inputStyle}
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                maxLength={120}
                placeholder="Descuento de verano"
              />
            </div>

            {/* Discount type toggle */}
            <div>
              <label style={{ ...labelStyle, display: "inline-flex", alignItems: "center" }}>
                Tipo de descuento * <HelpTooltip text="Porcentaje: 10% del total. Fijo: 5€ de descuento" />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                {(["percent", "fixed"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, discount_type: type }))}
                    style={{
                      flex: 1,
                      padding: "8px 0",
                      borderRadius: 8,
                      border: `1px solid ${form.discount_type === type ? "var(--brand-primary)" : "#d1d5db"}`,
                      background:
                        form.discount_type === type
                          ? "var(--brand-primary-soft, rgba(78,197,128,0.14))"
                          : "#fff",
                      color: form.discount_type === type ? "var(--brand-hover, #2e8b57)" : "#374151",
                      fontWeight: form.discount_type === type ? 700 : 500,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    {type === "percent" ? "% Porcentaje" : "€ Importe fijo"}
                  </button>
                ))}
              </div>
            </div>

            {/* Discount value */}
            <div>
              <label style={labelStyle} htmlFor="coupon-value">
                Valor del descuento *{" "}
                <span style={{ fontWeight: 400, color: "#9ca3af" }}>
                  {form.discount_type === "percent" ? "(ej: 10 para 10%)" : "(ej: 5.00 para 5 €)"}
                </span>
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="coupon-value"
                  type="number"
                  min={0}
                  max={form.discount_type === "percent" ? 100 : undefined}
                  step={0.01}
                  style={{ ...inputStyle, paddingRight: 36 }}
                  value={form.discount_value}
                  onChange={(e) => setForm((p) => ({ ...p, discount_value: e.target.value }))}
                  placeholder="10"
                />
                <span
                  style={{
                    position: "absolute",
                    right: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#9ca3af",
                    fontSize: 14,
                    pointerEvents: "none",
                  }}
                >
                  {form.discount_type === "percent" ? "%" : "€"}
                </span>
              </div>
            </div>

            {/* Min order */}
            <div>
              <label style={{ ...labelStyle, display: "inline-flex", alignItems: "center" }} htmlFor="coupon-min">
                Pedido mínimo (€) <HelpTooltip text="El cupón solo aplica si el pedido supera este importe" />
              </label>
              <input
                id="coupon-min"
                type="number"
                min={0}
                step={0.01}
                style={inputStyle}
                value={form.min_order_amount}
                onChange={(e) => setForm((p) => ({ ...p, min_order_amount: e.target.value }))}
                placeholder="0"
              />
            </div>

            {/* Max uses */}
            <div>
              <label style={{ ...labelStyle, display: "inline-flex", alignItems: "center" }} htmlFor="coupon-maxuses">
                Usos máximos <HelpTooltip text="Deja vacío para cupones de uso ilimitado" />
              </label>
              <input
                id="coupon-maxuses"
                type="number"
                min={1}
                step={1}
                style={inputStyle}
                value={form.max_uses}
                onChange={(e) => setForm((p) => ({ ...p, max_uses: e.target.value }))}
                placeholder="Sin límite"
              />
            </div>

            {/* Dates */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle} htmlFor="coupon-from">Fecha inicio</label>
                <input
                  id="coupon-from"
                  type="datetime-local"
                  style={inputStyle}
                  value={form.valid_from}
                  onChange={(e) => setForm((p) => ({ ...p, valid_from: e.target.value }))}
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor="coupon-until">Fecha fin</label>
                <input
                  id="coupon-until"
                  type="datetime-local"
                  style={inputStyle}
                  value={form.valid_until}
                  onChange={(e) => setForm((p) => ({ ...p, valid_until: e.target.value }))}
                />
              </div>
            </div>

            {/* Active toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                type="button"
                role="switch"
                aria-checked={form.is_active}
                onClick={() => setForm((p) => ({ ...p, is_active: !p.is_active }))}
                style={{
                  width: 40,
                  height: 22,
                  borderRadius: 11,
                  background: form.is_active ? "var(--brand-primary, #4ec580)" : "#d1d5db",
                  border: "none",
                  cursor: "pointer",
                  position: "relative",
                  flexShrink: 0,
                  transition: "background 0.2s",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 2,
                    left: form.is_active ? 20 : 2,
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: "#fff",
                    transition: "left 0.2s",
                  }}
                />
              </button>
              <span style={{ fontSize: 13, color: "#374151" }}>
                Cupón {form.is_active ? "activo" : "inactivo"}
              </span>
            </div>

            {formError && (
              <div
                role="alert"
                style={{
                  border: "1px solid #fecaca",
                  background: "#fef2f2",
                  color: "#991b1b",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 13,
                }}
              >
                {formError}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={closeModal} style={btnSecondary} disabled={saving}>
                Cancelar
              </button>
              <button type="button" onClick={handleSave} style={btnPrimary} disabled={saving}>
                {saving ? "Guardando..." : editingId ? "Actualizar" : "Crear cupón"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId !== null && (
        <div
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeleteId(null);
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(17,24,39,0.45)",
            zIndex: 2100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 14,
              padding: "24px",
              maxWidth: 360,
              width: "100%",
              boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
              display: "grid",
              gap: 12,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#111827" }}>
              Desactivar cupón
            </h3>
            <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
              El cupón quedará inactivo y no podrá usarse. Puedes reactivarlo editándolo.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setDeleteId(null)}
                style={btnSecondary}
                disabled={deleting}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                style={{ ...btnPrimary, background: "#dc2626" }}
                disabled={deleting}
              >
                {deleting ? "Desactivando..." : "Desactivar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
