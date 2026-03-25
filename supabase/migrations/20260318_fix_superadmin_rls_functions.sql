-- Fix: superadmin users can now perform write operations on any restaurant.
-- Previously, is_restaurant_admin and is_restaurant_member only checked
-- restaurant_members, so superadmins browsing other restaurants got RLS errors
-- on INSERT/UPDATE/DELETE even though AdminGate granted them owner-level access.

CREATE OR REPLACE FUNCTION public.is_restaurant_admin(_restaurant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $f$
  SELECT (
    EXISTS (
      SELECT 1 FROM restaurant_members rm
      WHERE rm.restaurant_id = _restaurant_id
        AND rm.user_id = auth.uid()
        AND rm.access_role IN ('owner', 'admin')
        AND rm.is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'superadmin'
    )
  );
$f$;

CREATE OR REPLACE FUNCTION public.is_restaurant_member(_restaurant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $f$
  SELECT (
    EXISTS (
      SELECT 1 FROM restaurant_members rm
      WHERE rm.restaurant_id = _restaurant_id
        AND rm.user_id = auth.uid()
        AND rm.is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'superadmin'
    )
  );
$f$;
