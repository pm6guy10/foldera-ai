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
  current_period_end: string | null;
  /** Stripe customer on file — billing portal available */
  canManageBilling: boolean;
}

export async function getSubscriptionStatus(userId: string): Promise<SubscriptionInfo> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('user_subscriptions')
    .select('plan, status, current_period_end, stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return {
      status: 'none',
      plan: null,
      daysRemaining: 0,
      isReadOnly: true,
      current_period_end: null,
      canManageBilling: false,
    };
  }

  const canManageBilling = Boolean(
    data.stripe_customer_id && typeof data.stripe_customer_id === 'string',
  );

  const now = Date.now();
  const periodEnd = data.current_period_end ? new Date(data.current_period_end).getTime() : null;
  const hasPeriodEnd = typeof periodEnd === 'number' && Number.isFinite(periodEnd);
  const daysRemaining = hasPeriodEnd
    ? Math.max(0, Math.ceil(((periodEnd as number) - now) / (1000 * 60 * 60 * 24)))
    : 0;

  const periodEndIso =
    typeof data.current_period_end === 'string' ? data.current_period_end : null;

  if (data.status === 'cancelled') {
    return {
      status: 'cancelled',
      plan: data.plan,
      daysRemaining: 0,
      isReadOnly: true,
      current_period_end: periodEndIso,
      canManageBilling,
    };
  }

  if (data.status === 'past_due') {
    return {
      status: 'past_due',
      plan: data.plan,
      daysRemaining,
      isReadOnly: false,
      current_period_end: periodEndIso,
      canManageBilling,
    };
  }

  if (data.status === 'active') {
    if (hasPeriodEnd && (periodEnd as number) < now) {
      return {
        status: 'expired',
        plan: data.plan,
        daysRemaining: 0,
        isReadOnly: true,
        current_period_end: periodEndIso,
        canManageBilling,
      };
    }

    if (data.plan === 'trial') {
      return {
        status: 'active_trial',
        plan: data.plan,
        daysRemaining,
        isReadOnly: false,
        current_period_end: periodEndIso,
        canManageBilling,
      };
    }

    if (data.plan === 'pro') {
      return {
        status: 'active',
        plan: data.plan,
        daysRemaining,
        isReadOnly: false,
        current_period_end: periodEndIso,
        canManageBilling,
      };
    }
  }

  return {
    status: 'active',
    plan: data.plan,
    daysRemaining,
    isReadOnly: false,
    current_period_end: periodEndIso,
    canManageBilling,
  };
}
