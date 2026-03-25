import { create } from "zustand";

import {
  emptyDraft,
  type CheckoutCustomer,
  type CheckoutDelivery,
  type CheckoutDraft,
  type CheckoutPayment,
  type CheckoutStep,
  type OrderType,
} from "./types";

type CheckoutStore = {
  step: CheckoutStep;
  draft: CheckoutDraft;
  clientOrderKey: string;
  appliedCouponCode: string | null;
  appliedDiscount: number;
  setCustomer: (customer: CheckoutCustomer) => void;
  setOrderType: (orderType: OrderType) => void;
  setDelivery: (delivery: CheckoutDelivery | undefined) => void;
  setPayment: (payment: CheckoutPayment) => void;
  setTip: (amount: number) => void;
  setCoupon: (code: string, amount: number) => void;
  clearCoupon: () => void;
  regenerateOrderKey: () => void;
  next: () => void;
  back: () => void;
  reset: () => void;
};

const CLIENT_ORDER_KEY_STORAGE = "checkout_client_order_key";
const COUPON_STORAGE_KEY = "checkout_applied_coupon";

function loadStoredCoupon(): { code: string | null; amount: number } {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(COUPON_STORAGE_KEY) : null;
    if (!raw) return { code: null, amount: 0 };
    const parsed = JSON.parse(raw) as { code?: string; amount?: number };
    return { code: parsed.code ?? null, amount: parsed.amount ?? 0 };
  } catch {
    return { code: null, amount: 0 };
  }
}

function saveStoredCoupon(code: string, amount: number): void {
  try {
    window.localStorage.setItem(COUPON_STORAGE_KEY, JSON.stringify({ code, amount }));
  } catch { /* ignore */ }
}

function clearStoredCoupon(): void {
  try {
    window.localStorage.removeItem(COUPON_STORAGE_KEY);
  } catch { /* ignore */ }
}

const getStepsForOrderType = (orderType: OrderType): CheckoutStep[] => {
  if (orderType === "pickup") {
    return ["customer", "type", "payment", "review"];
  }

  return ["customer", "type", "delivery", "payment", "review"];
};

function safeUUID(): string {
  const cryptoApi = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function getOrCreateClientOrderKey(): string {
  const fallback = safeUUID();

  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const existing = window.localStorage.getItem(CLIENT_ORDER_KEY_STORAGE);
    if (existing && existing.trim().length > 0) {
      return existing;
    }

    window.localStorage.setItem(CLIENT_ORDER_KEY_STORAGE, fallback);
    return fallback;
  } catch {
    return fallback;
  }
}

const DEVICE_CLIENT_ORDER_KEY = getOrCreateClientOrderKey();
const INITIAL_COUPON = loadStoredCoupon();

export const useCheckoutStore = create<CheckoutStore>((set, get) => ({
  step: "customer",
  draft: emptyDraft,
  clientOrderKey: DEVICE_CLIENT_ORDER_KEY,
  appliedCouponCode: INITIAL_COUPON.code,
  appliedDiscount: INITIAL_COUPON.amount,

  setCustomer: (customer) =>
    set((state) => ({
      draft: {
        ...state.draft,
        customer,
      },
    })),

  setOrderType: (orderType) =>
    set((state) => {
      const nextDelivery =
        orderType === "pickup"
          ? undefined
          : (state.draft.delivery ?? { addressText: "", isHouse: true, isBuilding: false });

      const nextStep =
        state.step === "delivery" && orderType === "pickup" ? "payment" : state.step;

      return {
        step: nextStep,
        draft: {
          ...state.draft,
          orderType,
          delivery: nextDelivery,
        },
      };
    }),

  setDelivery: (delivery) =>
    set((state) => ({
      draft: {
        ...state.draft,
        delivery,
      },
    })),

  setPayment: (payment) =>
    set((state) => ({
      draft: {
        ...state.draft,
        payment,
      },
    })),

  setTip: (amount) =>
    set((state) => ({
      draft: {
        ...state.draft,
        tipAmount: Math.max(0, amount),
      },
    })),

  setCoupon: (code, amount) => {
    saveStoredCoupon(code, amount);
    set({ appliedCouponCode: code, appliedDiscount: amount });
  },

  clearCoupon: () => {
    clearStoredCoupon();
    set({ appliedCouponCode: null, appliedDiscount: 0 });
  },

  regenerateOrderKey: () => set({ clientOrderKey: DEVICE_CLIENT_ORDER_KEY }),

  next: () => {
    const { step, draft } = get();
    const steps = getStepsForOrderType(draft.orderType);
    const index = steps.indexOf(step);

    if (index < 0 || index >= steps.length - 1) {
      return;
    }

    set({ step: steps[index + 1] });
  },

  back: () => {
    const { step, draft } = get();
    const steps = getStepsForOrderType(draft.orderType);
    const index = steps.indexOf(step);

    if (index <= 0) {
      return;
    }

    set({ step: steps[index - 1] });
  },

  reset: () => {
    clearStoredCoupon();
    set({
      step: "customer",
      draft: emptyDraft,
      clientOrderKey: DEVICE_CLIENT_ORDER_KEY,
      appliedCouponCode: null,
      appliedDiscount: 0,
    });
  },
}));
