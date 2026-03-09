# Checkout Stripe Connect (Preparacion)

## Estado actual
- El checkout soporta `cash`, `card_on_delivery` y `stripe_online` (con compatibilidad legacy para `card_online`).
- El metodo online solo se muestra cuando el restaurante cumple:
  - `restaurants.stripe_connected = true`
  - `restaurants.stripe_charges_enabled = true`
  - `restaurants.online_payment_enabled = true`
- Si no se cumple o falta configuracion de plataforma, el checkout muestra estado controlado y no rompe flujos offline.

## Comportamiento temporal (sin Stripe real)
- Al seleccionar `Pago online (Stripe)` y pulsar `Pagar online`, se devuelve:
  - `Pago online aun no disponible`
- No se crea cobro real ni se redirige a Stripe.
- Efectivo y tarjeta al repartir siguen funcionando igual.

## Compatibilidad backend
- Antes de llamar al RPC de pedido, `stripe_online` se normaliza a `card_online` para mantener compatibilidad con backend/migraciones actuales.

## Punto de integracion futura
Archivo: `src/features/checkout/ui/steps/StepPayment.tsx`
- Funcion: `handleStripeCheckout`
- Reemplazar el bloque temporal por flujo real:
  1. Crear Payment Intent o Session en Edge Function.
  2. Confirmar pago (Checkout o Elements).
  3. Crear pedido definitivo tras pago exitoso (o reservar pedido y confirmar estado).

Archivo: `src/features/checkout/services/orderService.ts`
- Mantener normalizacion `stripe_online -> card_online` mientras backend no acepte `stripe_online` nativo.
