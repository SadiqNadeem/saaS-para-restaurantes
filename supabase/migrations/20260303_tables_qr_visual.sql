-- Phase 1: Extend restaurant_tables with QR token and visual floor plan fields

ALTER TABLE restaurant_tables
ADD COLUMN IF NOT EXISTS qr_token text UNIQUE DEFAULT gen_random_uuid()::text,
ADD COLUMN IF NOT EXISTS shape text NOT NULL DEFAULT 'square'
  CHECK (shape IN ('square','rectangle','circle')),
ADD COLUMN IF NOT EXISTS pos_x integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS pos_y integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS width integer NOT NULL DEFAULT 100,
ADD COLUMN IF NOT EXISTS height integer NOT NULL DEFAULT 100,
ADD COLUMN IF NOT EXISTS merged_with uuid[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS is_merged_child boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS merged_parent_id uuid REFERENCES restaurant_tables(id);

-- Generate qr_token for existing tables that have none
UPDATE restaurant_tables
SET qr_token = gen_random_uuid()::text
WHERE qr_token IS NULL;
