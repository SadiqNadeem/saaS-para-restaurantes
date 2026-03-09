-- Prepare restaurants for future Stripe Connect rollout (idempotent)
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS stripe_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_connected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_onboarding_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_status text,
  ADD COLUMN IF NOT EXISTS stripe_last_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS online_payment_enabled boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS restaurants_stripe_account_id_idx
  ON public.restaurants (stripe_account_id)
  WHERE stripe_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS restaurants_online_payment_enabled_idx
  ON public.restaurants (online_payment_enabled);
