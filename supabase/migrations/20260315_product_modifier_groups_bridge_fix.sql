create extension if not exists pgcrypto;

create table if not exists public.product_modifier_groups (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  product_id uuid not null,
  modifier_group_id uuid not null,
  sort_order integer default 0,
  is_required boolean default false,
  created_at timestamptz default now()
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'product_modifier_groups'
      and column_name = 'group_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'product_modifier_groups'
      and column_name = 'modifier_group_id'
  ) then
    alter table public.product_modifier_groups rename column group_id to modifier_group_id;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'product_modifier_groups'
      and column_name = 'position'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'product_modifier_groups'
      and column_name = 'sort_order'
  ) then
    alter table public.product_modifier_groups rename column position to sort_order;
  end if;
end $$;

alter table public.product_modifier_groups
  add column if not exists restaurant_id uuid,
  add column if not exists modifier_group_id uuid,
  add column if not exists sort_order integer default 0,
  add column if not exists is_required boolean default false,
  add column if not exists created_at timestamptz default now();

update public.product_modifier_groups pmg
set restaurant_id = coalesce(p.restaurant_id, public.default_restaurant_id())
from public.products p
where pmg.product_id = p.id
  and pmg.restaurant_id is null;

update public.product_modifier_groups
set restaurant_id = public.default_restaurant_id()
where restaurant_id is null;

alter table public.product_modifier_groups
  alter column product_id set not null,
  alter column modifier_group_id set not null,
  alter column sort_order set default 0,
  alter column is_required set default false,
  alter column created_at set default now(),
  alter column restaurant_id set not null;

create index if not exists product_modifier_groups_product_id_idx
  on public.product_modifier_groups (product_id);

create index if not exists product_modifier_groups_modifier_group_id_idx
  on public.product_modifier_groups (modifier_group_id);

create index if not exists product_modifier_groups_restaurant_id_idx
  on public.product_modifier_groups (restaurant_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'product_modifier_groups_product_id_modifier_group_id_key'
  ) then
    alter table public.product_modifier_groups
      add constraint product_modifier_groups_product_id_modifier_group_id_key
      unique (product_id, modifier_group_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'product_modifier_groups_product_id_fkey'
  ) then
    alter table public.product_modifier_groups
      add constraint product_modifier_groups_product_id_fkey
      foreign key (product_id)
      references public.products(id)
      on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'product_modifier_groups_modifier_group_id_fkey'
  ) then
    alter table public.product_modifier_groups
      add constraint product_modifier_groups_modifier_group_id_fkey
      foreign key (modifier_group_id)
      references public.modifier_groups(id)
      on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'product_modifier_groups_restaurant_id_fkey'
  ) then
    alter table public.product_modifier_groups
      add constraint product_modifier_groups_restaurant_id_fkey
      foreign key (restaurant_id)
      references public.restaurants(id)
      on update cascade
      on delete restrict;
  end if;
end $$;

alter table public.product_modifier_groups enable row level security;

drop policy if exists "product_modifier_groups_select_public" on public.product_modifier_groups;
create policy "product_modifier_groups_select_public"
  on public.product_modifier_groups for select
  using (true);

drop policy if exists "pmg_insert_restaurant_admin" on public.product_modifier_groups;
create policy "pmg_insert_restaurant_admin"
  on public.product_modifier_groups for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.products p
      join public.modifier_groups mg on mg.id = product_modifier_groups.modifier_group_id
      where p.id = product_modifier_groups.product_id
        and p.restaurant_id = product_modifier_groups.restaurant_id
        and mg.restaurant_id = product_modifier_groups.restaurant_id
        and is_restaurant_admin(product_modifier_groups.restaurant_id)
    )
  );

drop policy if exists "pmg_update_restaurant_admin" on public.product_modifier_groups;
create policy "pmg_update_restaurant_admin"
  on public.product_modifier_groups for update
  to authenticated
  using (
    is_restaurant_admin(product_modifier_groups.restaurant_id)
  )
  with check (
    exists (
      select 1
      from public.products p
      join public.modifier_groups mg on mg.id = product_modifier_groups.modifier_group_id
      where p.id = product_modifier_groups.product_id
        and p.restaurant_id = product_modifier_groups.restaurant_id
        and mg.restaurant_id = product_modifier_groups.restaurant_id
        and is_restaurant_admin(product_modifier_groups.restaurant_id)
    )
  );

drop policy if exists "pmg_delete_restaurant_admin" on public.product_modifier_groups;
create policy "pmg_delete_restaurant_admin"
  on public.product_modifier_groups for delete
  to authenticated
  using (
    is_restaurant_admin(product_modifier_groups.restaurant_id)
  );
