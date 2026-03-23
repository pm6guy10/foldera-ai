/**
 * POST /api/stripe/checkout
 *
 * Creates a Stripe Checkout Session for the Pro plan and returns the URL.
 * Accepts an optional price_id parameter; defaults to STRIPE_PRO_PRICE_ID.
 * No trial — free tier is available to all users.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY
 *   STRIPE_PRO_PRICE_ID
 *   NEXTAUTH_URL (for success/cancel redirect URLs)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import Stripe from 'stripe';
import { authOptions } from '@/lib/auth/auth-options';
import { apiError } from '@/lib/utils/api-error';

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
  return new Stripe(key, { apiVersion: '2025-08-27.basil' as any });
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const requestedPriceId = typeof body?.price_id === 'string' ? body.price_id : undefined;
    const priceId = requestedPriceId || process.env.STRIPE_PRO_PRICE_ID;
    if (!priceId) {
      return NextResponse.json(
        { error: 'STRIPE_PRO_PRICE_ID not configured' },
        { status: 400 },
      );
    }

    const email = session.user.email;
    const userId = session.user.id;
    const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';

    const stripe = getStripe();
    const checkout = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/dashboard?upgraded=true`,
      cancel_url:  `${baseUrl}/pricing`,
      ...(email ? { customer_email: email } : {}),
      ...(userId ? { client_reference_id: userId } : {}),
    });

    return NextResponse.json({ url: checkout.url });
  } catch (err: unknown) {
    return apiError(err, 'stripe/checkout');
  }
}
