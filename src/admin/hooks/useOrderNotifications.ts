import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

const BASE_TITLE = "Panel Admin";

/**
 * Manages browser-level notifications for new orders:
 *  - Updates document.title with "(N) Panel Admin" badge
 *  - Requests Notification permission once on mount
 *  - Shows a browser Notification for each new order
 *
 * Lives in AdminLayout so it's always active, regardless of which admin page is open.
 * The realtime sound/toast logic stays in AdminOrdersPage (different channel, no conflict).
 */
export function useOrderNotifications(restaurantId: string) {
  const [unseenCount, setUnseenCount] = useState(0);

  // Ask for Notification permission once (skips if already granted or denied)
  useEffect(() => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, []);

  // Keep document.title in sync
  useEffect(() => {
    document.title =
      unseenCount > 0 ? `(${unseenCount}) ${BASE_TITLE}` : BASE_TITLE;
    return () => {
      document.title = BASE_TITLE;
    };
  }, [unseenCount]);

  // Realtime: separate channel from AdminOrdersPage ("admin-orders-*")
  useEffect(() => {
    if (!restaurantId) return;

    const channel = supabase
      .channel(`admin-notif-${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          setUnseenCount((n) => n + 1);

          if (
            typeof Notification !== "undefined" &&
            Notification.permission === "granted"
          ) {
            const order = payload.new as Record<string, unknown>;
            const total =
              typeof order.total === "number"
                ? `${(order.total as number).toFixed(2)} €`
                : "";
            const typeLabel =
              order.order_type === "delivery"
                ? "A domicilio"
                : order.order_type === "pickup"
                  ? "Recogida en local"
                  : "";
            const body = [typeLabel, total].filter(Boolean).join(" · ") ||
              "Tienes un nuevo pedido";

            new Notification("Nuevo pedido", {
              body,
              icon: "/vite.svg",
              tag: `new-order-${String(order.id ?? Date.now())}`,
            });
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [restaurantId]);

  /** Call when the user navigates to the orders page to clear the badge. */
  const resetBadge = useCallback(() => {
    setUnseenCount(0);
    document.title = BASE_TITLE;
  }, []);

  return { unseenCount, resetBadge };
}
