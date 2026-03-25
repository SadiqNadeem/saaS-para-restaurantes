-- ─── Custom domain verification status ───────────────────────────────────────
-- Adds a status enum and verified flag so the UI can show DNS check results.

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS custom_domain_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_domain_status   text NOT NULL DEFAULT 'pending'
    CHECK (custom_domain_status IN ('pending','verified','error'));

-- When custom_domain is cleared, reset verification
CREATE OR REPLACE FUNCTION public.reset_custom_domain_verification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.custom_domain IS DISTINCT FROM OLD.custom_domain THEN
    NEW.custom_domain_verified := false;
    NEW.custom_domain_status   := 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reset_domain_verification ON public.restaurants;
CREATE TRIGGER trg_reset_domain_verification
  BEFORE UPDATE ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION public.reset_custom_domain_verification();
