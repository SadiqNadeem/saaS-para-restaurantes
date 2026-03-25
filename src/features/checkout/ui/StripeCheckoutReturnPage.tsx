import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { supabase } from "../../../lib/supabase";
import { useRestaurant } from "../../../restaurant/RestaurantContext";

type StripeCheckoutReturnPageProps = {
  mode: "success" | "cancel";
};

type PaymentState = "loading" | "paid" | "pending" | "failed" | "error";

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 4;

export default function StripeCheckoutReturnPage({ mode }: StripeCheckoutReturnPageProps) {
  const { restaurantId, menuPath } = useRestaurant();
  const [params] = useSearchParams();
  const orderId = params.get("order_id") ?? "";
  const sessionId = params.get("session_id") ?? "";

  const [paymentState, setPaymentState] = useState<PaymentState>(
    mode === "cancel" ? "failed" : "loading"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pollAttemptsRef = useRef(0);

  useEffect(() => {
    if (mode !== "success") return;

    let alive = true;

    const pollPaymentStatus = async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("payment_status")
        .eq("id", orderId)
        .eq("restaurant_id", restaurantId)
        .maybeSingle();

      if (!alive) return;

      if (error) {
        setPaymentState("error");
        setErrorMessage(error.message);
        return;
      }

      const status = (data as { payment_status?: string } | null)?.payment_status;

      if (status === "paid") {
        setPaymentState("paid");
        return;
      }

      if (status === "failed") {
        setPaymentState("failed");
        return;
      }

      pollAttemptsRef.current += 1;
      if (pollAttemptsRef.current >= POLL_MAX_ATTEMPTS) {
        // Webhook aún no llegó — mostrar mensaje de espera, no error
        setPaymentState("pending");
        return;
      }

      setTimeout(() => { void pollPaymentStatus(); }, POLL_INTERVAL_MS);
    };

    const run = async () => {
      if (!orderId || !sessionId) {
        if (!alive) return;
        setPaymentState("error");
        setErrorMessage("Faltan datos del pago devueltos por Stripe.");
        return;
      }

      // Guardar el session_id en el pedido para trazabilidad
      await supabase
        .from("orders")
        .update({
          payment_provider: "stripe",
          payment_method: "card_online",
          payment_status: "pending",
          stripe_session_id: sessionId,
        })
        .eq("id", orderId)
        .eq("restaurant_id", restaurantId);

      if (!alive) return;

      // Empezar a sondear si el webhook ya confirmó el pago
      void pollPaymentStatus();
    };

    void run();

    return () => {
      alive = false;
    };
  }, [mode, orderId, sessionId, restaurantId]);

  if (mode === "cancel") {
    return (
      <main style={styles.container}>
        <div style={{ fontSize: 40, textAlign: "center" }}>✕</div>
        <h1 style={styles.title}>Pago cancelado</h1>
        <p style={styles.subtitle}>No se realizó ningún cargo. Puedes intentarlo de nuevo.</p>
        <Link to={menuPath} style={styles.link}>Volver al menú</Link>
      </main>
    );
  }

  if (paymentState === "loading") {
    return (
      <main style={styles.container}>
        <div style={styles.spinner} />
        <p style={styles.subtitle}>Confirmando tu pago...</p>
      </main>
    );
  }

  if (paymentState === "paid") {
    const shortId = orderId.slice(0, 8).toUpperCase();
    return (
      <main style={styles.container}>
        <div style={{ fontSize: 48, textAlign: "center" }}>✓</div>
        <h1 style={{ ...styles.title, color: "#2e8b57" }}>¡Pedido confirmado!</h1>
        <p style={styles.subtitle}>
          Referencia: <strong>#{shortId}</strong>
        </p>
        <p style={{ ...styles.subtitle, fontSize: 14 }}>
          Ya estamos preparando tu pedido.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link to={`${menuPath.replace(/\/$/, "")}/pedido/${orderId}`} style={styles.buttonPrimary}>
            Seguir mi pedido
          </Link>
          <Link to={menuPath} style={styles.link}>Volver al menú</Link>
        </div>
      </main>
    );
  }

  if (paymentState === "pending") {
    return (
      <main style={styles.container}>
        <div style={{ fontSize: 40, textAlign: "center" }}>⏳</div>
        <h1 style={styles.title}>Pedido recibido</h1>
        <p style={styles.subtitle}>
          Tu pago está siendo procesado. Recibirás la confirmación en breve.
        </p>
        <p style={{ ...styles.subtitle, fontSize: 13, color: "#9ca3af" }}>
          Si tienes dudas, contacta al restaurante con la referencia{" "}
          <strong>#{orderId.slice(0, 8).toUpperCase()}</strong>.
        </p>
        <Link to={menuPath} style={styles.link}>Volver al menú</Link>
      </main>
    );
  }

  if (paymentState === "failed") {
    return (
      <main style={styles.container}>
        <div style={{ fontSize: 40, textAlign: "center" }}>✕</div>
        <h1 style={{ ...styles.title, color: "#dc2626" }}>Pago no completado</h1>
        <p style={styles.subtitle}>
          No se pudo procesar el pago. No se ha realizado ningún cargo.
        </p>
        <Link to={menuPath} style={styles.link}>Volver al menú e intentar de nuevo</Link>
      </main>
    );
  }

  // paymentState === "error"
  return (
    <main style={styles.container}>
      <h1 style={styles.title}>Algo salió mal</h1>
      <p style={{ ...styles.subtitle, color: "#dc2626" }}>
        {errorMessage ?? "No se pudo verificar el estado del pedido."}
      </p>
      <Link to={menuPath} style={styles.link}>Volver al menú</Link>
    </main>
  );
}

const styles = {
  container: {
    padding: "48px 20px",
    fontFamily: "system-ui, sans-serif",
    display: "grid",
    gap: 16,
    maxWidth: 480,
    margin: "0 auto",
    justifyItems: "center",
    textAlign: "center" as const,
  },
  title: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    color: "#111827",
  },
  subtitle: {
    margin: 0,
    fontSize: 15,
    color: "#6b7280",
    lineHeight: 1.5,
  },
  link: {
    color: "#4ec580",
    textDecoration: "none",
    fontSize: 14,
    fontWeight: 600,
  },
  buttonPrimary: {
    background: "#4ec580",
    color: "#fff",
    padding: "10px 20px",
    borderRadius: 8,
    textDecoration: "none",
    fontSize: 14,
    fontWeight: 700,
  },
  spinner: {
    width: 32,
    height: 32,
    border: "3px solid #e5e7eb",
    borderTopColor: "#4ec580",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
} as const;
