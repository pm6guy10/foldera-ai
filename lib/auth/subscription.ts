/**
 * Subscription status helper.
 * Server-side: call getSubscriptionStatus(userId) in server components / API routes.
 *
 * Status meanings:
 *   active_trial  — within 14-day free trial
 *   active        — paid and current
 *   past_due      — payment failed, grace period
 *   expired       — trial ended, no payment
 *   cancelled     — subscription cancelled
 *   none          — no record found
 */

import { createServerClient } from '@/lib/db/client';

export type SubscriptionStatus =
  | 'active_trial'
  | 'active'
  | 'past_due'
  | 'expired'
  | 'cancelled'
  | 'none';

export interface SubscriptionInfo {
  status: SubscriptionStatus;
  plan: string | null;
  daysRemaining: number;
  /** True when the user cannot execute approvals */
  isReadOnly: boolean;
}

export async function getSubscriptionStatus(userId: string): Promise<SubscriptionInfo> {
  const supabase = createServerClient();

  const { data } = await supabase
    .from('user_subscriptions')
    .select('plan, status, current_period_end')
    .eq('user_id', userId)
    .maybeSingle();

  if (!data) {
    return { status: 'none', plan: null, daysRemaining: 0, isReadOnly: true };
  }

  const now       = Date.now();
  const periodEnd = new Date(data.current_period_end).getTime();
  const daysRemaining = Math.max(0, Math.ceil((periodEnd - now) / (1000 * 60 * 60 * 24)));

  if (data.status === 'cancelled') {
    return { status: 'cancelled', plan: data.plan, daysRemaining: 0, isReadOnly: true };
  }

  if (data.status === 'past_due') {
    return { status: 'past_due', plan: data.plan, daysRemaining, isReadOnly: false };
  }

  if (data.status === 'active') {
    if (periodEnd < now) {
      // Trial window has closed with no payment
      return { status: 'expired', plan: data.plan, daysRemaining: 0, isReadOnly: true };
    }
    if (data.plan === 'trial' || data.plan === 'pro') {
      // Distinguish trial from paid by checking if daysRemaining is within original 14-day window
      // and plan is still 'trial', but the DB plan column is set to 'pro' on checkout
      const status: SubscriptionStatus = data.plan === 'trial' ? 'active_trial' : 'active';
      return { status, plan: data.plan, daysRemaining, isReadOnly: false };
    }
  }

  return { status: 'active', plan: data.plan, daysRemaining, isReadOnly: false };
}
