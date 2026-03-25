-- ─── Onboarding progress tracking ────────────────────────────────────────────
-- Tracks where each restaurant is in the onboarding wizard so the banner
-- can prompt the owner to continue where they left off.

ALTER TABLE public.restaurant_settings
  ADD COLUMN IF NOT EXISTS onboarding_completed  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_step       smallint NOT NULL DEFAULT 0;

-- ─── Restaurant branding ──────────────────────────────────────────────────────
-- brand_color: hex string e.g. "#4ec580" — overrides the default green in storefront
-- cuisine_type: free-text description shown in SEO and on the public menu

ALTER TABLE public.restaurant_settings
  ADD COLUMN IF NOT EXISTS brand_color   text,
  ADD COLUMN IF NOT EXISTS cuisine_type  text;

-- Back-fill: any restaurant that has products/categories is past step 2
UPDATE public.restaurant_settings rs
SET onboarding_completed = true,
    onboarding_step = 4
WHERE EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.restaurant_id = rs.restaurant_id
  LIMIT 1
);
