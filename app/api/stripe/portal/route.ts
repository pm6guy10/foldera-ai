/**
 * POST /api/stripe/portal — Stripe Customer Billing Portal session.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import Stripe from 'stripe';
import { authOptions } from '@/lib/auth/auth-options';
import { createServerClient } from '@/lib/db/client';
import { apiError } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
  return new Stripe(key, { apiVersion: '2025-08-27.basil' as any });
}

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();
    const { data: rows, error } = await supabase
      .from('user_subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', session.user.id)
      .limit(1);

    if (error) {
      throw new Error(error.message);
    }

    const rowList = Array.isArray(rows) ? rows : [];
    const customerId = rowList[0]?.stripe_customer_id;
    if (!customerId || typeof customerId !== 'string') {
      return NextResponse.json({ error: 'No billing account on file' }, { status: 400 });
    }

    const baseUrl = (process.env.NEXTAUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '');
    const stripe = getStripe();
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${baseUrl}/dashboard/settings`,
    });

    return NextResponse.json({ url: portal.url });
  } catch (err: unknown) {
    return apiError(err, 'stripe/portal');
  }
}
