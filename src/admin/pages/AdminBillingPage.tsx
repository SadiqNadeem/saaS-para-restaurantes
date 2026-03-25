import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../../restaurant/RestaurantContext";
import { useSubscription } from "../hooks/useSubscription";
import type { SubscriptionStatus } from "../hooks/useSubscription";

// ── Types ─────────────────────────────────────────────────────────────────────

type Plan = {
  id: string;
  name: string;
  description: string;
  price_monthly_cents: number;
  stripe_price_id: string | null;
  features: string[];
};

type Toast = { id: number; type: "success" | "error"; message: string };

// ── Edge function helper ───────────────────────────────────────────────────────

const FUNCTIONS_URL = "https://ewxarutpvgelwdswjolz.supabase.co/functions/v1";

async function callEdgeFunction<T>(
  name: string,
  body: Record<string, unknown>
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? "";
  const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
  return json as T;
}

// ── Status badge ───────────────────────────────────────────────────────────────

const STATUS_META: Record<
  SubscriptionStatus,
  { label: string; bg: string; color: string }
> = {
  trialing:  { label: "En prueba",   bg: "#fef9c3", color: "#854d0e" },
  active:    { label: "Activa",      bg: "#dcfce7", color: "#166534" },
  past_due:  { label: "Pago fallido",bg: "#fee2e2", color: "#991b1b" },
  canceled:  { label: "Cancelada",   bg: "#f3f4f6", color: "#374151" },
  unpaid:    { label: "Sin pagar",   bg: "#fee2e2", color: "#991b1b" },
};

function StatusBadge({ status }: { status: SubscriptionStatus }) {
  const meta = STATUS_META[status];
  return (
    <span style={{
      display: "inline-block",
      padding: "3px 10px",
      borderRadius: 20,
      fontSize: 12,
      fontWeight: 600,
      background: meta.bg,
      color: meta.color,
    }}>
      {meta.label}
    </span>
  );
}

// ── Status banner ──────────────────────────────────────────────────────────────

function StatusBanner({
  status,
  trialDaysLeft,
  periodEnd,
  planId,
  onManageBilling,
  managePending,
}: {
  status: SubscriptionStatus;
  trialDaysLeft: number | null;
  periodEnd: string | null;
  planId: string | null;
  onManageBilling: () => void;
  managePending: boolean;
}) {
  if (status === "active") return null;

  const { bg, color } = STATUS_META[status];

  let text = "";
  if (status === "trialing" && trialDaysLeft !== null) {
    text = trialDaysLeft > 0
      ? `Tu periodo de prueba termina en ${trialDaysLeft} día${trialDaysLeft !== 1 ? "s" : ""}.`
      : "Tu periodo de prueba ha finalizado. Suscríbete para continuar.";
  } else if (status === "past_due") {
    text = "El último pago ha fallado. Stripe seguirá intentándolo. Actualiza tu método de pago para evitar la suspensión.";
  } else if (status === "canceled" && periodEnd) {
    const d = new Date(periodEnd);
    text = `Tu suscripción está cancelada. Tendrás acceso hasta el ${d.toLocaleDateString("es-ES")}.`;
  } else if (status === "unpaid") {
    text = "Tu suscripción está suspendida por pagos fallidos. Suscríbete de nuevo para recuperar el acceso.";
  }

  if (!text) return null;

  return (
    <div style={{
      background: bg,
      color,
      border: `1px solid ${color}33`,
      borderRadius: "var(--admin-radius-md)",
      padding: "14px 20px",
      marginBottom: 24,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
      flexWrap: "wrap",
    }}>
      <span style={{ fontSize: 14, fontWeight: 500 }}>{text}</span>
      {(status === "past_due") && planId && (
        <button
          onClick={onManageBilling}
          disabled={managePending}
          style={{
            padding: "8px 16px",
            borderRadius: "var(--admin-radius-sm)",
            background: color,
            color: "#fff",
            border: "none",
            cursor: managePending ? "not-allowed" : "pointer",
            fontSize: 13,
            fontWeight: 600,
            opacity: managePending ? 0.7 : 1,
            flexShrink: 0,
          }}
        >
          {managePending ? "Abriendo..." : "Actualizar pago"}
        </button>
      )}
    </div>
  );
}

