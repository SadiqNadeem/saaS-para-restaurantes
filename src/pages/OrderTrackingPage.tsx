import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useRestaurant } from "../restaurant/RestaurantContext";

type ReviewFormState = "idle" | "submitting" | "done";

function ReviewPrompt({ orderId, restaurantId }: { orderId: string; restaurantId: string }) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [state, setState] = useState<ReviewFormState>("idle");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (rating === 0) { setError("Selecciona una valoración."); return; }
    setState("submitting");
    setError(null);
    const { error: err } = await supabase.from("reviews").insert({
      restaurant_id: restaurantId,
      order_id: orderId,
      name: name.trim() || null,
      rating,
      comment: comment.trim() || null,
      is_approved: false,
    });
    if (err) {
      setError("No se pudo enviar la reseña. Inténtalo de nuevo.");
      setState("idle");
    } else {
      setState("done");
    }
  };

  if (state === "done") {
    return (
      <div
        style={{
          background: "rgba(78,197,128,0.1)",
          border: "1px solid rgba(78,197,128,0.4)",
          borderRadius: 12,
          padding: "16px 18px",
          textAlign: "center",
          marginTop: 16,
        }}
      >
        <div style={{ fontSize: 22, marginBottom: 4 }}>★</div>
        <div style={{ fontWeight: 700, color: "#2e8b57", fontSize: 15 }}>¡Gracias por tu opinión!</div>
        <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>Tu reseña está pendiente de aprobación.</div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "#f9fafb",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: "16px 18px",
        marginTop: 16,
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 14, color: "#111827" }}>¿Cómo fue tu experiencia?</div>

      {/* Stars */}
      <div style={{ display: "flex", gap: 4 }}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => setRating(star)}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(0)}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: 28,
              color: star <= (hovered || rating) ? "#f59e0b" : "#d1d5db",
              padding: "0 2px",
              lineHeight: 1,
            }}
          >
            ★
          </button>
        ))}
      </div>

      <input
        type="text"
        placeholder="Tu nombre (opcional)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
        style={{
          border: "1px solid #d1d5db",
          borderRadius: 8,
          padding: "7px 10px",
          fontSize: 13,
          background: "#fff",
        }}
      />

      <textarea
        placeholder="Cuéntanos tu experiencia (opcional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={400}
        rows={3}
        style={{
          border: "1px solid #d1d5db",
          borderRadius: 8,
          padding: "7px 10px",
          fontSize: 13,
          background: "#fff",
          resize: "vertical",
          fontFamily: "inherit",
        }}
      />

      {error && <div style={{ fontSize: 12, color: "#991b1b" }}>{error}</div>}

      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={state === "submitting"}
        style={{
          background: "#4ec580",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "9px 18px",
          fontWeight: 700,
          fontSize: 14,
          cursor: state === "submitting" ? "not-allowed" : "pointer",
          alignSelf: "start",
        }}
      >
        {state === "submitting" ? "Enviando..." : "Enviar valoración"}
      </button>
    </div>
  );
}

type OrderTracking = {
  id: string;
  status: string;
  order_type: string;
  created_at: string;
  total: number;
  customer_name: string;
  delivery_address: string | null;
  estimated_delivery_minutes: number | null;
  estimated_pickup_minutes: number | null;
};

const DELIVERY_STEPS = [
  { key: "pending", label: "Recibido" },
  { key: "accepted", label: "Aceptado" },
  { key: "preparing", label: "Preparando" },
  { key: "ready", label: "Listo" },
  { key: "out_for_delivery", label: "En camino" },
  { key: "delivered", label: "Entregado" },
];

const PICKUP_STEPS = [
  { key: "pending", label: "Recibido" },
  { key: "accepted", label: "Aceptado" },
  { key: "preparing", label: "Preparando" },
  { key: "ready", label: "Listo" },
  { key: "delivered", label: "Recogido" },
];

