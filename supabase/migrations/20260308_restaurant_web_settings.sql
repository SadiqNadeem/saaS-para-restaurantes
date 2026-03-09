-- Add missing columns to restaurant_web_settings
-- These fields are shown in the admin form but were never persisted to DB.
ALTER TABLE public.restaurant_web_settings
  ADD COLUMN IF NOT EXISTS banner_title text,
  ADD COLUMN IF NOT EXISTS banner_subtitle text,
  ADD COLUMN IF NOT EXISTS button_color text,
  ADD COLUMN IF NOT EXISTS add_button_variant text NOT NULL DEFAULT 'solid';

-- Create storage bucket for restaurant assets (logo, banner images)
INSERT INTO storage.buckets (id, name, public)
VALUES ('restaurant-assets', 'restaurant-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone (anon) to read images — needed for storefront to display them
CREATE POLICY IF NOT EXISTS "public read restaurant-assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'restaurant-assets');

-- Allow authenticated users to upload/update images
CREATE POLICY IF NOT EXISTS "auth upload restaurant-assets"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'restaurant-assets' AND auth.role() = 'authenticated');

CREATE POLICY IF NOT EXISTS "auth update restaurant-assets"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'restaurant-assets' AND auth.role() = 'authenticated');

CREATE POLICY IF NOT EXISTS "auth delete restaurant-assets"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'restaurant-assets' AND auth.role() = 'authenticated');
