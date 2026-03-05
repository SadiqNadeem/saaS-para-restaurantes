-- Fix set_order_status_safe to write to order_status_history.
-- Previously the function only updated orders.status without recording an audit entry.
-- POS and admin service (updateOrderStatus.ts) both call this RPC, so this fixes
-- audit coverage for all status changes.

CREATE OR REPLACE FUNCTION public.set_order_status_safe(p_order_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_status text;
  v_restaurant_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Fetch current status and restaurant before updating
  SELECT status, restaurant_id
    INTO v_old_status, v_restaurant_id
    FROM public.orders
   WHERE id = p_order_id
     AND status NOT IN ('delivered', 'cancelled')
     AND p_status <> 'pending'; -- prevent rolling back to pending

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cannot update this order';
  END IF;

  -- Update status
  UPDATE public.orders
     SET status = p_status
   WHERE id = p_order_id;

  -- Write to audit history
  INSERT INTO public.order_status_history
    (restaurant_id, order_id, old_status, new_status, changed_by, changed_at)
  VALUES
    (v_restaurant_id, p_order_id, v_old_status, p_status, auth.uid()::text, now());
END;
$$;
