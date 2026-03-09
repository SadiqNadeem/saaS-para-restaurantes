-- restaurant_features
-- Stores per-restaurant feature flags (enabled/disabled per plan or manual toggle).
-- If a row is missing for a (restaurant_id, feature_key) pair, the app defaults to enabled.

CREATE TABLE IF NOT EXISTS public.restaurant_features (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  feature_key    text NOT NULL,
  enabled        boolean NOT NULL DEFAULT true,
  updated_at     timestamptz DEFAULT now(),
  UNIQUE (restaurant_id, feature_key)
);

ALTER TABLE public.restaurant_features ENABLE ROW LEVEL SECURITY;

-- Members can read their restaurant's features
CREATE POLICY "members_read_features"
  ON public.restaurant_features FOR SELECT TO authenticated
  USING (is_restaurant_member(restaurant_id));

-- Admins can upsert features (used by superadmin / future plan management)
CREATE POLICY "admins_write_features"
  ON public.restaurant_features FOR ALL TO authenticated
  USING (is_restaurant_admin(restaurant_id))
  WITH CHECK (is_restaurant_admin(restaurant_id));

-- Seed: insert all features as enabled for every existing restaurant.
-- Uses INSERT … ON CONFLICT DO NOTHING so this is safe to re-run.
INSERT INTO public.restaurant_features (restaurant_id, feature_key, enabled)
SELECT r.id, f.feature_key, true
FROM public.restaurants r
CROSS JOIN (
  VALUES
    ('pos'),
    ('online_ordering'),
    ('tables'),
    ('table_qr'),
    ('staff_roles'),
    ('website_customization'),
    ('seo_tools'),
    ('coupons'),
    ('loyalty'),
    ('whatsapp_chatbot'),
    ('stripe_online_payments'),
    ('printer_auto'),
    ('metrics'),
    ('logs')
) AS f(feature_key)
ON CONFLICT (restaurant_id, feature_key) DO NOTHING;
