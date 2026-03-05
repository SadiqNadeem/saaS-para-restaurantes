-- SEO columns for restaurants
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS meta_title text;
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS meta_description text;
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS og_image_url text;
