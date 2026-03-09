# Stripe Connect Setup (Prepared / Placeholder)

This project is now prepared for Stripe Connect without requiring real Stripe keys yet.
Current checkout with `cash` and `card_on_delivery` remains unchanged.

## 1. Database changes

Migration added:
- `supabase/migrations/20260308_stripe_connect_columns.sql`

Columns added to `public.restaurants`:
- `stripe_account_id text`
- `stripe_connected boolean not null default false`
- `stripe_charges_enabled boolean not null default false`
- `stripe_payouts_enabled boolean not null default false`
- `stripe_onboarding_completed boolean not null default false`
- `stripe_connect_status text`
- `stripe_last_sync_at timestamptz`
- `online_payment_enabled boolean not null default false`

Indexes added:
- `restaurants_stripe_account_id_idx` (partial, non-null)
- `restaurants_online_payment_enabled_idx`

## 2. RLS policies (admin/owner scope)

Migration added:
- `supabase/migrations/20260308_stripe_connect_rls.sql`

Policies added on `public.restaurants` for authenticated users:
- `restaurants_stripe_select_admin`
- `restaurants_stripe_update_admin`

Both policies allow access only when user is an active restaurant member with role `owner` or `admin`.

## 3. Placeholder Edge Functions added

- `supabase/functions/create-stripe-connect-link/index.ts`
- `supabase/functions/handle-stripe-connect-callback/index.ts`
- `supabase/functions/create-restaurant-payment-intent/index.ts`
- `supabase/functions/handle-stripe-webhook/index.ts`
- Shared helpers:
  - `supabase/functions/_shared/http.ts`
  - `supabase/functions/_shared/stripeConfig.ts`

Behavior now:
- If Stripe env vars are missing, functions return controlled error:
  - `error: "Stripe no configurado"`
  - `code: "STRIPE_NOT_CONFIGURED"`
- If env vars exist but implementation is pending, functions return `501` placeholder responses.

## 4. Existing Stripe session function adjusted

Updated:
- `supabase/functions/create-stripe-session/index.ts`

Change:
- Missing env vars now return controlled `503 STRIPE_NOT_CONFIGURED` response (instead of generic server error).

## 5. Frontend env preparation

Updated:
- `src/features/checkout/ui/steps/StepPayment.tsx`

Change:
- Online card option now requires both:
  - `VITE_STRIPE_ENABLED === "true"`
  - `VITE_STRIPE_PUBLISHABLE_KEY` present

This keeps current behavior safe when Stripe is not configured.

## 6. Required environment variables (not set yet)

Server:
- `STRIPE_SECRET_KEY`
- `STRIPE_CLIENT_ID`
- `STRIPE_WEBHOOK_SECRET`

Client:
- `VITE_STRIPE_PUBLISHABLE_KEY`

Optional existing flags:
- `VITE_STRIPE_ENABLED`

## 7. What is still missing for real activation

1. Create Stripe account(s) and platform Connect setup.
2. Implement real logic in new Edge Functions:
   - account onboarding link creation
   - callback persistence into `restaurants`
   - payment intent creation with connected account transfer settings
   - webhook signature verification and order/payment synchronization
3. Wire admin UI to display connect status and trigger onboarding.
4. Use `online_payment_enabled` + connect status checks in checkout availability logic.
5. Add integration tests for payment paths and webhook idempotency.
