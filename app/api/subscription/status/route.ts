/**
 * GET /api/subscription/status
 *
 * Returns the current user's subscription status.
 * Used by the dashboard to show trial expiry upsell.
 *
 * Returns: { plan, status, trialEndsAt, daysRemaining } | { status: 'none' }
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { createServerClient } from '@/lib/db/client';
import { getAuthOptions } from '@/lib/auth/auth-options';

export const dynamic = 'force-dynamic';


export async function GET() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const supabase = createServerClient();

  const { data } = await supabase
    .from('user_subscriptions')
    .select('plan, status, current_period_end, created_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ status: 'none' });
  }

  const now = Date.now();
  const endsAt = new Date(data.current_period_end).getTime();
  const daysRemaining = Math.max(0, Math.ceil((endsAt - now) / (1000 * 60 * 60 * 24)));

  return NextResponse.json({
    plan:          data.plan,
    status:        data.status,
    trialEndsAt:   data.current_period_end,
    daysRemaining,
  });
}
