// ─── WhatsApp message service ─────────────────────────────────────────────────
// Option A (active): WhatsApp Link — no API keys, opens a wa.me link so the
// customer sends the message manually.
// Option B (prepared): WhatsApp Business API — wired in whatsappApiService.ts.

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Keys that map to a specific order lifecycle event or bot reply.
 * Matches the `whatsapp_templates` jsonb column in restaurant_settings.
 */
export type WhatsAppTemplateKey =
  | "order_received"
  | "order_accepted"
  | "order_preparing"
  | "order_ready"
  | "order_delivering"
  | "order_delivered"
  | "order_cancelled"
  | "bot_menu_reply";

/** Map of template key → message body string. Stored as jsonb in the DB. */
export type WhatsAppTemplates = Record<WhatsAppTemplateKey, string>;

/**
 * Which status transitions trigger an outbound notification.
 * Matches the `whatsapp_triggers` jsonb column in restaurant_settings.
 */
export type WhatsAppTriggers = {
  on_order_received: boolean;
  on_order_accepted: boolean;
  on_order_preparing: boolean;
  on_order_ready: boolean;
  on_order_delivering: boolean;
  on_order_delivered: boolean;
  on_order_cancelled: boolean;
};

// ─── Defaults ─────────────────────────────────────────────────────────────────

/**
 * Legacy single-template default.
 * Kept for backwards compatibility with existing call sites that pass one
 * template string directly to buildOrderConfirmationMessage().
 */
export const DEFAULT_WHATSAPP_TEMPLATE =
  "Hola! Tu pedido #{order_number} ha sido recibido \n" +
  "Tiempo estimado: {estimated_time} min\n" +
  "Total: {total}€\n" +
  "Gracias por tu pedido en {restaurant_name}!";

/** Full default set of per-status templates. Mirrors the DB column default. */
export const DEFAULT_WHATSAPP_TEMPLATES: WhatsAppTemplates = {
  order_received:
    " Hola {customer_name}! Tu pedido #{order_number} ha sido recibido.\n" +
    "Total: {total}€\n" +
    "Te avisaremos cuando esté listo. Gracias por pedir en {restaurant_name}!",
  order_accepted:
    " Tu pedido #{order_number} ha sido ACEPTADO.\n" +
    "Tiempo estimado: {estimated_time} min.\n" +
    "{restaurant_name}",
  order_preparing:
    " Tu pedido #{order_number} está siendo PREPARADO.\n" +
    "En breve estará listo!",
  order_ready:
    " Tu pedido #{order_number} está LISTO para recoger!\n" +
    "Pasa cuando quieras. {restaurant_name}",
  order_delivering:
    " Tu pedido #{order_number} está EN CAMINO.\n" +
    "Llegará en aproximadamente {estimated_time} min.",
  order_delivered:
    " Pedido #{order_number} ENTREGADO. Esperamos que lo disfrutes!\n" +
    " Déjanos tu opinión: {review_url}",
  order_cancelled:
    " Tu pedido #{order_number} ha sido CANCELADO.\n" +
    "Contacta con nosotros si tienes dudas: {whatsapp_phone}",
  bot_menu_reply:
    " Hola! Bienvenido a {restaurant_name}.\n" +
    "Puedes ver nuestra carta y hacer tu pedido aquí:\n" +
    " {menu_url}\n" +
    "¿Necesitas ayuda? Escríbenos!",
};

