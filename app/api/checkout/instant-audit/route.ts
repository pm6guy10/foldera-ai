import { NextResponse } from 'next/server';
import { stripe } from '@/lib/billing/stripe';

export async function POST() {
  try {
    // Create checkout session for $49/mo Guardian plan
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: '24/7 Guardian',
              description: 'Continuous monitoring of Gmail + Drive with instant conflict alerts',
            },
            unit_amount: 4900, // $49.00
            recurring: {
              interval: 'month',
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/instant-audit/success`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/instant-audit`,
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error('Checkout error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session', details: error.message },
      { status: 500 }
    );
  }
}
