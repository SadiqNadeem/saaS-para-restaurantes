import { useEffect } from "react";

type MetaTag = {
  name?: string;       // <meta name="…">
  property?: string;   // <meta property="…"> (Open Graph)
  content: string;
};

type HeadConfig = {
  title?: string;
  description?: string;
  canonical?: string;
  robots?: string;
  meta?: MetaTag[];
  jsonLd?: object;
};

const MANAGED_ATTR = "data-react-head";

/**
 * Lightweight head manager for SPAs. Injects/updates <title>, <meta> and
 * <link rel="canonical"> without requiring react-helmet-async.
 *
 * All injected nodes are tagged with data-react-head so they can be cleaned
 * up when the component unmounts.
 */
export function useDocumentHead(config: HeadConfig) {
  useEffect(() => {
    const injected: Element[] = [];

    // ── title ──
    if (config.title) {
      document.title = config.title;
    }

    // ── description ──
    if (config.description) {
      setOrCreate("meta", { name: "description", content: config.description }, injected);
    }

    // ── robots ──
    const robots = config.robots ?? "index, follow";
    setOrCreate("meta", { name: "robots", content: robots }, injected);

    // ── canonical ──
    if (config.canonical) {
      setOrCreateLink("canonical", config.canonical, injected);
    }

    // ── arbitrary meta (OG, Twitter, …) ──
    for (const m of config.meta ?? []) {
      const attrs: Record<string, string> = { content: m.content };
      if (m.name)     attrs.name     = m.name;
      if (m.property) attrs.property = m.property;
      setOrCreate("meta", attrs, injected);
    }

    // ── JSON-LD ──
    let ldScript: HTMLScriptElement | null = null;
    if (config.jsonLd) {
      ldScript = document.createElement("script");
      ldScript.type = "application/ld+json";
      ldScript.textContent = JSON.stringify(config.jsonLd);
      ldScript.setAttribute(MANAGED_ATTR, "json-ld");
      document.head.appendChild(ldScript);
    }

    return () => {
      // Remove nodes added by this effect
      for (const el of injected) el.remove();
      if (ldScript) ldScript.remove();
    };
  }, [
    config.title,
    config.description,
    config.canonical,
    config.robots,
    // Re-run when meta array content changes (stable if called with static objects)
    JSON.stringify(config.meta),
    JSON.stringify(config.jsonLd),
  ]); // eslint-disable-line react-hooks/exhaustive-deps
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setOrCreate(
  _tag: "meta",
  attrs: Record<string, string>,
  injected: Element[]
) {
  const key = attrs.name ?? attrs.property ?? "";
  const selector = attrs.name
    ? `meta[name="${key}"]`
    : `meta[property="${key}"]`;

  let el = document.head.querySelector(selector) as HTMLMetaElement | null;
  const created = !el;

  if (!el) {
    el = document.createElement("meta");
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    el.setAttribute(MANAGED_ATTR, "true");
    document.head.appendChild(el);
  } else {
    el.setAttribute("content", attrs.content);
  }

  if (created) injected.push(el);
}

function setOrCreateLink(rel: string, href: string, injected: Element[]) {
  let el = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  const created = !el;

  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    el.setAttribute(MANAGED_ATTR, "true");
    document.head.appendChild(el);
  }

  el.href = href;
  if (created) injected.push(el);
}
