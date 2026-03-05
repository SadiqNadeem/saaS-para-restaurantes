-- 0) Asegurar columnas (si ya existen, no pasa nada)
alter table public.orders
  add column if not exists delivery_lat numeric,
  add column if not exists delivery_lng numeric;

-- 1) Rehacer constraint (drop + add) para que sea exacta
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'orders_delivery_address_required_check'
  ) then
    alter table public.orders
      drop constraint orders_delivery_address_required_check;
  end if;

  alter table public.orders
    add constraint orders_delivery_address_required_check
    check (
      order_type <> 'delivery'
      or (
        delivery_street is not null
        and delivery_number is not null
        and delivery_lat is not null
        and delivery_lng is not null
      )
    );
end $$;

-- 2) Rehacer la función (misma firma: create_order_secure(jsonb))
--    Si tu función se llama distinto o tiene otra firma, dime y la adapto.
drop function if exists public.create_order_secure(jsonb);

create or replace function public.create_order_secure(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id uuid;
  v_order_type text;
  v_total numeric;
  v_payment_method text;
  v_status text := 'pending';

  v_delivery_street text;
  v_delivery_number text;
  v_delivery_lat numeric;
  v_delivery_lng numeric;

  v_order_id uuid;
begin
  -- restaurant_id (acepta varias formas por si tu frontend manda distinto)
  v_restaurant_id :=
    coalesce(
      nullif(p_payload->>'restaurantId','')::uuid,
      nullif(p_payload->>'restaurant_id','')::uuid,
      nullif(p_payload->>'restaurantID','')::uuid
    );

  if v_restaurant_id is null then
    raise exception 'RESTAURANT_ID_MISSING';
  end if;

  v_order_type := coalesce(nullif(p_payload->>'orderType',''), nullif(p_payload->>'order_type',''), 'pickup');
  v_total := coalesce(nullif(p_payload->>'total','')::numeric, 0);
  v_payment_method := coalesce(nullif(p_payload->>'paymentMethod',''), nullif(p_payload->>'payment_method',''), 'cash');

  -- Si es delivery, sacar dirección + lat/lng de p_payload.delivery
  if v_order_type = 'delivery' then
    v_delivery_street := nullif(p_payload->'delivery'->>'street','');
    v_delivery_number := nullif(p_payload->'delivery'->>'number','');
    v_delivery_lat := nullif(p_payload->'delivery'->>'lat','')::numeric;
    v_delivery_lng := nullif(p_payload->'delivery'->>'lng','')::numeric;
  end if;

  insert into public.orders (
    restaurant_id,
    order_type,
    total,
    payment_method,
    status,
    delivery_street,
    delivery_number,
    delivery_lat,
    delivery_lng
  )
  values (
    v_restaurant_id,
    v_order_type,
    v_total,
    v_payment_method,
    v_status,
    v_delivery_street,
    v_delivery_number,
    v_delivery_lat,
    v_delivery_lng
  )
  returning id into v_order_id;

  return jsonb_build_object('orderId', v_order_id);
end;
$$;

-- 3) Permisos típicos para poder llamar la RPC desde el cliente
grant execute on function public.create_order_secure(jsonb) to anon, authenticated;
