/**
 * POST /api/cron/renew-graph-subscriptions
 *
 * The ONLY remaining cron in the delivery path — and it is a cheap, LLM-free watchdog, not
 * a schedule the card waits on. Graph mail subscriptions expire in ~70h; this re-arms them
 * (PATCH renew, or create-if-missing) for every connected Microsoft user so push delivery
 * never silently lapses. Cards still fire on data-change via /api/webhooks/graph, not here.
 *
 * Auth: CRON_SECRET Bearer token.
 * Schedule: 0 9 * * * (daily at 09:00 UTC — well inside the ~70h expiry window).
 */
import { NextRequest, NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';
import { getAllUsersWithProvider } from '@/lib/auth/user-tokens';
import { ensureGraphSubscription } from '@/lib/sync/graph-subscription';
import { apiErrorForRoute } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function handler(request: NextRequest) {
  const authErr = validateCronAuth(request);
  if (authErr) return authErr;

  try {
    const userIds = await getAllUsersWithProvider('microsoft');
    const results: Array<{ userId: string; action: string; ok: boolean; error?: string }> = [];
    for (const userId of userIds) {
      const r = await ensureGraphSubscription(userId);
      results.push({ userId, action: r.action, ok: r.ok, ...(r.error ? { error: r.error } : {}) });
    }
    return NextResponse.json({
      ok: true,
      users: userIds.length,
      created: results.filter((r) => r.action === 'created' || r.action === 'recreated').length,
      renewed: results.filter((r) => r.action === 'renewed').length,
      skipped: results.filter((r) => r.action === 'skipped').length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (error: unknown) {
    return apiErrorForRoute(error, 'cron/renew-graph-subscriptions');
  }
}

export const GET = handler;
export const POST = handler;
