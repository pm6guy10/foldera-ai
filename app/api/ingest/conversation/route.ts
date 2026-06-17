/**
 * POST /api/ingest/conversation
 *
 * Accepts a plain-text conversation transcript and runs it through the
 * extraction engine for INGEST_USER_ID.
 *
 * Auth: Authorization: Bearer {CRON_SECRET}
 * Body: { text: string }
 * Returns: { signalId, decisionsWritten, patternsUpdated, tokensUsed }
 *
 * Used by scripts/ingest-recent.mjs for continuous graph feeding.
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractFromConversation } from '@/lib/extraction/conversation-extractor';
import { validateCronAuth } from '@/lib/auth/resolve-user';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // Use the shared, timing-safe cron-auth helper (constant-time compare + accepts
  // Authorization: Bearer or x-cron-secret) instead of a hand-rolled `!==` check.
  const authError = validateCronAuth(request);
  if (authError) return authError;

  const userId = process.env.INGEST_USER_ID;
  if (!userId) {
    return NextResponse.json({ error: 'INGEST_USER_ID not configured' }, { status: 500 });
  }

  let body: { text?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { text } = body;
  if (typeof text !== 'string' || text.trim().length === 0) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  try {
    const result = await extractFromConversation(text, userId);
    return NextResponse.json({
      signalId: result.signalId,
      decisionsWritten: result.decisionsWritten,
      patternsUpdated: result.patternsUpdated,
      tokensUsed: result.tokensUsed,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[/api/ingest/conversation]', msg);
    return NextResponse.json({ error: 'Internal server error during extraction' }, { status: 500 });
  }
}
