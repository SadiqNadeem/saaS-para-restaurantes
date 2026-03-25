// Helpers para construir URLs públicas del restaurante.
// Usan window.location.origin en runtime — nunca hardcodean localhost ni dominios.
// Para forzar un dominio base, configura VITE_PUBLIC_URL en .env.

function base(): string {
  return import.meta.env.VITE_PUBLIC_URL || window.location.origin;
}

export function getPublicMenuUrl(slug: string): string {
  return `${base()}/r/${slug}`;
}

export function getTableQrUrl(slug: string, qrToken: string): string {
  return `${base()}/r/${slug}/mesa/${qrToken}`;
}

export function getPublicBaseUrl(): string {
  return base();
}
