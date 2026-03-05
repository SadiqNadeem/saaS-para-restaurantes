-- Replaces create_restaurant_and_owner (was RETURNS uuid, now RETURNS jsonb).
-- Changes:
--   1. Returns jsonb with {restaurant_id, slug} so callers get slug without extra query.
--   2. Slug generation: regex-based (handles special chars), trims edge dashes.
--   3. Slug collision loop: appends random 4-digit suffix until unique.
--   4. Seeds restaurant_settings (sensible defaults).
--   5. Seeds 7 restaurant_hours rows (all closed, 09:00–22:00).
--   6. Seeds 2 demo categories: Principales, Bebidas.
--   7. Seeds 4 demo products (3 in Principales, 1 in Bebidas).

DROP FUNCTION IF EXISTS public.create_restaurant_and_owner(text);

CREATE FUNCTION public.create_restaurant_and_owner(p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_restaurant_id uuid;
  v_user_id       uuid;
  v_slug          text;
  v_base_slug     text;
  v_cat_main      uuid;
  v_cat_drinks    uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Build slug: lowercase, collapse non-alphanum runs to hyphens, trim edges
  v_base_slug := lower(regexp_replace(trim(p_name), '[^a-z0-9]+', '-', 'g'));
  v_base_slug := trim(both '-' from v_base_slug);
  IF v_base_slug = '' THEN v_base_slug := 'restaurante'; END IF;

  -- Resolve collisions by appending a random 4-digit suffix
  v_slug := v_base_slug;
  WHILE EXISTS (SELECT 1 FROM public.restaurants WHERE slug = v_slug) LOOP
    v_slug := v_base_slug || '-' || (floor(random() * 9000) + 1000)::int;
  END LOOP;

  -- Create restaurant
  INSERT INTO public.restaurants (name, slug)
  VALUES (p_name, v_slug)
  RETURNING id INTO v_restaurant_id;

  -- Owner membership
  INSERT INTO public.restaurant_members (restaurant_id, user_id, role)
  VALUES (v_restaurant_id, v_user_id, 'owner');

  -- Settings: only supply NOT-NULL-no-default columns; rest use table defaults
  INSERT INTO public.restaurant_settings (
    restaurant_id,
    base_lat,
    base_lng,
    delivery_radius_km
  ) VALUES (
    v_restaurant_id,
    0.0,
    0.0,
    5
  );

  -- Hours: 7 days (0=Sun … 6=Sat), all closed, 09:00–22:00
  INSERT INTO public.restaurant_hours (restaurant_id, day_of_week, is_open, open_time, close_time)
  SELECT v_restaurant_id, s.day, false, '09:00', '22:00'
  FROM generate_series(0, 6) AS s(day);

  -- Demo category: Principales
  INSERT INTO public.categories (restaurant_id, name, sort_order, is_active)
  VALUES (v_restaurant_id, 'Principales', 0, true)
  RETURNING id INTO v_cat_main;

  -- Demo category: Bebidas
  INSERT INTO public.categories (restaurant_id, name, sort_order, is_active)
  VALUES (v_restaurant_id, 'Bebidas', 1, true)
  RETURNING id INTO v_cat_drinks;

  -- Demo products in Principales
  INSERT INTO public.products (restaurant_id, category_id, name, price, sort_order, is_active)
  VALUES
    (v_restaurant_id, v_cat_main, 'Menu del dia', 10.00, 0, true),
    (v_restaurant_id, v_cat_main, 'Hamburguesa',   8.50, 1, true),
    (v_restaurant_id, v_cat_main, 'Ensalada',       6.00, 2, true);

  -- Demo product in Bebidas
  INSERT INTO public.products (restaurant_id, category_id, name, price, sort_order, is_active)
  VALUES (v_restaurant_id, v_cat_drinks, 'Refresco', 2.00, 0, true);

  RETURN jsonb_build_object('restaurant_id', v_restaurant_id, 'slug', v_slug);
END;
$$;
