create index if not exists orders_status_created_at_idx
  on public.orders (status, created_at desc);
