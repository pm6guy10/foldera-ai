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

  const body = await request.json().catch(() => ({}));
  const { action_id, decision, skip_reason } = body as {
    action_id?: string;
    decision?: string;
    skip_reason?: 'not_relevant' | 'already_handled' | 'wrong_approach';
  };

  if (!action_id) return NextResponse.json({ error: 'action_id required' }, { status: 400 });
  if (!['approve', 'skip'].includes(decision ?? '')) {
    return NextResponse.json({ error: 'decision must be "approve" or "skip"' }, { status: 400 });
  }

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
