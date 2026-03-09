-- ─── restaurant_tables ───────────────────────────────────────────────────────
-- Tracks physical tables/spots for dine-in orders

CREATE TABLE IF NOT EXISTS restaurant_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  zone text NOT NULL DEFAULT 'Sala',
  capacity integer,
  status text NOT NULL DEFAULT 'free'
    CHECK (status IN ('free','occupied','closing')),
  current_order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE restaurant_tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage tables" ON restaurant_tables FOR ALL USING (
  EXISTS (
    SELECT 1 FROM restaurant_members
    WHERE restaurant_id = restaurant_tables.restaurant_id
      AND user_id = auth.uid()
  )
);

CREATE POLICY "public read tables" ON restaurant_tables
  FOR SELECT USING (true);

-- Add table_id to orders so a dine-in order can be linked to a table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_id uuid
  REFERENCES restaurant_tables(id) ON DELETE SET NULL;

-- order_type is plain text (not an enum) so dine_in already works

-- Seed 6 demo tables for every existing restaurant
INSERT INTO restaurant_tables (restaurant_id, name, zone, capacity, position)
SELECT id, 'Mesa ' || n, 'Sala', 4, n
FROM restaurants, generate_series(1,6) AS n
ON CONFLICT DO NOTHING;
