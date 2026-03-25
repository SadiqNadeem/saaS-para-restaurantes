-- Add upsell flag to products
-- Products with is_upsell = true are shown in the checkout upsell modal
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_upsell boolean NOT NULL DEFAULT false;
