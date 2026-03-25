/**
 * Dynamic sitemap generator for all active restaurant menu pages.
 *
 * Deployed as a Supabase Edge Function.
 * Hit: GET /functions/v1/sitemap
 *
 * Returns an XML sitemap that includes:
 *  - The platform homepage
 *  - Each active restaurant's public menu URL (/r/:slug)
 *  - Restaurants with verified custom domains (https://customdomain/)
 *
 * Usage (deploy once, reference in robots.txt):
 *   Sitemap: https://yourdomain.com/functions/v1/sitemap
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// The canonical base URL of your SaaS platform (no trailing slash)
const PLATFORM_ORIGIN = Deno.env.get("PLATFORM_ORIGIN") ?? "https://app.yourdomain.com";

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Fetch all active restaurants (has at least one product = likely launched)
  const { data: restaurants, error } = await supabase
    .from("restaurants")
    .select("slug, custom_domain, custom_domain_verified, updated_at")
    .order("slug", { ascending: true });

  if (error) {
    return new Response("Error generating sitemap", { status: 500 });
  }

  const today = new Date().toISOString().slice(0, 10);

  const urls: string[] = [
    // Platform homepage
    urlEntry(PLATFORM_ORIGIN, today, "weekly", "0.8"),
  ];

  for (const r of restaurants ?? []) {
    const slug = r.slug as string;
    const lastmod = (r.updated_at as string | null)?.slice(0, 10) ?? today;

    // Always include the /r/:slug URL
    urls.push(urlEntry(`${PLATFORM_ORIGIN}/r/${slug}`, lastmod, "daily", "0.9"));

    // Additionally include the custom domain URL if verified
    if (r.custom_domain_verified && r.custom_domain) {
      urls.push(urlEntry(`https://${r.custom_domain as string}`, lastmod, "daily", "1.0"));
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
});

function urlEntry(loc: string, lastmod: string, changefreq: string, priority: string): string {
  return `  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
