-- Fix set_order_status_safe: order_status_history.old_status and new_status
-- are of type order_status (enum), not text. The previous version inserted text
-- values without casting, causing "column old_status is of type order_status but
-- expression is of type text" errors when accepting or cancelling orders.

DROP FUNCTION IF EXISTS public.set_order_status_safe(uuid, public.order_status);
DROP FUNCTION IF EXISTS public.set_order_status_safe(uuid, text);

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

  SELECT status::text, restaurant_id
    INTO v_old_status, v_restaurant_id
    FROM public.orders
   WHERE id = p_order_id
     AND status NOT IN ('delivered'::order_status, 'cancelled'::order_status)
     AND p_status::order_status <> 'pending'::order_status;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cannot update this order';
  END IF;

  UPDATE public.orders
     SET status = p_status::public.order_status
   WHERE id = p_order_id;

  INSERT INTO public.order_status_history
    (restaurant_id, order_id, old_status, new_status, changed_by, changed_at)
  VALUES
    (v_restaurant_id, p_order_id,
     v_old_status::public.order_status,
     p_status::public.order_status,
     auth.uid()::text, now());
END;
$$;
