export type OrderType = "pickup" | "delivery";

export type PaymentMethod = "cash" | "card_on_delivery" | "stripe_online" | "card_online";

export type CheckoutStep = "customer" | "type" | "delivery" | "payment" | "review";

export type CheckoutCustomer = {
  name: string;
  phone: string;
};

export type CheckoutDelivery = {
  addressText: string;
  street?: string;
  number?: string;
  city?: string;
  postcode?: string;
  postalCode?: string;
  notes?: string;
  isHouse?: boolean;
  isBuilding?: boolean;
  portal?: string;
  floor?: string;
  door?: string;
  block?: string;
  staircase?: string;
  stair?: string;
  instructions?: string;
  lat?: number | null;
  lng?: number | null;
  distanceKm?: number | null;
  isWithinRadius?: boolean | null;
  addressConfirmed?: boolean;
  confirmedAt?: string | null;
};

export type CheckoutPayment =
  | {
      method: "cash";
      cashGiven: number;
    }
  | {
      method: "card_on_delivery";
    }
  | {
      method: "stripe_online" | "card_online";
    };

export type CheckoutDraft = {
  customer: CheckoutCustomer;
  orderType: OrderType;
  delivery?: CheckoutDelivery;
  payment: CheckoutPayment;
  tipAmount: number;
};

export type CartExtra = {
  ingredientId: string;
  name: string;
  price: number;
};

export type CartModifierOption = {
  optionId: string;
  name: string;
  price: number;
};

export type CartModifierGroup = {
  groupId: string;
  groupName: string;
  options: CartModifierOption[];
};

export type CartItem = {
  id: string;
  productId: string;
  name: string;
  qty: number;
  basePrice: number;
  unitPrice: number;
  extras: CartExtra[];
  extraPrice?: number;
  selectedModifiers?: CartModifierGroup[];
};

export const emptyDraft: CheckoutDraft = {
  customer: {
    name: "",
    phone: "",
  },
  orderType: "pickup",
  delivery: undefined,
  payment: {
    method: "cash",
    cashGiven: 0,
  },
  tipAmount: 0,
};
