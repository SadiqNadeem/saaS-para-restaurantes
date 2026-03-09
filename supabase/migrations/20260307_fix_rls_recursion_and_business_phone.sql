-- Fix 1: is_superadmin() must be SECURITY DEFINER to avoid infinite recursion.
--   profiles table has RLS with USING (is_superadmin()), and is_superadmin() reads
--   from profiles → triggers profiles RLS → calls is_superadmin() again → stack overflow.
--   SECURITY DEFINER bypasses RLS when the function runs, breaking the cycle.
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'superadmin'
  );
$$;

-- Fix 2: Add missing business_phone column referenced in the app storefront and admin settings.
ALTER TABLE public.restaurant_settings
  ADD COLUMN IF NOT EXISTS business_phone text;

-- Fix 3: Recreate set_order_status_safe with explicit cast to order_status enum.
--   orders.status is of type order_status (enum), so passing text directly fails.
--   Also drops any overloads (enum or text param) to avoid ambiguity.
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
     AND status NOT IN ('delivered', 'cancelled')
     AND p_status <> 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cannot update this order';
  END IF;

  UPDATE public.orders
     SET status = p_status::public.order_status
   WHERE id = p_order_id;

  INSERT INTO public.order_status_history
    (restaurant_id, order_id, old_status, new_status, changed_by, changed_at)
  VALUES
    (v_restaurant_id, p_order_id, v_old_status, p_status, auth.uid()::text, now());
END;
$$;
