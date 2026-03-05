-- FIX 2: Add estimated delivery/pickup time columns to restaurant_settings
ALTER TABLE restaurant_settings
  ADD COLUMN IF NOT EXISTS estimated_delivery_minutes integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS estimated_pickup_minutes integer NOT NULL DEFAULT 15;
