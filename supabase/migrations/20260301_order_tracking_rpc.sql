-- FIX 3: Public order tracking RPC (accessible to anonymous users)
CREATE OR REPLACE FUNCTION get_order_tracking(p_order_id uuid)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT row_to_json(t) FROM (
    SELECT
      o.id,
      o.status,
      o.order_type,
      o.created_at,
      o.total,
      o.customer_name,
      o.delivery_address,
      rs.estimated_delivery_minutes,
      rs.estimated_pickup_minutes
    FROM orders o
    LEFT JOIN restaurant_settings rs ON rs.restaurant_id = o.restaurant_id
    WHERE o.id = p_order_id
    LIMIT 1
  ) t
$$;

GRANT EXECUTE ON FUNCTION get_order_tracking TO anon;
GRANT EXECUTE ON FUNCTION get_order_tracking TO authenticated;
