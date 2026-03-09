-- ============================================================
-- SECURITY HARDENING — 20260302_security_hardening.sql
-- Generated after full RLS audit on 2026-03-07
-- ============================================================

-- ============================================================
-- 1. RESTAURANT_WEB_SETTINGS
--    CRITICAL: RLS was completely disabled — any user could
--    read or write every restaurant's web customisation.
-- ============================================================
ALTER TABLE public.restaurant_web_settings ENABLE ROW LEVEL SECURITY;

-- Storefront needs to read these settings (logo, colours, etc.)
CREATE POLICY "rws_public_select"
  ON public.restaurant_web_settings FOR SELECT
  USING (true);

-- Only the restaurant's own admins may write
CREATE POLICY "rws_admin_write"
  ON public.restaurant_web_settings FOR ALL
  TO authenticated
  USING  (is_restaurant_admin(restaurant_id))
  WITH CHECK (is_restaurant_admin(restaurant_id));


-- ============================================================
-- 2. ORDERS — Remove public SELECT policies
--    CRITICAL: "orders_select_public" and
--    "orders_select_authenticated" (both qual=true) allowed
--    ANY anonymous visitor to read every order across ALL
--    tenants — customer name, phone, address, total.
--    GDPR / privacy violation.
-- ============================================================
DROP POLICY IF EXISTS "orders_select_public"        ON public.orders;
DROP POLICY IF EXISTS "orders_select_authenticated" ON public.orders;

-- NOTE: The frontend function findOrderByClientKey() reads orders as anon
-- to check idempotency. After this change it will always return null, but
-- the create_order_safe_v2 RPC (SECURITY DEFINER) still handles idempotency
-- server-side, so order creation remains safe. The RPC returns the existing
-- order_id directly when a duplicate client_order_key is detected.


-- ============================================================
-- 3. ORDERS — Remove unnecessary public INSERT policies
--    create_order_safe_v2 is SECURITY DEFINER and handles all
--    inserts internally. These policies allowed anyone to bypass
--    the RPC and insert orders with arbitrary status, prices,
--    or skipping the open/closed restaurant check.
-- ============================================================
DROP POLICY IF EXISTS "Anyone can create orders" ON public.orders;
DROP POLICY IF EXISTS "orders_public_insert"     ON public.orders;
DROP POLICY IF EXISTS "orders_insert_public"     ON public.orders;
DROP POLICY IF EXISTS "orders_insert"            ON public.orders;


-- ============================================================
-- 4. ORDER_ITEMS — Remove public SELECT and public INSERT
--    Same reasoning as orders:
--    - Public SELECT leaks item details across tenants.
--    - Public INSERT bypasses the SECURITY DEFINER RPC which
--      is the only correct entry point for creating order items.
-- ============================================================
DROP POLICY IF EXISTS "order_items_select_public"  ON public.order_items;
DROP POLICY IF EXISTS "Anyone can create order items" ON public.order_items;
DROP POLICY IF EXISTS "order_items_insert"         ON public.order_items;
DROP POLICY IF EXISTS "order_items_insert_public"  ON public.order_items;


-- ============================================================
-- 5. ORDER_ITEM_MODIFIER_OPTIONS — Remove public INSERT
--    The SECURITY DEFINER RPC calculates modifier prices from
--    the DB and inserts them. No direct client insert is needed.
-- ============================================================
DROP POLICY IF EXISTS "order_item_modifier_options_insert_public"
  ON public.order_item_modifier_options;


-- ============================================================
-- 6. ORDER_ITEM_INGREDIENTS — Remove public SELECT + INSERT
--    Same as above.
-- ============================================================
DROP POLICY IF EXISTS "order_item_ingredients_select_public"          ON public.order_item_ingredients;
DROP POLICY IF EXISTS "order_item_ingredients_insert_public"          ON public.order_item_ingredients;
DROP POLICY IF EXISTS "Anyone can create order item ingredients"       ON public.order_item_ingredients;


-- ============================================================
-- 7. RESTAURANT_HOURS — Add public SELECT
--    The storefront calls is_restaurant_open_now() which is
--    SECURITY INVOKER — it runs as the calling user (anon).
--    Without a public SELECT policy anon cannot read hours,
--    causing the function to always return false (restaurant
--    appears permanently closed to customers).
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'restaurant_hours'
      AND policyname = 'restaurant_hours_public_select'
  ) THEN
    CREATE POLICY "restaurant_hours_public_select"
      ON public.restaurant_hours FOR SELECT
      USING (true);
  END IF;
END $$;


-- ============================================================
-- 8. CAMPAIGNS — Add policies (RLS=true but 0 policies)
--    With RLS enabled and no policies, ALL access is blocked —
--    even legitimate superadmin access.
--    campaigns has no restaurant_id; it is a platform-level table.
-- ============================================================
CREATE POLICY "campaigns_superadmin_all"
  ON public.campaigns FOR ALL
  TO authenticated
  USING  (is_superadmin())
  WITH CHECK (is_superadmin());


-- ============================================================
-- 9. CAMPAIGN_LOGS — Add policies (same situation as campaigns)
-- ============================================================
CREATE POLICY "campaign_logs_superadmin_all"
  ON public.campaign_logs FOR ALL
  TO authenticated
  USING  (is_superadmin())
  WITH CHECK (is_superadmin());


