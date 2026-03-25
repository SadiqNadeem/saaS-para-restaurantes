/**
 * Rate limiting para Supabase Edge Functions (Deno).
 *
 * Usa Deno KV como almacén de estado distribuido (disponible en Supabase Edge Functions).
 * Si Deno KV no está disponible (entorno local sin --unstable-kv), cae a un Map en memoria
 * que solo funciona por instancia — suficiente para desarrollo.
 *
 * Límites por endpoint:
 *   - auth (login, registro):          10 req / 15 min  por IP
 *   - create-stripe-session (pedidos): 30 req / min     por IP
 *   - ai-agent:                        20 req / min     por usuario autenticado
 *   - verify-custom-domain:             5 req / hora    por restaurante
 *   - get-subscription-status:         60 req / min     por usuario
 *   - público (menú, storefront):     100 req / min     por IP
 */

export interface RateLimitConfig {
  /** Número máximo de requests permitidos en la ventana */
  limit: number;
  /** Duración de la ventana en segundos */
  windowSecs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Requests restantes en la ventana actual */
  remaining: number;
  /** Segundos hasta que la ventana se resetea */
  retryAfter: number;
}

// ─── Presets de configuración ─────────────────────────────────────────────────

export const RATE_LIMITS = {
  auth:              { limit: 10,  windowSecs: 15 * 60 } satisfies RateLimitConfig,
  orders:            { limit: 30,  windowSecs: 60      } satisfies RateLimitConfig,
  ai:                { limit: 20,  windowSecs: 60      } satisfies RateLimitConfig,
  domainVerify:      { limit: 5,   windowSecs: 60 * 60 } satisfies RateLimitConfig,
  subscription:      { limit: 60,  windowSecs: 60      } satisfies RateLimitConfig,
  publicMenu:        { limit: 100, windowSecs: 60      } satisfies RateLimitConfig,
  adminApi:          { limit: 60,  windowSecs: 60      } satisfies RateLimitConfig,
} as const;

// ─── Implementación con Deno KV ───────────────────────────────────────────────

// Fallback in-memory para entornos sin KV (desarrollo local)
const memoryStore = new Map<string, { count: number; resetAt: number }>();

async function getKv(): Promise<Deno.Kv | null> {
  try {
    // @ts-ignore — Deno.openKv puede no estar disponible en todos los entornos
    return await Deno.openKv();
  } catch {
    return null;
  }
}

/**
 * Comprueba si una clave ha superado su límite de rate.
 *
 * @param key   Identificador único (ej: `"orders:ip:1.2.3.4"`)
 * @param config Configuración del límite
 */
export async function checkRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = config.windowSecs * 1000;
  const resetAt = Math.ceil(now / windowMs) * windowMs;
  const kvKey = ["rl", key, Math.floor(now / windowMs)];

  const kv = await getKv();

  if (kv) {
    // ── Deno KV path ──────────────────────────────────────────────────────────
    try {
      const entry = await kv.get<number>(kvKey);
      const current = entry.value ?? 0;

      if (current >= config.limit) {
        const retryAfter = Math.ceil((resetAt - now) / 1000);
        await kv.close();
        return { allowed: false, remaining: 0, retryAfter };
      }

      // Atomic increment
      await kv.atomic()
        .check(entry)
        .set(kvKey, current + 1, { expireIn: windowMs + 5000 })
        .commit();

      await kv.close();
      return {
        allowed: true,
        remaining: config.limit - current - 1,
        retryAfter: 0,
      };
    } catch {
      await kv.close().catch(() => {});
      // Si KV falla, permitimos la request (fail open) y logueamos
      console.warn("[rateLimit] Deno KV error — failing open for key:", key);
      return { allowed: true, remaining: config.limit, retryAfter: 0 };
    }
  }

  // ── In-memory fallback ────────────────────────────────────────────────────
  const existing = memoryStore.get(key);

  if (!existing || now >= existing.resetAt) {
    memoryStore.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: config.limit - 1, retryAfter: 0 };
  }

  if (existing.count >= config.limit) {
    const retryAfter = Math.ceil((existing.resetAt - now) / 1000);
    return { allowed: false, remaining: 0, retryAfter };
  }

  existing.count++;
  return {
    allowed: true,
    remaining: config.limit - existing.count,
    retryAfter: 0,
  };
}

/**
 * Extrae la IP del cliente de los headers de la request.
 * Supabase Edge Functions reciben la IP real en x-forwarded-for.
 */
export function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * Genera una respuesta 429 estándar con el header Retry-After.
 */
export function rateLimitedResponse(retryAfter: number): Response {
  return new Response(
    JSON.stringify({
      error: "Demasiadas peticiones. Por favor espera antes de reintentar.",
      code: "RATE_LIMITED",
      status: 429,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
        "X-RateLimit-Limit": "0",
        "X-RateLimit-Remaining": "0",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    }
  );
}
