import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../../restaurant/RestaurantContext";
import { useAdminMembership } from "./AdminMembershipContext";

// Step labels matching Onboarding.tsx STEP_META
const STEP_LABELS = [
  "Información básica",
  "Horarios",
  "Primer producto",
  "Métodos de pago",
];

type BannerData = {
  completed: boolean;
  step: number; // 0 = not started, 1-4 = completed up to that step
  slug: string;
};

export function OnboardingBanner() {
  const { restaurantId, slug } = useRestaurant();
  const { isOwner } = useAdminMembership();
  const navigate = useNavigate();

  const [data, setData] = useState<BannerData | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!restaurantId || !isOwner) return;

    // Check localStorage to see if previously dismissed this session
    const key = `onboarding_dismissed_${restaurantId}`;
    if (sessionStorage.getItem(key)) { setDismissed(true); return; }

    void (async () => {
      const { data: row } = await supabase
        .from("restaurant_settings")
        .select("onboarding_completed, onboarding_step")
        .eq("restaurant_id", restaurantId)
        .maybeSingle<{ onboarding_completed: boolean; onboarding_step: number }>();

      if (!row) return;

      setData({
        completed: row.onboarding_completed ?? false,
        step: row.onboarding_step ?? 0,
        slug,
      });
    })();
  }, [restaurantId, isOwner, slug]);

  const handleDismiss = () => {
    if (restaurantId) sessionStorage.setItem(`onboarding_dismissed_${restaurantId}`, "1");
    setDismissed(true);
  };

  const handleContinue = () => {
    navigate(`/onboarding?restaurant=${slug}&step=${(data?.step ?? 0) + 1}`);
  };

  if (dismissed || !data || data.completed || !isOwner) return null;

  const nextStepLabel = STEP_LABELS[data.step] ?? "Configuración";
  const pct = Math.round(((data.step) / 4) * 100);

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)",
        border: "1px solid #6ee7b7",
        borderRadius: 10,
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        flexWrap: "wrap",
        marginBottom: 16,
      }}
    >
      {/* Progress ring / icon */}
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          background: "#fff",
          border: "2px solid #4ec580",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
          flexShrink: 0,
        }}
      >
        🚀
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "#065f46" }}>
          Completa tu configuración — {pct}% listo
        </div>
        <div style={{ fontSize: 12, color: "#047857", marginTop: 2 }}>
          Siguiente paso: <strong>{nextStepLabel}</strong>
        </div>
        {/* Progress bar */}
        <div
          style={{
            marginTop: 6,
            height: 4,
            background: "#a7f3d0",
            borderRadius: 4,
            overflow: "hidden",
            maxWidth: 200,
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              background: "#10b981",
              borderRadius: 4,
              transition: "width 0.3s",
            }}
          />
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <button
          type="button"
          onClick={handleContinue}
          style={{
            padding: "7px 16px",
            borderRadius: 8,
            border: "none",
            background: "#4ec580",
            color: "#fff",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Continuar setup
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          style={{
            padding: "7px 10px",
            borderRadius: 8,
            border: "1px solid #6ee7b7",
            background: "transparent",
            color: "#047857",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
