export const ACTIVE_STATUSES = [
  "pending",
  "accepted",
  "preparing",
  "ready",
  "out_for_delivery",
] as const;

export const HISTORY_STATUSES = ["delivered", "cancelled"] as const;

export const ALL_ORDER_STATUSES = [...ACTIVE_STATUSES, ...HISTORY_STATUSES] as const;

export type OrderStatus = (typeof ALL_ORDER_STATUSES)[number];

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ALL_ORDER_STATUSES as readonly string[]).includes(value);
}
