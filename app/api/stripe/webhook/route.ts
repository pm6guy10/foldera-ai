/**
 * POST /api/stripe/webhook
 *
 * Verifies signature (400 on failure). Updates user_subscriptions via service-role Supabase.
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServerClient } from '@/lib/db/client';
import { sendPaymentFailedEmail, sendProWelcomeEmail } from '@/lib/email/resend';
import {
  periodEndIsoFromInvoice,
  periodEndIsoFromSubscription,
  subscriptionStatusToDb,
  updateSubscriptionByCustomerId,
  updateSubscriptionBySubscriptionId,
} from '@/lib/stripe/subscription-db';

export const dynamic = 'force-dynamic';

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
  return new Stripe(key, { apiVersion: '2025-08-27.basil' as any });
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
  const stripe = getStripe();
  const baseUrl = (process.env.NEXTAUTH_URL ?? 'https://foldera.ai').replace(/\/$/, '');

  try {
    if (event.type === 'checkout.session.completed') {
      const sessionThin = event.data.object as Stripe.Checkout.Session;
      const expanded = await stripe.checkout.sessions.retrieve(sessionThin.id, {
        expand: ['subscription'],
      });

      const userId =
        expanded.client_reference_id ||
        expanded.metadata?.userId ||
        expanded.metadata?.user_id ||
        null;

      const customerId =
        typeof expanded.customer === 'string' ? expanded.customer : expanded.customer?.id ?? null;
      const subObj = expanded.subscription;
      let subId: string | null = null;
      let periodEndIso: string | null = null;
      if (subObj && typeof subObj === 'object') {
        subId = (subObj as Stripe.Subscription).id;
        periodEndIso = periodEndIsoFromSubscription(subObj as Stripe.Subscription);
      }
      if (!periodEndIso) {
        periodEndIso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      }

      if (!userId) {
        throw new Error('[stripe/webhook] checkout.session.completed missing user id');
      } else {
        const { error } = await supabase.from('user_subscriptions').upsert(
          {
            user_id: userId,
            stripe_customer_id: customerId,
            stripe_subscription_id: subId,
            plan: 'pro',
            status: 'active',
            current_period_end: periodEndIso,
          },
          { onConflict: 'user_id' },
        );

        if (error) {
          throw new Error(`[stripe/webhook] upsert failed: ${error.message}`);
        } else {
          const to =
            expanded.customer_details?.email ??
            (typeof expanded.customer_email === 'string' ? expanded.customer_email : null);
          if (to) {
            void sendProWelcomeEmail(to).catch((e) =>
              console.error('[stripe/webhook] pro welcome email failed:', e),
            );
          }
          console.log('[stripe/webhook] subscription activated for', userId);
        }
      }
    } else if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object as Stripe.Subscription;
      const periodEnd = periodEndIsoFromSubscription(subscription);
      const dbStatus = subscriptionStatusToDb(subscription.status);
      const patch: Record<string, unknown> = {
        status: dbStatus,
        ...(periodEnd ? { current_period_end: periodEnd } : {}),
      };
      if (subscription.status === 'canceled' || subscription.status === 'unpaid') {
        patch.plan = 'free';
      } else if (
        subscription.status === 'active' ||
        subscription.status === 'trialing' ||
        subscription.status === 'past_due'
      ) {
        patch.plan = 'pro';
      }
      await updateSubscriptionBySubscriptionId(supabase, subscription.id, patch);
    } else if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription;
      await updateSubscriptionBySubscriptionId(supabase, subscription.id, {
        plan: 'free',
        status: 'cancelled',
        stripe_subscription_id: null,
        data_deletion_scheduled_at: null,
      });
      console.log('[stripe/webhook] subscription deleted → free', subscription.id);
    } else if (event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
      if (!customerId) {
        return NextResponse.json({ received: true });
      }
      const periodEnd = periodEndIsoFromInvoice(invoice);
      const patch: Record<string, unknown> = { status: 'active', plan: 'pro' };
      if (periodEnd) patch.current_period_end = periodEnd;
      await updateSubscriptionByCustomerId(supabase, customerId, patch);
    } else if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
      if (customerId) {
        await updateSubscriptionByCustomerId(supabase, customerId, { status: 'past_due' });

        const to = typeof invoice.customer_email === 'string' ? invoice.customer_email : null;
        if (to) {
          try {
            const portal = await stripe.billingPortal.sessions.create({
              customer: customerId,
              return_url: `${baseUrl}/dashboard/settings`,
            });
            void sendPaymentFailedEmail(to, portal.url).catch((e) =>
              console.error('[stripe/webhook] payment failed email:', e),
            );
          } catch (e) {
            console.error('[stripe/webhook] billing portal for payment_failed:', e);
            void sendPaymentFailedEmail(to, `${baseUrl}/dashboard/settings`).catch(() => {});
          }
        }
      }
    }
  } catch (e) {
    console.error('[stripe/webhook] handler error:', e);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
