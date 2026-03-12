-- Persist selected signup plan for each restaurant.
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'starter';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'restaurants_plan_check'
      AND conrelid = 'public.restaurants'::regclass
  ) THEN
    ALTER TABLE public.restaurants
      ADD CONSTRAINT restaurants_plan_check
      CHECK (plan IN ('starter', 'pro', 'enterprise'));
  END IF;
END $$;
