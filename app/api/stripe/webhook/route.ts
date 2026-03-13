/**
 * POST /api/stripe/webhook
 *
 * Handles Stripe webhook events:
 *   checkout.session.completed  → create user_subscriptions row
 *   invoice.payment_succeeded   → update status to active
 *   invoice.payment_failed      → update status to past_due
 *   customer.subscription.deleted → update status to cancelled + schedule deletion
 *
 * Env vars:
 *   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServerClient } from '@/lib/db/client';

export const dynamic = 'force-dynamic';


function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-08-27.basil' as any });
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[stripe/webhook] STRIPE_WEBHOOK_SECRET not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const body = await request.text();
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[stripe/webhook] signature verification failed:', msg);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const supabase = createServerClient();

  // ── checkout.session.completed ──────────────────────────────────────────
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId     = session.client_reference_id;
    const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
    const subId      = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;

    if (!userId) {
      console.warn('[stripe/webhook] checkout.session.completed missing client_reference_id');
    } else {
      // Trial ends 14 days from now (matches trial_period_days in checkout)
      const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

      const { error } = await supabase
        .from('user_subscriptions')
        .upsert(
          {
            user_id:                userId,
            stripe_customer_id:     customerId ?? null,
            stripe_subscription_id: subId ?? null,
            plan:                   'pro',
            status:                 'active',
            current_period_end:     trialEnd,
          },
          { onConflict: 'user_id' }
        );

      if (error) {
        console.error('[stripe/webhook] upsert failed:', error.message);
      } else {
        console.log('[stripe/webhook] subscription created for', userId);
      }
    }
  }

  // ── invoice.payment_succeeded ────────────────────────────────────────────
  else if (event.type === 'invoice.payment_succeeded') {
    const invoice    = event.data.object as Stripe.Invoice;
    const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
    // invoice.period_end is a Unix timestamp (seconds)
    const periodEnd  = invoice.lines?.data?.[0]?.period?.end
      ? new Date((invoice.lines.data[0].period.end as number) * 1000).toISOString()
      : null;

    if (customerId) {
      const update: Record<string, string> = { status: 'active', plan: 'pro' };
      if (periodEnd) update.current_period_end = periodEnd;

      await supabase
        .from('user_subscriptions')
        .update(update)
        .eq('stripe_customer_id', customerId);

      console.log('[stripe/webhook] payment succeeded for customer', customerId);
    }
  }

  // ── invoice.payment_failed ───────────────────────────────────────────────
  else if (event.type === 'invoice.payment_failed') {
    const invoice    = event.data.object as Stripe.Invoice;
    const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;

    if (customerId) {
      await supabase
        .from('user_subscriptions')
        .update({ status: 'past_due' })
        .eq('stripe_customer_id', customerId);

      console.log('[stripe/webhook] payment failed for customer', customerId);
    }
  }

  // ── customer.subscription.deleted ───────────────────────────────────────
  else if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId   = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

    const { data: sub } = await supabase
      .from('user_subscriptions')
      .select('user_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();

    if (sub?.user_id) {
      const deletionAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      await supabase
        .from('user_subscriptions')
        .update({
          status:                     'cancelled',
          data_deletion_scheduled_at: deletionAt,
        })
        .eq('user_id', sub.user_id);

      console.log('[stripe/webhook] subscription cancelled for', sub.user_id, '— deletion scheduled at', deletionAt);
    } else {
      console.warn('[stripe/webhook] no user found for Stripe customer', customerId);
    }
  }

  return NextResponse.json({ received: true });
}
