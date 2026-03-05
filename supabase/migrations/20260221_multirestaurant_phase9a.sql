create extension if not exists pgcrypto;

create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  delivery_radius_m int not null default 3000
);

insert into public.restaurants (name, slug)
select 'Restaurante Default', 'default'
where not exists (
  select 1 from public.restaurants where slug = 'default'
);

create or replace function public.default_restaurant_id()
returns uuid
language sql
stable
as $$
  select id
  from public.restaurants
  where slug = 'default'
  limit 1
$$;

alter table public.products add column if not exists restaurant_id uuid;
alter table public.categories add column if not exists restaurant_id uuid;
alter table public.modifier_groups add column if not exists restaurant_id uuid;
alter table public.modifier_options add column if not exists restaurant_id uuid;
alter table public.orders add column if not exists restaurant_id uuid;
alter table public.order_items add column if not exists restaurant_id uuid;
alter table public.order_item_modifier_options add column if not exists restaurant_id uuid;

update public.products
set restaurant_id = public.default_restaurant_id()
where restaurant_id is null;

update public.categories
set restaurant_id = public.default_restaurant_id()
where restaurant_id is null;

update public.modifier_groups
set restaurant_id = public.default_restaurant_id()
where restaurant_id is null;

update public.modifier_options
set restaurant_id = coalesce(modifier_groups.restaurant_id, public.default_restaurant_id())
from public.modifier_groups
where modifier_options.restaurant_id is null
  and modifier_options.group_id = modifier_groups.id;

update public.modifier_options
set restaurant_id = public.default_restaurant_id()
where restaurant_id is null;

update public.orders
set restaurant_id = public.default_restaurant_id()
where restaurant_id is null;

update public.order_items
set restaurant_id = coalesce(orders.restaurant_id, public.default_restaurant_id())
from public.orders
where order_items.restaurant_id is null
  and order_items.order_id = orders.id;

update public.order_items
set restaurant_id = public.default_restaurant_id()
where restaurant_id is null;

update public.order_item_modifier_options
set restaurant_id = coalesce(order_items.restaurant_id, public.default_restaurant_id())
from public.order_items
where order_item_modifier_options.restaurant_id is null
  and order_item_modifier_options.order_item_id = order_items.id;

update public.order_item_modifier_options
set restaurant_id = public.default_restaurant_id()
where restaurant_id is null;

alter table public.products alter column restaurant_id set default public.default_restaurant_id();
alter table public.categories alter column restaurant_id set default public.default_restaurant_id();
alter table public.modifier_groups alter column restaurant_id set default public.default_restaurant_id();
alter table public.modifier_options alter column restaurant_id set default public.default_restaurant_id();
alter table public.orders alter column restaurant_id set default public.default_restaurant_id();
alter table public.order_items alter column restaurant_id set default public.default_restaurant_id();
alter table public.order_item_modifier_options alter column restaurant_id set default public.default_restaurant_id();

alter table public.products alter column restaurant_id set not null;
alter table public.categories alter column restaurant_id set not null;
alter table public.modifier_groups alter column restaurant_id set not null;
alter table public.modifier_options alter column restaurant_id set not null;
alter table public.orders alter column restaurant_id set not null;
alter table public.order_items alter column restaurant_id set not null;
alter table public.order_item_modifier_options alter column restaurant_id set not null;

create index if not exists products_restaurant_id_idx on public.products (restaurant_id);
create index if not exists categories_restaurant_id_idx on public.categories (restaurant_id);
create index if not exists modifier_groups_restaurant_id_idx on public.modifier_groups (restaurant_id);
create index if not exists modifier_options_restaurant_id_idx on public.modifier_options (restaurant_id);
create index if not exists orders_restaurant_id_idx on public.orders (restaurant_id);
create index if not exists order_items_restaurant_id_idx on public.order_items (restaurant_id);
create index if not exists order_item_modifier_options_restaurant_id_idx on public.order_item_modifier_options (restaurant_id);

create index if not exists restaurants_slug_idx on public.restaurants (slug);

alter table public.products
  add constraint products_restaurant_id_fkey
  foreign key (restaurant_id) references public.restaurants(id)
  on update cascade on delete restrict;

alter table public.categories
  add constraint categories_restaurant_id_fkey
  foreign key (restaurant_id) references public.restaurants(id)
  on update cascade on delete restrict;

alter table public.modifier_groups
  add constraint modifier_groups_restaurant_id_fkey
  foreign key (restaurant_id) references public.restaurants(id)
  on update cascade on delete restrict;

alter table public.modifier_options
  add constraint modifier_options_restaurant_id_fkey
  foreign key (restaurant_id) references public.restaurants(id)
  on update cascade on delete restrict;

alter table public.orders
  add constraint orders_restaurant_id_fkey
  foreign key (restaurant_id) references public.restaurants(id)
  on update cascade on delete restrict;

alter table public.order_items
  add constraint order_items_restaurant_id_fkey
  foreign key (restaurant_id) references public.restaurants(id)
  on update cascade on delete restrict;

alter table public.order_item_modifier_options
  add constraint order_item_modifier_options_restaurant_id_fkey
  foreign key (restaurant_id) references public.restaurants(id)
  on update cascade on delete restrict;
