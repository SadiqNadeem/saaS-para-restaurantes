create extension if not exists pgcrypto;

create table if not exists public.product_modifier_groups (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  product_id uuid not null,
  modifier_group_id uuid not null,
  created_at timestamptz not null default now()
);

alter table public.product_modifier_groups
  add column if not exists restaurant_id uuid,
  add column if not exists product_id uuid,
  add column if not exists modifier_group_id uuid,
  add column if not exists created_at timestamptz default now();

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

alter table public.product_modifier_groups enable row level security;

drop policy if exists "product_modifier_groups_select_public" on public.product_modifier_groups;
drop policy if exists "pmg_select_restaurant_member" on public.product_modifier_groups;
create policy "pmg_select_restaurant_member"
  on public.product_modifier_groups
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = product_modifier_groups.restaurant_id
        and rm.user_id = auth.uid()
    )
  );

drop policy if exists "pmg_insert_restaurant_admin" on public.product_modifier_groups;
drop policy if exists "pmg_insert_restaurant_member" on public.product_modifier_groups;
create policy "pmg_insert_restaurant_member"
  on public.product_modifier_groups
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = product_modifier_groups.restaurant_id
        and rm.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.products p
      where p.id = product_modifier_groups.product_id
        and p.restaurant_id = product_modifier_groups.restaurant_id
    )
    and exists (
      select 1
      from public.modifier_groups mg
      where mg.id = product_modifier_groups.modifier_group_id
        and mg.restaurant_id = product_modifier_groups.restaurant_id
    )
  );

drop policy if exists "pmg_delete_restaurant_admin" on public.product_modifier_groups;
drop policy if exists "pmg_delete_restaurant_member" on public.product_modifier_groups;
create policy "pmg_delete_restaurant_member"
  on public.product_modifier_groups
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = product_modifier_groups.restaurant_id
        and rm.user_id = auth.uid()
    )
  );