function getStepIndex(status: string, steps: { key: string }[]): number {
  return steps.findIndex((s) => s.key === status);
}

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function OrderTrackingPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { name: restaurantName, menuPath, restaurantId } = useRestaurant();
  const [order, setOrder] = useState<OrderTracking | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchOrder = async () => {
    if (!orderId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.rpc("get_order_tracking", {
      p_order_id: orderId,
    });

    if (error || !data) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setOrder(data as OrderTracking);
    setLoading(false);
  };

  useEffect(() => {
    void fetchOrder();

    intervalRef.current = setInterval(() => {
      void fetchOrder();
    }, 10000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const isCancelled = order?.status === "cancelled";
  const isDelivery = order?.order_type === "delivery";
  const steps = isDelivery ? DELIVERY_STEPS : PICKUP_STEPS;
  const currentStep = order ? getStepIndex(order.status, steps) : -1;
  const estMins = order
    ? isDelivery
      ? (order.estimated_delivery_minutes ?? 30)
      : (order.estimated_pickup_minutes ?? 15)
    : null;

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ color: "#6b7280" }}>Cargando estado del pedido...</p>
        </div>
      </div>
    );
  }

  if (notFound || !order) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <h2 style={{ margin: "0 0 8px" }}>Pedido no encontrado</h2>
          <p style={{ color: "#6b7280" }}>
            No encontramos este pedido. Comprueba el enlace o contacta con el restaurante.
          </p>
          <Link to={menuPath} style={linkStyle}>
            ← Ir al menú
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>{restaurantName}</div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
            Pedido #{order.id.slice(0, 8).toUpperCase()}
          </h2>
          <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 4 }}>
            Realizado a las {formatTime(order.created_at)}
          </div>
        </div>

        {/* Cancelled state */}
        {isCancelled && (
          <div
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 10,
              padding: "12px 16px",
              color: "#991b1b",
              fontWeight: 600,
              marginBottom: 20,
            }}
          >
            Pedido cancelado
          </div>
        )}

        {/* Stepper */}
        {!isCancelled && (
          <div style={{ marginBottom: 24 }}>
            {steps.map((step, idx) => {
              const isDone = currentStep > idx;
              const isActive = currentStep === idx;
              return (
                <div
                  key={step.key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 0",
                    borderBottom: idx < steps.length - 1 ? "1px solid #f3f4f6" : "none",
                  }}
                >
                  {/* Circle */}
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: isDone
                        ? "#4ec580"
                        : isActive
                        ? "#4ec580"
                        : "#e5e7eb",
                      border: isActive ? "3px solid #2e8b57" : "none",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {isDone && (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2.5 7L5.5 10L11.5 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>

                  {/* Label */}
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: isActive ? 700 : isDone ? 500 : 400,
                      color: isActive ? "#111827" : isDone ? "#374151" : "#9ca3af",
                    }}
                  >
                    {step.label}
                    {isActive && estMins !== null && (
                      <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 400, marginLeft: 8 }}>
                        ~{estMins} min
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Order details */}
        <div
          style={{
            background: "#f9fafb",
            borderRadius: 10,
            padding: "12px 14px",
            display: "grid",
            gap: 6,
            fontSize: 14,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#6b7280" }}>Tipo</span>
            <span style={{ fontWeight: 500 }}>{isDelivery ? "Entrega a domicilio" : "Recogida en local"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#6b7280" }}>Total</span>
            <span style={{ fontWeight: 600 }}>{Number(order.total).toFixed(2)} €</span>
          </div>
          {isDelivery && order.delivery_address && (
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ color: "#6b7280", flexShrink: 0 }}>Dirección</span>
              <span style={{ fontWeight: 500, textAlign: "right" }}>{order.delivery_address}</span>
            </div>
          )}
        </div>

        {/* Auto-refresh notice */}
        {order.status !== "delivered" && (
          <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 16, textAlign: "center" }}>
            Esta página se actualiza automáticamente cada 10 segundos
          </p>
        )}

        {/* Review prompt — only when delivered */}
        {order.status === "delivered" && orderId && (
          <ReviewPrompt orderId={orderId} restaurantId={restaurantId} />
        )}

        <Link to={menuPath} style={{ ...linkStyle, display: "block", textAlign: "center", marginTop: 16 }}>
          ← Volver al menú
        </Link>
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f8fafc",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "40px 16px",
};

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  padding: "24px 28px",
  width: "100%",
  maxWidth: 480,
};

const linkStyle: React.CSSProperties = {
  color: "#2e8b57",
  textDecoration: "none",
  fontWeight: 500,
  fontSize: 14,
};
