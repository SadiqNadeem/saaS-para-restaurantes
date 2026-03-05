-- Add email column to profiles if it doesn't exist
alter table public.profiles
  add column if not exists email text;

-- Backfill existing rows from auth.users
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id
  and p.email is null;

-- Function to keep profiles.email in sync with auth.users.email
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set email = new.email
  where id = new.id;
  return new;
end;
$$;

-- Trigger fires on new user signup and on email change
drop trigger if exists on_auth_user_email_sync on auth.users;
create trigger on_auth_user_email_sync
  after insert or update of email on auth.users
  for each row
  execute function public.sync_profile_email();
