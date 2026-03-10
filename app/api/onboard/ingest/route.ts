/**
 * POST /api/onboard/ingest
 *
 * Public route — no auth required. Accepts a Claude conversation export
 * and processes it into the TKG under a client-generated tempUserId.
 *
 * Body: { text: string; tempUserId: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractFromConversation } from '@/lib/extraction/conversation-extractor';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  let body: { text?: unknown; tempUserId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { text, tempUserId } = body;

  if (typeof tempUserId !== 'string' || !UUID_RE.test(tempUserId)) {
    return NextResponse.json({ error: 'Invalid tempUserId' }, { status: 400 });
  }

  if (typeof text !== 'string' || text.trim().length < 50) {
    return NextResponse.json({ error: 'text must be at least 50 characters' }, { status: 400 });
  }

  try {
    const result = await extractFromConversation(text, tempUserId);
    return NextResponse.json({
      signalId: result.signalId,
      decisionsWritten: result.decisionsWritten,
      patternsUpdated: result.patternsUpdated,
    });
  } catch (err: any) {
    console.error('[/api/onboard/ingest]', err.message);
    // Let duplicate ingests pass through silently
    if (err.message?.includes('already ingested')) {
      return NextResponse.json({ signalId: null, decisionsWritten: 0, patternsUpdated: 0 });
    }
    return NextResponse.json({ error: err.message || 'Extraction failed' }, { status: 500 });
  }
}
