import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRestaurant } from "../../restaurant/RestaurantContext";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid";

export type SubscriptionData = {
  subscription_status: SubscriptionStatus;
  subscription_plan_id: string | null;
  stripe_subscription_id: string | null;
  stripe_billing_customer_id: string | null;
  subscription_current_period_end: string | null;
  trial_ends_at: string | null;
};

type UseSubscriptionResult = {
  data: SubscriptionData | null;
  loading: boolean;
  /** true cuando el acceso debe bloquearse */
  isBlocked: boolean;
  /** días de trial restantes (null si no está en trial) */
  trialDaysLeft: number | null;
  refetch: () => void;
};

/** Lee el estado de suscripción directamente de la BD (sin llamar a Stripe).
 *  El webhook mantiene la BD sincronizada, así que esto es suficiente para el guard. */
export function useSubscription(): UseSubscriptionResult {
  const { restaurantId } = useRestaurant();
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!restaurantId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      const { data: row } = await supabase
        .from("restaurants")
        .select(
          "subscription_status, subscription_plan_id, stripe_subscription_id, " +
          "stripe_billing_customer_id, subscription_current_period_end, trial_ends_at"
        )
        .eq("id", restaurantId)
        .maybeSingle<SubscriptionData>();

      if (!cancelled) {
        setData(row ?? null);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [restaurantId, tick]);

  const now = Date.now();
  const status = data?.subscription_status ?? "trialing";

  const trialDaysLeft = (() => {
    if (status !== "trialing" || !data?.trial_ends_at) return null;
    const diff = new Date(data.trial_ends_at).getTime() - now;
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  })();

  const isBlocked = (() => {
    if (loading || !data) return false;
    if (status === "unpaid") return true;
    if (status === "trialing") return trialDaysLeft !== null && trialDaysLeft <= 0;
    if (status === "canceled") {
      if (!data.subscription_current_period_end) return true;
      return new Date(data.subscription_current_period_end).getTime() < now;
    }
    return false; // active, past_due → acceso permitido
  })();

  return { data, loading, isBlocked, trialDaysLeft, refetch: () => setTick((n) => n + 1) };
}
