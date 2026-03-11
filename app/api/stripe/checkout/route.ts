/**
 * POST /api/stripe/checkout
 *
 * Creates a Stripe Checkout Session for the selected plan and returns the URL.
 * Body: { plan: "pro" | "starter" }
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY
 *   STRIPE_PRO_PRICE_ID
 *   STRIPE_STARTER_PRICE_ID
 *   NEXTAUTH_URL (for success/cancel redirect URLs)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import Stripe from 'stripe';
import { authOptions } from '@/lib/auth/auth-options';

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
  // Use type assertion — the exact version string is enforced by the installed Stripe SDK
  return new Stripe(key, { apiVersion: '2025-08-27.basil' as any });
}

const PRICE_IDS: Record<string, string | undefined> = {
  pro:     process.env.STRIPE_PRO_PRICE_ID,
  starter: process.env.STRIPE_STARTER_PRICE_ID,
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const plan: string = body.plan ?? 'starter';

  const priceId = PRICE_IDS[plan];
  if (!priceId) {
    return NextResponse.json(
      { error: `No price configured for plan "${plan}"` },
      { status: 400 },
    );
  }

  // Get user email for Stripe pre-fill (optional — does not block checkout)
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  const userId = session?.user?.id;

  const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';

  try {
    const stripe = getStripe();
    const checkout = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/dashboard?subscribed=1`,
      cancel_url:  `${baseUrl}/start/result`,
      ...(email ? { customer_email: email } : {}),
      ...(userId ? { client_reference_id: userId } : {}),
    });

    return NextResponse.json({ url: checkout.url });
  } catch (err: any) {
    console.error('[stripe/checkout]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
