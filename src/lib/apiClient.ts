/**
 * Wrapper sobre fetch para llamadas a Supabase Edge Functions.
 *
 * Maneja automáticamente:
 *   - 429 Rate Limited → lanza AppError(RATE_LIMITED) con retryAfter
 *   - Errores de red → lanza AppError(NETWORK_ERROR)
 *   - Respuestas de error del servidor → lanza AppError con el código recibido
 *
 * Uso:
 *   const data = await callEdgeFunction("create-stripe-session", { order_id, slug });
 */

import { supabase } from "./supabase";
import { AppError, AppErrorCode } from "./errors";

type EdgeFunctionName =
  | "create-stripe-session"
  | "create-subscription-checkout"
  | "create-billing-portal-session"
  | "get-subscription-status"
  | "get-stripe-connect-status"
  | "verify-custom-domain"
  | "ai-agent"
  | "whatsapp-send";

/**
 * Llama a una Edge Function con el JWT del usuario actual.
 * Lanza AppError en caso de fallo.
 */
export async function callEdgeFunction<T = unknown>(
  name: EdgeFunctionName,
  body: Record<string, unknown>
): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const url = `${supabaseUrl}/functions/v1/${name}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseAnonKey,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    throw new AppError(
      AppErrorCode.NETWORK_ERROR,
      "No se pudo conectar con el servidor. Comprueba tu conexión.",
      { cause }
    );
  }

  // 429 — rate limit superado
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("Retry-After") ?? 60);
    throw new AppError(
      AppErrorCode.RATE_LIMITED,
      `Demasiadas peticiones. Por favor espera ${retryAfter} segundo${retryAfter !== 1 ? "s" : ""} e inténtalo de nuevo.`,
      { status: 429, meta: { retryAfter } }
    );
  }

  // Intentar parsear como JSON
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new AppError(
      AppErrorCode.SERVER_ERROR,
      `Error inesperado del servidor (${response.status})`,
      { status: response.status }
    );
  }

  if (!response.ok) {
    const payload = json as { error?: string; code?: string; status?: number };
    const code = (payload.code as AppErrorCode | undefined) ?? AppErrorCode.SERVER_ERROR;
    throw new AppError(
      code,
      payload.error ?? `Error del servidor (${response.status})`,
      { status: response.status }
    );
  }

  return json as T;
}