// ── Plan card ──────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  isCurrent,
  onSubscribe,
  pending,
  disabled,
}: {
  plan: Plan;
  isCurrent: boolean;
  onSubscribe: () => void;
  pending: boolean;
  disabled: boolean;
}) {
  const isPro = plan.id === "pro";
  const price = (plan.price_monthly_cents / 100).toFixed(0);

  return (
    <div style={{
      background: "var(--admin-card-bg)",
      border: isPro
        ? "2px solid var(--brand-primary)"
        : "1px solid var(--admin-card-border)",
      borderRadius: "var(--admin-radius-lg)",
      padding: 28,
      display: "flex",
      flexDirection: "column",
      gap: 16,
      position: "relative",
    }}>
      {isPro && (
        <div style={{
          position: "absolute",
          top: -12,
          left: "50%",
          transform: "translateX(-50%)",
          background: "var(--brand-primary)",
          color: "#fff",
          fontSize: 11,
          fontWeight: 700,
          padding: "3px 12px",
          borderRadius: 20,
          letterSpacing: "0.05em",
          whiteSpace: "nowrap",
        }}>
          MÁS POPULAR
        </div>
      )}

      <div>
        <div style={{
          fontSize: 16,
          fontWeight: 700,
          color: "var(--admin-text-primary)",
          marginBottom: 4,
        }}>
          {plan.name}
        </div>
        <div style={{ fontSize: 13, color: "var(--admin-text-secondary)" }}>
          {plan.description}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span style={{ fontSize: 32, fontWeight: 800, color: "var(--admin-text-primary)" }}>
          {price}€
        </span>
        <span style={{ fontSize: 13, color: "var(--admin-text-muted)" }}>/mes</span>
      </div>

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {plan.features.map((f) => (
          <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "var(--admin-text-secondary)" }}>
            <span style={{ color: "var(--brand-primary)", flexShrink: 0, marginTop: 1 }}>✓</span>
            {f}
          </li>
        ))}
      </ul>

      <div style={{ marginTop: "auto" }}>
        {isCurrent ? (
          <div style={{
            textAlign: "center",
            padding: "11px",
            borderRadius: "var(--admin-radius-sm)",
            background: "var(--brand-primary-soft)",
            color: "var(--brand-primary)",
            fontWeight: 600,
            fontSize: 14,
            border: "1px solid var(--brand-primary-border)",
          }}>
            Plan actual
          </div>
        ) : (
          <button
            onClick={onSubscribe}
            disabled={disabled || pending}
            style={{
              width: "100%",
              padding: "11px",
              borderRadius: "var(--admin-radius-sm)",
              background: isPro ? "var(--brand-primary)" : "transparent",
              color: isPro ? "#fff" : "var(--admin-text-primary)",
              border: isPro ? "none" : "1.5px solid var(--admin-card-border)",
              cursor: disabled || pending ? "not-allowed" : "pointer",
              fontWeight: 600,
              fontSize: 14,
              opacity: disabled || pending ? 0.6 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {pending ? "Redirigiendo..." : "Suscribirme"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AdminBillingPage() {
  const { restaurantId } = useRestaurant();
  const { data: subData, loading: subLoading, trialDaysLeft, refetch } = useSubscription();
  const [searchParams, setSearchParams] = useSearchParams();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);
  const [managePending, setManagePending] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  // Manejar subscription_success=1 en la URL
  useEffect(() => {
    if (searchParams.get("subscription_success") === "1") {
      pushToast("success", "¡Suscripción activada correctamente!");
      setSearchParams({}, { replace: true });
      refetch();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cargar planes desde la BD
  useEffect(() => {
    supabase
      .from("subscription_plans")
      .select("id, name, description, price_monthly_cents, stripe_price_id, features")
      .eq("is_active", true)
      .order("price_monthly_cents")
      .then(({ data }) => {
        if (data) {
          setPlans(data.map((p) => ({
            ...p,
            features: Array.isArray(p.features) ? p.features as string[] : [],
          })));
        }
        setPlansLoading(false);
      });
  }, []);

  function pushToast(type: "success" | "error", message: string) {
    const id = ++toastId.current;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }

  async function handleSubscribe(planId: string) {
    setPendingPlanId(planId);
    try {
      const result = await callEdgeFunction<{ url: string }>(
        "create-subscription-checkout",
        { restaurant_id: restaurantId, plan_id: planId }
      );
      window.location.href = result.url;
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : "Error al crear la sesión de pago.");
      setPendingPlanId(null);
    }
  }

  async function handleManageBilling() {
    setManagePending(true);
    try {
      const result = await callEdgeFunction<{ url: string }>(
        "create-billing-portal-session",
        { restaurant_id: restaurantId }
      );
      window.location.href = result.url;
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : "Error al abrir el portal de facturación.");
      setManagePending(false);
    }
  }

  const status = subData?.subscription_status ?? "trialing";
  const currentPlanId = subData?.subscription_plan_id ?? null;
  const hasBillingCustomer = !!subData?.stripe_billing_customer_id;

  return (
    <div className="admin-panel" style={{ maxWidth: 900, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--admin-text-primary)", margin: 0 }}>
          Suscripción y facturación
        </h1>
        <p style={{ fontSize: 14, color: "var(--admin-text-secondary)", marginTop: 6 }}>
          Gestiona tu plan y datos de pago.
        </p>
      </div>

      {/* Banner de estado */}
      {!subLoading && subData && (
        <StatusBanner
          status={status}
          trialDaysLeft={trialDaysLeft}
          periodEnd={subData.subscription_current_period_end}
          planId={currentPlanId}
          onManageBilling={handleManageBilling}
          managePending={managePending}
        />
      )}

      {/* Estado actual (si tiene plan activo) */}
      {!subLoading && subData && currentPlanId && (
        <div style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
          borderRadius: "var(--admin-radius-md)",
          padding: "18px 20px",
          marginBottom: 28,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}>
          <div>
            <div style={{ fontSize: 13, color: "var(--admin-text-muted)", marginBottom: 4 }}>
              Plan actual
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: "var(--admin-text-primary)", textTransform: "capitalize" }}>
                {plans.find((p) => p.id === currentPlanId)?.name ?? currentPlanId}
              </span>
              <StatusBadge status={status} />
            </div>
            {subData.subscription_current_period_end && status === "active" && (
              <div style={{ fontSize: 12, color: "var(--admin-text-muted)", marginTop: 4 }}>
                Próxima renovación: {new Date(subData.subscription_current_period_end).toLocaleDateString("es-ES")}
              </div>
            )}
          </div>
          {hasBillingCustomer && (
            <button
              onClick={handleManageBilling}
              disabled={managePending}
              style={{
                padding: "9px 18px",
                borderRadius: "var(--admin-radius-sm)",
                background: "transparent",
                color: "var(--admin-text-primary)",
                border: "1.5px solid var(--admin-card-border)",
                cursor: managePending ? "not-allowed" : "pointer",
                fontSize: 13,
                fontWeight: 600,
                opacity: managePending ? 0.7 : 1,
              }}
            >
              {managePending ? "Abriendo..." : "Gestionar facturación"}
            </button>
          )}
        </div>
      )}

      {/* Plan cards */}
      <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--admin-text-primary)", marginBottom: 16 }}>
        Planes disponibles
      </h2>

      {plansLoading ? (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
        }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{
              height: 320,
              borderRadius: "var(--admin-radius-lg)",
              background: "var(--admin-card-border)",
              animation: "pulse 1.5s ease-in-out infinite",
            }} />
          ))}
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
        }}>
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isCurrent={currentPlanId === plan.id && status === "active"}
              onSubscribe={() => handleSubscribe(plan.id)}
              pending={pendingPlanId === plan.id}
              disabled={pendingPlanId !== null && pendingPlanId !== plan.id}
            />
          ))}
        </div>
      )}

      {/* Nota trial */}
      <p style={{ fontSize: 12, color: "var(--admin-text-muted)", marginTop: 20, textAlign: "center" }}>
        Todos los planes incluyen 14 días de prueba gratuita al registrarse.
        Puedes cancelar en cualquier momento desde el portal de facturación.
      </p>

      {/* Toasts */}
      <div style={{ position: "fixed", bottom: 24, right: 24, display: "flex", flexDirection: "column", gap: 8, zIndex: 9999 }}>
        {toasts.map((t) => (
          <div key={t.id} style={{
            background: t.type === "success" ? "#166534" : "#991b1b",
            color: "#fff",
            padding: "12px 18px",
            borderRadius: "var(--admin-radius-sm)",
            fontSize: 13,
            fontWeight: 500,
            maxWidth: 340,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}>
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
