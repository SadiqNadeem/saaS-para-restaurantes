/**
 * Verify that a custom domain's DNS points to this platform.
 *
 * Expected call:
 *   POST /functions/v1/verify-custom-domain
 *   Authorization: Bearer <user_jwt>
 *   { "restaurantId": "uuid", "domain": "menu.mirestaurante.com" }
 *
 * Logic:
 *   1. Validate user is admin of restaurantId
 *   2. DNS lookup via Cloudflare's public DNS-over-HTTPS API
 *   3. Check that the CNAME or A record resolves to the expected target
 *   4. Update restaurants.custom_domain_verified + custom_domain_status
 *
 * DNS setup instructions to show users:
 *   Create a CNAME record:
 *     Name:  menu (or @)
 *     Value: PLATFORM_CNAME_TARGET (e.g. your-netlify-app.netlify.app)
 *
 * SSL:
 *   - Vercel: add domain via Vercel API → automatic SSL provisioning
 *   - Netlify: add domain in Netlify UI → automatic SSL via Let's Encrypt
 *   - Cloudflare: enable proxy → SSL handled by Cloudflare
 *   - Custom server: use caddy (automatic HTTPS) or certbot with nginx/apache
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, RATE_LIMITS, rateLimitedResponse } from "../_shared/rateLimit.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// The expected CNAME target that customers should point their domain to.
// Set PLATFORM_CNAME_TARGET in your Supabase project secrets.
const PLATFORM_CNAME_TARGET = (Deno.env.get("PLATFORM_CNAME_TARGET") ?? "").toLowerCase().replace(/\.$/, "");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    // ── Rate limit: 5 req/hora por restaurante (se aplica tras parsear el body) ─
    const body = await req.json() as { restaurantId?: string; domain?: string };
    const { restaurantId, domain: rawDomain } = body;

    if (restaurantId) {
      const rl = await checkRateLimit(`domain:restaurant:${restaurantId}`, RATE_LIMITS.domainVerify);
      if (!rl.allowed) return rateLimitedResponse(rl.retryAfter);
    }

    // ── Parse & validate request ───────────────────────────────────────────
    if (!restaurantId || !rawDomain) {
      return json({ error: "restaurantId and domain are required" }, 400);
    }

    const domain = rawDomain.toLowerCase().trim().replace(/\/$/, "");

    if (!isValidDomain(domain)) {
      return json({ error: "Invalid domain format" }, 400);
    }

    // ── Verify caller is admin of this restaurant ──────────────────────────
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");

    const userClient = createClient(SUPABASE_URL, token, {
      auth: { persistSession: false },
    });

    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: membership } = await serviceClient
      .from("restaurant_members")
      .select("access_role")
      .eq("user_id", user.id)
      .eq("restaurant_id", restaurantId)
      .maybeSingle<{ access_role: string }>();

    const isSuperadmin = await serviceClient.rpc("is_superadmin").then(({ data }) => !!data);

    if (!isSuperadmin && membership?.access_role !== "owner" && membership?.access_role !== "admin") {
      return json({ error: "Forbidden" }, 403);
    }

    // ── DNS lookup via Cloudflare DoH ──────────────────────────────────────
    const { verified, details } = await checkDns(domain);

    // ── Update DB ─────────────────────────────────────────────────────────
    const status = verified ? "verified" : "error";
    await serviceClient
      .from("restaurants")
      .update({
        custom_domain: domain,
        custom_domain_verified: verified,
        custom_domain_status: status,
      })
      .eq("id", restaurantId);

    return json({ verified, status, details }, 200);

  } catch (err: unknown) {
    console.error("[verify-custom-domain]", err);
    return json({ error: "Internal server error" }, 500);
  }
});

// ─── DNS check ────────────────────────────────────────────────────────────────

async function checkDns(domain: string): Promise<{ verified: boolean; details: string }> {
  try {
    // Query CNAME records first
    const cnameUrl = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=CNAME`;
    const res = await fetch(cnameUrl, { headers: { Accept: "application/dns-json" } });
    const data = await res.json() as { Answer?: { data: string }[] };

    if (data.Answer && data.Answer.length > 0) {
      const cnameTarget = data.Answer[0].data.toLowerCase().replace(/\.$/, "");

      if (!PLATFORM_CNAME_TARGET) {
        // No target configured — just confirm DNS resolves
        return { verified: true, details: `CNAME apunta a: ${cnameTarget}` };
      }

      if (cnameTarget === PLATFORM_CNAME_TARGET || cnameTarget.endsWith(`.${PLATFORM_CNAME_TARGET}`)) {
        return { verified: true, details: `CNAME correcto: ${cnameTarget}` };
      }

      return {
        verified: false,
        details: `CNAME apunta a ${cnameTarget}, pero debería apuntar a ${PLATFORM_CNAME_TARGET}`,
      };
    }

    // No CNAME found — check A record as fallback
    const aUrl = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=A`;
    const aRes = await fetch(aUrl, { headers: { Accept: "application/dns-json" } });
    const aData = await aRes.json() as { Answer?: { data: string }[] };

    if (aData.Answer && aData.Answer.length > 0) {
      return { verified: false, details: `Se encontró registro A pero no CNAME. Crea un CNAME que apunte a ${PLATFORM_CNAME_TARGET || "tu plataforma"}.` };
    }

    return { verified: false, details: "No se encontró ningún registro DNS para este dominio." };

  } catch {
    return { verified: false, details: "No se pudo realizar la consulta DNS." };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidDomain(domain: string): boolean {
  // Basic domain validation (no protocol, no path, no port)
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(domain);
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
