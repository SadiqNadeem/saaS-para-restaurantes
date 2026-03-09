-- Add visual floor plan columns to restaurant_tables
-- (safe to re-run; all statements use IF NOT EXISTS)

ALTER TABLE restaurant_tables
  ADD COLUMN IF NOT EXISTS shape text NOT NULL DEFAULT 'square'
    CHECK (shape IN ('square','rectangle','circle')),
  ADD COLUMN IF NOT EXISTS pos_x integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pos_y integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS width integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS height integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS merged_with uuid[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_merged_child boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS merged_parent_id uuid REFERENCES restaurant_tables(id);

-- Auto-position existing tables in a 5-column grid so they don't all stack at 0,0
UPDATE restaurant_tables t
SET
  pos_x = (((ROW_NUMBER() OVER (PARTITION BY restaurant_id ORDER BY created_at) - 1) % 5) * 140 + 60),
  pos_y = ((((ROW_NUMBER() OVER (PARTITION BY restaurant_id ORDER BY created_at) - 1) / 5)) * 140 + 60)
FROM (
  SELECT id, restaurant_id, created_at
  FROM restaurant_tables
) sub
WHERE t.id = sub.id
  AND t.pos_x = 0
  AND t.pos_y = 0;
