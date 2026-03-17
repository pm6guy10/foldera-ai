/**
 * GET /api/settings/spend
 * Returns daily and monthly API spend for the settings page.
 * Auth required — returns data for any authenticated session (single-user app).
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth/auth-options';
import { getSpendSummary } from '@/lib/utils/api-tracker';
import { logStructuredEvent } from '@/lib/utils/structured-logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const summary = await getSpendSummary(session.user.id);
    return NextResponse.json(summary);
  } catch (err) {
    logStructuredEvent({
      event: 'settings_spend_failed',
      level: 'error',
      generationStatus: 'spend_summary_failed',
      artifactType: null,
      details: {
        scope: 'settings/spend',
        error: err instanceof Error ? err.message : String(err),
      },
    });
    return NextResponse.json({ error: 'Failed to load spend summary' }, { status: 500 });
  }
}
