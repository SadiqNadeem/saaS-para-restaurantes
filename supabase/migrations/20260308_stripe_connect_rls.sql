-- Stripe Connect access policies for restaurant admins/owners.
-- Safe to run multiple times.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'restaurants'
      AND policyname = 'restaurants_stripe_select_admin'
  ) THEN
    CREATE POLICY "restaurants_stripe_select_admin"
      ON public.restaurants
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.restaurant_members rm
          WHERE rm.restaurant_id = restaurants.id
            AND rm.user_id = auth.uid()
            AND COALESCE(rm.is_active, true) = true
            AND COALESCE(rm.access_role, 'staff') IN ('owner', 'admin')
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'restaurants'
      AND policyname = 'restaurants_stripe_update_admin'
  ) THEN
    CREATE POLICY "restaurants_stripe_update_admin"
      ON public.restaurants
      FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.restaurant_members rm
          WHERE rm.restaurant_id = restaurants.id
            AND rm.user_id = auth.uid()
            AND COALESCE(rm.is_active, true) = true
            AND COALESCE(rm.access_role, 'staff') IN ('owner', 'admin')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.restaurant_members rm
          WHERE rm.restaurant_id = restaurants.id
            AND rm.user_id = auth.uid()
            AND COALESCE(rm.is_active, true) = true
            AND COALESCE(rm.access_role, 'staff') IN ('owner', 'admin')
        )
      );
  END IF;
END $$;
