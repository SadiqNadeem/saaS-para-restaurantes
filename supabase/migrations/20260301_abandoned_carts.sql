CREATE TABLE abandoned_carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  customer_email text,
  customer_name text,
  customer_phone text,
  cart_items jsonb NOT NULL DEFAULT '[]',
  cart_total numeric NOT NULL DEFAULT 0,
  order_type text,
  session_id text,
  recovered boolean NOT NULL DEFAULT false,
  recovered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE abandoned_carts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read abandoned carts" ON abandoned_carts FOR ALL USING (
  EXISTS (SELECT 1 FROM restaurant_members
  WHERE restaurant_id = abandoned_carts.restaurant_id AND user_id = auth.uid())
);
CREATE POLICY "public insert abandoned carts" ON abandoned_carts
FOR INSERT WITH CHECK (true);
CREATE POLICY "public update abandoned carts" ON abandoned_carts
FOR UPDATE USING (true);
