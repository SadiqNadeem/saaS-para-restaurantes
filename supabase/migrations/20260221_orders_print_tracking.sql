alter table public.orders
  add column if not exists printed_at timestamptz;

alter table public.orders
  add column if not exists print_count int not null default 0;

alter table public.orders
  add column if not exists last_print_error text;

create index if not exists orders_printed_at_idx
  on public.orders (printed_at);
