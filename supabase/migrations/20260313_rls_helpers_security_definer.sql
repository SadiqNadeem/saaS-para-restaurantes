-- Fix: make all RLS helper functions SECURITY DEFINER.
--
-- Root cause: these functions were SECURITY INVOKER (default).
-- When called inside an RLS policy on table A, they query table B
-- (restaurant_members / profiles) which also has RLS enabled.
-- PostgreSQL 17 evaluates the nested RLS policies under the calling role,
-- which can fail or produce unexpected results for INSERT/UPDATE operations.
--
-- SECURITY DEFINER makes the functions run as the function owner (postgres),
-- bypassing nested RLS while still using auth.uid() for filtering.
-- SET search_path = public prevents search_path injection attacks.
--
-- This is the Supabase-recommended pattern for RLS helper functions:
-- https://supabase.com/docs/guides/database/postgres/row-level-security

CREATE OR REPLACE FUNCTION public.is_restaurant_admin(_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM restaurant_members rm
    WHERE rm.restaurant_id = _restaurant_id
      AND rm.user_id = auth.uid()
      AND rm.role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_restaurant_member(_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM restaurant_members rm
    WHERE rm.restaurant_id = _restaurant_id
      AND rm.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = auth.uid()
      AND role = 'superadmin'
  );
$$;
