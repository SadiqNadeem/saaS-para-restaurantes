-- Enable RLS on profiles table
-- Existing policies (read own, update own) stay intact.
-- Add superadmin read-all policy.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Superadmin can read all profiles (e.g. to manage members)
CREATE POLICY "superadmin_read_all"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (is_superadmin());
