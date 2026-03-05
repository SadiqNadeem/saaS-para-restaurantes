ALTER TABLE orders ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'web';
CREATE INDEX IF NOT EXISTS idx_orders_source ON orders(source);
COMMENT ON COLUMN orders.source IS 'Origin of order: web | pos';
