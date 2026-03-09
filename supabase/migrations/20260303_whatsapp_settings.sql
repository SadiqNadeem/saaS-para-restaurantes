-- WhatsApp notification settings
ALTER TABLE public.restaurant_settings
  ADD COLUMN IF NOT EXISTS whatsapp_phone text,
  ADD COLUMN IF NOT EXISTS whatsapp_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_message_template text NOT NULL DEFAULT 'Hola! Tu pedido #{order_number} ha sido recibido. Tiempo estimado: {estimated_time} min. Total: {total}€. Gracias por tu pedido en {restaurant_name}!',
  ADD COLUMN IF NOT EXISTS whatsapp_provider text NOT NULL DEFAULT 'link';

ALTER TABLE public.restaurant_settings
  DROP CONSTRAINT IF EXISTS restaurant_settings_whatsapp_provider_check;

ALTER TABLE public.restaurant_settings
  ADD CONSTRAINT restaurant_settings_whatsapp_provider_check
  CHECK (whatsapp_provider IN ('link', 'twilio', '360dialog'));
