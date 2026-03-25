-- Bloque 7: table_number denormalizado + comportamiento Modelo A (pedidos separados por comensal)

-- 1. Columna table_number en orders (nombre de mesa sin JOIN)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS table_number text;

-- 2. Índice para consultas por table_id (TPV agrupa por mesa)
CREATE INDEX IF NOT EXISTS idx_orders_table_id
  ON public.orders(table_id)
  WHERE table_id IS NOT NULL;

-- 3. Actualiza create_table_qr_order:
--    - Guarda table_number en el pedido (nombre denormalizado)
--    - Modelo A: si la mesa ya está ocupada, NO sobreescribe current_order_id
--      (el primer pedido queda como referencia; los siguientes se vinculan via table_id)
CREATE OR REPLACE FUNCTION public.create_table_qr_order(
  p_restaurant_id uuid,
  p_table_id uuid,
  p_client_order_key text,
  p_customer_name text,
  p_customer_phone text,
  p_notes text,
  p_items jsonb
)
RETURNS TABLE(order_id uuid, total numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table public.restaurant_tables%ROWTYPE;
  v_result RECORD;
BEGIN
  SELECT *
  INTO v_table
  FROM public.restaurant_tables t
  WHERE t.id = p_table_id
    AND t.restaurant_id = p_restaurant_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND';
  END IF;

  IF v_table.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'TABLE_INACTIVE';
  END IF;

  SELECT o.order_id, o.total
  INTO v_result
  FROM public.create_order_safe_v2(
    p_restaurant_id    := p_restaurant_id,
    p_client_order_key := p_client_order_key,
    p_payment_method   := 'cash',
    p_order_type       := 'dine_in',
    p_delivery_fee     := 0,
    p_cash_given       := NULL,
    p_customer_name    := COALESCE(NULLIF(BTRIM(p_customer_name), ''), v_table.name),
    p_customer_phone   := COALESCE(p_customer_phone, ''),
    p_delivery_address := '',
    p_notes            := p_notes,
    p_items            := p_items,
    p_source           := 'qr_table',
    p_tip_amount       := 0,
    p_table_id         := p_table_id
  ) AS o
  LIMIT 1;

  IF v_result.order_id IS NULL THEN
    RAISE EXCEPTION 'ORDER_CREATION_FAILED';
  END IF;

  -- Guarda el nombre de la mesa denormalizado en el pedido
  UPDATE public.orders
  SET table_number = v_table.name
  WHERE id = v_result.order_id;

  -- Modelo A: marca la mesa como ocupada pero NO sobreescribe current_order_id
  -- si ya había un pedido activo (permite múltiples pedidos por mesa)
  UPDATE public.restaurant_tables
  SET
    status           = 'occupied',
    current_order_id = CASE
      WHEN current_order_id IS NULL THEN v_result.order_id
      ELSE current_order_id
    END
  WHERE id = p_table_id
    AND restaurant_id = p_restaurant_id;

  RETURN QUERY
  SELECT v_result.order_id, v_result.total;
END;
$$;

REVOKE ALL ON FUNCTION public.create_table_qr_order(uuid, uuid, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_table_qr_order(uuid, uuid, text, text, text, text, jsonb) TO anon, authenticated;

-- 4. RPC para el TPV: obtiene todos los pedidos activos de una mesa
--    Usado por PosTablesPage para agrupar pedidos (Modelo A)
CREATE OR REPLACE FUNCTION public.get_table_active_orders(
  p_restaurant_id uuid,
  p_table_id      uuid
)
RETURNS TABLE (
  order_id      uuid,
  customer_name text,
  total         numeric,
  status        text,
  source        text,
  created_at    timestamptz,
  item_count    bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.id                                             AS order_id,
    o.customer_name,
    COALESCE(o.total, o.subtotal, 0)                 AS total,
    o.status,
    o.source,
    o.created_at,
    COUNT(oi.id)                                     AS item_count
  FROM public.orders o
  LEFT JOIN public.order_items oi ON oi.order_id = o.id
  WHERE o.restaurant_id = p_restaurant_id
    AND o.table_id      = p_table_id
    AND o.status NOT IN ('delivered', 'cancelled')
  GROUP BY o.id, o.customer_name, o.total, o.subtotal, o.status, o.source, o.created_at
  ORDER BY o.created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.get_table_active_orders(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_table_active_orders(uuid, uuid) TO authenticated;
