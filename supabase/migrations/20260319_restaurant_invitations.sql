-- ─── restaurant_invitations ───────────────────────────────────────────────────
-- Token-based invitation links for team members.
-- Owner / admin generates a link; recipient visits it and gets added to the team.

CREATE TABLE IF NOT EXISTS public.restaurant_invitations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  token         text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  access_role   text NOT NULL DEFAULT 'staff'
                  CHECK (access_role IN ('owner','admin','staff')),
  job_role      text
                  CHECK (job_role IN ('manager','camarero','repartidor','cocina','cajero')),
  invited_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note          text,                         -- optional personal note
  expires_at    timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  used_at       timestamptz,
  used_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Index for looking up invitations by restaurant
CREATE INDEX IF NOT EXISTS idx_invitations_restaurant_id
  ON public.restaurant_invitations (restaurant_id);

CREATE INDEX IF NOT EXISTS idx_invitations_used_at
  ON public.restaurant_invitations (used_at)
  WHERE used_at IS NULL;

-- Public lookup by token (anon can read to display the invite page)
ALTER TABLE public.restaurant_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_invitation_by_token"
  ON public.restaurant_invitations FOR SELECT
  USING (true);   -- token is the secret; anyone with the URL can read it

CREATE POLICY "admins_insert_invitations"
  ON public.restaurant_invitations FOR INSERT
  TO authenticated
  WITH CHECK (is_restaurant_admin(restaurant_id));

CREATE POLICY "admins_delete_invitations"
  ON public.restaurant_invitations FOR DELETE
  TO authenticated
  USING (is_restaurant_admin(restaurant_id));

-- Allow the invited user to mark invitation as used
CREATE POLICY "auth_use_invitation"
  ON public.restaurant_invitations FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
