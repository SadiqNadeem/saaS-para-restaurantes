create or replace function public.create_order_secure(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_existing_order_id uuid;
  v_restaurant_id uuid;
  v_client_order_key text;
  v_customer_name text;
  v_customer_phone text;
  v_order_type text;
  v_payment_method text;
  v_cash_given numeric;
  v_change_due numeric;
  v_address_line text;
  v_address_lat numeric;
  v_address_lng numeric;
  v_is_building boolean;
  v_portal text;
  v_floor text;
  v_door text;
  v_block text;
  v_stair text;
  v_instructions text;
  v_notes jsonb;
  v_items_json jsonb;
  v_item jsonb;
  v_qty int;
  v_product_id uuid;
  v_price numeric;
  v_is_active boolean;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_delivery_fee numeric := 0;
  v_distance_km numeric := 0;
  v_lat1 numeric;
  v_lng1 numeric;
  v_lat2 numeric;
  v_lng2 numeric;
  v_dlat numeric;
  v_dlng numeric;
  v_a numeric;
  v_c numeric;
  v_radius_km numeric;
  v_min_order_amount numeric;
  v_delivery_fee_mode text;
  v_delivery_fee_fixed numeric;
  v_delivery_fee_base numeric;
  v_delivery_fee_per_km numeric;
  v_delivery_fee_min numeric;
  v_delivery_fee_max numeric;
  v_allow_cash boolean;
  v_allow_card boolean;
  v_is_accepting_orders boolean;
  v_base_lat numeric;
  v_base_lng numeric;
  v_recent_orders_count int := 0;
begin
  if payload is null then
    raise exception 'Payload vacio';
  end if;

  v_restaurant_id := nullif(payload->>'restaurant_id', '')::uuid;
  if v_restaurant_id is null then
    raise exception 'restaurant_id es obligatorio';
  end if;

  v_client_order_key := nullif(payload->>'client_order_key', '');
  if v_client_order_key is null or btrim(v_client_order_key) = '' then
    raise exception 'client_order_key es obligatorio';
  end if;

  select count(*)::int
    into v_recent_orders_count
  from public.orders
  where restaurant_id = v_restaurant_id
    and client_order_key = v_client_order_key
    and created_at >= now() - interval '5 minutes';

  if v_recent_orders_count >= 5 then
    raise exception 'Demasiados pedidos, espera 5 minutos';
  end if;

  if v_client_order_key is not null then
    select id
      into v_existing_order_id
    from public.orders
    where restaurant_id = v_restaurant_id
      and client_order_key = v_client_order_key
    limit 1;

    if v_existing_order_id is not null then
      return v_existing_order_id;
    end if;
  end if;

  v_customer_name := coalesce(payload->>'customer_name', '');
  v_customer_phone := coalesce(payload->>'customer_phone', '');
  v_order_type := coalesce(payload->>'order_type', '');
  v_payment_method := coalesce(payload->>'payment_method', '');
  v_cash_given := nullif(payload->>'cash_given', '')::numeric;
  v_address_line := nullif(payload->>'address_line', '');
  v_address_lat := nullif(payload->>'address_lat', '')::numeric;
  v_address_lng := nullif(payload->>'address_lng', '')::numeric;
  v_is_building := coalesce((payload->>'is_building')::boolean, false);
  v_portal := nullif(payload->>'portal', '');
  v_floor := nullif(payload->>'floor', '');
  v_door := nullif(payload->>'door', '');
  v_block := nullif(payload->>'block', '');
  v_stair := nullif(payload->>'stair', '');
  v_instructions := nullif(payload->>'instructions', '');
  v_notes := coalesce(payload->'notes', '{}'::jsonb);
  v_items_json := coalesce(payload->'items', '[]'::jsonb);

  if btrim(v_customer_name) = '' then
    raise exception 'El nombre del cliente es obligatorio';
  end if;

  if btrim(v_customer_phone) = '' then
    raise exception 'El telefono del cliente es obligatorio';
  end if;

  if v_order_type not in ('pickup', 'delivery') then
    raise exception 'order_type invalido';
  end if;

  if v_payment_method not in ('cash', 'card_on_delivery', 'card_online') then
    raise exception 'payment_method invalido';
  end if;

  if jsonb_typeof(v_items_json) <> 'array' or jsonb_array_length(v_items_json) = 0 then
    raise exception 'Tu carrito esta vacio';
  end if;

  select
    coalesce(is_accepting_orders, true),
    delivery_radius_km,
    coalesce(min_order_amount, 0),
    coalesce(delivery_fee_mode, 'fixed'),
    coalesce(delivery_fee_fixed, 0),
    coalesce(delivery_fee_base, 0),
    coalesce(delivery_fee_per_km, 0),
    delivery_fee_min,
    delivery_fee_max,
    coalesce(allow_cash, true),
    coalesce(allow_card, true),
    base_lat,
    base_lng
  into
    v_is_accepting_orders,
    v_radius_km,
    v_min_order_amount,
    v_delivery_fee_mode,
    v_delivery_fee_fixed,
    v_delivery_fee_base,
    v_delivery_fee_per_km,
    v_delivery_fee_min,
    v_delivery_fee_max,
    v_allow_cash,
    v_allow_card,
    v_base_lat,
    v_base_lng
  from public.restaurant_settings
  where restaurant_id = v_restaurant_id
  limit 1;

  if not found then
    raise exception 'No se encontro restaurant_settings para este restaurante';
  end if;

  if coalesce(v_is_accepting_orders, true) = false then
    raise exception 'El restaurante esta cerrado en este momento';
  end if;

  if v_payment_method = 'cash' and coalesce(v_allow_cash, true) = false then
    raise exception 'El pago en efectivo no esta permitido';
  end if;

  if v_payment_method in ('card_on_delivery', 'card_online') and coalesce(v_allow_card, true) = false then
    raise exception 'El pago con tarjeta no esta permitido';
  end if;

  if v_order_type = 'delivery' then
    if v_address_line is null or btrim(v_address_line) = '' then
      raise exception 'La direccion de entrega es obligatoria';
    end if;

    if v_is_building and (v_portal is null or v_floor is null or v_door is null) then
      raise exception 'Faltan datos del edificio: portal, piso y puerta';
    end if;

    if v_address_lat is null or v_address_lng is null then
      raise exception 'Faltan coordenadas de destino';
    end if;

    if v_radius_km is not null then
      if v_base_lat is null or v_base_lng is null then
        raise exception 'Faltan coordenadas del restaurante para calcular distancia';
      end if;

      v_lat1 := v_base_lat;
      v_lng1 := v_base_lng;
      v_lat2 := v_address_lat;
      v_lng2 := v_address_lng;

      v_dlat := radians(v_lat2 - v_lat1);
      v_dlng := radians(v_lng2 - v_lng1);
      v_a := power(sin(v_dlat / 2), 2)
        + cos(radians(v_lat1)) * cos(radians(v_lat2)) * power(sin(v_dlng / 2), 2);
      v_c := 2 * atan2(sqrt(v_a), sqrt(1 - v_a));
      v_distance_km := 6371 * v_c;

      if v_distance_km > v_radius_km then
        raise exception 'Fuera del radio de entrega: % km > % km', round(v_distance_km::numeric, 2), v_radius_km;
      end if;
    end if;
  end if;

  for v_item in select value from jsonb_array_elements(v_items_json)
  loop
    v_product_id := nullif(v_item->>'product_id', '')::uuid;
    v_qty := greatest(1, coalesce((v_item->>'qty')::int, 1));

    if v_product_id is null then
      raise exception 'Producto invalido en carrito';
    end if;

    select price, coalesce(is_active, true)
      into v_price, v_is_active
    from public.products
    where id = v_product_id
      and restaurant_id = v_restaurant_id
    limit 1;

    if not found then
      raise exception 'Producto no encontrado: %', v_product_id;
    end if;

    if coalesce(v_is_active, true) = false then
      raise exception 'Producto desactivado: %', v_product_id;
    end if;

    v_subtotal := v_subtotal + (coalesce(v_price, 0) * v_qty);
  end loop;

  if v_subtotal < coalesce(v_min_order_amount, 0) then
    raise exception 'Pedido minimo: % EUR', to_char(coalesce(v_min_order_amount, 0), 'FM999999990.00');
  end if;

  if v_order_type = 'delivery' then
    if v_delivery_fee_mode = 'distance' then
      v_delivery_fee := coalesce(v_delivery_fee_base, 0) + coalesce(v_delivery_fee_per_km, 0) * coalesce(v_distance_km, 0);
      if v_delivery_fee_min is not null then
        v_delivery_fee := greatest(v_delivery_fee, v_delivery_fee_min);
      end if;
      if v_delivery_fee_max is not null then
        v_delivery_fee := least(v_delivery_fee, v_delivery_fee_max);
      end if;
    else
      v_delivery_fee := coalesce(v_delivery_fee_fixed, 0);
    end if;
  else
    v_delivery_fee := 0;
    v_distance_km := 0;
  end if;

  v_delivery_fee := greatest(coalesce(v_delivery_fee, 0), 0);
  v_total := coalesce(v_subtotal, 0) + coalesce(v_delivery_fee, 0);

  if v_payment_method = 'cash' then
    if v_cash_given is null or v_cash_given <= 0 then
      raise exception 'En efectivo, el importe debe ser mayor que 0';
    end if;
    if v_cash_given < v_total then
      raise exception 'El efectivo recibido es menor al total del pedido';
    end if;
    v_change_due := v_cash_given - v_total;
  else
    v_cash_given := null;
    v_change_due := 0;
  end if;

  insert into public.orders (
    restaurant_id,
    status,
    total,
    delivery_fee,
    customer_name,
    customer_phone,
    order_type,
    address_line,
    address_lat,
    address_lng,
    is_building,
    portal,
    floor,
    door,
    block,
    stair,
    instructions,
    distance_km,
    payment_method,
    payment_provider,
    payment_status,
    cash_given,
    change_due,
    client_order_key,
    notes
  )
  values (
    v_restaurant_id,
    'pending',
    round(v_total, 2),
    round(v_delivery_fee, 2),
    v_customer_name,
    v_customer_phone,
    v_order_type,
    v_address_line,
    v_address_lat,
    v_address_lng,
    v_is_building,
    v_portal,
    v_floor,
    v_door,
    v_block,
    v_stair,
    v_instructions,
    round(v_distance_km, 3),
    v_payment_method,
    case
      when v_payment_method = 'card_online' then 'stripe'
      when v_payment_method = 'card_on_delivery' then 'dataphone'
      else 'cash'
    end,
    'unpaid',
    v_cash_given,
    v_change_due,
    v_client_order_key,
    v_notes || jsonb_build_object('pricing', jsonb_build_object('subtotal', round(v_subtotal, 2), 'delivery_fee', round(v_delivery_fee, 2), 'total', round(v_total, 2)))
  )
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(v_items_json)
  loop
    v_product_id := nullif(v_item->>'product_id', '')::uuid;
    v_qty := greatest(1, coalesce((v_item->>'qty')::int, 1));

    select price
      into v_price
    from public.products
    where id = v_product_id
      and restaurant_id = v_restaurant_id
    limit 1;

    insert into public.order_items (
      restaurant_id,
      order_id,
      product_id,
      qty,
      base_price,
      unit_price
    )
    values (
      v_restaurant_id,
      v_order_id,
      v_product_id,
      v_qty,
      coalesce(v_price, 0),
      coalesce(v_price, 0)
    );
  end loop;

  return v_order_id;
end;
$$;
