/**
 * POST /api/conviction/execute
 * Body: { action_id: string, decision: "approve" | "skip", skip_reason?: SkipReason }
 *
 * Unified execution layer: delegates to executeAction().
 * On approve, artifact is fully executed (email send, calendar create, document/research saved).
 * Feedback is written to tkg_signals with idempotent keys.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth/auth-options';
import { executeAction } from '@/lib/conviction/execute-action';
import { validationError } from '@/lib/utils/api-error';
import { executeBodySchema } from '@/lib/utils/api-schemas';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let userId: string | undefined;
  const ingestSecret = request.headers.get('x-ingest-secret');
  if (ingestSecret) {
    if (ingestSecret !== process.env.INGEST_API_KEY) {
      return NextResponse.json({ error: 'Invalid ingest secret' }, { status: 401 });
    }
    userId = process.env.INGEST_USER_ID;
  } else {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    userId = process.env.INGEST_USER_ID ?? session.user.id;
  }
  if (!userId) return NextResponse.json({ error: 'User ID not resolved' }, { status: 500 });

  const raw = await request.json().catch(() => ({}));
  const parsed = executeBodySchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Invalid request';
    return validationError(msg);
  }
  const { action_id, decision, skip_reason } = parsed.data;

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
}
