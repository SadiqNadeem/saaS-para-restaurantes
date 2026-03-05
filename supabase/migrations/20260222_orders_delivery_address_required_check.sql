do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_delivery_address_required_check'
  ) then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'orders'
        and column_name = 'delivery_street'
    ) and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'orders'
        and column_name = 'delivery_number'
    ) then
      alter table public.orders
        add constraint orders_delivery_address_required_check
        check (
          order_type <> 'delivery'
          or (
            coalesce(delivery_street, '') <> ''
            and coalesce(delivery_number, '') <> ''
          )
        );
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'orders'
        and column_name = 'address_line'
    ) then
      alter table public.orders
        add constraint orders_delivery_address_required_check
        check (
          order_type <> 'delivery'
          or coalesce(address_line, '') <> ''
        );
    end if;
  end if;
end
$$;
