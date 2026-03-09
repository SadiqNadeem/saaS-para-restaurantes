CREATE TABLE IF NOT EXISTS restaurant_floor_walls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  x1 integer NOT NULL,
  y1 integer NOT NULL,
  x2 integer NOT NULL,
  y2 integer NOT NULL,
  thickness integer NOT NULL DEFAULT 8,
  color text NOT NULL DEFAULT '#64748b',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE restaurant_floor_walls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage walls" ON restaurant_floor_walls FOR ALL USING (
  EXISTS (
    SELECT 1 FROM restaurant_members
    WHERE restaurant_id = restaurant_floor_walls.restaurant_id
      AND user_id = auth.uid()
  )
);
