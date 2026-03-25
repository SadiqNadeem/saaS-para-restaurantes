/**
 * Logger estructurado para el frontend.
 *
 * En desarrollo: imprime en consola con formato legible.
 * En producción: envía a Sentry si está configurado, y opcionalmente
 *   a la tabla app_events de Supabase via logEvent().
 *
 * Uso:
 *   import { logger } from "@/lib/logger";
 *   logger.info("orders", "Pedido creado", { orderId, total });
 *   logger.warn("auth", "Token a punto de expirar");
 *   logger.error("checkout", "Fallo RPC create_order_safe_v2", { error });
 *
 * Integración con Sentry:
 *   1. npm install @sentry/react
 *   2. En src/main.tsx, antes de createRoot():
 *        import * as Sentry from "@sentry/react";
 *        Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN, environment: "production" });
 *   3. Descomentar las líneas de Sentry en este archivo.
 */

// import * as Sentry from "@sentry/react";  // ← descomentar tras instalar Sentry

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  scope: string;
  message: string;
  meta?: Record<string, unknown>;
  timestamp: string;
}

// ─── Implementación ───────────────────────────────────────────────────────────

function buildEntry(
  level: LogLevel,
  scope: string,
  message: string,
  meta?: Record<string, unknown>
): LogEntry {
  return {
    level,
    scope,
    message,
    meta,
    timestamp: new Date().toISOString(),
  };
}

function consoleLog(entry: LogEntry) {
  const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.scope}]`;
  const args = entry.meta ? [prefix, entry.message, entry.meta] : [prefix, entry.message];

  switch (entry.level) {
    case "info":  console.info(...args);  break;
    case "warn":  console.warn(...args);  break;
    case "error": console.error(...args); break;
  }
}

function report(entry: LogEntry, originalError?: unknown) {
  // ── Desarrollo: siempre mostrar en consola ──────────────────────────────────
  if (import.meta.env.DEV) {
    consoleLog(entry);
    return;
  }

  // ── Producción: solo WARN y ERROR van a consola (errores de monitoring) ──────
  if (entry.level !== "info") {
    consoleLog(entry);
  }

  // ── Sentry (descomentar tras instalar @sentry/react) ─────────────────────────
  // if (entry.level === "error" && import.meta.env.VITE_SENTRY_DSN) {
  //   if (originalError instanceof Error) {
  //     Sentry.captureException(originalError, {
  //       extra: { scope: entry.scope, message: entry.message, ...entry.meta },
  //     });
  //   } else {
  //     Sentry.captureMessage(entry.message, {
  //       level: "error",
  //       extra: { scope: entry.scope, ...entry.meta },
  //     });
  //   }
  // }
  //
  // if (entry.level === "warn" && import.meta.env.VITE_SENTRY_DSN) {
  //   Sentry.captureMessage(entry.message, {
  //     level: "warning",
  //     extra: { scope: entry.scope, ...entry.meta },
  //   });
  // }
}

// ─── API pública ──────────────────────────────────────────────────────────────

export const logger = {
  info(scope: string, message: string, meta?: Record<string, unknown>) {
    report(buildEntry("info", scope, message, meta));
  },

  warn(scope: string, message: string, meta?: Record<string, unknown>) {
    report(buildEntry("warn", scope, message, meta));
  },

  /**
   * Loguea un error. Si se pasa el error original, se envía a Sentry con el stack.
   * Nunca loguees datos sensibles (passwords, tokens, PAN de tarjetas).
   */
  error(scope: string, message: string, meta?: Record<string, unknown>, originalError?: unknown) {
    // Sanitizar: nunca incluir tokens ni datos de pago en logs
    const safeMeta = sanitizeMeta(meta);
    report(buildEntry("error", scope, message, safeMeta), originalError);
  },
};

// ─── Sanitización de metadata ─────────────────────────────────────────────────

const SENSITIVE_KEYS = new Set([
  "password", "token", "secret", "key", "authorization",
  "card", "cvv", "pan", "iban", "pin",
]);

function sanitizeMeta(
  meta?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!meta) return undefined;

  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      result[k] = "[REDACTED]";
    } else {
      result[k] = v;
    }
  }
  return result;
}
