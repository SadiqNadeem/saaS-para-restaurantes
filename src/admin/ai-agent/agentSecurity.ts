// Agent security: input validation and rate limiting.

import type { ToolName } from "./agentTools";

export type ValidationResult = {
  valid: boolean;
  sanitized: Record<string, unknown>;
  error?: string;
};

// ── Input sanitization helpers ──────────────────────────────────────────────

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, "").trim();
}

function sanitizeString(value: unknown, maxLen = 100): string {
  return stripHtml(String(value ?? "")).slice(0, maxLen);
}

function sanitizeNumber(value: unknown, min: number, max: number): number | null {
  const n = Number(value);
  if (isNaN(n)) return null;
  return Math.min(Math.max(n, min), max);
}

// ── Per-tool validation ─────────────────────────────────────────────────────

export function validateToolParams(
  toolName: ToolName,
  params: Record<string, unknown>
): ValidationResult {
  const ok = (sanitized: Record<string, unknown>): ValidationResult => ({ valid: true, sanitized });
  const fail = (error: string): ValidationResult => ({ valid: false, sanitized: {}, error });

  switch (toolName) {
    case "get_orders_today": {
      const allowed = new Set(["status", "hour", "type"]);
      const group_by = params.group_by ? sanitizeString(params.group_by, 20) : "status";
      return ok({ group_by: allowed.has(group_by) ? group_by : "status" });
    }

    case "get_sales_summary": {
      const allowed = new Set(["today", "week", "month"]);
      const period = sanitizeString(params.period, 10);
      if (!allowed.has(period)) return fail("period debe ser 'today', 'week' o 'month'");
      return ok({ period });
    }

    case "get_top_products": {
      const allowed = new Set(["today", "week", "month"]);
      const period = sanitizeString(params.period, 10);
      if (!allowed.has(period)) return fail("period debe ser 'today', 'week' o 'month'");
      const limit = sanitizeNumber(params.limit ?? 5, 1, 10);
      if (limit === null) return fail("limit debe ser un número entre 1 y 10");
      return ok({ period, limit });
    }

    case "get_menu_status":
      return ok({});

    case "create_tables": {
      const count = sanitizeNumber(params.count, 1, 20);
      if (count === null) return fail("count debe ser entre 1 y 20");
      const zone = params.zone ? sanitizeString(params.zone, 50) : "Sala";
      const prefix = params.prefix ? sanitizeString(params.prefix, 30) : "Mesa";
      return ok({ count, zone, prefix });
    }

    case "create_category": {
      const name = sanitizeString(params.name, 50);
      if (name.length < 2) return fail("El nombre de la categoría debe tener al menos 2 caracteres");
      if (name.length > 50) return fail("El nombre de la categoría no puede superar 50 caracteres");
      return ok({ name });
    }

    case "update_delivery_settings": {
      const sanitized: Record<string, unknown> = {};
      if (params.delivery_radius_km !== undefined) {
        const v = sanitizeNumber(params.delivery_radius_km, 0, 100);
        if (v === null) return fail("delivery_radius_km debe ser un número entre 0 y 100");
        sanitized.delivery_radius_km = v;
      }
      if (params.delivery_fee !== undefined) {
        const v = sanitizeNumber(params.delivery_fee, 0, 999);
        if (v === null) return fail("delivery_fee debe ser un número entre 0 y 999");
        sanitized.delivery_fee = v;
      }
      if (params.minimum_order !== undefined) {
        const v = sanitizeNumber(params.minimum_order, 0, 9999);
        if (v === null) return fail("minimum_order debe ser un número entre 0 y 9999");
        sanitized.minimum_order = v;
      }
      if (params.delivery_enabled !== undefined) {
        sanitized.delivery_enabled = Boolean(params.delivery_enabled);
      }
      if (Object.keys(sanitized).length === 0) {
        return fail("Especifica al menos un campo a actualizar");
      }
      return ok(sanitized);
    }

    case "toggle_accepting_orders":
      return ok({ accepting: Boolean(params.accepting) });

    case "hide_product": {
      const product_name = sanitizeString(params.product_name, 100);
      if (!product_name) return fail("product_name requerido");
      return ok({ product_name });
    }

    case "create_coupon": {
      const code = sanitizeString(params.code, 30).toUpperCase();
      if (!code) return fail("code requerido");
      if (!/^[A-Z0-9_-]+$/.test(code)) return fail("code solo puede contener letras, números, guiones y guiones bajos");
      const discount_type = sanitizeString(params.discount_type, 10);
      if (!["percent", "fixed"].includes(discount_type)) {
        return fail("discount_type debe ser 'percent' o 'fixed'");
      }
      const discount_value = sanitizeNumber(params.discount_value, 0.01, discount_type === "percent" ? 100 : 9999);
      if (discount_value === null) return fail("discount_value inválido");
      const min_order_amount = params.min_order_amount !== undefined
        ? sanitizeNumber(params.min_order_amount, 0, 9999)
        : null;
      return ok({ code, discount_type, discount_value, min_order_amount });
    }

    case "delete_product": {
      const product_name = sanitizeString(params.product_name, 100);
      if (!product_name) return fail("product_name requerido");
      return ok({ product_name });
    }

    case "delete_category": {
      const category_name = sanitizeString(params.category_name, 100);
      if (!category_name) return fail("category_name requerido");
      return ok({ category_name });
    }

    case "update_product_prices": {
      const allowed = new Set(["percent_increase", "percent_decrease", "set_price"]);
      const change_type = sanitizeString(params.change_type, 30);
      if (!allowed.has(change_type)) {
        return fail("change_type debe ser 'percent_increase', 'percent_decrease' o 'set_price'");
      }
      const maxValue = change_type === "set_price" ? 99999 : 100;
      const value = sanitizeNumber(params.value, 0.01, maxValue);
      if (value === null) return fail(`value debe ser entre 0.01 y ${maxValue}`);
      const product_name = sanitizeString(params.product_name, 100);
      if (!product_name) return fail("product_name requerido (o 'all' para todos)");
      return ok({ change_type, value, product_name });
    }

    case "delete_tables": {
      if (!Array.isArray(params.table_names)) {
        return fail("table_names debe ser una lista");
      }
      const table_names = (params.table_names as unknown[])
        .slice(0, 50)
        .map((n) => sanitizeString(n, 60))
        .filter((n) => n.length > 0);
      if (table_names.length === 0) return fail("table_names no puede estar vacío");
      return ok({ table_names });
    }

    default:
      return fail(`Tool desconocida: ${String(toolName)}`);
  }
}

