import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { supabase } from "../../../lib/supabase";
import { useRestaurant } from "../../../restaurant/RestaurantContext";

type StripeCheckoutReturnPageProps = {
  mode: "success" | "cancel";
};

export default function StripeCheckoutReturnPage({ mode }: StripeCheckoutReturnPageProps) {
  const { restaurantId, menuPath } = useRestaurant();
  const [params] = useSearchParams();
  const orderId = params.get("order_id") ?? "";
  const sessionId = params.get("session_id") ?? "";

  const [loading, setLoading] = useState(mode === "success");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(
    mode === "cancel" ? "Pago cancelado" : null
  );

  useEffect(() => {
    if (mode !== "success") {
      return;
    }

    let alive = true;

    const run = async () => {
      if (!orderId || !sessionId) {
        if (!alive) return;
        setError("Faltan datos del pago devueltos por Stripe.");
        setLoading(false);
        return;
      }

      const { error: updateError } = await supabase
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

      if (updateError) {
        console.error(updateError);
        setError(`No se pudo actualizar el pedido tras el pago: ${updateError.message}`);
      } else {
        setMessage("Pago en proceso de confirmacion");
      }

      setLoading(false);
    };

    void run();

    return () => {
      alive = false;
    };
  }, [mode, orderId, sessionId]);

  return (
    <main style={{ padding: 20, fontFamily: "system-ui", display: "grid", gap: 12 }}>
      <h1>{mode === "success" ? "Checkout Stripe" : "Pago cancelado"}</h1>

      {loading && <p>Actualizando estado del pedido...</p>}
      {message && <p>{message}</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <div style={{ display: "flex", gap: 8 }}>
        <Link to={menuPath}>Volver al inicio</Link>
      </div>
    </main>
  );
}
