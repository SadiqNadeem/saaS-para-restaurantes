type GetRestaurantSlugParams = {
  hostname?: string;
  pathname?: string;
  routeSlug?: string | null;
};

type GetRestaurantSlugResult = {
  slug: string;
  source: "subdomain" | "route" | "default";
  usesSubdomain: boolean;
};

const RESERVED_SUBDOMAINS = new Set(["www", "app", "admin"]);
const PLATFORM_HOSTS = ["netlify.app", "vercel.app"];

function isIpv4Hostname(hostname: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

function extractSlugFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/r\/([^/]+)/i);
  if (!match?.[1]) {
    return null;
  }

  const slug = decodeURIComponent(match[1]).trim();
  return slug || null;
}

function extractSlugFromHostname(hostname: string): string | null {
  const host = hostname.trim().toLowerCase();

  if (!host || host === "localhost" || isIpv4Hostname(host)) {
    return null;
  }

  if (PLATFORM_HOSTS.some((platformHost) => host.endsWith(`.${platformHost}`))) {
    return null;
  }

  const parts = host.split(".").filter(Boolean);
  if (parts.length < 3) {
    return null;
  }

  const subdomainParts = parts.slice(0, -2);
  if (subdomainParts.length === 0) {
    return null;
  }

  for (const part of subdomainParts) {
    if (!RESERVED_SUBDOMAINS.has(part)) {
      return part;
    }
  }

  return null;
}

export function getRestaurantSlug(params: GetRestaurantSlugParams = {}): GetRestaurantSlugResult {
  const hostname =
    params.hostname ??
    (typeof window !== "undefined" ? window.location.hostname : "");
  const pathname =
    params.pathname ??
    (typeof window !== "undefined" ? window.location.pathname : "");
  const routeSlug = params.routeSlug?.trim() || null;
  const host = hostname.trim().toLowerCase();

  if (host === "localhost") {
    const pathSlug = routeSlug ?? extractSlugFromPath(pathname);
    if (pathSlug) {
      return { slug: pathSlug, source: "route", usesSubdomain: false };
    }

    return { slug: "default", source: "default", usesSubdomain: false };
  }

  const subdomainSlug = extractSlugFromHostname(hostname);
  if (subdomainSlug) {
    return { slug: subdomainSlug, source: "subdomain", usesSubdomain: true };
  }

  const pathSlug = routeSlug ?? extractSlugFromPath(pathname);
  if (pathSlug) {
    return { slug: pathSlug, source: "route", usesSubdomain: false };
  }

  return { slug: "default", source: "default", usesSubdomain: false };
}
