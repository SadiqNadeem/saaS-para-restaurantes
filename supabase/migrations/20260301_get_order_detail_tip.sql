-- Update get_order_detail to include tip_amount and change_due
CREATE OR REPLACE FUNCTION public.get_order_detail(p_order_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  with o as (
    select
      id,
      restaurant_id,
      created_at,
      status,
      order_type,
      payment_method,
      total,
      delivery_fee,
      coalesce(tip_amount, 0) as tip_amount,
      cash_given,
      change_due,
      customer_name,
      customer_phone,
      delivery_address,
      notes
    from public.orders
    where id = p_order_id
    limit 1
  ),
  items as (
    select
      oi.order_id,
      jsonb_agg(
        jsonb_build_object(
          'id', oi.id,
          'product_id', oi.product_id,
          'name', coalesce(oi.snapshot_name, p.name, 'Producto'),
          'qty', oi.qty,
          'unit_price', coalesce(oi.snapshot_price, p.price, 0),
          'extras_total', coalesce(oi.extras_total, 0),
          'line_total', coalesce(oi.line_total, (oi.qty * coalesce(oi.snapshot_price, p.price, 0)) + coalesce(oi.extras_total, 0)),
          'notes', oi.notes,
          'extras', coalesce(oi.snapshot_extras, '[]'::jsonb)
        )
        order by oi.created_at asc
      ) as items
    from public.order_items oi
    left join public.products p on p.id = oi.product_id
    where oi.order_id = p_order_id
    group by oi.order_id
  )
  select jsonb_build_object(
    'order', (select to_jsonb(o) from o),
    'items', coalesce((select items.items from items), '[]'::jsonb)
  );
$function$;
