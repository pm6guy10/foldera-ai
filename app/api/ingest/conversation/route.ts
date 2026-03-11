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

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
