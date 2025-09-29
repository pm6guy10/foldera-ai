import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe, getOrCreateCustomer, createCheckoutSession } from '@/lib/billing/stripe';
import { getPlanByName } from '@/lib/billing/plans';

function getSupabaseClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function POST(req: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }
  try {
    const { userId, email, planName } = await req.json();
    
    if (!userId || !email || !planName) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // Get the plan details
    const plan = getPlanByName(planName);
    
    if (!plan.priceId) {
      return NextResponse.json(
        { error: 'Invalid plan selected' },
        { status: 400 }
      );
    }
    
    // Check if user already has a Stripe customer ID
    const { data: existingSubscription } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .single();
    
    let customerId: string;
    
    if (existingSubscription?.stripe_customer_id) {
      customerId = existingSubscription.stripe_customer_id;
    } else {
      // Create new Stripe customer
      customerId = await getOrCreateCustomer(userId, email);
      
      // Store customer ID in database
      await supabase
        .from('subscriptions')
        .upsert({
          user_id: userId,
          stripe_customer_id: customerId,
          plan_name: 'free',
          status: 'active',
        });
    }
    
    // Create checkout session
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const session = await createCheckoutSession(
      customerId,
      plan.priceId,
      `${baseUrl}/dashboard?success=true`,
      `${baseUrl}/dashboard?canceled=true`
    );
    
    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    });
    
  } catch (error: any) {
    console.error('Error creating checkout session:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session', details: error.message },
      { status: 500 }
    );
  }
}
