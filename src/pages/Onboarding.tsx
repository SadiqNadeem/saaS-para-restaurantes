import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import QRCode from "qrcode";

import { prepareImageWebp } from "../lib/images/prepareImageWebp";
import { uploadProductImage } from "../lib/images/uploadProductImage";
import { supabase } from "../lib/supabase";

// ─── constants ───────────────────────────────────────────────────────────────

const TOTAL_STEPS = 4;

// Mon first in display, Sun last. Index matches day_of_week (0=Sun, 1=Mon…).
const DISPLAY_DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAMES = [
  "Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado",
] as const;

const STEP_META = [
  { title: "Tu restaurante", desc: "Información básica y configuración de delivery" },
  { title: "Horarios", desc: "¿Cuándo está abierto tu restaurante?" },
  { title: "Tu primer producto", desc: "Añade productos para que tu menú no esté vacío" },
  { title: "¡Listo!", desc: "Tu restaurante está listo para recibir pedidos" },
] as const;

// ─── types ───────────────────────────────────────────────────────────────────

type DayRow = { is_open: boolean; open_time: string; close_time: string };

type ProductDraft = {
  id: string;
  name: string;
  price: string;
  description: string;
  imageFile: File | null;
  localPreview: string | null;
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function emptyProduct(): ProductDraft {
  return {
    id: crypto.randomUUID(),
    name: "",
    price: "",
    description: "",
    imageFile: null,
    localPreview: null,
  };
}

function defaultHours(): Record<number, DayRow> {
  const map: Record<number, DayRow> = {};
  for (let i = 0; i <= 6; i++) {
    map[i] = { is_open: false, open_time: "09:00", close_time: "22:00" };
  }
  return map;
}

// ─── canvas confetti ─────────────────────────────────────────────────────────

function ConfettiCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const COLORS = [
      "#4ec580", "#ff6b6b", "#ffd93d", "#6c5ce7",
      "#a29bfe", "#fd79a8", "#00cec9", "#fdcb6e",
    ];

    type Particle = {
      x: number; y: number; vx: number; vy: number;
      color: string; w: number; h: number;
      rotation: number; rv: number; opacity: number;
    };

    const particles: Particle[] = Array.from({ length: 130 }, () => ({
      x: Math.random() * window.innerWidth,
      y: -10 - Math.random() * 120,
      vx: (Math.random() - 0.5) * 4,
      vy: 1.5 + Math.random() * 3.5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      w: 6 + Math.random() * 9,
      h: 4 + Math.random() * 5,
      rotation: Math.random() * Math.PI * 2,
      rv: (Math.random() - 0.5) * 0.18,
      opacity: 1,
    }));

    let raf: number;

    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.06;
        p.rotation += p.rv;
        if (p.y > canvas.height * 0.65) {
          p.opacity = Math.max(0, p.opacity - 0.025);
        }
        if (p.opacity > 0) alive = true;

        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }

      if (alive) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9000 }}
    />
  );
}

// ─── shared UI components ─────────────────────────────────────────────────────

function ProgressBar({ step, total }: { step: number; total: number }) {
  const pct = ((step - 1) / (total - 1)) * 100;
  return (
    <div style={{ marginBottom: 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 6,
          fontSize: 12,
          color: "#9ca3af",
        }}
      >
        <span>Paso {step} de {total}</span>
        <span>{Math.round(pct)}%</span>
      </div>
      <div
        style={{
          height: 4,
          background: "#f3f4f6",
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: "#111827",
            borderRadius: 4,
            transition: "width 0.35s ease",
          }}
        />
      </div>
    </div>
  );
}

function StepHeader({ step }: { step: number }) {
  const meta = STEP_META[step - 1];
  return (
    <div style={{ marginBottom: 20 }}>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#111827" }}>
        {meta.title}
      </h2>
      <p style={{ margin: "4px 0 0", fontSize: 14, color: "#6b7280" }}>{meta.desc}</p>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
      <span style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>{label}</span>
      {children}
      {hint ? <span style={{ fontSize: 12, color: "#9ca3af" }}>{hint}</span> : null}
    </label>
  );
}

