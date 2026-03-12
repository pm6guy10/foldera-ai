/**
 * POST /api/stripe/webhook
 *
 * Handles Stripe webhook events.
 * Processes customer.subscription.deleted to mark subscriptions cancelled
 * and schedule data deletion in 30 days.
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

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId   = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
    const supabase     = createServerClient();

    // Find user by Stripe customer ID (stored as stripe_customer_id in user_subscriptions)
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
          status:                    'cancelled',
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
