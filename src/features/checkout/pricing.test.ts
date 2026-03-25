/**
 * Tests para cálculo de precios de pedido.
 *
 * Cubre: precio base, extras, modificadores, delivery fee, descuentos, propina.
 */
import { describe, it, expect } from "vitest";

// ─── Funciones de cálculo (extraídas/replicadas para testabilidad) ────────────

type Extra = { price: number };
type ModifierOption = { price: number };
type ModifierGroup = { options: ModifierOption[] };
type CartItem = {
  qty: number;
  basePrice: number;
  extras?: Extra[];
  selectedModifiers?: ModifierGroup[];
};

function calcLineTotal(item: CartItem): number {
  const extrasTotal = (item.extras ?? []).reduce((s, e) => s + e.price, 0);
  const modifiersTotal = (item.selectedModifiers ?? []).reduce(
    (s, g) => s + g.options.reduce((o, opt) => o + opt.price, 0),
    0
  );
  return Math.round((item.basePrice + extrasTotal + modifiersTotal) * item.qty * 100) / 100;
}

function calcSubtotal(items: CartItem[]): number {
  return Math.round(items.reduce((s, item) => s + calcLineTotal(item), 0) * 100) / 100;
}

function calcDeliveryFee(
  mode: "fixed" | "distance",
  distanceKm: number,
  opts: {
    fixedFee?: number;
    baseFee?: number;
    perKm?: number;
    minFee?: number;
    maxFee?: number;
    freeOver?: number;
    subtotal?: number;
  }
): number {
  if (opts.freeOver != null && (opts.subtotal ?? 0) >= opts.freeOver) return 0;

  if (mode === "fixed") return opts.fixedFee ?? 0;

  // distance mode
  const base = opts.baseFee ?? 0;
  const variable = distanceKm * (opts.perKm ?? 0);
  const fee = base + variable;
  const clamped = Math.max(opts.minFee ?? 0, Math.min(opts.maxFee ?? Infinity, fee));
  return Math.round(clamped * 100) / 100;
}

function calcTotal(subtotal: number, deliveryFee: number, discount: number, tip: number): number {
  return Math.round(Math.max(0, subtotal + deliveryFee - discount + tip) * 100) / 100;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("calcLineTotal", () => {
  it("simple item, no extras, no modifiers", () => {
    expect(calcLineTotal({ qty: 2, basePrice: 5.5 })).toBe(11.0);
  });

  it("item with extras", () => {
    expect(
      calcLineTotal({
        qty: 1,
        basePrice: 8.0,
        extras: [{ price: 1.5 }, { price: 0.5 }],
      })
    ).toBe(10.0);
  });

  it("item with modifiers", () => {
    expect(
      calcLineTotal({
        qty: 1,
        basePrice: 6.0,
        selectedModifiers: [
          { options: [{ price: 2.0 }, { price: 1.0 }] },
        ],
      })
    ).toBe(9.0);
  });

  it("item with both extras and modifiers, qty > 1", () => {
    expect(
      calcLineTotal({
        qty: 3,
        basePrice: 4.0,
        extras: [{ price: 1.0 }],
        selectedModifiers: [{ options: [{ price: 0.5 }] }],
      })
    ).toBe(16.5); // (4 + 1 + 0.5) * 3
  });

  it("handles zero price items", () => {
    expect(calcLineTotal({ qty: 1, basePrice: 0 })).toBe(0);
  });
});

describe("calcSubtotal", () => {
  it("sums multiple items", () => {
    const items: CartItem[] = [
      { qty: 2, basePrice: 5.0 },
      { qty: 1, basePrice: 3.5, extras: [{ price: 0.5 }] },
    ];
    expect(calcSubtotal(items)).toBe(14.0);
  });

  it("empty cart is 0", () => {
    expect(calcSubtotal([])).toBe(0);
  });
});

describe("calcDeliveryFee", () => {
  it("fixed mode returns fixed fee", () => {
    expect(calcDeliveryFee("fixed", 5, { fixedFee: 2.5 })).toBe(2.5);
  });

  it("distance mode calculates correctly", () => {
    // base 1€ + 0.5€/km * 3km = 2.5€
    expect(calcDeliveryFee("distance", 3, { baseFee: 1, perKm: 0.5 })).toBe(2.5);
  });

  it("distance mode respects minFee", () => {
    // 0.1 + 0.1 = 0.2, clamped to minFee 1.5
    expect(calcDeliveryFee("distance", 0.1, { baseFee: 0.1, perKm: 1, minFee: 1.5 })).toBe(1.5);
  });

  it("distance mode respects maxFee", () => {
    // 1 + 0.5 * 20 = 11, clamped to maxFee 5
    expect(calcDeliveryFee("distance", 20, { baseFee: 1, perKm: 0.5, maxFee: 5 })).toBe(5);
  });

  it("free delivery when subtotal exceeds threshold", () => {
    expect(
      calcDeliveryFee("fixed", 0, { fixedFee: 3, freeOver: 25, subtotal: 30 })
    ).toBe(0);
  });

  it("charges delivery when subtotal below threshold", () => {
    expect(
      calcDeliveryFee("fixed", 0, { fixedFee: 3, freeOver: 25, subtotal: 20 })
    ).toBe(3);
  });
});

describe("calcTotal", () => {
  it("basic total without discount or tip", () => {
    expect(calcTotal(15.0, 2.5, 0, 0)).toBe(17.5);
  });

  it("applies discount", () => {
    expect(calcTotal(20.0, 2.5, 5.0, 0)).toBe(17.5);
  });

  it("adds tip", () => {
    expect(calcTotal(15.0, 0, 0, 2.0)).toBe(17.0);
  });

  it("never returns negative total", () => {
    expect(calcTotal(5.0, 0, 100, 0)).toBe(0);
  });

  it("full scenario: subtotal + fee - discount + tip", () => {
    expect(calcTotal(30.0, 3.0, 5.0, 1.5)).toBe(29.5);
  });
});