// ── Rate limiting ───────────────────────────────────────────────────────────

const RATE_LIMIT_MAX = 50;
const RATE_LIMIT_WARN = 40;

type RateLimitStore = {
  count: number;
  date: string; // YYYY-MM-DD
};

function getRateLimitKey(restaurantId: string): string {
  return `ai_rate_${restaurantId}`;
}

function todayDate(): string {
  return new Date().toISOString().split("T")[0];
}

export function getRateLimitStatus(restaurantId: string): {
  count: number;
  remaining: number;
  blocked: boolean;
  warning: boolean;
} {
  try {
    const key = getRateLimitKey(restaurantId);
    const raw = localStorage.getItem(key);
    const today = todayDate();

    if (!raw) {
      return { count: 0, remaining: RATE_LIMIT_MAX, blocked: false, warning: false };
    }

    const store = JSON.parse(raw) as RateLimitStore;
    if (store.date !== today) {
      return { count: 0, remaining: RATE_LIMIT_MAX, blocked: false, warning: false };
    }

    const count = store.count;
    return {
      count,
      remaining: Math.max(0, RATE_LIMIT_MAX - count),
      blocked: count >= RATE_LIMIT_MAX,
      warning: count >= RATE_LIMIT_WARN && count < RATE_LIMIT_MAX
    };
  } catch {
    return { count: 0, remaining: RATE_LIMIT_MAX, blocked: false, warning: false };
  }
}

export function incrementRateLimit(restaurantId: string): void {
  try {
    const key = getRateLimitKey(restaurantId);
    const today = todayDate();
    const raw = localStorage.getItem(key);
    let store: RateLimitStore = { count: 0, date: today };

    if (raw) {
      const parsed = JSON.parse(raw) as RateLimitStore;
      if (parsed.date === today) store = parsed;
    }

    store.count += 1;
    store.date = today;
    localStorage.setItem(key, JSON.stringify(store));
  } catch {
    // ignore storage errors
  }
}