export const DEFAULT_WHATSAPP_TRIGGERS: WhatsAppTriggers = {
  on_order_received: true,
  on_order_accepted: true,
  on_order_preparing: false,
  on_order_ready: true,
  on_order_delivering: true,
  on_order_delivered: true,
  on_order_cancelled: true,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Maps an order status string to the corresponding WhatsAppTemplateKey.
 * Returns null when the status has no associated notification template
 * (e.g. intermediate states not mapped to any trigger).
 *
 * Usage:
 * const key = getTemplateKeyForStatus(order.status);
 * if (key) {
 * const body = templates[key] ?? DEFAULT_WHATSAPP_TEMPLATES[key];
 * }
 */
export function getTemplateKeyForStatus(
  status: string
): WhatsAppTemplateKey | null {
  const map: Record<string, WhatsAppTemplateKey> = {
    pending: "order_received",
    accepted: "order_accepted",
    preparing: "order_preparing",
    ready: "order_ready",
    out_for_delivery: "order_delivering",
    delivering: "order_delivering", // alias
    delivered: "order_delivered",
    cancelled: "order_cancelled",
  };
  return map[status] ?? null;
}

/**
 * Returns the trigger key for a given order status so callers can check
 * whether the restaurant has enabled notifications for that transition.
 *
 * Usage:
 * const triggerKey = getTriggerKeyForStatus(newStatus);
 * if (triggerKey && triggers[triggerKey]) { sendNotification(); }
 */
export function getTriggerKeyForStatus(
  status: string
): keyof WhatsAppTriggers | null {
  const map: Record<string, keyof WhatsAppTriggers> = {
    pending: "on_order_received",
    accepted: "on_order_accepted",
    preparing: "on_order_preparing",
    ready: "on_order_ready",
    out_for_delivery: "on_order_delivering",
    delivering: "on_order_delivering",
    delivered: "on_order_delivered",
    cancelled: "on_order_cancelled",
  };
  return map[status] ?? null;
}

/**
 * Resolves the correct template body for a given order status.
 * Falls back to DEFAULT_WHATSAPP_TEMPLATES if the restaurant's templates
 * map is missing the key.
 */
export function getTemplateForStatus(
  status: string,
  templates: Partial<WhatsAppTemplates>
): string {
  const key = getTemplateKeyForStatus(status);
  if (!key) return DEFAULT_WHATSAPP_TEMPLATE;
  return templates[key] ?? DEFAULT_WHATSAPP_TEMPLATES[key];
}

// ─── Link builder ─────────────────────────────────────────────────────────────

/**
 * Cleans the phone number and returns a wa.me deep-link with the message
 * pre-filled. Phone must include country code (e.g. +34612345678).
 */
export function buildWhatsAppLink(phone: string, message: string): string {
  const cleaned = phone.replace(/[\s\-\(\)]/g, "");
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${cleaned}?text=${encoded}`;
}

// ─── Template variables ───────────────────────────────────────────────────────

/**
 * Extra context injected into template replacement that comes from restaurant
 * settings rather than from the order itself.
 */
export interface WhatsAppMessageContext {
  /** Public URL to the restaurant's online menu (storefront). */
  menuUrl?: string;
  /** Restaurant's WhatsApp phone for customer-facing display. */
  whatsappPhone?: string;
  /** URL where customers can leave a review (e.g. Google Maps link). */
  reviewUrl?: string;
}

/**
 * Builds a customer-facing message by replacing all template variables.
 *
 * Supported variables:
 * {order_number} → last 6 chars of order.id (uppercased)
 * {customer_name} → order.customer_name
 * {total} → order.total formatted with 2 decimals
 * {estimated_time} → estimated_minutes or '20-30'
 * {restaurant_name} → restaurant name
 * {items_list} → bulleted list of items
 * {order_type} → emoji + label (delivery / pickup / dine-in)
 * {menu_url} → context.menuUrl (optional)
 * {whatsapp_phone} → context.whatsappPhone (optional)
 * {review_url} → context.reviewUrl (optional)
 */
export function buildOrderConfirmationMessage(
  order: {
    id: string;
    customer_name: string;
    items: Array<{ name: string; quantity: number; price?: number }>;
    total: number;
    order_type: string;
    estimated_minutes?: number;
  },
  restaurantName: string,
  template: string,
  context: WhatsAppMessageContext = {}
): string {
  const itemsList = order.items
    .map((i) => ` • ${i.quantity}x ${i.name}`)
    .join("\n");

  const orderTypeLabel =
    order.order_type === "delivery"
      ? " Delivery"
      : order.order_type === "pickup"
        ? " Recogida"
        : " Mesa";

  return template
    .replace(/\{order_number\}/g, order.id.slice(-6).toUpperCase())
    .replace(/\{customer_name\}/g, order.customer_name || "Cliente")
    .replace(/\{total\}/g, order.total.toFixed(2))
    .replace(/\{estimated_time\}/g, String(order.estimated_minutes ?? "20-30"))
    .replace(/\{restaurant_name\}/g, restaurantName)
    .replace(/\{items_list\}/g, itemsList)
    .replace(/\{order_type\}/g, orderTypeLabel)
    .replace(/\{menu_url\}/g, context.menuUrl ?? "")
    .replace(/\{whatsapp_phone\}/g, context.whatsappPhone ?? "")
    .replace(/\{review_url\}/g, context.reviewUrl ?? "");
}

/**
 * Builds the message the ADMIN sends to a customer (order summary).
 * Used from the admin panel "Contact customer" button.
 */
export function buildAdminNotificationMessage(
  order: {
    id: string;
    customer_name?: string | null;
    customer_phone?: string | null;
    total?: number | null;
    order_type?: string | null;
    items?: Array<{ name: string; quantity: number }>;
  },
  restaurantName: string
): string {
  const itemsList =
    order.items?.map((i) => `• ${i.quantity}x ${i.name}`).join("\n") || "";

  const total = (order.total ?? 0).toFixed(2);

  return (
    ` *Nuevo pedido - ${restaurantName}*\n\n` +
    `Pedido #${order.id.slice(-6).toUpperCase()}\n` +
    `Cliente: ${order.customer_name || "-"}\n` +
    `Teléfono: ${order.customer_phone || "-"}\n\n` +
    `${itemsList}\n\n` +
    `*Total: ${total}€*\n` +
    `Tipo: ${order.order_type || "-"}`
  );
}
