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
import { getAuthOptions } from '@/lib/auth/auth-options';
import { getSubscriptionStatus } from '@/lib/auth/subscription';
import { apiError } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';


export async function GET() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    console.error(`[subscription/status] 401 — session: ${JSON.stringify({ hasSession: !!session, hasUser: !!session?.user, userId: session?.user?.id ?? 'MISSING', email: session?.user?.email ?? 'MISSING' })}`);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const info = await getSubscriptionStatus(session.user.id);

    return NextResponse.json({
      plan:          info.plan,
      status:        info.status,
      daysRemaining: info.daysRemaining,
    });
  } catch (err: unknown) {
    return apiError(err, 'subscription/status');
  }
}
