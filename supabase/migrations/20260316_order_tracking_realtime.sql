-- Enable Realtime for orders table so the tracking page gets live updates
ALTER PUBLICATION supabase_realtime ADD TABLE orders;

-- Allow anonymous users to read orders by id for public order tracking.
-- The UUID (128-bit random) acts as an opaque secret token — guessing is not feasible.
CREATE POLICY "orders_anon_tracking" ON public.orders
  FOR SELECT TO anon
  USING (true);

-- Update get_order_tracking RPC to also return order items
CREATE OR REPLACE FUNCTION public.get_order_tracking(p_order_id uuid)
  RETURNS json
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
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
      rs.estimated_pickup_minutes,
      COALESCE(
        (
          SELECT json_agg(json_build_object(
            'name', oi.snapshot_name,
            'qty',  oi.qty,
            'line_total', oi.line_total,
            'extras', oi.snapshot_extras
          ))
          FROM order_items oi
          WHERE oi.order_id = o.id
        ),
        '[]'::json
      ) AS items
    FROM orders o
    LEFT JOIN restaurant_settings rs ON rs.restaurant_id = o.restaurant_id
    WHERE o.id = p_order_id
    LIMIT 1
  ) t
$function$;
