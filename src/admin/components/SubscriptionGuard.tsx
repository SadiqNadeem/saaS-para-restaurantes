import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useSubscription } from "../hooks/useSubscription";
import { useRestaurant } from "../../restaurant/RestaurantContext";

/** Bloquea el acceso al panel admin si la suscripción ha caducado.
 *  La página /admin/billing siempre es accesible. */
export default function SubscriptionGuard({ children }: { children: ReactNode }) {
  const { adminPath } = useRestaurant();
  const { pathname } = useLocation();
  const { loading, isBlocked, data, trialDaysLeft } = useSubscription();

  // Siempre permitir acceso a la página de billing
  const isBillingPage = pathname.endsWith("/billing");
  if (isBillingPage) return <>{children}</>;

  // Mientras carga no bloqueamos (evita flash)
  if (loading || !isBlocked) return <>{children}</>;

  const status = data?.subscription_status ?? "trialing";

  const message = (() => {
    if (status === "trialing") return "Tu periodo de prueba ha finalizado.";
    if (status === "canceled") return "Tu suscripción ha sido cancelada.";
    if (status === "unpaid") return "El pago de tu suscripción ha fallado repetidamente.";
    return "Tu suscripción no está activa.";
  })();

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--admin-content-bg)",
      padding: 24,
    }}>
      <div style={{
        maxWidth: 440,
        width: "100%",
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
        borderRadius: "var(--admin-radius-lg)",
        padding: 40,
        textAlign: "center",
        boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <h2 style={{
          fontSize: 20,
          fontWeight: 700,
          color: "var(--admin-text-primary)",
          marginBottom: 8,
        }}>
          Acceso restringido
        </h2>
        <p style={{
          fontSize: 14,
          color: "var(--admin-text-secondary)",
          marginBottom: 28,
          lineHeight: 1.6,
        }}>
          {message} Activa o renueva tu suscripción para seguir usando el panel.
        </p>
        <Link
          to={`${adminPath}/billing`}
          style={{
            display: "inline-block",
            padding: "12px 28px",
            background: "var(--brand-primary)",
            color: "#fff",
            borderRadius: "var(--admin-radius-sm)",
            textDecoration: "none",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          Ver planes y suscribirte
        </Link>
      </div>
    </div>
  );
}
