-- Backfill access_role from existing role column for all restaurant_members rows
-- that are missing or incorrectly set.
--
-- Context: access_role column was added after the initial restaurant_members table.
-- Rows created before the column existed (or with the wrong default) may have NULL
-- or 'staff' even when role = 'owner'. This migration corrects all such rows.
--
-- Safe to re-run: WHERE clause targets only rows that need fixing.

UPDATE restaurant_members
SET access_role = CASE
  WHEN role = 'owner'                    THEN 'owner'
  WHEN role IN ('admin', 'manager')      THEN 'admin'
  ELSE                                        'staff'
END
WHERE access_role IS NULL
   OR (access_role = 'staff' AND role = 'owner');

-- Verify result
SELECT rm.access_role, rm.role, r.name AS restaurant
FROM restaurant_members rm
JOIN restaurants r ON r.id = rm.restaurant_id
ORDER BY r.name, rm.access_role;
