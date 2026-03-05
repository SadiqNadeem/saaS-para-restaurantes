-- Add p_source parameter to create_order_safe_v2 (overload with client_order_key)
-- so POS can pass 'pos' as the source without a post-INSERT UPDATE.

CREATE OR REPLACE FUNCTION public.create_order_safe_v2(
  p_restaurant_id     uuid,
  p_client_order_key  text,
  p_payment_method    text,
  p_order_type        text,
  p_delivery_fee      numeric,
  p_cash_given        numeric,
  p_customer_name     text,
  p_customer_phone    text,
  p_delivery_address  text,
  p_notes             text,
  p_items             jsonb,
  p_source            text DEFAULT 'web'
)
RETURNS TABLE(order_id uuid, total numeric)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  v_existing_id uuid;

  v_order_id uuid;
  v_item jsonb;
  v_opt jsonb;
  v_ing jsonb;

  v_product_id uuid;
  v_qty int;

  v_base_price numeric;
  v_product_name text;

  v_extras_total numeric;
  v_final_unit_price numeric;
  v_line_total numeric;

  v_subtotal numeric := 0;
  v_delivery_fee numeric := 0;
  v_total numeric := 0;
  v_cash_change numeric := null;

  -- delivery required by CHECK
  v_notes_json jsonb;
  v_delivery jsonb;
  v_delivery_number text;
  v_delivery_lat double precision;
  v_delivery_lng double precision;
  v_distance_km numeric := 0;

  -- restaurant settings
  v_fee_mode text;
  v_fee_fixed numeric;
  v_fee_per_km numeric;

  v_key text := nullif(btrim(coalesce(p_client_order_key,'')), '');

  v_use_key_col text;
  v_source text := coalesce(nullif(btrim(coalesce(p_source,'')), ''), 'web');
