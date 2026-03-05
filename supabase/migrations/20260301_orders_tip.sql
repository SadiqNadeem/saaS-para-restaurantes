-- FIX 4: Add tip_amount column to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tip_amount numeric NOT NULL DEFAULT 0;
