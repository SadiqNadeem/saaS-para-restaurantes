-- Add dine_in as valid order_type for POS table orders
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_type_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_order_type_check
  CHECK (order_type = ANY (ARRAY['pickup'::text, 'delivery'::text, 'dine_in'::text]));