begin
  -- BLOQUEO SI ESTÁ CERRADO
  if public.is_restaurant_open_now(p_restaurant_id) = false then
    raise exception 'RESTAURANT_CLOSED';
  end if;

  -- Detect which column to use for idempotency key
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='orders' and column_name='client_order_key_text'
  ) then
    v_use_key_col := 'client_order_key_text';
  else
    v_use_key_col := 'client_order_key';
  end if;

  -- =====================
  -- Idempotency check
  -- =====================
  if v_key is not null then
    if v_use_key_col = 'client_order_key_text' then
      select o.id, o.total into v_existing_id, v_total
      from public.orders o
      where o.restaurant_id = p_restaurant_id
        and o.client_order_key_text = v_key
      limit 1;
    else
      select o.id, o.total into v_existing_id, v_total
      from public.orders o
      where o.restaurant_id = p_restaurant_id
        and o.client_order_key = v_key
      limit 1;
    end if;

    if v_existing_id is not null then
      return query select v_existing_id, round(coalesce(v_total,0),2);
      return;
    end if;
  end if;

  -- =====================
  -- Parse notes JSON
  -- =====================
  begin
    v_notes_json := nullif(trim(p_notes), '')::jsonb;
  exception when others then
    v_notes_json := null;
  end;

  if v_notes_json is not null and jsonb_typeof(v_notes_json) = 'string' then
    begin
      v_notes_json := (v_notes_json #>> '{}')::jsonb;
    exception when others then
      v_notes_json := null;
    end;
  end if;

  if v_notes_json is not null and (v_notes_json ? 'delivery') and jsonb_typeof(v_notes_json->'delivery') = 'object' then
    v_delivery := v_notes_json->'delivery';
  else
    v_delivery := null;
  end if;

  v_delivery_number := nullif(trim(coalesce(v_delivery->>'number','')), '');
  v_delivery_lat    := nullif(coalesce(v_delivery->>'lat',''), '')::double precision;
  v_delivery_lng    := nullif(coalesce(v_delivery->>'lng',''), '')::double precision;

  begin
    v_distance_km := nullif(coalesce(v_delivery->>'distanceKm',''), '')::numeric;
  exception when others then
    v_distance_km := 0;
  end;

  -- =====================
  -- Server-side delivery fee calculation
  -- =====================
  if p_order_type = 'delivery' then
    select
      coalesce(rs.delivery_fee_mode, 'fixed'),
      coalesce(rs.delivery_fee_fixed, 0),
      coalesce(rs.delivery_fee_per_km, 0)
    into v_fee_mode, v_fee_fixed, v_fee_per_km
    from public.restaurant_settings rs
    where rs.restaurant_id = p_restaurant_id
    limit 1;

    if coalesce(v_fee_mode,'fixed') = 'distance' then
      v_delivery_fee := greatest(0, coalesce(v_fee_per_km,0) * greatest(0, coalesce(v_distance_km,0)));
    else
      v_delivery_fee := greatest(0, coalesce(v_fee_fixed,0));
    end if;
  else
    v_delivery_fee := 0;
  end if;

  if p_order_type = 'delivery' then
    if nullif(trim(coalesce(p_delivery_address,'')), '') is null
       or v_delivery_number is null
       or v_delivery_lat is null
       or v_delivery_lng is null
    then
      raise exception 'Delivery address incomplete';
    end if;
  end if;

  -- =====================
  -- Calculate subtotal (validates product belongs to restaurant)
  -- =====================
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'ITEMS_REQUIRED';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := greatest(coalesce((v_item->>'qty')::int, 1), 1);

    select p.price, p.name
      into v_base_price, v_product_name
    from public.products p
    where p.id = v_product_id
      and p.restaurant_id = p_restaurant_id
    limit 1;

    if v_product_name is null then
      raise exception 'PRODUCT_NOT_FOUND';
    end if;

    v_extras_total := 0;

    if (v_item ? 'options') and jsonb_typeof(v_item->'options') = 'array' then
      for v_opt in select * from jsonb_array_elements(v_item->'options')
      loop
        if coalesce(v_opt->>'option_id','') <> '' then
          v_extras_total :=
            v_extras_total
            + (
              coalesce(
                (select o.price
                 from public.modifier_options o
                 where o.id = (v_opt->>'option_id')::uuid
                   and o.restaurant_id = p_restaurant_id
                 limit 1),
                0
              )
              * greatest(coalesce((v_opt->>'qty')::int, 1), 1)
            );
        end if;
      end loop;
    end if;

    if (v_item ? 'ingredients') and jsonb_typeof(v_item->'ingredients') = 'array' then
      for v_ing in select * from jsonb_array_elements(v_item->'ingredients')
      loop
        if coalesce(v_ing->>'ingredient_id','') <> '' then
          v_extras_total :=
            v_extras_total
            + coalesce(
              (select i.price
               from public.ingredients i
               where i.id = (v_ing->>'ingredient_id')::uuid
                 and i.restaurant_id = p_restaurant_id
               limit 1),
              0
            );
        end if;
      end loop;
    end if;

    v_final_unit_price := coalesce(v_base_price,0) + coalesce(v_extras_total,0);
    v_line_total := v_final_unit_price * v_qty;
    v_subtotal := v_subtotal + v_line_total;
  end loop;

  v_total := v_subtotal + v_delivery_fee;

  -- Cash validation
  if p_payment_method = 'cash' then
    if p_cash_given is null then
      raise exception 'CASH_GIVEN_REQUIRED';
    end if;
    if p_cash_given < v_total then
      raise exception 'CASH_GIVEN_LT_TOTAL';
    end if;
    v_cash_change := p_cash_given - v_total;
  end if;

  -- Insert order (branches on which key column exists)
  if v_use_key_col = 'client_order_key_text' then
    insert into public.orders (
      restaurant_id, client_order_key_text,
      status, subtotal, delivery_fee, total,
      payment_method, payment_status, cash_given, change_due,
      order_type, customer_name, customer_phone,
      delivery_street, delivery_number, delivery_lat, delivery_lng,
      notes, source
    )
    values (
      p_restaurant_id, v_key,
      'pending', round(v_subtotal,2), round(v_delivery_fee,2), round(v_total,2),
      p_payment_method, 'unpaid', p_cash_given, v_cash_change,
      p_order_type, p_customer_name, p_customer_phone,
      case when p_order_type='delivery' then p_delivery_address else null end,
      case when p_order_type='delivery' then v_delivery_number else null end,
      case when p_order_type='delivery' then v_delivery_lat else null end,
      case when p_order_type='delivery' then v_delivery_lng else null end,
      p_notes, v_source
    )
    returning id into v_order_id;
  else
    insert into public.orders (
      restaurant_id, client_order_key,
      status, subtotal, delivery_fee, total,
      payment_method, payment_status, cash_given, change_due,
      order_type, customer_name, customer_phone,
      delivery_street, delivery_number, delivery_lat, delivery_lng,
      notes, source
    )
    values (
      p_restaurant_id, v_key,
      'pending', round(v_subtotal,2), round(v_delivery_fee,2), round(v_total,2),
      p_payment_method, 'unpaid', p_cash_given, v_cash_change,
      p_order_type, p_customer_name, p_customer_phone,
      case when p_order_type='delivery' then p_delivery_address else null end,
      case when p_order_type='delivery' then v_delivery_number else null end,
      case when p_order_type='delivery' then v_delivery_lat else null end,
      case when p_order_type='delivery' then v_delivery_lng else null end,
      p_notes, v_source
    )
    returning id into v_order_id;
  end if;

  -- Insert items
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := greatest(coalesce((v_item->>'qty')::int, 1), 1);

    select p.price, p.name
      into v_base_price, v_product_name
    from public.products p
    where p.id = v_product_id
      and p.restaurant_id = p_restaurant_id
    limit 1;

    v_extras_total := 0;

    if (v_item ? 'options') and jsonb_typeof(v_item->'options') = 'array' then
      for v_opt in select * from jsonb_array_elements(v_item->'options')
      loop
        if coalesce(v_opt->>'option_id','') <> '' then
          v_extras_total :=
            v_extras_total
            + (
              coalesce(
                (select o.price
                 from public.modifier_options o
                 where o.id = (v_opt->>'option_id')::uuid
                   and o.restaurant_id = p_restaurant_id
                 limit 1),
                0
              )
              * greatest(coalesce((v_opt->>'qty')::int, 1), 1)
            );
        end if;
      end loop;
    end if;

    if (v_item ? 'ingredients') and jsonb_typeof(v_item->'ingredients') = 'array' then
      for v_ing in select * from jsonb_array_elements(v_item->'ingredients')
      loop
        if coalesce(v_ing->>'ingredient_id','') <> '' then
          v_extras_total :=
            v_extras_total
            + coalesce(
              (select i.price
               from public.ingredients i
               where i.id = (v_ing->>'ingredient_id')::uuid
                 and i.restaurant_id = p_restaurant_id
               limit 1),
              0
            );
        end if;
      end loop;
    end if;

    v_final_unit_price := coalesce(v_base_price,0) + coalesce(v_extras_total,0);
    v_line_total := v_final_unit_price * v_qty;

    insert into public.order_items (
      order_id, product_id, qty, snapshot_name,
      base_price, extras_total, final_unit_price, line_total,
      unit_price, restaurant_id, price
    )
    values (
      v_order_id, v_product_id, v_qty, v_product_name,
      v_base_price, v_extras_total, v_final_unit_price, v_line_total,
      v_final_unit_price, p_restaurant_id, v_final_unit_price
    );
  end loop;

  return query select v_order_id, round(v_total,2);
end;
$$;
