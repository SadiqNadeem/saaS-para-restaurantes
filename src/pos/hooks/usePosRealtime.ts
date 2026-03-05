import { useCallback, useEffect, useState } from "react";

import type { OrderStatus } from "../../constants/orderStatus";
import { isOrderStatus } from "../../constants/orderStatus";
import { supabase } from "../../lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PosOrderItem = {
  id: string;
  qty: number;
  snapshot_name: string | null;
  unit_price: number | null;
  line_total: number | null;
};

export type PosRealtimeOrder = {
  id: string;
  created_at: string | null;
  status: OrderStatus | null;
  order_type: string | null;
  source: string | null;
  total: number | null;
  customer_name: string | null;
  payment_method: string | null;
  payment_status: string | null;
  order_items: PosOrderItem[];
};

export type PosToast = {
  id: string;
  message: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const SOUND_ENABLED_KEY = "admin_sound_enabled";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function fmtEur(n: number | null | undefined): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(n ?? 0);
}

function parseOrder(row: Record<string, unknown>): PosRealtimeOrder {
  return {
    id: String(row.id ?? ""),
    created_at: (row.created_at as string | null) ?? null,
    status: isOrderStatus(row.status) ? row.status : null,
    order_type: (row.order_type as string | null) ?? null,
    source: (row.source as string | null) ?? null,
    total: typeof row.total === "number" ? row.total : null,
    customer_name: (row.customer_name as string | null) ?? null,
    payment_method: (row.payment_method as string | null) ?? null,
    payment_status: (row.payment_status as string | null) ?? null,
    order_items: Array.isArray(row.order_items)
      ? (row.order_items as PosOrderItem[])
      : [],
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

type UsePosRealtimeParams = {
  restaurantId: string | null;
};

type UsePosRealtimeReturn = {
  orders: PosRealtimeOrder[];
  loading: boolean;
  realtimeConnected: boolean;
  newWebOrderIds: Set<string>;
  pendingWebCount: number;
  toasts: PosToast[];
  dismissToast: (id: string) => void;
  patchOrder: (id: string, patch: Partial<PosRealtimeOrder>) => void;
};

let _toastSeq = 0;

export function usePosRealtime({
  restaurantId,
}: UsePosRealtimeParams): UsePosRealtimeReturn {
  const [orders, setOrders] = useState<PosRealtimeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [newWebOrderIds, setNewWebOrderIds] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<PosToast[]>([]);

  // ── Request notification permission on first mount ──
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, []);

  // ── Initial load ──
  const loadOrders = useCallback(async () => {
    if (!restaurantId) return;

    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, created_at, status, order_type, source, total, customer_name, payment_method, payment_status," +
          " order_items(id, qty, snapshot_name, unit_price, line_total)"
      )
      .eq("restaurant_id", restaurantId)
      .eq("archived", false)
      .gte("created_at", todayIso())
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("[pos-realtime] load error", error);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
    setOrders(rows.map(parseOrder));
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => {
    setLoading(true);
    void loadOrders();
  }, [loadOrders]);

  // ── Helpers ──
  const playAlert = useCallback(() => {
    if (localStorage.getItem(SOUND_ENABLED_KEY) !== "1") return;
    const audio = new Audio("/new-order.mp3");
    audio.volume = 1.0;
    void audio.play().catch(() => {});
  }, []);

  const showBrowserNotification = useCallback(
    (order: Pick<PosRealtimeOrder, "customer_name" | "total">) => {
      if (
        typeof Notification === "undefined" ||
        Notification.permission !== "granted"
      ) {
        return;
      }
      const notification = new Notification("Nuevo pedido web", {
        body: `${fmtEur(order.total)} — Cliente: ${order.customer_name ?? "Sin nombre"}`,
        icon: "/favicon.ico",
      });
      setTimeout(() => notification.close(), 8000);
    },
    []
  );

  const pushToast = useCallback((message: string) => {
    const id = `pos-toast-${++_toastSeq}`;
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const patchOrder = useCallback(
    (id: string, patch: Partial<PosRealtimeOrder>) => {
      setOrders((prev) =>
        prev.map((o) => (o.id === id ? { ...o, ...patch } : o))
      );
    },
    []
  );

  // ── Realtime subscription ──
  useEffect(() => {
    if (!restaurantId) return;

    const channel = supabase
      .channel(`pos-realtime-${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          const record = payload.new as Record<string, unknown>;
          const source = record.source as string | null;
          const isWeb = source !== "pos";
          const orderId = String(record.id ?? "");

          void supabase
            .from("orders")
            .select(
              "id, created_at, status, order_type, source, total, customer_name, payment_method, payment_status," +
                " order_items(id, qty, snapshot_name, unit_price, line_total)"
            )
            .eq("id", orderId)
            .maybeSingle()
            .then(({ data }) => {
              if (!data) return;
              const newOrder = parseOrder(data as unknown as Record<string, unknown>);

              setOrders((prev) => [
                newOrder,
                ...prev.filter((o) => o.id !== newOrder.id),
              ]);

              if (isWeb) {
                playAlert();
                showBrowserNotification(newOrder);
                pushToast(`🔔 Nuevo pedido web — ${fmtEur(newOrder.total)}`);

                setNewWebOrderIds((prev) => new Set([...prev, newOrder.id]));
                setTimeout(() => {
                  setNewWebOrderIds((prev) => {
                    const next = new Set(prev);
                    next.delete(newOrder.id);
                    return next;
                  });
                }, 3000);
              }
            });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          const record = payload.new as Record<string, unknown>;
          const id = String(record.id ?? "");
          const newStatus = isOrderStatus(record.status) ? record.status : null;
          setOrders((prev) =>
            prev.map((o) => (o.id === id ? { ...o, status: newStatus } : o))
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          const record = payload.old as Record<string, unknown>;
          const id = String(record.id ?? "");
          setOrders((prev) => prev.filter((o) => o.id !== id));
        }
      )
      .subscribe((status) => {
        setRealtimeConnected(status === "SUBSCRIBED");
      });

    return () => {
      void supabase.removeChannel(channel);
      setRealtimeConnected(false);
    };
  }, [restaurantId, playAlert, showBrowserNotification, pushToast]);

  const pendingWebCount = orders.filter(
    (o) => o.source !== "pos" && o.status === "pending"
  ).length;

  return {
    orders,
    loading,
    realtimeConnected,
    newWebOrderIds,
    pendingWebCount,
    toasts,
    dismissToast,
    patchOrder,
  };
}
