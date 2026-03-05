import { createContext, useContext, type ReactNode } from "react";

import { useRestaurant } from "../restaurant/RestaurantContext";
import {
  usePosRealtime,
  type PosRealtimeOrder,
  type PosToast,
} from "./hooks/usePosRealtime";

// ─── Context type ─────────────────────────────────────────────────────────────

type PosRealtimeCtxType = {
  orders: PosRealtimeOrder[];
  loading: boolean;
  realtimeConnected: boolean;
  newWebOrderIds: Set<string>;
  pendingWebCount: number;
  toasts: PosToast[];
  dismissToast: (id: string) => void;
  patchOrder: (id: string, patch: Partial<PosRealtimeOrder>) => void;
};

// ─── Context ──────────────────────────────────────────────────────────────────

const PosRealtimeCtx = createContext<PosRealtimeCtxType | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function PosRealtimeProvider({ children }: { children: ReactNode }) {
  const { restaurantId } = useRestaurant();
  const value = usePosRealtime({ restaurantId });
  return (
    <PosRealtimeCtx.Provider value={value}>{children}</PosRealtimeCtx.Provider>
  );
}

// ─── Consumer hook ────────────────────────────────────────────────────────────

export function usePosRealtimeCtx(): PosRealtimeCtxType {
  const ctx = useContext(PosRealtimeCtx);
  if (!ctx) {
    throw new Error("usePosRealtimeCtx must be used inside PosRealtimeProvider");
  }
  return ctx;
}

// Re-export types for consumers
export type { PosRealtimeOrder, PosToast };
