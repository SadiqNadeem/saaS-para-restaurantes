import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../../restaurant/RestaurantContext";
import { useAdminMembership } from "../components/AdminMembershipContext";

type Review = {
  id: string;
  name: string | null;
  rating: number;
  comment: string | null;
  is_approved: boolean;
  created_at: string;
  order_id: string | null;
};

function StarRating({ rating }: { rating: number }) {
  return (
    <span style={{ color: "#f59e0b", fontSize: 15, letterSpacing: 1 }}>
      {Array.from({ length: 5 }, (_, i) => (i < rating ? "★" : "☆")).join("")}
    </span>
  );
}

export default function AdminReviewsPage() {
  const { restaurantId, adminPath } = useRestaurant();
  const { canManage } = useAdminMembership();

  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved">("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg(null), 3000);
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("reviews")
      .select("id, name, rating, comment, is_approved, created_at, order_id")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (!error) {
      setReviews((data ?? []) as Review[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  const handleApprove = async (id: string, approve: boolean) => {
    if (!canManage) return;
    setActionLoading(id);
    const { error } = await supabase
      .from("reviews")
      .update({ is_approved: approve })
      .eq("id", id)
      .eq("restaurant_id", restaurantId);
    if (error) {
      showToast(`Error: ${error.message}`);
    } else {
      setReviews((prev) =>
        prev.map((r) => (r.id === id ? { ...r, is_approved: approve } : r))
      );
      showToast(approve ? "Reseña publicada." : "Reseña ocultada.");
    }
    setActionLoading(null);
  };

  const handleDelete = async (id: string) => {
    if (!canManage) return;
    if (!window.confirm("¿Eliminar esta reseña?")) return;
    setActionLoading(id);
    const { error } = await supabase
      .from("reviews")
      .delete()
      .eq("id", id)
      .eq("restaurant_id", restaurantId);
    if (error) {
      showToast(`Error: ${error.message}`);
    } else {
      setReviews((prev) => prev.filter((r) => r.id !== id));
      showToast("Reseña eliminada.");
    }
    setActionLoading(null);
  };

  const filtered = reviews.filter((r) => {
    if (filter === "approved") return r.is_approved;
    if (filter === "pending") return !r.is_approved;
    return true;
  });

  const avgRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

  return (
    <div className="admin-panel" style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "var(--admin-text-primary)" }}>
          Reseñas
        </h1>
        <p style={{ margin: "4px 0 0", color: "var(--admin-text-secondary)", fontSize: 14 }}>
          Gestión y moderación de valoraciones de clientes
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        {[
          { label: "Total reseñas", value: reviews.length },
          { label: "Publicadas", value: reviews.filter((r) => r.is_approved).length },
          { label: "Pendientes", value: reviews.filter((r) => !r.is_approved).length },
          { label: "Valoración media", value: reviews.length > 0 ? `${avgRating.toFixed(1)} ★` : "—" },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              background: "var(--admin-card-bg)",
              border: "1px solid var(--admin-card-border)",
              borderRadius: "var(--admin-radius-sm)",
              padding: "14px 16px",
              boxShadow: "var(--admin-card-shadow)",
            }}
          >
            <div style={{ fontSize: 11, color: "var(--admin-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
              {stat.label}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--admin-text-primary)" }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--admin-card-border)" }}>
        {(["all", "pending", "approved"] as const).map((f) => {
          const label = f === "all" ? "Todas" : f === "pending" ? "Pendientes" : "Publicadas";
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              style={{
                border: "none",
                borderBottom: filter === f ? "2px solid var(--brand-primary)" : "2px solid transparent",
                background: "transparent",
                padding: "8px 16px",
                fontWeight: filter === f ? 700 : 500,
                color: filter === f ? "var(--brand-hover)" : "var(--admin-text-secondary)",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ color: "var(--admin-text-muted)", fontSize: 14 }}>Cargando...</div>
      ) : filtered.length === 0 ? (
        <div
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
            borderRadius: "var(--admin-radius-md)",
            padding: "32px",
            textAlign: "center",
            color: "var(--admin-text-muted)",
          }}
        >
          No hay reseñas en esta categoría
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {filtered.map((review) => (
            <div
              key={review.id}
              style={{
                background: "var(--admin-card-bg)",
                border: `1px solid ${review.is_approved ? "var(--admin-card-border)" : "#fcd34d"}`,
                borderRadius: "var(--admin-radius-md)",
                padding: "16px 18px",
                boxShadow: "var(--admin-card-shadow)",
                display: "grid",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <StarRating rating={review.rating} />
                  <span style={{ fontWeight: 600, fontSize: 14, color: "var(--admin-text-primary)" }}>
                    {review.name ?? "Anónimo"}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--admin-text-muted)" }}>
                    {new Date(review.created_at).toLocaleDateString("es-ES")}
                  </span>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      background: review.is_approved ? "rgba(78,197,128,0.14)" : "#fef3c7",
                      color: review.is_approved ? "var(--brand-hover)" : "#92400e",
                    }}
                  >
                    {review.is_approved ? "Publicada" : "Pendiente"}
                  </span>
                </div>
                {review.order_id && (
                  <a
                    href={`${adminPath}/orders/${review.order_id}`}
                    style={{ fontSize: 12, color: "var(--brand-hover)", textDecoration: "none" }}
                  >
                    Pedido #{review.order_id.slice(0, 8).toUpperCase()}
                  </a>
                )}
              </div>

              {review.comment && (
                <p style={{ margin: 0, fontSize: 14, color: "var(--admin-text-primary)", lineHeight: 1.5 }}>
                  "{review.comment}"
                </p>
              )}

              {canManage && (
                <div style={{ display: "flex", gap: 8 }}>
                  {!review.is_approved ? (
                    <button
                      type="button"
                      onClick={() => void handleApprove(review.id, true)}
                      disabled={actionLoading === review.id}
                      style={{
                        background: "var(--brand-primary)",
                        color: "#fff",
                        border: "none",
                        borderRadius: 6,
                        padding: "5px 12px",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Publicar
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleApprove(review.id, false)}
                      disabled={actionLoading === review.id}
                      style={{
                        background: "#f3f4f6",
                        color: "var(--admin-text-primary)",
                        border: "1px solid var(--admin-card-border)",
                        borderRadius: 6,
                        padding: "5px 12px",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Ocultar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleDelete(review.id)}
                    disabled={actionLoading === review.id}
                    style={{
                      background: "#fef2f2",
                      color: "#991b1b",
                      border: "1px solid #fecaca",
                      borderRadius: 6,
                      padding: "5px 12px",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Eliminar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Toast */}
      {toastMsg && (
        <div
          style={{
            position: "fixed",
            right: 16,
            bottom: 16,
            background: "var(--brand-primary-soft)",
            border: "1px solid var(--brand-primary-border)",
            color: "var(--brand-hover)",
            borderRadius: 10,
            padding: "10px 16px",
            fontWeight: 500,
            fontSize: 14,
            zIndex: 60,
            boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
          }}
        >
          {toastMsg}
        </div>
      )}
    </div>
  );
}
