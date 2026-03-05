alter table public.addresses add column if not exists is_building boolean not null default false;
alter table public.addresses add column if not exists portal text;
alter table public.addresses add column if not exists floor text;
alter table public.addresses add column if not exists door text;
alter table public.addresses add column if not exists block text;
alter table public.addresses add column if not exists stair text;
alter table public.addresses add column if not exists instructions text;
