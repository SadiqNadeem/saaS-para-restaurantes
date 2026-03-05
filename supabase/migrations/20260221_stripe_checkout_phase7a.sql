alter table public.orders
  add column if not exists payment_provider text default 'stripe';

alter table public.orders
  add column if not exists payment_method text;

alter table public.orders
  add column if not exists payment_status text default 'unpaid';

alter table public.orders
  add column if not exists stripe_session_id text;

alter table public.orders
  add column if not exists stripe_payment_intent_id text;

alter table public.orders
  add column if not exists paid_at timestamptz;

create index if not exists orders_payment_status_idx
  on public.orders (payment_status);

create index if not exists orders_stripe_session_id_idx
  on public.orders (stripe_session_id);

create index if not exists orders_stripe_payment_intent_id_idx
  on public.orders (stripe_payment_intent_id);
