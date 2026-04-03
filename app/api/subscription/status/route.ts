/**
 * GET /api/subscription/status
 *
 * Authenticated. Reads user_subscriptions (via getSubscriptionStatus).
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth/auth-options';
import { getSubscriptionStatus } from '@/lib/auth/subscription';
import { apiErrorForRoute } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const info = await getSubscriptionStatus(session.user.id);

    return NextResponse.json({
      plan: info.plan,
      status: info.status,
      current_period_end: info.current_period_end,
      daysRemaining: info.daysRemaining,
      can_manage_billing: info.canManageBilling,
    });
  } catch (err: unknown) {
    return apiErrorForRoute(err, 'subscription/status');
  }
}
