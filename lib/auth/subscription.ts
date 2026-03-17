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

// Owner account — exempt from trial/payment gates
const OWNER_USER_ID = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';

export async function getSubscriptionStatus(userId: string): Promise<SubscriptionInfo> {
  // Owner is always active pro
  if (userId === OWNER_USER_ID) {
    return { status: 'active', plan: 'pro', daysRemaining: 999, isReadOnly: false };
  }

  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('user_subscriptions')
    .select('plan, status, current_period_end')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

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
      return { status: 'expired', plan: data.plan, daysRemaining: 0, isReadOnly: true };
    }

    if (data.plan === 'trial') {
      return { status: 'active_trial', plan: data.plan, daysRemaining, isReadOnly: false };
    }

    if (data.plan === 'pro') {
      return { status: 'active', plan: data.plan, daysRemaining, isReadOnly: false };
    }
  }

  return { status: 'active', plan: data.plan, daysRemaining, isReadOnly: false };
}
