-- Printing configuration columns for restaurant_settings
-- Run this migration in the Supabase SQL editor

ALTER TABLE public.restaurant_settings
  ADD COLUMN IF NOT EXISTS print_mode            text    NOT NULL DEFAULT 'browser',
  ADD COLUMN IF NOT EXISTS auto_print_web_orders boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_print_pos_orders boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS print_on_new_order    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS print_on_accept       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kitchen_printer_name  text,
  ADD COLUMN IF NOT EXISTS customer_printer_name text,
  ADD COLUMN IF NOT EXISTS print_width           text    NOT NULL DEFAULT '80mm',
  ADD COLUMN IF NOT EXISTS rawbt_enabled         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS local_print_url       text    NOT NULL DEFAULT 'http://127.0.0.1:18181/print';

-- print_mode values: 'browser' | 'desktop_app'
-- print_width values: '58mm' | '80mm'
