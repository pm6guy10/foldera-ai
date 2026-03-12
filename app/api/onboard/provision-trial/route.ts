/**
 * POST /api/onboard/provision-trial
 *
 * Called after a user completes onboarding and sees their first directive.
 * Creates a 14-day trial in user_subscriptions. Idempotent — safe to call
 * multiple times; returns existing trial if already provisioned.
 *
 * Requires: authenticated session (Google OAuth completed)
 * Returns:  { plan, status, trialEndsAt }
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { createServerClient } from '@/lib/db/client';
import { getAuthOptions } from '@/lib/auth/auth-options';
import { apiError } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';


export async function POST() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const supabase = createServerClient();

  // Return existing subscription if already provisioned
  const { data: existing } = await supabase
    .from('user_subscriptions')
    .select('plan, status, current_period_end, created_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      plan:         existing.plan,
      status:       existing.status,
      trialEndsAt:  existing.current_period_end,
      alreadyExists: true,
    });
  }

  // Provision 14-day trial
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('user_subscriptions')
    .insert({
      user_id:             userId,
      plan:                'trial',
      status:              'active',
      current_period_end:  trialEndsAt,
    })
    .select('plan, status, current_period_end')
    .single();

  if (error) {
    return apiError(error, 'onboard/provision-trial');
  }

  return NextResponse.json({
    plan:        data.plan,
    status:      data.status,
    trialEndsAt: data.current_period_end,
  });
}
