import type { CreatePosOrderParams } from "./posOrderService";

const QUEUE_KEY = "pos_offline_queue";

export type QueuedOrder = {
  /** Local UUID used to remove this entry after syncing */
  queueId: string;
  params: CreatePosOrderParams;
  /** Pre-computed total for display in sync toasts */
  total: number;
  /** Display label, e.g. customer name */
  customerLabel: string;
  queuedAt: number;
};

function readQueue(): QueuedOrder[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as QueuedOrder[];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedOrder[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Storage full — can't do much, order is lost
  }
}

/** Add an order to the offline queue. Returns the local queueId. */
export function enqueueOrder(
  params: CreatePosOrderParams,
  total: number,
  customerLabel: string
): string {
  const queueId = crypto.randomUUID();
  const queue = readQueue();
  queue.push({ queueId, params, total, customerLabel, queuedAt: Date.now() });
  writeQueue(queue);
  return queueId;
}

/** All pending offline orders in FIFO order. */
export function getOfflineQueue(): QueuedOrder[] {
  return readQueue();
}

/** Remove a single entry by queueId (after successful sync). */
export function removeFromQueue(queueId: string): void {
  writeQueue(readQueue().filter((e) => e.queueId !== queueId));
}

/** How many orders are waiting to be synced. */
export function offlineQueueSize(): number {
  return readQueue().length;
}
