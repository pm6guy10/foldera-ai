/**
 * Stripe ↔ user_subscriptions sync helpers (used by webhook handler).
 */

import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';

export function periodEndIsoFromInvoice(invoice: Stripe.Invoice): string | null {
  const sec =
    typeof invoice.period_end === 'number'
      ? invoice.period_end
      : (invoice.lines?.data?.[0]?.period?.end as number | undefined);
  if (typeof sec !== 'number' || !Number.isFinite(sec)) return null;
  return new Date(sec * 1000).toISOString();
}

export function periodEndIsoFromSubscription(sub: Stripe.Subscription): string | null {
  const end = (sub as unknown as { current_period_end?: number }).current_period_end;
  if (typeof end !== 'number' || !Number.isFinite(end)) {
    return null;
  }
  return new Date(end * 1000).toISOString();
}

/** Map Stripe.Subscription.status to user_subscriptions.status */
export function subscriptionStatusToDb(stripeStatus: Stripe.Subscription.Status): string {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
      return 'past_due';
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':
      return 'cancelled';
    case 'incomplete':
    case 'paused':
    default:
      return 'active';
  }
}

export async function updateSubscriptionByCustomerId(
  supabase: SupabaseClient,
  customerId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { data, error } = await supabase
    .from('user_subscriptions')
    .update(patch)
    .eq('stripe_customer_id', customerId)
    .select('id');
  if (error) {
    throw new Error(`[stripe] update by customer failed: ${error.message}`);
  }
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`[stripe] no subscription row matched customer ${customerId}`);
  }
}

export async function updateSubscriptionBySubscriptionId(
  supabase: SupabaseClient,
  stripeSubscriptionId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { data, error } = await supabase
    .from('user_subscriptions')
    .update(patch)
    .eq('stripe_subscription_id', stripeSubscriptionId)
    .select('id');
  if (error) {
    throw new Error(`[stripe] update by subscription id failed: ${error.message}`);
  }
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`[stripe] no subscription row matched subscription ${stripeSubscriptionId}`);
  }
}
