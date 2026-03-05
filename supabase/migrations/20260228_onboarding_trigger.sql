-- Auto-create a profiles row whenever a new user signs up via auth.
-- The existing on_auth_user_email_sync trigger only UPDATEs email — it never INSERTs.
-- This trigger fills that gap so self-registered users get a profile immediately.
--
-- profiles columns (live): id (pk), role (default 'customer'), created_at, email
-- NOTE: user_id does NOT exist as a column — omitted from INSERT.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'customer')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
