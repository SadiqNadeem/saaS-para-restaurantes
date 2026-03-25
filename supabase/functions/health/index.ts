/**
 * Health check endpoint.
 *
 * GET /functions/v1/health
 *
 * Respuesta:
 *   { status: "ok", version: string, timestamp: string, checks: { db: "ok" | "error" } }
 *
 * Usado por:
 *   - CI/CD post-deploy health check
 *   - Monitoring externo (UptimeRobot, Checkly, etc.)
 *   - AdminDiagnosticsPage para verificar estado del sistema
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Versión de la app — se puede inyectar en build via VITE_APP_VERSION o equivalente
const VERSION = Deno.env.get("APP_VERSION") ?? "1.0.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  if (req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  const timestamp = new Date().toISOString();
  const checks: Record<string, string> = {};

  // ── Check: base de datos ────────────────────────────────────────────────────
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
      });
      // Query mínima: solo verifica que la BD responde
      const { error } = await supabase.rpc("is_superadmin").maybeSingle();
      checks.db = error ? "error" : "ok";
    } else {
      checks.db = "unconfigured";
    }
  } catch {
    checks.db = "error";
  }

  // ── Resultado final ─────────────────────────────────────────────────────────
  const allOk = Object.values(checks).every((v) => v === "ok" || v === "unconfigured");
  const status = allOk ? "ok" : "degraded";
  const httpStatus = allOk ? 200 : 503;

  return json({ status, version: VERSION, timestamp, checks }, httpStatus);
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
