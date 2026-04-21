/**
 * POST /api/stripe/portal — Stripe Customer Billing Portal session.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import Stripe from 'stripe';
import { authOptions } from '@/lib/auth/auth-options';
import { createServerClient } from '@/lib/db/client';
import {
  periodEndIsoFromSubscription,
  subscriptionStatusToDb,
} from '@/lib/stripe/subscription-db';
import { apiErrorForRoute } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';

type RecoverablePortalCustomer = {
  customerId: string;
  subscriptionId: string | null;
  currentPeriodEnd: string | null;
  status: string;
};

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
  return new Stripe(key, { apiVersion: '2025-08-27.basil' as any });
}

function isMissingCustomerError(err: unknown): boolean {
  return err instanceof Error && /No such customer/i.test(err.message);
}

function getRequestOrigin(request: Request): string {
  return new URL(request.url).origin.replace(/\/$/, '');
}

function rankSubscription(sub: Stripe.Subscription): number {
  switch (sub.status) {
    case 'active':
      return 6;
    case 'trialing':
      return 5;
    case 'past_due':
      return 4;
    case 'unpaid':
      return 3;
    case 'incomplete':
      return 2;
    case 'paused':
      return 1;
    default:
      return 0;
  }
}

async function findRecoverablePortalCustomer(
  stripe: Stripe,
  email: string,
): Promise<RecoverablePortalCustomer | null> {
  const customers = await stripe.customers.list({ email, limit: 10 });
  let winner: RecoverablePortalCustomer | null = null;
  let winnerScore = -1;
  let winnerPeriodEnd = -1;

  for (const customer of customers.data) {
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'all',
      limit: 10,
    });

    for (const sub of subscriptions.data) {
      const score = rankSubscription(sub);
      const periodEnd =
        typeof (sub as unknown as { current_period_end?: number }).current_period_end === 'number'
          ? ((sub as unknown as { current_period_end?: number }).current_period_end as number)
          : 0;
      if (score < winnerScore) continue;
      if (score === winnerScore && periodEnd <= winnerPeriodEnd) continue;

      winner = {
        customerId: customer.id,
        subscriptionId: sub.id,
        currentPeriodEnd: periodEndIsoFromSubscription(sub),
        status: subscriptionStatusToDb(sub.status),
      };
      winnerScore = score;
      winnerPeriodEnd = periodEnd;
    }
  }

  return winner;
}

async function repairSubscriptionRow(
  userId: string,
  recovered: RecoverablePortalCustomer,
): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from('user_subscriptions')
    .update({
      stripe_customer_id: recovered.customerId,
      stripe_subscription_id: recovered.subscriptionId,
      current_period_end: recovered.currentPeriodEnd,
      status: recovered.status,
    })
    .eq('user_id', userId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();
    const { data: rows, error } = await supabase
      .from('user_subscriptions')
      .select('stripe_customer_id, stripe_subscription_id')
      .eq('user_id', session.user.id)
      .limit(1);

    if (error) {
      throw new Error(error.message);
    }

    const rowList = Array.isArray(rows) ? rows : [];
    const customerId = rowList[0]?.stripe_customer_id;
    const stripe = getStripe();
    const returnUrl = `${getRequestOrigin(request)}/dashboard/settings`;

    let resolvedCustomerId =
      typeof customerId === 'string' && customerId.trim().length > 0 ? customerId : null;

    if (!resolvedCustomerId && typeof session.user.email === 'string') {
      const recovered = await findRecoverablePortalCustomer(stripe, session.user.email);
      if (recovered) {
        await repairSubscriptionRow(session.user.id, recovered);
        resolvedCustomerId = recovered.customerId;
      }
    }

    if (!resolvedCustomerId) {
      return NextResponse.json({ error: 'No billing account on file' }, { status: 400 });
    }

    let portal;
    try {
      portal = await stripe.billingPortal.sessions.create({
        customer: resolvedCustomerId,
        return_url: returnUrl,
      });
    } catch (err: unknown) {
      if (!isMissingCustomerError(err) || typeof session.user.email !== 'string') {
        throw err;
      }

      const recovered = await findRecoverablePortalCustomer(stripe, session.user.email);
      if (!recovered) {
        throw err;
      }

      await repairSubscriptionRow(session.user.id, recovered);
      portal = await stripe.billingPortal.sessions.create({
        customer: recovered.customerId,
        return_url: returnUrl,
      });
    }

    return NextResponse.json({ url: portal.url });
  } catch (err: unknown) {
    return apiErrorForRoute(err, 'stripe/portal');
  }
}
