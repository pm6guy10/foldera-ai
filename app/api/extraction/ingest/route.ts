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
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth/auth-options';
import { extractFromConversation } from '@/lib/extraction/conversation-extractor';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // Resolve userId — either from a valid session or from the script-level ingest secret
  let userId: string | undefined;
  const ingestSecret = request.headers.get('x-ingest-secret');
  if (ingestSecret) {
    if (ingestSecret !== process.env.INGEST_API_KEY) {
      return NextResponse.json({ error: 'Invalid ingest secret' }, { status: 401 });
    }
    userId = process.env.INGEST_USER_ID;
    if (!userId) {
      return NextResponse.json({ error: 'INGEST_USER_ID not configured' }, { status: 500 });
    }
  } else {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Single-user app: prefer INGEST_USER_ID (a valid Supabase UUID) over
    // session.user.id, which could be a Google sub string if the JWT callback
    // hasn't been refreshed since the fix was deployed.
    userId = process.env.INGEST_USER_ID ?? session.user.id;
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
      { error: err.message || 'Extraction failed' },
      { status: 500 }
    );
  }
}
