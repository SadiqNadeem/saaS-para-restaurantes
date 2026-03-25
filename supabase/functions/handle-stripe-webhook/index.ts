import Stripe from "https://esm.sh/stripe@14.25.0?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import {
  getStripeEnvConfig,
  missingStripeEnv,
  stripeNotConfiguredResponse,
} from "../_shared/stripeConfig.ts";
import { corsHeaders, jsonResponse } from "../_shared/http.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  const env = getStripeEnvConfig();
  const missing = missingStripeEnv(env, ["secretKey", "webhookSecret"]);
  if (missing.length > 0) return stripeNotConfiguredResponse(missing);

  // 1. Leer body RAW antes de cualquier parse (Stripe requiere el payload sin modificar)
  const signature = req.headers.get("stripe-signature");
  if (!signature) return jsonResponse(400, { error: "Missing stripe-signature header" });

  const payload = await req.text();
  if (!payload) return jsonResponse(400, { error: "Empty webhook body" });

  // 2. Verificar firma criptográfica — rechazar si no es válida
  const stripe = new Stripe(env.secretKey, { apiVersion: "2024-06-20" });
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(payload, signature, env.webhookSecret);
  } catch (err) {
    console.error("[stripe-webhook] Firma inválida:", String(err));
    return jsonResponse(400, { error: "Invalid stripe signature" });
  }

  // 3. Despachar según tipo de evento
  const billingEvents = [
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.payment_failed",
  ];
  const paymentEvents = ["checkout.session.completed", "payment_intent.succeeded"];
  const connectEvents = ["account.updated", "account.application.deauthorized"];

  const isKnownEvent =
    billingEvents.includes(event.type) ||
    paymentEvents.includes(event.type) ||
    connectEvents.includes(event.type);

  if (!isKnownEvent) {
    return jsonResponse(200, { received: true, skipped: event.type });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  // ── 4a. Eventos de Stripe Connect ─────────────────────────────────────────

  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account;
    const chargesEnabled = account.charges_enabled === true;
    const payoutsEnabled = account.payouts_enabled === true;
    const detailsSubmitted = account.details_submitted === true;
    const status = chargesEnabled && payoutsEnabled ? "active"
      : detailsSubmitted ? "connected_not_chargeable"
      : "onboarding_pending";

    const { error: updateErr } = await supabase
      .from("restaurants")
      .update({
        stripe_connected: true,
        stripe_charges_enabled: chargesEnabled,
        stripe_payouts_enabled: payoutsEnabled,
        stripe_onboarding_completed: detailsSubmitted,
        stripe_connect_status: status,
        stripe_last_sync_at: new Date().toISOString(),
      })
      .eq("stripe_account_id", account.id);

    if (updateErr) {
      console.error("[stripe-webhook] account.updated error:", updateErr);
    } else {
      console.log(`[stripe-webhook] account.updated ${account.id} → status=${status}`);
    }
    return jsonResponse(200, { received: true, type: event.type, account_id: account.id });
  }

  if (event.type === "account.application.deauthorized") {
    const account = event.data.object as { id: string };

    const { error: updateErr } = await supabase
      .from("restaurants")
      .update({
        stripe_connected: false,
        stripe_charges_enabled: false,
        stripe_payouts_enabled: false,
        stripe_onboarding_completed: false,
        stripe_connect_status: "deauthorized",
        online_payment_enabled: false,
        stripe_last_sync_at: new Date().toISOString(),
      })
      .eq("stripe_account_id", account.id);

    if (updateErr) {
      console.error("[stripe-webhook] deauthorized error:", updateErr);
    } else {
      console.log(`[stripe-webhook] account.application.deauthorized ${account.id}`);
    }
    return jsonResponse(200, { received: true, type: event.type, account_id: account.id });
  }

  // ── 4b. Eventos de Stripe Billing ─────────────────────────────────────────

  // checkout.session.completed con mode=subscription → nueva suscripción confirmada
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    if (session.mode === "subscription") {
      const restaurantId = session.metadata?.restaurant_id ?? null;
      const planId = session.metadata?.plan_id ?? null;
      const subscriptionId = typeof session.subscription === "string"
        ? session.subscription
        : null;

      if (!restaurantId || !subscriptionId) {
        console.error(
          "[stripe-webhook] checkout.session subscription: faltan metadata",
          { restaurantId, subscriptionId, event_id: event.id }
        );
        return jsonResponse(200, { received: true, error: "missing_billing_metadata" });
      }

      // Consultar la suscripción para obtener current_period_end
      let periodEnd: string | null = null;
      try {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        periodEnd = new Date(sub.current_period_end * 1000).toISOString();
      } catch (err) {
        console.error("[stripe-webhook] Error leyendo suscripción de Stripe:", String(err));
      }

      const { error: updateErr } = await supabase
        .from("restaurants")
        .update({
          subscription_status: "active",
          subscription_plan_id: planId,
          stripe_subscription_id: subscriptionId,
          ...(periodEnd ? { subscription_current_period_end: periodEnd } : {}),
        })
        .eq("id", restaurantId);

      if (updateErr) {
        console.error("[stripe-webhook] Error activando suscripción:", updateErr);
        return jsonResponse(500, { error: "db_update_failed" });
      }

      console.log(
        `[stripe-webhook] Suscripción activada: restaurante=${restaurantId} ` +
        `sub=${subscriptionId} plan=${planId}`
      );
      return jsonResponse(200, {
        received: true,
        type: event.type,
        restaurant_id: restaurantId,
        subscription_id: subscriptionId,
      });
    }

    // mode === "payment" → continúa al bloque 4c de pedidos (fall-through)
  }

  if (event.type === "customer.subscription.updated") {
    const sub = event.data.object as Stripe.Subscription;
    const restaurantId = sub.metadata?.restaurant_id ?? null;

    if (!restaurantId) {
      console.error(
        "[stripe-webhook] subscription.updated sin restaurant_id en metadata:",
        event.id
      );
      return jsonResponse(200, { received: true, error: "missing_restaurant_id" });
    }

    // Mapear estado de Stripe a nuestros valores
    const stripeStatus = sub.status;
    const ourStatus = ((): string => {
      if (stripeStatus === "active" || stripeStatus === "trialing") return "active";
      if (stripeStatus === "past_due") return "past_due";
      if (stripeStatus === "canceled") return "canceled";
      if (stripeStatus === "unpaid") return "unpaid";
      return "past_due"; // incomplete / incomplete_expired
    })();

    const periodEnd = new Date(sub.current_period_end * 1000).toISOString();

    const { error: updateErr } = await supabase
      .from("restaurants")
      .update({
        subscription_status: ourStatus,
        subscription_current_period_end: periodEnd,
      })
      .eq("id", restaurantId);

    if (updateErr) {
      console.error("[stripe-webhook] subscription.updated error:", updateErr);
    } else {
      console.log(
        `[stripe-webhook] subscription.updated restaurante=${restaurantId} ` +
        `stripe_status=${stripeStatus} → our_status=${ourStatus}`
      );
    }
    return jsonResponse(200, {
      received: true,
      type: event.type,
      restaurant_id: restaurantId,
      status: ourStatus,
    });
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    const restaurantId = sub.metadata?.restaurant_id ?? null;

    if (!restaurantId) {
      console.error(
        "[stripe-webhook] subscription.deleted sin restaurant_id en metadata:",
        event.id
      );
      return jsonResponse(200, { received: true, error: "missing_restaurant_id" });
    }

    // Acceso hasta fin del periodo pagado — no corte inmediato
    // El frontend usa subscription_current_period_end para saber hasta cuándo hay acceso
    const periodEnd = new Date(sub.current_period_end * 1000).toISOString();

    const { error: updateErr } = await supabase
      .from("restaurants")
      .update({
        subscription_status: "canceled",
        subscription_current_period_end: periodEnd,
      })
      .eq("id", restaurantId);

    if (updateErr) {
      console.error("[stripe-webhook] subscription.deleted error:", updateErr);
    } else {
      console.log(
        `[stripe-webhook] subscription.deleted restaurante=${restaurantId} ` +
        `acceso hasta ${periodEnd}`
      );
    }
    return jsonResponse(200, {
      received: true,
      type: event.type,
      restaurant_id: restaurantId,
      access_until: periodEnd,
    });
  }

  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = typeof invoice.customer === "string" ? invoice.customer : null;

    if (!customerId) {
      console.error("[stripe-webhook] invoice.payment_failed sin customer_id:", event.id);
      return jsonResponse(200, { received: true, error: "no_customer_id" });
    }

    // Buscamos por stripe_billing_customer_id (no por stripe_account_id de Connect)
    const { error: updateErr } = await supabase
      .from("restaurants")
      .update({ subscription_status: "past_due" })
      .eq("stripe_billing_customer_id", customerId);

    if (updateErr) {
      console.error("[stripe-webhook] invoice.payment_failed error:", updateErr);
    } else {
      console.log(
        `[stripe-webhook] invoice.payment_failed customer=${customerId} → past_due`
      );
    }
    return jsonResponse(200, {
      received: true,
      type: event.type,
      customer_id: customerId,
    });
  }

  // ── 4c. Eventos de pago de pedidos ────────────────────────────────────────

  // Extraer order_id y amount del evento de pago
  let orderId: string | null = null;
  let amountReceivedCents: number | null = null;
  let paymentIntentId: string | null = null;

  if (event.type === "checkout.session.completed") {
    // Llegamos aquí solo si mode === "payment" (subscription ya devolvió arriba)
    const session = event.data.object as Stripe.Checkout.Session;
    orderId = session.metadata?.order_id ?? null;
    amountReceivedCents = session.amount_total;
    paymentIntentId = typeof session.payment_intent === "string"
      ? session.payment_intent
      : null;
  } else {
    const pi = event.data.object as Stripe.PaymentIntent;
    orderId = pi.metadata?.order_id ?? null;
    amountReceivedCents = pi.amount_received;
    paymentIntentId = pi.id;
  }

  if (!orderId) {
    console.error("[stripe-webhook] Sin order_id en metadata, event:", event.id);
    return jsonResponse(200, { received: true, error: "no_order_id_in_metadata" });
  }

  // 5. Leer pedido de la BD
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("id, total, payment_status, restaurant_id")
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr || !order) {
    console.error("[stripe-webhook] Pedido no encontrado:", orderId, orderErr);
    return jsonResponse(200, { received: true, error: "order_not_found" });
  }

  // Idempotencia: ya pagado
  if (order.payment_status === "paid") {
    return jsonResponse(200, { received: true, skipped: "already_paid" });
  }

  // 6. Validar amount en céntimos (integer, sin float)
  //    orders.total está en euros (numeric). Convertir a céntimos para comparar.
  const expectedCents = Math.round(Number(order.total) * 100);

  if (amountReceivedCents !== null && amountReceivedCents !== expectedCents) {
    console.error(
      `[stripe-webhook] AMOUNT MISMATCH order=${orderId} ` +
      `expected=${expectedCents} received=${amountReceivedCents} event=${event.id}`
    );
    await supabase.from("app_events").insert({
      event_type: "stripe_amount_mismatch",
      payload: {
        order_id: orderId,
        expected_cents: expectedCents,
        received_cents: amountReceivedCents,
        stripe_event_id: event.id,
      },
    });
    return jsonResponse(200, { received: true, error: "amount_mismatch" });
  }

  // 7. Marcar pedido como pagado
  const { error: updateErr } = await supabase
    .from("orders")
    .update({
      payment_status: "paid",
      paid_at: new Date().toISOString(),
      stripe_payment_intent_id: paymentIntentId,
    })
    .eq("id", orderId);

  if (updateErr) {
    console.error("[stripe-webhook] Error actualizando pedido:", updateErr);
    return jsonResponse(500, { error: "db_update_failed" });
  }

  console.log(`[stripe-webhook] Pedido ${orderId} marcado como pagado. Cents: ${amountReceivedCents}`);
  return jsonResponse(200, { received: true, order_id: orderId });
});