function Toggle({
  on,
  onChange,
  disabled,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      disabled={disabled}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        border: "none",
        background: on ? "#111827" : "#d1d5db",
        cursor: disabled ? "not-allowed" : "pointer",
        padding: 0,
        display: "flex",
        alignItems: "center" as const,
        flexShrink: 0,
        transition: "background 0.2s",
      }}
    >
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
          marginLeft: on ? 22 : 2,
          transition: "margin-left 0.2s",
          flexShrink: 0,
          display: "block",
        }}
      />
    </button>
  );
}

// ─── style constants ──────────────────────────────────────────────────────────

const INPUT: React.CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "9px 11px",
  fontSize: 14,
  color: "#111827",
  background: "#fff",
  outline: "none",
  width: "100%",
  boxSizing: "border-box" as const,
};

const BTN_PRIMARY: React.CSSProperties = {
  border: "1px solid #111827",
  borderRadius: 8,
  padding: "10px 20px",
  background: "#111827",
  color: "#fff",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const BTN_SECONDARY: React.CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "10px 16px",
  background: "#fff",
  color: "#374151",
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
};

// ─── main component ───────────────────────────────────────────────────────────

export default function Onboarding() {
  const navigate = useNavigate();
  const location = useLocation();

  const [currentStep, setCurrentStep] = useState(1);
  const [restaurantId, setRestaurantId] = useState("");
  const [slug, setSlug] = useState("");
  const [initLoading, setInitLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  // ── Step 1 state ──
  const [restaurantName, setRestaurantName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [hasDelivery, setHasDelivery] = useState(false);
  const [deliveryRadius, setDeliveryRadius] = useState("5");
  const [deliveryFee, setDeliveryFee] = useState("0");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // ── Step 2 state ──
  const [hoursByDay, setHoursByDay] = useState<Record<number, DayRow>>(defaultHours);

  // ── Step 3 state ──
  const [categoryName, setCategoryName] = useState("");
  const [products, setProducts] = useState<ProductDraft[]>([emptyProduct()]);

  // ── init: load restaurant from URL param ──
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const slugParam = params.get("restaurant") ?? "";
    const nameParam = params.get("name") ?? "";

    if (!slugParam) {
      navigate("/register", { replace: true });
      return;
    }

    setSlug(slugParam);
    if (nameParam) setRestaurantName(decodeURIComponent(nameParam));

    supabase
      .from("restaurants")
      .select("id,name")
      .eq("slug", slugParam)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          navigate("/register", { replace: true });
          return;
        }
        setRestaurantId(String(data.id));
        if (!nameParam) setRestaurantName(String(data.name ?? ""));
        setInitLoading(false);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
      for (const p of products) {
        if (p.localPreview) URL.revokeObjectURL(p.localPreview);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const adminUrl = `/r/${slug}/admin`;
  const menuUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/r/${slug}`;

  // ── save helpers ──

  const saveStep1 = async () => {
    setSaving(true);
    setErrorMsg(null);
    try {
      const trimmedName = restaurantName.trim();
      if (trimmedName) {
        await supabase
          .from("restaurants")
          .update({ name: trimmedName })
          .eq("id", restaurantId);
      }

      const settingsPayload: Record<string, unknown> = {
        restaurant_id: restaurantId,
        business_phone: phone.trim() || null,
      };
      if (hasDelivery) {
        settingsPayload.delivery_radius_km = Number(deliveryRadius) || 5;
        settingsPayload.delivery_fee_fixed = Number(deliveryFee) || 0;
      }
      await supabase
        .from("restaurant_settings")
        .upsert(settingsPayload, { onConflict: "restaurant_id" });

      // Logo: best-effort — path in product-images bucket
      if (logoFile) {
        try {
          const blob = await prepareImageWebp(logoFile);
          await uploadProductImage(
            supabase,
            restaurantId,
            `restaurant-logo-${restaurantId}`,
            blob
          );
        } catch {
          // silent — logo is optional
        }
      }

      setCurrentStep(2);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error al guardar.");
    } finally {
      setSaving(false);
    }
  };

  const saveStep2 = async () => {
    setSaving(true);
    setErrorMsg(null);
    try {
      const payload = DISPLAY_DAY_ORDER.map((day) => {
        const row = hoursByDay[day];
        return {
          restaurant_id: restaurantId,
          day_of_week: day,
          is_open: row.is_open,
          open_time: row.is_open ? row.open_time : null,
          close_time: row.is_open ? row.close_time : null,
        };
      });

      const { error } = await supabase
        .from("restaurant_hours")
        .upsert(payload, { onConflict: "restaurant_id,day_of_week" });

      if (error) throw error;
      setCurrentStep(3);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error al guardar horarios.");
    } finally {
      setSaving(false);
    }
  };

  const copyTimesToAllDays = () => {
    const sourceDay =
      DISPLAY_DAY_ORDER.find((d) => hoursByDay[d].is_open) ?? DISPLAY_DAY_ORDER[0];
    const { open_time, close_time } = hoursByDay[sourceDay];
    setHoursByDay((prev) => {
      const next = { ...prev };
      for (const day of DISPLAY_DAY_ORDER) {
        next[day] = { ...next[day], open_time, close_time };
      }
      return next;
    });
  };

  const saveStep3 = async () => {
    const validProducts = products.filter((p) => p.name.trim().length > 0);
    const hasAnything = categoryName.trim().length > 0 || validProducts.length > 0;

    if (!hasAnything) {
      setCurrentStep(4);
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    try {
      const catName = categoryName.trim() || "Menú";
      const { data: catData, error: catError } = await supabase
        .from("categories")
        .insert({
          restaurant_id: restaurantId,
          name: catName,
          sort_order: 0,
          is_active: true,
        })
        .select("id")
        .single();

      if (catError) throw catError;
      const categoryId = catData?.id ? String(catData.id) : null;

      for (const [index, prod] of validProducts.entries()) {
        const { data: prodData, error: prodError } = await supabase
          .from("products")
          .insert({
            restaurant_id: restaurantId,
            category_id: categoryId,
            name: prod.name.trim(),
            price: Number(prod.price) || 0,
            description: prod.description.trim() || null,
            sort_order: index,
            is_active: true,
          })
          .select("id")
          .single();

        if (prodError) throw prodError;

        if (prodData?.id && prod.imageFile) {
          try {
            const blob = await prepareImageWebp(prod.imageFile);
            const url = await uploadProductImage(
              supabase,
              restaurantId,
              String(prodData.id),
              blob
            );
            await supabase
              .from("products")
              .update({ image_url: url })
              .eq("id", String(prodData.id));
          } catch {
            // silent — image is optional
          }
        }
      }

      setCurrentStep(4);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error al guardar productos.");
    } finally {
      setSaving(false);
    }
  };

  const updateProduct = (index: number, key: keyof ProductDraft, value: unknown) => {
    setProducts((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [key]: value } : p))
    );
  };

  const handleProductImage = (index: number, file: File | null) => {
    const prev = products[index];
    if (prev?.localPreview) URL.revokeObjectURL(prev.localPreview);
    if (!file) {
      updateProduct(index, "imageFile", null);
      updateProduct(index, "localPreview", null);
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setProducts((prev) =>
      prev.map((p, i) =>
        i === index ? { ...p, imageFile: file, localPreview: previewUrl } : p
      )
    );
  };

  // Generate QR code when reaching the success step
  useEffect(() => {
    if (currentStep !== 4 || !menuUrl) return;
    QRCode.toDataURL(menuUrl, {
      width: 220,
      margin: 2,
      color: { dark: "#111827", light: "#ffffff" },
    })
      .then((url) => setQrDataUrl(url))
      .catch(() => { /* silent — QR is cosmetic */ });
  }, [currentStep, menuUrl]);

  const goBack = () => {
    setErrorMsg(null);
    setCurrentStep((s) => s - 1);
  };

  const handleNext = () => {
    setErrorMsg(null);
    if (currentStep === 1) void saveStep1();
    else if (currentStep === 2) void saveStep2();
    else if (currentStep === 3) void saveStep3();
  };

  // ── render ────────────────────────────────────────────────────────────────

  if (initLoading) {
    return (
      <PageShell>
        <p style={{ color: "#6b7280", fontSize: 14 }}>Cargando...</p>
      </PageShell>
    );
  }

  return (
    <>
      {currentStep === 4 && <ConfettiCanvas />}

      <PageShell>
        <div
          style={{
            width: "100%",
            maxWidth: 620,
            background: "#ffffff",
            borderRadius: 16,
            border: "1px solid #e5e7eb",
            boxShadow: "0 4px 24px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.04)",
            padding: "28px 28px 24px",
          }}
        >
          <ProgressBar step={currentStep} total={TOTAL_STEPS} />
          <StepHeader step={currentStep} />

          {errorMsg ? (
            <div
              role="alert"
              style={{
                margin: "0 0 12px",
                fontSize: 13,
                color: "#b91c1c",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: 8,
                padding: "8px 10px",
              }}
            >
              {errorMsg}
            </div>
          ) : null}

          {/* ── Step 1: Tu restaurante ── */}
          {currentStep === 1 && (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 14 }}>
              <Field label="Nombre del restaurante">
                <input
                  style={INPUT}
                  value={restaurantName}
                  onChange={(e) => setRestaurantName(e.target.value)}
                  placeholder="Mi Restaurante"
                  disabled={saving}
                />
              </Field>

              <Field
                label="Teléfono de contacto"
                hint="El número que aparecerá para los clientes"
              >
                <input
                  style={INPUT}
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+34 600 000 000"
                  disabled={saving}
                />
              </Field>

              <Field
                label="Dirección"
                hint="Solo para referencia interna"
              >
                <input
                  style={INPUT}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Calle Mayor 1, Madrid"
                  disabled={saving}
                />
              </Field>

              <Field label="Logo (opcional)">
                {logoPreview ? (
                  <img
                    src={logoPreview}
                    alt="Logo preview"
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: 10,
                      objectFit: "cover" as const,
                      border: "1px solid #e5e7eb",
                      marginBottom: 6,
                    }}
                  />
                ) : null}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={saving}
                  style={{ fontSize: 13 }}
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    if (logoPreview) URL.revokeObjectURL(logoPreview);
                    setLogoFile(file);
                    setLogoPreview(file ? URL.createObjectURL(file) : null);
                  }}
                />
              </Field>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between" as const,
                  gap: 12,
                  padding: "10px 12px",
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                }}
              >
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14, color: "#374151" }}>
                    ¿Haces delivery?
                  </div>
                  <div style={{ fontSize: 12, color: "#9ca3af" }}>
                    Activa si ofreces entrega a domicilio
                  </div>
                </div>
                <Toggle on={hasDelivery} onChange={setHasDelivery} disabled={saving} />
              </div>

              {hasDelivery ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                  }}
                >
                  <Field label="Radio máximo (km)">
                    <input
                      style={INPUT}
                      type="number"
                      min={0}
                      step="0.5"
                      value={deliveryRadius}
                      onChange={(e) => setDeliveryRadius(e.target.value)}
                      disabled={saving}
                    />
                  </Field>
                  <Field label="Tarifa fija (€)">
                    <input
                      style={INPUT}
                      type="number"
                      min={0}
                      step="0.01"
                      value={deliveryFee}
                      onChange={(e) => setDeliveryFee(e.target.value)}
                      disabled={saving}
                    />
                  </Field>
                </div>
              ) : null}
            </div>
          )}

          {/* ── Step 2: Horarios ── */}
          {currentStep === 2 && (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "flex-end" as const }}>
                <button
                  type="button"
                  onClick={copyTimesToAllDays}
                  disabled={saving}
                  style={{ ...BTN_SECONDARY, fontSize: 13, padding: "7px 12px" }}
                >
                  Copiar horario a todos los días
                </button>
              </div>

              {DISPLAY_DAY_ORDER.map((day) => {
                const row = hoursByDay[day];
                return (
                  <div
                    key={day}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      border: "1px solid #f3f4f6",
                      borderRadius: 8,
                    }}
                  >
                    <Toggle
                      on={row.is_open}
                      onChange={(next) =>
                        setHoursByDay((prev) => ({
                          ...prev,
                          [day]: { ...row, is_open: next },
                        }))
                      }
                      disabled={saving}
                    />

                    <span
                      style={{
                        fontWeight: 500,
                        fontSize: 14,
                        color: "#111827",
                        minWidth: 86,
                        flexShrink: 0,
                      }}
                    >
                      {DAY_NAMES[day]}
                    </span>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 6,
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      <input
                        type="time"
                        value={row.open_time}
                        disabled={saving || !row.is_open}
                        onChange={(e) =>
                          setHoursByDay((prev) => ({
                            ...prev,
                            [day]: { ...row, open_time: e.target.value },
                          }))
                        }
                        style={{ ...INPUT, opacity: row.is_open ? 1 : 0.4 }}
                      />
                      <input
                        type="time"
                        value={row.close_time}
                        disabled={saving || !row.is_open}
                        onChange={(e) =>
                          setHoursByDay((prev) => ({
                            ...prev,
                            [day]: { ...row, close_time: e.target.value },
                          }))
                        }
                        style={{ ...INPUT, opacity: row.is_open ? 1 : 0.4 }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Step 3: Tu primer producto ── */}
          {currentStep === 3 && (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 14 }}>
              <div
                style={{
                  fontSize: 13,
                  color: "#6b7280",
                  background: "#f9fafb",
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: "10px 12px",
                  lineHeight: 1.55,
                }}
              >
                Añade al menos un producto para que tu menú no esté vacío cuando los
                clientes lo visiten. Puedes saltarte este paso y añadir productos más
                tarde desde el panel admin.
              </div>

              <Field label="Nombre de la categoría" hint="Ej: Kebabs, Pizzas, Bebidas">
                <input
                  style={INPUT}
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  placeholder="Menú principal"
                  disabled={saving}
                />
              </Field>

              {products.map((prod, index) => (
                <div
                  key={prod.id}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                    padding: "12px 14px",
                    background: "#fafafa",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 12,
                      color: "#9ca3af",
                      textTransform: "uppercase" as const,
                      letterSpacing: "0.05em",
                      marginBottom: 10,
                    }}
                  >
                    Producto {index + 1}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                    <Field label="Nombre">
                      <input
                        style={INPUT}
                        value={prod.name}
                        onChange={(e) => updateProduct(index, "name", e.target.value)}
                        placeholder="Kebab de pollo"
                        disabled={saving}
                      />
                    </Field>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 8,
                      }}
                    >
                      <Field label="Precio (€)">
                        <input
                          style={INPUT}
                          type="number"
                          min={0}
                          step="0.01"
                          value={prod.price}
                          onChange={(e) => updateProduct(index, "price", e.target.value)}
                          placeholder="6.50"
                          disabled={saving}
                        />
                      </Field>

                      <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>
                          Imagen (opcional)
                        </span>
                        {prod.localPreview ? (
                          <img
                            src={prod.localPreview}
                            alt=""
                            style={{
                              width: 40,
                              height: 40,
                              objectFit: "cover" as const,
                              borderRadius: 6,
                            }}
                          />
                        ) : null}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          disabled={saving}
                          style={{ fontSize: 12 }}
                          onChange={(e) =>
                            handleProductImage(index, e.target.files?.[0] ?? null)
                          }
                        />
                      </div>
                    </div>

                    <Field label="Descripción (opcional)">
                      <textarea
                        style={{ ...INPUT, resize: "vertical" as const }}
                        rows={2}
                        value={prod.description}
                        onChange={(e) =>
                          updateProduct(index, "description", e.target.value)
                        }
                        placeholder="Con lechuga, tomate y salsa especial"
                        disabled={saving}
                      />
                    </Field>
                  </div>
                </div>
              ))}

              {products.length < 3 ? (
                <button
                  type="button"
                  onClick={() => setProducts((prev) => [...prev, emptyProduct()])}
                  disabled={saving}
                  style={{
                    ...BTN_SECONDARY,
                    fontSize: 13,
                    padding: "8px 14px",
                    alignSelf: "flex-start" as const,
                  }}
                >
                  + Añadir otro producto
                </button>
              ) : null}
            </div>
          )}

          {/* ── Step 4: ¡Listo! ── */}
          {currentStep === 4 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column" as const,
                alignItems: "center",
                gap: 16,
                paddingTop: 8,
              }}
            >
              <div style={{ fontSize: 64 }}></div>
              <h3
                style={{
                  margin: 0,
                  fontSize: 22,
                  fontWeight: 700,
                  color: "#111827",
                  textAlign: "center" as const,
                }}
              >
                Tu restaurante está listo
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: 14,
                  color: "#6b7280",
                  textAlign: "center" as const,
                  lineHeight: 1.6,
                  maxWidth: 360,
                }}
              >
                Ya puedes recibir pedidos. Comparte tu URL con tus clientes:
              </p>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "#f9fafb",
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: "10px 12px",
                  width: "100%",
                  boxSizing: "border-box" as const,
                }}
              >
                <span
                  style={{
                    fontFamily: "monospace",
                    fontSize: 13,
                    color: "#374151",
                    wordBreak: "break-all" as const,
                    flex: 1,
                  }}
                >
                  {menuUrl}
                </span>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(menuUrl)}
                  style={{ ...BTN_SECONDARY, padding: "6px 10px", fontSize: 12, flexShrink: 0 }}
                >
                  Copiar
                </button>
              </div>

              {/* QR code */}
              {qrDataUrl ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column" as const,
                    alignItems: "center",
                    gap: 8,
                    padding: "12px",
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                    background: "#f9fafb",
                    width: "100%",
                    boxSizing: "border-box" as const,
                  }}
                >
                  <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
                    Comparte el QR con tus clientes
                  </p>
                  <img
                    src={qrDataUrl}
                    alt="QR de tu menú"
                    style={{
                      width: 160,
                      height: 160,
                      borderRadius: 8,
                      border: "1px solid #e5e7eb",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const a = document.createElement("a");
                      a.href = qrDataUrl;
                      a.download = `qr-menu-${slug}.png`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                    }}
                    style={{ ...BTN_SECONDARY, fontSize: 13, padding: "7px 16px" }}
                  >
                    Descargar QR
                  </button>
                </div>
              ) : null}

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap" as const,
                  justifyContent: "center" as const,
                  marginTop: 4,
                }}
              >
                <button
                  type="button"
                  onClick={() => window.open(menuUrl, "_blank", "noopener,noreferrer")}
                  style={{ ...BTN_SECONDARY, fontSize: 14 }}
                >
                  Ver mi menú
                </button>
                <button
                  type="button"
                  onClick={() => navigate(adminUrl, { replace: true })}
                  style={{ ...BTN_PRIMARY, fontSize: 14 }}
                >
                  Ir al panel admin →
                </button>
              </div>
            </div>
          )}

          {/* ── Navigation (steps 1–3) ── */}
          {currentStep < 4 ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between" as const,
                marginTop: 24,
                paddingTop: 16,
                borderTop: "1px solid #f3f4f6",
                flexWrap: "wrap" as const,
                gap: 8,
              }}
            >
              <div style={{ display: "flex", gap: 8 }}>
                {currentStep > 1 ? (
                  <button
                    type="button"
                    onClick={goBack}
                    disabled={saving}
                    style={BTN_SECONDARY}
                  >
                    Atrás
                  </button>
                ) : null}

                {currentStep === 3 ? (
                  <button
                    type="button"
                    onClick={() => setCurrentStep(4)}
                    disabled={saving}
                    style={{ ...BTN_SECONDARY, color: "#9ca3af" }}
                  >
                    Omitir
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={handleNext}
                  disabled={saving}
                  style={{ ...BTN_PRIMARY, opacity: saving ? 0.7 : 1 }}
                >
                  {saving
                    ? "Guardando..."
                    : currentStep === 3
                    ? "Finalizar"
                    : "Siguiente →"}
                </button>
              </div>

              <Link
                to={adminUrl}
                style={{
                  fontSize: 13,
                  color: "#9ca3af",
                  textDecoration: "underline",
                  textUnderlineOffset: 2,
                }}
              >
                Configurar más tarde
              </Link>
            </div>
          ) : null}
        </div>
      </PageShell>
    </>
  );
}

// ─── layout shell ─────────────────────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "32px 16px 48px",
        background: "#f5f5f7",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        boxSizing: "border-box" as const,
      }}
    >
      {children}
    </div>
  );
}
