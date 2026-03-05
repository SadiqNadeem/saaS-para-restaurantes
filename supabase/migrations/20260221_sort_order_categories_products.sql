alter table public.categories
  add column if not exists sort_order int not null default 0;

alter table public.products
  add column if not exists sort_order int not null default 0;

create index if not exists categories_sort_order_idx
  on public.categories (sort_order);

create index if not exists products_category_sort_order_idx
  on public.products (category_id, sort_order);
