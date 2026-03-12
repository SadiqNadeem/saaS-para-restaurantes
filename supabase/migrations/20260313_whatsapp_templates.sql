-- ============================================================
-- Migration: WhatsApp per-status message templates + auto-reply
-- Adds three columns to restaurant_settings:
--   whatsapp_templates   jsonb  — one message body per order status + bot reply
--   whatsapp_auto_reply  bool   — master switch for inbound bot auto-reply
--   whatsapp_triggers    jsonb  — which status transitions send a notification
-- ============================================================

ALTER TABLE public.restaurant_settings
  ADD COLUMN IF NOT EXISTS whatsapp_templates jsonb NOT NULL DEFAULT '{
    "order_received":  "🛎️ Hola {customer_name}! Tu pedido #{order_number} ha sido recibido.\nTotal: {total}€\nTe avisaremos cuando esté listo. Gracias por pedir en {restaurant_name}!",
    "order_accepted":  "✅ Tu pedido #{order_number} ha sido ACEPTADO.\nTiempo estimado: {estimated_time} min.\n{restaurant_name}",
    "order_preparing": "👨‍🍳 Tu pedido #{order_number} está siendo PREPARADO.\nEn breve estará listo!",
    "order_ready":     "🎉 Tu pedido #{order_number} está LISTO para recoger!\nPasa cuando quieras. {restaurant_name}",
    "order_delivering":"🛵 Tu pedido #{order_number} está EN CAMINO.\nLlegará en aproximadamente {estimated_time} min.",
    "order_delivered": "✅ Pedido #{order_number} ENTREGADO. Esperamos que lo disfrutes!\n⭐ Déjanos tu opinión: {review_url}",
    "order_cancelled": "❌ Tu pedido #{order_number} ha sido CANCELADO.\nContacta con nosotros si tienes dudas: {whatsapp_phone}",
    "bot_menu_reply":  "👋 Hola! Bienvenido a {restaurant_name}.\nPuedes ver nuestra carta y hacer tu pedido aquí:\n🍽️ {menu_url}\n¿Necesitas ayuda? Escríbenos!"
  }'::jsonb,

  ADD COLUMN IF NOT EXISTS whatsapp_auto_reply boolean NOT NULL DEFAULT false,

  ADD COLUMN IF NOT EXISTS whatsapp_triggers jsonb NOT NULL DEFAULT '{
    "on_order_received":  true,
    "on_order_accepted":  true,
    "on_order_preparing": false,
    "on_order_ready":     true,
    "on_order_delivering":true,
    "on_order_delivered": true,
    "on_order_cancelled": true
  }'::jsonb;
