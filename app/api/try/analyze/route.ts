/**
 * POST /api/try/analyze
 *
 * Zero-auth stateless demo. Accepts a short paragraph, calls Claude,
 * returns a directive card. No DB write. No session required.
 *
 * Body:    { text: string }
 * Returns: { directive, action_type, confidence, reason, evidence }
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { rateLimit } from '@/lib/utils/rate-limit';

export const dynamic = 'force-dynamic';

// Rate-limit: max 20 chars/sec check is server-side; we just enforce min length.
const DEMO_SYSTEM = `You are Foldera's conviction engine. You have been given one paragraph from someone describing what they are working on or struggling with right now.

Your job: identify the single most actionable thing they should do TODAY.

Be specific. Not generic advice. A real concrete action.
Good: "Email Marcus Chen this week to confirm the revenue share terms before the Friday deadline he mentioned."
Bad: "Follow up with relevant stakeholders about ongoing priorities."

action_type must be exactly one of:
- write_document: create a document, plan, or written artifact
- send_message: reach out to a specific person
- make_decision: commit to one path and stop deliberating
- do_nothing: the best move is to wait and let something resolve
- schedule: block time or create a calendar commitment
- research: gather specific information before the next decision

confidence should be 40–70 — you only have one paragraph.

Return JSON only, no prose:
{
  "directive": "Specific action in plain English, written as an instruction",
  "action_type": "one of the six types above",
  "confidence": 55,
  "reason": "One sentence citing evidence directly from their text",
  "evidence": [
    { "type": "signal", "description": "specific detail from their paragraph", "date": null }
  ]
}`;

export async function POST(request: NextRequest) {
  // Rate limit: 5 requests per IP per hour
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown';
  const rl = await rateLimit(`try:analyze:${ip}`, { limit: 5, window: 3600 });
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Too many requests — please wait before trying again.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000)) } }
    );
  }

  let body: { text?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { text } = body;
  if (typeof text !== 'string' || text.trim().length < 20) {
    return NextResponse.json({ error: 'text must be at least 20 characters' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      temperature: 0.4 as any,
      system: DEMO_SYSTEM,
      messages: [{
        role: 'user',
        content: `Here is what I'm working on or struggling with:\n\n${text.slice(0, 1200)}`,
      }],
    });

    const raw = response.content[0].type === 'text' ? response.content[0].text : '';
    const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());

    return NextResponse.json({
      directive:   String(parsed.directive   ?? ''),
      action_type: String(parsed.action_type ?? 'research'),
      confidence:  Number(parsed.confidence  ?? 50),
      reason:      String(parsed.reason      ?? ''),
      evidence:    Array.isArray(parsed.evidence) ? parsed.evidence : [],
    });
  } catch (err: any) {
    console.error('[try/analyze]', err.message);
    return NextResponse.json({ error: 'Analysis failed — try again' }, { status: 500 });
  }
}
