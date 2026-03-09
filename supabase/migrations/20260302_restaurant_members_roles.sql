-- Extend restaurant_members with granular role fields
ALTER TABLE restaurant_members
ADD COLUMN IF NOT EXISTS access_role text NOT NULL DEFAULT 'staff'
  CHECK (access_role IN ('owner','admin','staff')),
ADD COLUMN IF NOT EXISTS job_role text
  CHECK (job_role IN ('manager','camarero','repartidor','cocina','cajero')),
ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS display_name text,
ADD COLUMN IF NOT EXISTS invited_at timestamptz,
ADD COLUMN IF NOT EXISTS joined_at timestamptz DEFAULT now();

-- Migrate existing 'role' column to access_role
UPDATE restaurant_members
SET access_role = CASE
  WHEN role = 'owner' THEN 'owner'
  WHEN role IN ('admin','manager') THEN 'admin'
  ELSE 'staff'
END
WHERE access_role = 'staff';
