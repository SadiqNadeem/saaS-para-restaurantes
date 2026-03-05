alter table public.restaurant_members enable row level security;

grant select on public.restaurant_members to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'restaurant_members'
      and policyname = 'restaurant_members_select_own'
  ) then
    create policy restaurant_members_select_own
      on public.restaurant_members
      for select
      to authenticated
      using (user_id = auth.uid());
  end if;
end
$$;
