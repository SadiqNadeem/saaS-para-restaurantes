-- Drop all existing versions of create_order_safe_v2 (4 conflicting signatures)
DROP FUNCTION IF EXISTS public.create_order_safe_v2(uuid,text,text,text,numeric,numeric,text,text,text,text,jsonb,text,numeric);
DROP FUNCTION IF EXISTS public.create_order_safe_v2(uuid,text,text,text,numeric,numeric,text,text,text,text,jsonb,text);
DROP FUNCTION IF EXISTS public.create_order_safe_v2(uuid,text,text,text,numeric,numeric,text,text,text,text,jsonb);
DROP FUNCTION IF EXISTS public.create_order_safe_v2(uuid,text,text,numeric,numeric,text,text,text,text,jsonb);

-- Definitive version: one function, all parameters
CREATE OR REPLACE FUNCTION public.create_order_safe_v2(
  p_restaurant_id    uuid,
  p_client_order_key text,
  p_payment_method   text,
  p_order_type       text,
  p_delivery_fee     numeric,
  p_cash_given       numeric,
  p_customer_name    text,
  p_customer_phone   text,
  p_delivery_address text,
  p_notes            text,
  p_items            jsonb,
  p_source           text    DEFAULT 'web',
  p_tip_amount       numeric DEFAULT 0,
  p_table_id         uuid    DEFAULT NULL
)
RETURNS TABLE(order_id uuid, total numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id      uuid;
  v_order_id         uuid;
  v_item             jsonb;
  v_opt              jsonb;
  v_ing              jsonb;
  v_product_id       uuid;
  v_qty              int;
  v_base_price       numeric;
  v_product_name     text;
  v_extras_total     numeric;
  v_final_unit_price numeric;
  v_line_total       numeric;
  v_subtotal         numeric := 0;
  v_delivery_fee     numeric := 0;
  v_tip              numeric := 0;
  v_total            numeric := 0;
  v_cash_change      numeric := null;
  v_notes_json       jsonb;
  v_delivery         jsonb;
  v_delivery_number  text;
  v_delivery_lat     double precision;
  v_delivery_lng     double precision;
  v_distance_km      numeric := 0;
  v_fee_mode         text;
  v_fee_fixed        numeric;
  v_fee_per_km       numeric;
  v_key              text := nullif(btrim(coalesce(p_client_order_key, '')), '');
  v_use_key_col      text;
  v_source           text := coalesce(nullif(btrim(coalesce(p_source, '')), ''), 'web');
  v_is_pos           boolean;
BEGIN
  v_is_pos := (v_source = 'pos');

  -- Skip restaurant-closed check for POS orders
  IF NOT v_is_pos THEN
    IF public.is_restaurant_open_now(p_restaurant_id) = false THEN
      RAISE EXCEPTION 'RESTAURANT_CLOSED';
    END IF;
  END IF;

  v_tip := greatest(coalesce(p_tip_amount, 0), 0);

  -- Detect idempotency key column
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'client_order_key_text'
  ) THEN
    v_use_key_col := 'client_order_key_text';
  ELSE
    v_use_key_col := 'client_order_key';
  END IF;

  -- Idempotency check
  IF v_key IS NOT NULL THEN
    IF v_use_key_col = 'client_order_key_text' THEN
      SELECT o.id, o.total INTO v_existing_id, v_total
      FROM public.orders o
      WHERE o.restaurant_id = p_restaurant_id AND o.client_order_key_text = v_key
      LIMIT 1;
    ELSE
      SELECT o.id, o.total INTO v_existing_id, v_total
      FROM public.orders o
      WHERE o.restaurant_id = p_restaurant_id AND o.client_order_key = v_key
      LIMIT 1;
    END IF;
    IF v_existing_id IS NOT NULL THEN
      RETURN QUERY SELECT v_existing_id, round(coalesce(v_total, 0), 2);
      RETURN;
    END IF;
  END IF;

  -- Parse notes JSON
  BEGIN
    v_notes_json := nullif(trim(p_notes), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    v_notes_json := null;
  END;
  IF v_notes_json IS NOT NULL AND jsonb_typeof(v_notes_json) = 'string' THEN
    BEGIN
      v_notes_json := (v_notes_json #>> '{}')::jsonb;
    EXCEPTION WHEN OTHERS THEN
      v_notes_json := null;
    END;
  END IF;
  IF v_notes_json IS NOT NULL AND (v_notes_json ? 'delivery') AND jsonb_typeof(v_notes_json -> 'delivery') = 'object' THEN
    v_delivery := v_notes_json -> 'delivery';
  ELSE
    v_delivery := null;
  END IF;
  v_delivery_number := nullif(trim(coalesce(v_delivery ->> 'number', '')), '');
  v_delivery_lat    := nullif(coalesce(v_delivery ->> 'lat', ''), '')::double precision;
  v_delivery_lng    := nullif(coalesce(v_delivery ->> 'lng', ''), '')::double precision;
  BEGIN
    v_distance_km := nullif(coalesce(v_delivery ->> 'distanceKm', ''), '')::numeric;
  EXCEPTION WHEN OTHERS THEN
    v_distance_km := 0;
  END;

  -- Server-side delivery fee calculation
  IF p_order_type = 'delivery' THEN
    SELECT
      coalesce(rs.delivery_fee_mode, 'fixed'),
      coalesce(rs.delivery_fee_fixed, 0),
      coalesce(rs.delivery_fee_per_km, 0)
    INTO v_fee_mode, v_fee_fixed, v_fee_per_km
    FROM public.restaurant_settings rs
    WHERE rs.restaurant_id = p_restaurant_id
    LIMIT 1;
    IF coalesce(v_fee_mode, 'fixed') = 'distance' THEN
      v_delivery_fee := greatest(0, coalesce(v_fee_per_km, 0) * greatest(0, coalesce(v_distance_km, 0)));
    ELSE
      v_delivery_fee := greatest(0, coalesce(v_fee_fixed, 0));
    END IF;
  ELSE
    v_delivery_fee := 0;
  END IF;

  -- Delivery address required for delivery orders
  IF p_order_type = 'delivery' THEN
    IF nullif(trim(coalesce(p_delivery_address, '')), '') IS NULL
       OR v_delivery_number IS NULL
       OR v_delivery_lat IS NULL
       OR v_delivery_lng IS NULL
    THEN
      RAISE EXCEPTION 'Delivery address incomplete';
    END IF;
  END IF;

  -- Items required only for non-POS web orders (POS and dine_in may start empty)
  IF NOT v_is_pos AND p_order_type <> 'dine_in' THEN
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
      RAISE EXCEPTION 'ITEMS_REQUIRED';
    END IF;
  END IF;

  -- Calculate subtotal
  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' AND jsonb_array_length(p_items) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      v_product_id := (v_item ->> 'product_id')::uuid;
      v_qty := greatest(coalesce((v_item ->> 'qty')::int, 1), 1);
      SELECT p.price, p.name INTO v_base_price, v_product_name
      FROM public.products p
      WHERE p.id = v_product_id AND p.restaurant_id = p_restaurant_id
      LIMIT 1;
      IF v_product_name IS NULL THEN
        RAISE EXCEPTION 'PRODUCT_NOT_FOUND';
      END IF;
      v_extras_total := 0;
      IF (v_item ? 'options') AND jsonb_typeof(v_item -> 'options') = 'array' THEN
        FOR v_opt IN SELECT * FROM jsonb_array_elements(v_item -> 'options') LOOP
          IF coalesce(v_opt ->> 'option_id', '') <> '' THEN
            v_extras_total := v_extras_total + (
              coalesce((
                SELECT o.price FROM public.modifier_options o
                WHERE o.id = (v_opt ->> 'option_id')::uuid AND o.restaurant_id = p_restaurant_id
                LIMIT 1
              ), 0) * greatest(coalesce((v_opt ->> 'qty')::int, 1), 1)
            );
          END IF;
        END LOOP;
      END IF;
      IF (v_item ? 'ingredients') AND jsonb_typeof(v_item -> 'ingredients') = 'array' THEN
        FOR v_ing IN SELECT * FROM jsonb_array_elements(v_item -> 'ingredients') LOOP
          IF coalesce(v_ing ->> 'ingredient_id', '') <> '' THEN
            v_extras_total := v_extras_total + coalesce((
              SELECT i.price FROM public.ingredients i
              WHERE i.id = (v_ing ->> 'ingredient_id')::uuid AND i.restaurant_id = p_restaurant_id
              LIMIT 1
            ), 0);
          END IF;
        END LOOP;
      END IF;
      v_final_unit_price := coalesce(v_base_price, 0) + coalesce(v_extras_total, 0);
      v_subtotal := v_subtotal + v_final_unit_price * v_qty;
    END LOOP;
  END IF;

  v_total := v_subtotal + v_delivery_fee + v_tip;

  -- Cash validation (skip for POS dine_in where payment happens at close)
  IF p_payment_method = 'cash' AND NOT (v_is_pos AND p_order_type = 'dine_in') THEN
    IF p_cash_given IS NULL THEN
      RAISE EXCEPTION 'CASH_GIVEN_REQUIRED';
    END IF;
    IF p_cash_given < v_total THEN
      RAISE EXCEPTION 'CASH_GIVEN_LT_TOTAL';
    END IF;
    v_cash_change := p_cash_given - v_total;
  END IF;

  -- Insert order
  IF v_use_key_col = 'client_order_key_text' THEN
    INSERT INTO public.orders (
      restaurant_id, client_order_key_text,
      status, subtotal, delivery_fee, tip_amount, total,
      payment_method, payment_status, cash_given, change_due,
      order_type, customer_name, customer_phone,
      delivery_street, delivery_number, delivery_lat, delivery_lng,
      notes, source, table_id
    ) VALUES (
      p_restaurant_id, v_key,
      'pending'::order_status, round(v_subtotal,2), round(v_delivery_fee,2), round(v_tip,2), round(v_total,2),
      p_payment_method, 'unpaid', p_cash_given, v_cash_change,
      p_order_type, p_customer_name, p_customer_phone,
      CASE WHEN p_order_type = 'delivery' THEN p_delivery_address ELSE null END,
      CASE WHEN p_order_type = 'delivery' THEN v_delivery_number ELSE null END,
      CASE WHEN p_order_type = 'delivery' THEN v_delivery_lat ELSE null END,
      CASE WHEN p_order_type = 'delivery' THEN v_delivery_lng ELSE null END,
      p_notes, v_source, p_table_id
    ) RETURNING id INTO v_order_id;
  ELSE
    INSERT INTO public.orders (
      restaurant_id, client_order_key,
      status, subtotal, delivery_fee, tip_amount, total,
      payment_method, payment_status, cash_given, change_due,
      order_type, customer_name, customer_phone,
      delivery_street, delivery_number, delivery_lat, delivery_lng,
      notes, source, table_id
    ) VALUES (
      p_restaurant_id, v_key,
      'pending'::order_status, round(v_subtotal,2), round(v_delivery_fee,2), round(v_tip,2), round(v_total,2),
      p_payment_method, 'unpaid', p_cash_given, v_cash_change,
      p_order_type, p_customer_name, p_customer_phone,
      CASE WHEN p_order_type = 'delivery' THEN p_delivery_address ELSE null END,
      CASE WHEN p_order_type = 'delivery' THEN v_delivery_number ELSE null END,
      CASE WHEN p_order_type = 'delivery' THEN v_delivery_lat ELSE null END,
      CASE WHEN p_order_type = 'delivery' THEN v_delivery_lng ELSE null END,
      p_notes, v_source, p_table_id
    ) RETURNING id INTO v_order_id;
  END IF;

  -- Insert items
  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' AND jsonb_array_length(p_items) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      v_product_id := (v_item ->> 'product_id')::uuid;
      v_qty := greatest(coalesce((v_item ->> 'qty')::int, 1), 1);
      SELECT p.price, p.name INTO v_base_price, v_product_name
      FROM public.products p
      WHERE p.id = v_product_id AND p.restaurant_id = p_restaurant_id
      LIMIT 1;
      v_extras_total := 0;
      IF (v_item ? 'options') AND jsonb_typeof(v_item -> 'options') = 'array' THEN
        FOR v_opt IN SELECT * FROM jsonb_array_elements(v_item -> 'options') LOOP
          IF coalesce(v_opt ->> 'option_id', '') <> '' THEN
            v_extras_total := v_extras_total + (
              coalesce((
                SELECT o.price FROM public.modifier_options o
                WHERE o.id = (v_opt ->> 'option_id')::uuid AND o.restaurant_id = p_restaurant_id
                LIMIT 1
              ), 0) * greatest(coalesce((v_opt ->> 'qty')::int, 1), 1)
            );
          END IF;
        END LOOP;
      END IF;
      IF (v_item ? 'ingredients') AND jsonb_typeof(v_item -> 'ingredients') = 'array' THEN
        FOR v_ing IN SELECT * FROM jsonb_array_elements(v_item -> 'ingredients') LOOP
          IF coalesce(v_ing ->> 'ingredient_id', '') <> '' THEN
            v_extras_total := v_extras_total + coalesce((
              SELECT i.price FROM public.ingredients i
              WHERE i.id = (v_ing ->> 'ingredient_id')::uuid AND i.restaurant_id = p_restaurant_id
              LIMIT 1
            ), 0);
          END IF;
        END LOOP;
      END IF;
      v_final_unit_price := coalesce(v_base_price, 0) + coalesce(v_extras_total, 0);
      v_line_total := v_final_unit_price * v_qty;
      INSERT INTO public.order_items (
        order_id, product_id, qty, snapshot_name,
        base_price, extras_total, final_unit_price, line_total,
        unit_price, restaurant_id, price
      ) VALUES (
        v_order_id, v_product_id, v_qty, v_product_name,
        v_base_price, v_extras_total, v_final_unit_price, v_line_total,
        v_final_unit_price, p_restaurant_id, v_final_unit_price
      );
    END LOOP;
  END IF;

  RETURN QUERY SELECT v_order_id, round(v_total, 2);
END;
$$;
