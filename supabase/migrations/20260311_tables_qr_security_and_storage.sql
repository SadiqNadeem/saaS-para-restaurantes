-- Tables QR security + table QR ordering RPC + storage policy hardening

-- 1) Ensure table status supports reserved everywhere
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'restaurant_tables_status_check'
      AND conrelid = 'public.restaurant_tables'::regclass
  ) THEN
    ALTER TABLE public.restaurant_tables
      DROP CONSTRAINT restaurant_tables_status_check;
  END IF;

  ALTER TABLE public.restaurant_tables
    ADD CONSTRAINT restaurant_tables_status_check
    CHECK (status = ANY (ARRAY['free'::text, 'occupied'::text, 'closing'::text, 'reserved'::text]));
END $$;

-- 2) Tighten tables/walls RLS and remove broad public table reads
DROP POLICY IF EXISTS "public read tables" ON public.restaurant_tables;

DROP POLICY IF EXISTS "admin manage tables" ON public.restaurant_tables;
DROP POLICY IF EXISTS "restaurant_members_manage_tables" ON public.restaurant_tables;
CREATE POLICY "restaurant_members_manage_tables"
  ON public.restaurant_tables
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.restaurant_members rm
      WHERE rm.restaurant_id = restaurant_tables.restaurant_id
        AND rm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.restaurant_members rm
      WHERE rm.restaurant_id = restaurant_tables.restaurant_id
        AND rm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "admin manage walls" ON public.restaurant_floor_walls;
DROP POLICY IF EXISTS "restaurant_members_manage_floor_walls" ON public.restaurant_floor_walls;
CREATE POLICY "restaurant_members_manage_floor_walls"
  ON public.restaurant_floor_walls
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.restaurant_members rm
      WHERE rm.restaurant_id = restaurant_floor_walls.restaurant_id
        AND rm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.restaurant_members rm
      WHERE rm.restaurant_id = restaurant_floor_walls.restaurant_id
        AND rm.user_id = auth.uid()
    )
  );

-- 3) Public-safe table resolver for QR (minimal fields, scoped by restaurant + token)
CREATE OR REPLACE FUNCTION public.get_public_table_by_qr(
  p_restaurant_id uuid,
  p_qr_token text
)
RETURNS TABLE (
  id uuid,
  name text,
  is_active boolean,
  restaurant_id uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.name, t.is_active, t.restaurant_id
  FROM public.restaurant_tables t
  WHERE t.restaurant_id = p_restaurant_id
    AND t.qr_token = p_qr_token
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_table_by_qr(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_table_by_qr(uuid, text) TO anon, authenticated;

-- 4) End-to-end QR table order RPC (creates order + links table atomically server-side)
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
    p_restaurant_id := p_restaurant_id,
    p_client_order_key := p_client_order_key,
    p_payment_method := 'cash',
    p_order_type := 'dine_in',
    p_delivery_fee := 0,
    p_cash_given := NULL,
    p_customer_name := COALESCE(NULLIF(BTRIM(p_customer_name), ''), v_table.name),
    p_customer_phone := COALESCE(p_customer_phone, ''),
    p_delivery_address := '',
    p_notes := p_notes,
    p_items := p_items,
    p_source := 'qr_table',
    p_tip_amount := 0,
    p_table_id := p_table_id
  ) AS o
  LIMIT 1;

  IF v_result.order_id IS NULL THEN
    RAISE EXCEPTION 'ORDER_CREATION_FAILED';
  END IF;

  UPDATE public.restaurant_tables
  SET status = 'occupied',
      current_order_id = v_result.order_id
  WHERE id = p_table_id
    AND restaurant_id = p_restaurant_id;

  RETURN QUERY
  SELECT v_result.order_id, v_result.total;
END;
$$;

REVOKE ALL ON FUNCTION public.create_table_qr_order(uuid, uuid, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_table_qr_order(uuid, uuid, text, text, text, text, jsonb) TO anon, authenticated;

-- 5) Storage hardening: restaurant-assets INSERT should also be restaurant-member scoped
DROP POLICY IF EXISTS "auth upload restaurant-assets" ON storage.objects;
DROP POLICY IF EXISTS "members_insert_restaurant_assets" ON storage.objects;
CREATE POLICY "members_insert_restaurant_assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'restaurant-assets'
    AND EXISTS (
      SELECT 1
      FROM public.restaurant_members rm
      WHERE rm.user_id = auth.uid()
        AND rm.restaurant_id::text = split_part(name, '/', 1)
    )
  );

-- 6) Storage hardening: product-images write scoped by restaurant prefix in object path
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT p.policyname
    FROM pg_policies p
    WHERE p.schemaname = 'storage'
      AND p.tablename = 'objects'
      AND p.policyname ILIKE 'admin_upload_product_images%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "members_insert_product_images" ON storage.objects;
DROP POLICY IF EXISTS "members_update_product_images" ON storage.objects;
DROP POLICY IF EXISTS "members_delete_product_images" ON storage.objects;
DROP POLICY IF EXISTS "public_read_product_images" ON storage.objects;

CREATE POLICY "members_insert_product_images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND EXISTS (
      SELECT 1
      FROM public.restaurant_members rm
      WHERE rm.user_id = auth.uid()
        AND rm.restaurant_id::text = split_part(name, '/', 1)
    )
  );

CREATE POLICY "members_update_product_images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND EXISTS (
      SELECT 1
      FROM public.restaurant_members rm
      WHERE rm.user_id = auth.uid()
        AND rm.restaurant_id::text = split_part(name, '/', 1)
    )
  )
  WITH CHECK (
    bucket_id = 'product-images'
    AND EXISTS (
      SELECT 1
      FROM public.restaurant_members rm
      WHERE rm.user_id = auth.uid()
        AND rm.restaurant_id::text = split_part(name, '/', 1)
    )
  );

CREATE POLICY "members_delete_product_images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND EXISTS (
      SELECT 1
      FROM public.restaurant_members rm
      WHERE rm.user_id = auth.uid()
        AND rm.restaurant_id::text = split_part(name, '/', 1)
    )
  );

CREATE POLICY "public_read_product_images"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'product-images');
