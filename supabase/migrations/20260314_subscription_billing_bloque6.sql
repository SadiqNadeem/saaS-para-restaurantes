-- ═══════════════════════════════════════════════════════════════════════════
-- Migración: 20260314_subscription_billing_bloque6.sql
-- Sistema de suscripciones SaaS — Bloque 6
-- Idempotente: usa IF NOT EXISTS / ON CONFLICT DO NOTHING / DROP IF EXISTS
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Tabla de planes ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id                    text        PRIMARY KEY,
  name                  text        NOT NULL,
  description           text,
  price_monthly_cents   integer     NOT NULL,
  stripe_price_id       text,        -- se rellena desde el dashboard de Stripe
  features              jsonb       NOT NULL DEFAULT '[]',
  is_active             boolean     NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plans_public_read"    ON public.subscription_plans;
DROP POLICY IF EXISTS "plans_superadmin_all" ON public.subscription_plans;

-- Cualquier visitante puede leer los planes activos (página de pricing pública)
CREATE POLICY "plans_public_read" ON public.subscription_plans
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

-- Solo superadmin puede crear/editar/eliminar planes
CREATE POLICY "plans_superadmin_all" ON public.subscription_plans
  FOR ALL TO authenticated
  USING (is_superadmin())
  WITH CHECK (is_superadmin());


-- ── 2. Seed: tres planes reales ─────────────────────────────────────────────

INSERT INTO public.subscription_plans (id, name, description, price_monthly_cents, features)
VALUES
  (
    'starter',
    'Starter',
    'Ideal para empezar',
    2900,
    '["TPV básico", "Pedidos online", "1 usuario", "Soporte por email"]'::jsonb
  ),
  (
    'pro',
    'Pro',
    'Para restaurantes en crecimiento',
    5900,
    '["Todo lo de Starter", "Usuarios ilimitados", "Estadísticas avanzadas", "Soporte prioritario"]'::jsonb
  ),
  (
    'enterprise',
    'Enterprise',
    'Para grupos y cadenas',
    9900,
    '["Todo lo de Pro", "Personalización de marca", "Account manager dedicado", "SLA garantizado"]'::jsonb
  )
ON CONFLICT (id) DO NOTHING;


-- ── 3. Columnas de suscripción en restaurants ────────────────────────────────
--
--  stripe_billing_customer_id  — cliente de Stripe Billing (≠ stripe_account_id
--    que es de Connect). UNIQUE para evitar duplicados.
--  stripe_subscription_id      — sub_xxx de Stripe Billing. UNIQUE.
--  subscription_current_period_end — cuándo vence el periodo actual (viene
--    del webhook de Stripe, no lo calculamos nosotros).
--  trial_ends_at               — 14 días desde la migración para todos los
--    restaurantes existentes; DEFAULT para los nuevos.

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS subscription_plan_id
    text REFERENCES public.subscription_plans(id),
  ADD COLUMN IF NOT EXISTS subscription_status
    text NOT NULL DEFAULT 'trialing',
  ADD COLUMN IF NOT EXISTS stripe_billing_customer_id
    text UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id
    text UNIQUE,
  ADD COLUMN IF NOT EXISTS subscription_current_period_end
    timestamptz,
  ADD COLUMN IF NOT EXISTS trial_ends_at
    timestamptz NOT NULL DEFAULT (now() + interval '14 days');


-- ── 4. Check constraint en subscription_status ────────────────────────────────

ALTER TABLE public.restaurants
  DROP CONSTRAINT IF EXISTS restaurants_subscription_status_check;

ALTER TABLE public.restaurants
  ADD CONSTRAINT restaurants_subscription_status_check
  CHECK (subscription_status IN (
    'trialing',   -- trial activo, sin tarjeta
    'active',     -- suscripción pagada y al día
    'past_due',   -- fallo de cobro, Stripe reintentando
    'canceled',   -- cancelada, acceso hasta fin de periodo
    'unpaid'      -- reintentos agotados, acceso bloqueado
  ));


-- ── 5. Índices para consultas frecuentes ────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_restaurants_subscription_status
  ON public.restaurants (subscription_status);

CREATE INDEX IF NOT EXISTS idx_restaurants_stripe_billing_customer
  ON public.restaurants (stripe_billing_customer_id)
  WHERE stripe_billing_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_restaurants_stripe_subscription_id
  ON public.restaurants (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
