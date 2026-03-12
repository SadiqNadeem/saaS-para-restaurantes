-- Fix product_modifier_groups: rename columns, add restaurant_id, update RLS policies
-- Resolves RLS 403 on INSERT/UPDATE/DELETE

-- 1. Rename group_id → modifier_group_id (if not already renamed)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='product_modifier_groups' AND column_name='group_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='product_modifier_groups' AND column_name='modifier_group_id'
  ) THEN
    ALTER TABLE public.product_modifier_groups RENAME COLUMN group_id TO modifier_group_id;
  END IF;
END $$;

-- 2. Rename position → sort_order (if not already renamed)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='product_modifier_groups' AND column_name='position'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='product_modifier_groups' AND column_name='sort_order'
  ) THEN
    ALTER TABLE public.product_modifier_groups RENAME COLUMN position TO sort_order;
  END IF;
END $$;

-- 3. Add missing columns
ALTER TABLE public.product_modifier_groups
  ADD COLUMN IF NOT EXISTS restaurant_id uuid,
  ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_required boolean DEFAULT false;

-- 4. Backfill restaurant_id from products
UPDATE public.product_modifier_groups pmg
SET restaurant_id = p.restaurant_id
FROM public.products p
WHERE pmg.product_id = p.id
  AND pmg.restaurant_id IS NULL;

-- 5. Enforce NOT NULL
ALTER TABLE public.product_modifier_groups
  ALTER COLUMN restaurant_id SET NOT NULL,
  ALTER COLUMN modifier_group_id SET NOT NULL;

-- 6. Foreign keys, unique constraint, indexes
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='product_modifier_groups_restaurant_id_fkey') THEN
    ALTER TABLE public.product_modifier_groups
      ADD CONSTRAINT product_modifier_groups_restaurant_id_fkey
      FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id)
      ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='product_modifier_groups_modifier_group_id_fkey') THEN
    ALTER TABLE public.product_modifier_groups
      ADD CONSTRAINT product_modifier_groups_modifier_group_id_fkey
      FOREIGN KEY (modifier_group_id) REFERENCES public.modifier_groups(id)
      ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='product_modifier_groups_product_id_modifier_group_id_key') THEN
    ALTER TABLE public.product_modifier_groups
      ADD CONSTRAINT product_modifier_groups_product_id_modifier_group_id_key
      UNIQUE (product_id, modifier_group_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS pmg_restaurant_id_idx ON public.product_modifier_groups (restaurant_id);
CREATE INDEX IF NOT EXISTS pmg_product_id_idx ON public.product_modifier_groups (product_id);
CREATE INDEX IF NOT EXISTS pmg_modifier_group_id_idx ON public.product_modifier_groups (modifier_group_id);

-- 7. Drop all old policies
DROP POLICY IF EXISTS "product_modifier_groups_select_public" ON public.product_modifier_groups;
DROP POLICY IF EXISTS "product_modifier_groups_select_admin"  ON public.product_modifier_groups;
DROP POLICY IF EXISTS "pmg_select_restaurant_member"           ON public.product_modifier_groups;
DROP POLICY IF EXISTS "pmg_insert_restaurant_admin"            ON public.product_modifier_groups;
DROP POLICY IF EXISTS "pmg_insert_restaurant_member"           ON public.product_modifier_groups;
DROP POLICY IF EXISTS "pmg_update_restaurant_admin"            ON public.product_modifier_groups;
DROP POLICY IF EXISTS "pmg_delete_restaurant_admin"            ON public.product_modifier_groups;
DROP POLICY IF EXISTS "pmg_delete_restaurant_member"           ON public.product_modifier_groups;
-- Drop new policies idempotently in case this runs twice
DROP POLICY IF EXISTS "pmg_select_public" ON public.product_modifier_groups;
DROP POLICY IF EXISTS "pmg_insert_admin"  ON public.product_modifier_groups;
DROP POLICY IF EXISTS "pmg_update_admin"  ON public.product_modifier_groups;
DROP POLICY IF EXISTS "pmg_delete_admin"  ON public.product_modifier_groups;

-- 8. Create clean RLS policies
--    SELECT: public (storefront needs modifier data)
CREATE POLICY "pmg_select_public"
  ON public.product_modifier_groups FOR SELECT
  USING (true);

--    INSERT: restaurant admins + superadmins
CREATE POLICY "pmg_insert_admin"
  ON public.product_modifier_groups FOR INSERT TO authenticated
  WITH CHECK (
    is_superadmin() OR is_restaurant_admin(restaurant_id)
  );

--    UPDATE: restaurant admins + superadmins
CREATE POLICY "pmg_update_admin"
  ON public.product_modifier_groups FOR UPDATE TO authenticated
  USING  (is_superadmin() OR is_restaurant_admin(restaurant_id))
  WITH CHECK (is_superadmin() OR is_restaurant_admin(restaurant_id));

--    DELETE: restaurant admins + superadmins
CREATE POLICY "pmg_delete_admin"
  ON public.product_modifier_groups FOR DELETE TO authenticated
  USING (is_superadmin() OR is_restaurant_admin(restaurant_id));
