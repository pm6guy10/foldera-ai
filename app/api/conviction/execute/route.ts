/**
 * POST /api/conviction/execute
 * Body: { action_id: string, decision: "approve" | "skip", skip_reason?: SkipReason }
 *
 * Unified execution layer: delegates to executeAction().
 * On approve, artifact is fully executed (email send, calendar create, document/research saved).
 * Feedback is written to tkg_signals with idempotent keys.
 */

import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { executeAction } from '@/lib/conviction/execute-action';
import { validationError } from '@/lib/utils/api-error';
import { executeBodySchema } from '@/lib/utils/api-schemas';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await resolveUser(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const raw = await request.json().catch(() => ({}));
  const parsed = executeBodySchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Invalid request';
    return validationError(msg);
  }
  const { action_id, decision, skip_reason } = parsed.data;

  try {
    const result = await executeAction({
      userId,
      actionId: action_id,
      decision: decision as 'approve' | 'skip',
      skipReason: skip_reason,
    });

    if (result.error && result.status === 'skipped') {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    return NextResponse.json({
      status: result.status,
      action_id: result.action_id,
      result: result.result,
    });
  } catch (error) {
    Sentry.captureException(error, { tags: { route: 'conviction/execute', userId } });
    console.error('[conviction/execute] execute failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Execution failed' }, { status: 500 });
  }
}
