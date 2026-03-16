/**
 * POST /api/drafts/decide
 * Body: { draft_id: string, decision: "approve" | "reject" }
 *
 * Unified execution layer: delegates to executeAction().
 * Approve = artifact fully executed (email, document, calendar, research, etc.).
 * Reject = skip with feedback; both paths write to tkg_signals for learning.
 *
 * Auth: session OR x-ingest-secret header.
 */

import { NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { executeAction } from '@/lib/conviction/execute-action';
import { validationError } from '@/lib/utils/api-error';
import { draftsDecideBodySchema } from '@/lib/utils/api-schemas';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await resolveUser(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const raw = await request.json().catch(() => ({}));
  const parsed = draftsDecideBodySchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Invalid request';
    return validationError(msg);
  }
  const { draft_id, decision, edited_artifact } = parsed.data;

  const result = await executeAction({
    userId,
    actionId: draft_id,
    decision: decision === 'reject' ? 'reject' : 'approve',
    ...(edited_artifact ? { editedArtifact: edited_artifact as Record<string, unknown> } : {}),
  });

  if (result.error && result.status === 'skipped') {
    return NextResponse.json(
      { error: result.error },
      { status: result.error.includes('Cannot execute') ? 409 : 404 },
    );
  }
  if (result.status === 'draft_rejected') {
    return NextResponse.json({ draft_id: result.action_id, decision: 'reject', status: 'draft_rejected' });
  }

  return NextResponse.json({
    draft_id: result.action_id,
    decision: decision === 'reject' ? 'reject' : 'approve',
    status: result.status,
    result: result.result,
    email_sent: result.result?.sent === true,
  });
}
