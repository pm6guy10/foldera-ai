import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe, stripeConfig } from '@/lib/billing/stripe';
import { getPlanByPriceId } from '@/lib/billing/plans';
import Stripe from 'stripe';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature');
  
  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    );
  }
  
  let event: Stripe.Event;
  
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      stripeConfig.webhookSecret
    );
  } catch (error: any) {
    console.error('Webhook signature verification failed:', error);
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    );
  }
  
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }
      
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(subscription);
        break;
      }
      
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }
      
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentSucceeded(invoice);
        break;
      }
      
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }
      
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
    
    return NextResponse.json({ received: true });
    
  } catch (error: any) {
    console.error('Error processing webhook:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed', details: error.message },
      { status: 500 }
    );
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;
  
  if (!subscriptionId) return;
  
  // Get the subscription details
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  
  // Get the plan from the price ID
  const priceId = subscription.items.data[0].price.id;
  const plan = getPlanByPriceId(priceId);
  
  if (!plan) {
    console.error('Unknown price ID:', priceId);
    return;
  }
  
  // Update subscription in database
  await supabase
    .from('subscriptions')
    .update({
      stripe_subscription_id: subscriptionId,
      plan_name: plan.id,
      status: subscription.status,
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    })
    .eq('stripe_customer_id', customerId);
  
  console.log(`Subscription created for customer ${customerId}: ${plan.name}`);
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const priceId = subscription.items.data[0].price.id;
  const plan = getPlanByPriceId(priceId);
  
  if (!plan) {
    console.error('Unknown price ID:', priceId);
    return;
  }
  
  // Update subscription in database
  await supabase
    .from('subscriptions')
    .update({
      plan_name: plan.id,
      status: subscription.status,
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    })
    .eq('stripe_customer_id', customerId);
  
  console.log(`Subscription updated for customer ${customerId}: ${plan.name}`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  
  // Downgrade to free plan
  await supabase
    .from('subscriptions')
    .update({
      plan_name: 'free',
      status: 'canceled',
      stripe_subscription_id: null,
    })
    .eq('stripe_customer_id', customerId);
  
  console.log(`Subscription canceled for customer ${customerId}`);
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  
  console.log(`Payment succeeded for customer ${customerId}: ${invoice.amount_paid / 100}`);
  
  // You could send a receipt email here or track revenue
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  
  console.log(`Payment failed for customer ${customerId}`);
  
  // You could send a payment failure email here
  // Or suspend the subscription after multiple failures
}
