-- Manual per-restaurant feature flags (superadmin-controlled)

CREATE TABLE IF NOT EXISTS public.restaurant_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  feature_key text NOT NULL CHECK (
    feature_key IN (
      'pos',
      'online_ordering',
      'tables',
      'table_qr',
      'staff_roles',
      'website_customization',
      'seo_tools',
      'coupons',
      'loyalty',
      'whatsapp_chatbot',
      'stripe_online_payments',
      'printer_auto',
      'metrics',
      'logs'
    )
  ),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_features_unique_restaurant_feature UNIQUE (restaurant_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_features_restaurant_id
  ON public.restaurant_features(restaurant_id);

ALTER TABLE public.restaurant_features ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_features TO authenticated;

DROP POLICY IF EXISTS "restaurant_features_select_member_or_superadmin" ON public.restaurant_features;
CREATE POLICY "restaurant_features_select_member_or_superadmin"
  ON public.restaurant_features
  FOR SELECT
  TO authenticated
  USING (
    is_superadmin()
    OR EXISTS (
      SELECT 1
      FROM public.restaurant_members rm
      WHERE rm.restaurant_id = restaurant_features.restaurant_id
        AND rm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "restaurant_features_manage_superadmin" ON public.restaurant_features;
CREATE POLICY "restaurant_features_manage_superadmin"
  ON public.restaurant_features
  FOR ALL
  TO authenticated
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE OR REPLACE FUNCTION public.set_restaurant_features_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restaurant_features_set_updated_at ON public.restaurant_features;
CREATE TRIGGER trg_restaurant_features_set_updated_at
BEFORE UPDATE ON public.restaurant_features
FOR EACH ROW
EXECUTE FUNCTION public.set_restaurant_features_updated_at();

-- Backfill existing restaurants with the default feature set enabled.
WITH feature_keys AS (
  SELECT unnest(
    ARRAY[
      'pos',
      'online_ordering',
      'tables',
      'table_qr',
      'staff_roles',
      'website_customization',
      'seo_tools',
      'coupons',
      'loyalty',
      'whatsapp_chatbot',
      'stripe_online_payments',
      'printer_auto',
      'metrics',
      'logs'
    ]::text[]
  ) AS feature_key
)
INSERT INTO public.restaurant_features (restaurant_id, feature_key, enabled)
SELECT r.id, fk.feature_key, true
FROM public.restaurants r
CROSS JOIN feature_keys fk
ON CONFLICT (restaurant_id, feature_key) DO NOTHING;

-- Auto-seed future restaurants with the same default feature set.
CREATE OR REPLACE FUNCTION public.seed_restaurant_features_for_new_restaurant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.restaurant_features (restaurant_id, feature_key, enabled)
  SELECT
    NEW.id,
    feature_key,
    true
  FROM unnest(
    ARRAY[
      'pos',
      'online_ordering',
      'tables',
      'table_qr',
      'staff_roles',
      'website_customization',
      'seo_tools',
      'coupons',
      'loyalty',
      'whatsapp_chatbot',
      'stripe_online_payments',
      'printer_auto',
      'metrics',
      'logs'
    ]::text[]
  ) AS feature_key
  ON CONFLICT (restaurant_id, feature_key) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_restaurant_features_on_restaurant_insert ON public.restaurants;
CREATE TRIGGER trg_seed_restaurant_features_on_restaurant_insert
AFTER INSERT ON public.restaurants
FOR EACH ROW
EXECUTE FUNCTION public.seed_restaurant_features_for_new_restaurant();
