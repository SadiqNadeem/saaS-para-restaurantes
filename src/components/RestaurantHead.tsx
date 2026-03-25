import { useDocumentHead } from "../hooks/useDocumentHead";

// ─── Types ────────────────────────────────────────────────────────────────────

type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
};

type RestaurantHeadProps = {
  restaurantName: string;
  slug: string;
  cuisineType?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  ogImage?: string | null;
  customDomain?: string | null;
  customDomainVerified?: boolean;
  products?: Product[];
};

/**
 * Injects all SEO head tags for a restaurant's public menu page:
 * - <title>, <meta description>
 * - Open Graph (og:*)
 * - Twitter Card
 * - Canonical URL
 * - JSON-LD (Restaurant + menu items)
 *
 * Works in a pure client-side Vite SPA. Google's crawler executes JS, so
 * meta tags set here are indexed. Social previews work because crawlers
 * also run JS when following shared links.
 *
 * For full SSR support, migrate to a framework like Remix/Next.js and
 * use their server-side head APIs instead.
 */
export function RestaurantHead({
  restaurantName,
  slug,
  cuisineType,
  metaTitle,
  metaDescription,
  ogImage,
  customDomain,
  customDomainVerified,
  products = [],
}: RestaurantHeadProps) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  // If the restaurant has a verified custom domain, use it as canonical base
  const canonicalBase =
    customDomainVerified && customDomain
      ? `https://${customDomain}`
      : origin;

  const canonicalUrl = customDomainVerified && customDomain
    ? `https://${customDomain}`
    : `${origin}/r/${slug}`;

  const title = metaTitle ?? `Menú de ${restaurantName} | Pide online`;

  const cuisine = cuisineType ? `${cuisineType}. ` : "";
  const description =
    metaDescription ??
    `Consulta el menú de ${restaurantName}. ${cuisine}Pide online desde tu mesa.`;

  // JSON-LD: Schema.org Restaurant + menu items
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: restaurantName,
    url: canonicalUrl,
    ...(cuisineType ? { servesCuisine: cuisineType } : {}),
    ...(ogImage ? { image: ogImage } : {}),
    hasMenu: {
      "@type": "Menu",
      name: `Menú de ${restaurantName}`,
      url: `${canonicalBase}/r/${slug}`,
      hasMenuSection: products.length > 0
        ? [
            {
              "@type": "MenuSection",
              name: "Productos",
              hasMenuItem: products.slice(0, 50).map((p) => ({
                "@type": "MenuItem",
                name: p.name,
                ...(p.description ? { description: p.description } : {}),
                offers: {
                  "@type": "Offer",
                  price: p.price.toFixed(2),
                  priceCurrency: "EUR",
                },
              })),
            },
          ]
        : undefined,
    },
  };

  useDocumentHead({
    title,
    description,
    canonical: canonicalUrl,
    robots: "index, follow",
    meta: [
      // Open Graph
      { property: "og:type",        content: "website" },
      { property: "og:title",       content: title },
      { property: "og:description", content: description },
      { property: "og:url",         content: canonicalUrl },
      ...(ogImage ? [{ property: "og:image", content: ogImage }] : []),

      // Twitter Card
      { name: "twitter:card",        content: "summary_large_image" },
      { name: "twitter:title",       content: title },
      { name: "twitter:description", content: description },
      ...(ogImage ? [{ name: "twitter:image", content: ogImage }] : []),
    ],
    jsonLd,
  });

  // This is a logic-only component — no rendered DOM
  return null;
}
