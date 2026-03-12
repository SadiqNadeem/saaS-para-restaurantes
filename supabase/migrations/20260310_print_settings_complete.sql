-- ============================================================
-- PRINT SETTINGS COMPLETE — 2026-03-10
-- ============================================================
-- Adds all missing print-related columns to restaurant_settings.
-- Columns already used in frontend code but missing from DB:
--   auto_print_pos_orders, print_on_new_order, print_on_accept,
--   kitchen_printer_name, customer_printer_name, print_width,
--   rawbt_enabled, local_print_url
-- New columns for redesigned printing UI:
--   print_kitchen_separate, desktop_app_url,
--   print_sound_enabled, print_retry_enabled,
--   auto_print_on_accept, auto_print_pos
-- ============================================================

ALTER TABLE public.restaurant_settings
  -- Already-used-in-code columns now added to DB:
  ADD COLUMN IF NOT EXISTS auto_print_pos_orders    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS print_on_new_order       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS print_on_accept          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kitchen_printer_name     text,
  ADD COLUMN IF NOT EXISTS customer_printer_name    text,
  ADD COLUMN IF NOT EXISTS print_width              text    NOT NULL DEFAULT '80mm'
    CHECK (print_width IN ('58mm', '80mm')),
  ADD COLUMN IF NOT EXISTS rawbt_enabled            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS local_print_url          text,

  -- New columns for redesigned UI:
  ADD COLUMN IF NOT EXISTS print_kitchen_separate   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS desktop_app_url          text    NOT NULL DEFAULT 'http://127.0.0.1:18181',
  ADD COLUMN IF NOT EXISTS print_sound_enabled      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS print_retry_enabled      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_print_on_accept     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_print_pos           boolean NOT NULL DEFAULT false;
