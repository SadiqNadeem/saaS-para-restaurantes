ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS custom_domain text UNIQUE;
