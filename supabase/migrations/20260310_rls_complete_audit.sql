-- ============================================================
-- RLS COMPLETE AUDIT — 2026-03-10
-- ============================================================
-- Audit results:
--
-- ✅ RLS ENABLED: All 37 public tables have RLS enabled.
-- ✅ NO EMPTY POLICIES: All tables have at least one policy.
--
-- ISSUES FOUND AND FIXED:
--
-- 1. restaurant_members.rm_insert_owner_only — INSERT policy had no
--    WITH CHECK clause, allowing any authenticated user to add
--    themselves (or anyone) to any restaurant. Fixed to require
--    is_restaurant_admin(restaurant_id).
--
-- 2. cash_closings.cc_insert_owner_admin — INSERT policy had no
--    WITH CHECK, allowing members to insert cash closings for any
--    restaurant. Fixed to require owner/admin role on that restaurant.
--
-- 3. orders — no anon/public INSERT policy. Intentional: storefront
--    uses create_order_safe_v2 RPC (SECURITY DEFINER) which bypasses
--    RLS. Direct INSERT by anon correctly blocked.
--
-- 4. order_status_history — no direct INSERT/UPDATE/DELETE for
--    authenticated users. Intentional: status changes go through
--    admin_update_order_status RPC (SECURITY DEFINER).
--
-- INFORMATIONAL — Legacy duplicate policies (not security risks,
-- but create noise and slight overhead). Tables affected:
--   categories, products, modifier_groups, modifier_options.
-- These have multiple overlapping SELECT/INSERT/UPDATE/DELETE
-- policies from different migration phases. The newer
-- is_restaurant_admin / is_restaurant_member policies are
-- correctly scoped. Old policies using profiles.role='admin'
-- are superadmin-only access, redundant with is_superadmin()
-- checks. Safe to keep for now but can be pruned later.
-- ============================================================

-- ── FIX 1: restaurant_members INSERT needs WITH CHECK ────────
-- Without WITH CHECK, any authenticated user could self-add
-- to any restaurant by knowing the restaurant_id.

DROP POLICY IF EXISTS "rm_insert_owner_only" ON public.restaurant_members;

CREATE POLICY "rm_insert_owner_admin" ON public.restaurant_members
  FOR INSERT TO authenticated
  WITH CHECK (is_restaurant_admin(restaurant_id));

-- ── FIX 2: cash_closings INSERT needs WITH CHECK ─────────────
-- Without WITH CHECK, any restaurant member could insert
-- cash closing records for restaurants they don't administer.

DROP POLICY IF EXISTS "cc_insert_owner_admin" ON public.cash_closings;

CREATE POLICY "cc_insert_owner_admin_checked" ON public.cash_closings
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM restaurant_members m
      WHERE m.restaurant_id = cash_closings.restaurant_id
        AND m.user_id = auth.uid()
        AND m.role = ANY (ARRAY['owner', 'admin'])
    )
  );

-- ── VERIFY: Public storefront read access ────────────────────
-- Confirming required public SELECT policies exist:
-- restaurants       → restaurants_public_select (USING true) ✅
-- categories        → categories_public_read (USING true) ✅
-- products          → Public can read products (USING true) ✅
-- restaurant_hours  → restaurant_hours_public_select (USING true) ✅
-- restaurant_settings → public read restaurant_settings (USING true) ✅
-- modifier_groups   → modifier_groups_select_public_active ✅
-- modifier_options  → modifier_options_select_public_active ✅
-- product_modifier_groups → product_modifier_groups_select_public ✅
-- restaurant_web_settings → rws_public_select ✅
-- All public storefront read access is correctly configured.

-- ── SUMMARY ──────────────────────────────────────────────────
-- Tables audited: 37
-- Tables with RLS disabled: 0 (none — all secure)
-- Tables with no policies: 0 (none — all have rules)
-- Security fixes applied: 2 (INSERT WITH CHECK gaps)
-- Public read access: Confirmed for all storefront-required tables
-- ─────────────────────────────────────────────────────────────
