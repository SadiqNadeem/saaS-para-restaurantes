/**
 * Códigos de error de la aplicación.
 *
 * Uso:
 *   throw new AppError(AppErrorCode.RESTAURANT_NOT_FOUND, "No existe el restaurante");
 *
 *   // En catch:
 *   if (err instanceof AppError && err.code === AppErrorCode.UNAUTHORIZED) { ... }
 */

// ─── Códigos de error ─────────────────────────────────────────────────────────

export const AppErrorCode = {
  // Autenticación / autorización
  UNAUTHORIZED:              "UNAUTHORIZED",
  FORBIDDEN:                 "FORBIDDEN",
  SESSION_EXPIRED:           "SESSION_EXPIRED",

  // Restaurante / tenant
  RESTAURANT_NOT_FOUND:      "RESTAURANT_NOT_FOUND",
  RESTAURANT_CLOSED:         "RESTAURANT_CLOSED",
  RESTAURANT_NOT_ACCEPTING:  "RESTAURANT_NOT_ACCEPTING",

  // Menú
  PRODUCT_NOT_FOUND:         "PRODUCT_NOT_FOUND",
  PRODUCT_INACTIVE:          "PRODUCT_INACTIVE",
  CATEGORY_NOT_FOUND:        "CATEGORY_NOT_FOUND",
  INVALID_MENU_ITEM:         "INVALID_MENU_ITEM",

  // Pedidos / checkout
  ORDER_NOT_FOUND:           "ORDER_NOT_FOUND",
  ORDER_ALREADY_EXISTS:      "ORDER_ALREADY_EXISTS",
  INVALID_ORDER:             "INVALID_ORDER",
  CART_EMPTY:                "CART_EMPTY",
  DELIVERY_OUT_OF_RANGE:     "DELIVERY_OUT_OF_RANGE",
  PAYMENT_FAILED:            "PAYMENT_FAILED",
  PRICE_MISMATCH:            "PRICE_MISMATCH",

  // Invitaciones / equipo
  INVITATION_NOT_FOUND:      "INVITATION_NOT_FOUND",
  INVITATION_EXPIRED:        "INVITATION_EXPIRED",
  INVITATION_ALREADY_USED:   "INVITATION_ALREADY_USED",

  // Red / servidor
  NETWORK_ERROR:             "NETWORK_ERROR",
  SERVER_ERROR:              "SERVER_ERROR",
  RATE_LIMITED:              "RATE_LIMITED",
  VALIDATION_ERROR:          "VALIDATION_ERROR",
  NOT_FOUND:                 "NOT_FOUND",
} as const;

export type AppErrorCode = (typeof AppErrorCode)[keyof typeof AppErrorCode];

// ─── Clase AppError ───────────────────────────────────────────────────────────

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  /** Contexto adicional (no mostrar al usuario) */
  readonly meta?: Record<string, unknown>;

  constructor(
    code: AppErrorCode,
    message: string,
    options?: { status?: number; meta?: Record<string, unknown>; cause?: unknown }
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = options?.status ?? codeToStatus(code);
    this.meta = options?.meta;
    if (options?.cause) {
      this.cause = options.cause;
    }
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      status: this.status,
    };
  }
}

// ─── Mapeo código → status HTTP ──────────────────────────────────────────────

function codeToStatus(code: AppErrorCode): number {
  switch (code) {
    case AppErrorCode.UNAUTHORIZED:
    case AppErrorCode.SESSION_EXPIRED:
      return 401;
    case AppErrorCode.FORBIDDEN:
      return 403;
    case AppErrorCode.RESTAURANT_NOT_FOUND:
    case AppErrorCode.PRODUCT_NOT_FOUND:
    case AppErrorCode.CATEGORY_NOT_FOUND:
    case AppErrorCode.ORDER_NOT_FOUND:
    case AppErrorCode.INVITATION_NOT_FOUND:
    case AppErrorCode.NOT_FOUND:
      return 404;
    case AppErrorCode.VALIDATION_ERROR:
    case AppErrorCode.INVALID_ORDER:
    case AppErrorCode.INVALID_MENU_ITEM:
    case AppErrorCode.CART_EMPTY:
    case AppErrorCode.PRICE_MISMATCH:
      return 400;
    case AppErrorCode.ORDER_ALREADY_EXISTS:
    case AppErrorCode.INVITATION_ALREADY_USED:
      return 409;
    case AppErrorCode.RATE_LIMITED:
      return 429;
    default:
      return 500;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extrae un mensaje legible de cualquier tipo de error */
export function getErrorMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Ha ocurrido un error inesperado";
}

/** Devuelve true si el error es un 429 de Supabase o de la app */
export function isRateLimitError(error: unknown): boolean {
  if (error instanceof AppError) return error.code === AppErrorCode.RATE_LIMITED;
  if (error && typeof error === "object") {
    const e = error as { status?: number; code?: string };
    return e.status === 429 || e.code === AppErrorCode.RATE_LIMITED;
  }
  return false;
}

/** Convierte un error de Supabase PostgREST en AppError */
export function fromSupabaseError(
  error: { message?: string | null; code?: string | null; details?: string | null } | null
): AppError {
  if (!error) return new AppError(AppErrorCode.SERVER_ERROR, "Error desconocido");

  const msg = error.message ?? "Error en base de datos";

  // RLS / permisos
  if (error.code === "42501" || msg.includes("row-level security")) {
    return new AppError(AppErrorCode.FORBIDDEN, "No tienes permisos para esta acción", {
      status: 403,
      meta: { supabaseCode: error.code },
    });
  }

  // Not found
  if (error.code === "PGRST116") {
    return new AppError(AppErrorCode.NOT_FOUND, "Registro no encontrado", { status: 404 });
  }

  return new AppError(AppErrorCode.SERVER_ERROR, msg, {
    meta: { supabaseCode: error.code, details: error.details },
  });
}
