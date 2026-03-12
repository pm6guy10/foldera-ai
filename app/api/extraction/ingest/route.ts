/**
 * POST /api/extraction/ingest
 *
 * Accepts a raw Claude conversation export, runs it through the extraction
 * engine, and writes the result into the tkg_ identity graph.
 *
 * Body: { text: string }
 * Returns: { signalId, decisionsWritten, patternsUpdated, tokensUsed }
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { extractFromConversation } from '@/lib/extraction/conversation-extractor';
import { rateLimit } from '@/lib/utils/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await resolveUser(request as unknown as Request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  // Rate limit: 10 requests per 60 seconds per user
  const rl = await rateLimit(`ingest:${userId}`, { limit: 10, window: 60 });
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000)) } },
    );
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
  } catch (err: any) {
    console.error('[/api/extraction/ingest]', err);
    return NextResponse.json(
      { error: 'Internal server error during extraction' },
      { status: 500 }
    );
  }
}
