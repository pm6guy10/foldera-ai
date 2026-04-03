/**
 * POST /api/stripe/checkout
 *
 * Body (optional): { priceId?, price_id?, userId?, email? }
 * All identity fields must match the signed-in session when provided.
 *
 * Env: STRIPE_SECRET_KEY, STRIPE_PRO_PRICE_ID, NEXTAUTH_URL
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import Stripe from 'stripe';
import { authOptions } from '@/lib/auth/auth-options';
import { apiErrorForRoute } from '@/lib/utils/api-error';

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
    const priceIdRaw =
      (typeof body?.priceId === 'string' && body.priceId) ||
      (typeof body?.price_id === 'string' && body.price_id) ||
      process.env.STRIPE_PRO_PRICE_ID;
    if (!priceIdRaw) {
      return NextResponse.json({ error: 'STRIPE_PRO_PRICE_ID not configured' }, { status: 400 });
    }

    const bodyUserId = typeof body?.userId === 'string' ? body.userId : undefined;
    const bodyEmail = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : undefined;

    if (bodyUserId && bodyUserId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const sessionEmail = session.user.email?.trim().toLowerCase() ?? '';
    if (bodyEmail && sessionEmail && bodyEmail !== sessionEmail) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const userId = session.user.id;
    const email = session.user.email ?? undefined;
    const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';

    const stripe = getStripe();
    const checkout = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceIdRaw, quantity: 1 }],
      success_url: `${baseUrl}/dashboard?upgraded=true`,
      cancel_url: `${baseUrl}/pricing`,
      client_reference_id: userId,
      ...(email ? { customer_email: email } : {}),
      metadata: { userId },
    });

    return NextResponse.json({ url: checkout.url });
  } catch (err: unknown) {
    return apiErrorForRoute(err, 'stripe/checkout');
  }
}
