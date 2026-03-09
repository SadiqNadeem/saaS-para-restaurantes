// ─── Option A: WhatsApp Link (active) ────────────────────────────────────────
// No API keys needed. Opens a wa.me link so the user sends the message manually.

export const DEFAULT_WHATSAPP_TEMPLATE =
  "Hola! Tu pedido #{order_number} ha sido recibido ✅\n" +
  "Tiempo estimado: {estimated_time} min\n" +
  "Total: {total}€\n" +
  "Gracias por tu pedido en {restaurant_name}!";

/**
 * Cleans the phone number and returns a wa.me deep-link with the message pre-filled.
 * Phone must include country code (e.g. +34612345678).
 */
export function buildWhatsAppLink(phone: string, message: string): string {
  const cleaned = phone.replace(/[\s\-\(\)]/g, "");
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${cleaned}?text=${encoded}`;
}

/**
 * Builds the customer-facing confirmation message using the restaurant's template.
 *
 * Supported variables:
 *   {order_number}    → last 6 chars of order.id (uppercased)
 *   {customer_name}   → order.customer_name
 *   {total}           → order.total formatted with 2 decimals
 *   {estimated_time}  → estimated_minutes or '20-30'
 *   {restaurant_name} → restaurant name
 *   {items_list}      → bulleted list of items
 *   {order_type}      → emoji + label depending on delivery/pickup/dine_in
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
  template: string
): string {
  const itemsList = order.items
    .map((i) => `  • ${i.quantity}x ${i.name}`)
    .join("\n");

  const orderTypeLabel =
    order.order_type === "delivery"
      ? "🛵 Delivery"
      : order.order_type === "pickup"
        ? "🏃 Recogida"
        : "🪑 Mesa";

  return template
    .replace(/\{order_number\}/g, order.id.slice(-6).toUpperCase())
    .replace(/\{customer_name\}/g, order.customer_name || "Cliente")
    .replace(/\{total\}/g, order.total.toFixed(2))
    .replace(/\{estimated_time\}/g, String(order.estimated_minutes ?? "20-30"))
    .replace(/\{restaurant_name\}/g, restaurantName)
    .replace(/\{items_list\}/g, itemsList)
    .replace(/\{order_type\}/g, orderTypeLabel);
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
    `🔔 *Nuevo pedido - ${restaurantName}*\n\n` +
    `Pedido #${order.id.slice(-6).toUpperCase()}\n` +
    `Cliente: ${order.customer_name || "-"}\n` +
    `Teléfono: ${order.customer_phone || "-"}\n\n` +
    `${itemsList}\n\n` +
    `*Total: ${total}€*\n` +
    `Tipo: ${order.order_type || "-"}`
  );
}
