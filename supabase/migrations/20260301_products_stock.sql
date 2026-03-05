-- FIX 5: Basic stock control columns for products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS track_stock  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stock_quantity integer NOT NULL DEFAULT 0;
