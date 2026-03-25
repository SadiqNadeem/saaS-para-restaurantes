-- ─── Modos de operación ──────────────────────────────────────────────────────
-- Añade tres flags a restaurant_settings para controlar qué canales
-- de pedido y módulos están activos en cada restaurante.
--
-- delivery_enabled: si los clientes pueden pedir a domicilio (default true)
-- pickup_enabled:   si los clientes pueden pedir para recoger (default true)
-- pos_enabled:      si el TPV está activo en el panel admin (default true)
--
-- Los tres valores por defecto son true para no romper restaurantes existentes.

ALTER TABLE public.restaurant_settings
  ADD COLUMN IF NOT EXISTS delivery_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pickup_enabled   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pos_enabled      boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.restaurant_settings.delivery_enabled
  IS 'Si los clientes pueden realizar pedidos a domicilio desde el menú público';
COMMENT ON COLUMN public.restaurant_settings.pickup_enabled
  IS 'Si los clientes pueden realizar pedidos para recoger en local';
COMMENT ON COLUMN public.restaurant_settings.pos_enabled
  IS 'Si el módulo TPV está activo en el panel de administración';
