import { supabase } from "../supabase";

export type AppEventLevel = "info" | "warn" | "error";

function normalizeError(error: unknown) {
  if (!error) return null;
  if (typeof error === "string") return { message: error };
  if (typeof error === "object") {
    const maybe = error as { message?: unknown; code?: unknown; details?: unknown };
    return {
      message: typeof maybe.message === "string" ? maybe.message : String(maybe.message ?? ""),
      code: maybe.code ?? null,
      details: maybe.details ?? null,
    };
  }
  return { message: String(error) };
}

export async function logEvent(
  level: AppEventLevel,
  scope: string,
  message: string,
  meta?: Record<string, unknown>
): Promise<void> {
  const payload = {
    level,
    scope,
    message,
    meta: meta ?? {},
  };

  const { error } = await supabase.from("app_events").insert(payload);
  if (error) {
    console.error("[logEvent] failed", {
      insertError: normalizeError(error),
      payload,
    });
  }
}