-- ============================================================
-- 10. CUSTOMERS — Add admin read policy
--     Only INSERT existed ("Anyone can create customers").
--     Admins had no way to SELECT customer records.
--     customers has no restaurant_id; add owner-based read.
-- ============================================================
CREATE POLICY "customers_owner_read"
  ON public.customers FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "customers_superadmin_read"
  ON public.customers FOR SELECT
  TO authenticated
  USING (is_superadmin());


-- ============================================================
-- 11. ABANDONED_CARTS — Fix UPDATE policy
--     The existing policy had qual=true, meaning ANY user
--     (including anonymous) could overwrite any cart row.
--     Replace with a members-only policy.
-- ============================================================
DROP POLICY IF EXISTS "public update abandoned carts" ON public.abandoned_carts;

CREATE POLICY "members_update_abandoned_carts"
  ON public.abandoned_carts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM restaurant_members rm
      WHERE rm.restaurant_id = abandoned_carts.restaurant_id
        AND rm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM restaurant_members rm
      WHERE rm.restaurant_id = abandoned_carts.restaurant_id
        AND rm.user_id = auth.uid()
    )
  );


-- ============================================================
-- 12. PRODUCT_MODIFIER_GROUPS — Fix write policies
--     Current write policies check profiles.role = 'admin'
--     (superadmin check) instead of tenant-scoped admin check.
--     A superadmin or any user with role='admin' in profiles
--     could modify bridge records for any restaurant.
--     Fix: join through products to enforce tenant isolation.
-- ============================================================
DROP POLICY IF EXISTS "product_modifier_groups_insert_admin" ON public.product_modifier_groups;
DROP POLICY IF EXISTS "product_modifier_groups_update_admin" ON public.product_modifier_groups;
DROP POLICY IF EXISTS "product_modifier_groups_delete_admin" ON public.product_modifier_groups;

CREATE POLICY "pmg_insert_restaurant_admin"
  ON public.product_modifier_groups FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.products p
      WHERE p.id = product_modifier_groups.product_id
        AND is_restaurant_admin(p.restaurant_id)
    )
  );

CREATE POLICY "pmg_update_restaurant_admin"
  ON public.product_modifier_groups FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.products p
      WHERE p.id = product_modifier_groups.product_id
        AND is_restaurant_admin(p.restaurant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.products p
      WHERE p.id = product_modifier_groups.product_id
        AND is_restaurant_admin(p.restaurant_id)
    )
  );

CREATE POLICY "pmg_delete_restaurant_admin"
  ON public.product_modifier_groups FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.products p
      WHERE p.id = product_modifier_groups.product_id
        AND is_restaurant_admin(p.restaurant_id)
    )
  );


-- ============================================================
-- 13. STORAGE — Fix restaurant-assets write policies
--     The existing UPDATE/DELETE policies only check
--     auth.role() = 'authenticated', meaning any logged-in
--     user from any restaurant can overwrite or delete another
--     restaurant's logo/banner.
--
--     Proper fix: restrict to restaurant members. Assets are
--     stored under paths starting with the restaurant_id.
--     We match the first path segment against restaurant_members.
--
--     NOTE: This requires storage.objects path to start with
--     the restaurant_id UUID (e.g. "<uuid>/logo.webp").
--     If your paths differ, adjust the substring logic below.
-- ============================================================
DROP POLICY IF EXISTS "auth update restaurant-assets" ON storage.objects;
DROP POLICY IF EXISTS "auth delete restaurant-assets"  ON storage.objects;

CREATE POLICY "members_update_restaurant_assets"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'restaurant-assets'
    AND EXISTS (
      SELECT 1 FROM restaurant_members rm
      WHERE rm.user_id = auth.uid()
        AND rm.restaurant_id::text = split_part(name, '/', 1)
    )
  )
  WITH CHECK (
    bucket_id = 'restaurant-assets'
    AND EXISTS (
      SELECT 1 FROM restaurant_members rm
      WHERE rm.user_id = auth.uid()
        AND rm.restaurant_id::text = split_part(name, '/', 1)
    )
  );

CREATE POLICY "members_delete_restaurant_assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'restaurant-assets'
    AND EXISTS (
      SELECT 1 FROM restaurant_members rm
      WHERE rm.user_id = auth.uid()
        AND rm.restaurant_id::text = split_part(name, '/', 1)
    )
  );


-- ============================================================
-- KNOWN REMAINING VULNERABILITIES (require code changes)
-- ============================================================
--
-- A) p_delivery_fee accepted from client in create_order_safe_v2
--    A malicious customer can pass p_delivery_fee=0 to avoid
--    paying delivery fees. The RPC should calculate delivery_fee
--    server-side from restaurant_settings instead.
--    FIX REQUIRED IN: create_order_safe_v2 RPC body.
--
-- B) console.log of full RPC payload in production
--    src/features/checkout/services/orderService.ts line 405:
--    console.log("[checkout] create_order_safe_v2 rpcPayload", ...)
--    Logs customer name, phone, address, cart to browser console.
--    FIX REQUIRED IN: orderService.ts — remove or guard with
--    an env-based debug flag.
--
-- C) Anon key hardcoded in src/lib/supabase.ts
--    The anon key is a public JWT (role: anon) and safe to
--    expose in frontend code by Supabase design. However, best
--    practice is to move it to VITE_SUPABASE_ANON_KEY in .env.
--    No service/admin keys were found in frontend code.
--
-- D) Coupon update from client (orderService.ts ~L493)
--    After order creation the client tries to write coupon_code
--    and discount_amount directly to orders, and increment
--    coupons.uses_count. These writes fail silently (RLS blocks
--    them for anon users) — coupons are never actually applied
--    to order records. Move coupon logic into the RPC.
