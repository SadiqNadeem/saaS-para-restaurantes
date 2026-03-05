import type { CheckoutDraft, CheckoutPayment, CheckoutStep as BaseCheckoutStep } from "./types";

export type CheckoutStep = BaseCheckoutStep;

export type AddressState = {
  addressText?: string;
  street?: string;
  number?: string;
  city?: string;
  postcode?: string;
  postalCode?: string;
  lat?: number | null;
  lng?: number | null;
  isWithinRadius?: boolean | null;
  addressConfirmed?: boolean;
  isHouse?: boolean;
  portal?: string;
  block?: string;
  staircase?: string;
  stair?: string;
  floor?: string;
  door?: string;
};

export type CheckoutState = {
  step: CheckoutStep;
  draft: CheckoutDraft;
  cartTotal?: number;
};

export type ValidationResult = {
  ok: boolean;
  errors: Record<string, string>;
};

export function validateAddress(address?: AddressState): ValidationResult {
  const errors: Record<string, string> = {};

  if (!address?.addressText?.trim()) {
    errors.addressText = "La direccion es obligatoria.";
  }
  if (!address?.street?.trim() || !address?.number?.trim()) {
    errors.streetNumber = "Calle y numero son obligatorios.";
  }

  if (!Number.isFinite(address?.lat) || !Number.isFinite(address?.lng)) {
    errors.addressCoords = "La direccion debe tener coordenadas validas.";
  }

  if (address?.isWithinRadius !== true) {
    errors.withinRadius = "La direccion esta fuera del radio de entrega.";
  }

  if (address?.addressConfirmed !== true) {
    errors.addressConfirmed = "Debes confirmar la direccion antes de continuar.";
  }

  const isHouse = Boolean(address?.isHouse);
  if (!isHouse) {
    if (!address?.portal?.trim() || !address?.floor?.trim() || !address?.door?.trim()) {
      errors.building = "Faltan datos del edificio: portal, piso y puerta";
    }
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateDetails(state: CheckoutState): ValidationResult {
  const errors: Record<string, string> = {};
  const customer = state.draft.customer;

  if (!customer.name.trim()) {
    errors.customerName = "El nombre es obligatorio.";
  }

  if (!customer.phone.trim()) {
    errors.customerPhone = "El telefono es obligatorio.";
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
  };
}

export function validatePayment(payment: CheckoutPayment, cartTotal = 0): ValidationResult {
  const errors: Record<string, string> = {};

  if (payment.method === "cash") {
    const cashGiven = Number(payment.cashGiven);
    if (!(cashGiven > 0)) {
      errors.cashGiven = "En efectivo, introduce un importe mayor que 0.";
    } else if (cashGiven < cartTotal) {
      errors.cashGiven = "El efectivo es menor que el total del pedido.";
    }
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
  };
}

export function canProceed(state: CheckoutState): ValidationResult {
  if (state.step === "customer") {
    return validateDetails(state);
  }

  if (state.step === "delivery" && state.draft.orderType === "delivery") {
    return validateAddress(state.draft.delivery);
  }

  if (state.step === "payment") {
    return validatePayment(state.draft.payment, state.cartTotal ?? 0);
  }

  return { ok: true, errors: {} };
}
