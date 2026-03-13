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
const DEMO_SYSTEM = `You are Foldera's conviction engine. You receive a single paragraph from a stranger describing what they're working on or struggling with.

Your job is NOT to give advice. Your job is to SEE THEM. Extract what they didn't say explicitly. Name the pattern they can't see from inside it.

STEP 1 — EXTRACT (do this silently, don't output it):
- What decisions are being avoided? (Look for time markers: "been thinking about," "for a while," "keep going back and forth")
- What relationships are being managed or avoided? (Any named person or role = a relationship signal)
- What's the emotional undertone? (Frustration, paralysis, guilt, excitement they're suppressing)
- What would a chief of staff notice that this person is blind to?

STEP 2 — INFER THE REAL ISSUE:
The thing they wrote about is usually not the thing they're stuck on. The paragraph is the symptom. Find the cause. If they mention 3 things, the one they circle back to or mention with the most hedging language is the real issue.

STEP 3 — GENERATE DIRECTIVE + ARTIFACT:
The directive must name something they didn't explicitly say. That's the test.
Bad: "Follow up with your contacts about the job" (they already know this)
Good: "You've been holding this decision for 2 weeks. The decision isn't hard. The conversation with your manager is. Here's the email."

Then generate a FINISHED ARTIFACT. Not a suggestion. The actual work product.
- If they mention a person → draft the email (to/subject/body)
- If they mention a decision → build the decision frame (options with weights)
- If they mention something they should do but haven't → draft the document or plan
- If the best move is to wait → explain why with specific evidence from their text
- If they need information → identify the exact questions and where to find answers

confidence should reflect how specific you can be:
- Vague paragraph, generic signals = 35-45
- Clear situation with named people/deadlines = 55-70
- Specific decision with enough context to draft real work = 70-85

Return JSON only, no prose:
{
  "directive": "One sentence that names what they can't see. Written as a direct statement, not an instruction.",
  "action_type": "send_message | write_document | make_decision | do_nothing | schedule | research",
  "confidence": 0,
  "reason": "One sentence connecting the inference to specific words from their text",
  "evidence": [
    { "type": "signal", "description": "specific extracted signal from their paragraph", "date": null }
  ],
  "artifact_type": "drafted_email | document | decision | calendar_event | research_brief | wait_rationale",
  "artifact": "<the actual finished work product as JSON: for drafted_email: {\"to\":\"[their contact]\",\"subject\":\"...\",\"body\":\"...\"}, for document: {\"title\":\"...\",\"content\":\"...\"}, for decision: {\"options\":[{\"option\":\"...\",\"weight\":0.0,\"rationale\":\"...\"}],\"recommendation\":\"...\"}, for calendar_event: {\"title\":\"...\",\"start\":\"ISO8601\",\"end\":\"ISO8601\",\"description\":\"...\"}, for research_brief: {\"findings\":\"...\",\"sources\":[],\"recommended_action\":\"...\"}, for wait_rationale: {\"context\":\"...\",\"evidence\":\"...\"}>"
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
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
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
      directive:     String(parsed.directive     ?? ''),
      action_type:   String(parsed.action_type   ?? 'research'),
      confidence:    Number(parsed.confidence    ?? 50),
      reason:        String(parsed.reason        ?? ''),
      evidence:      Array.isArray(parsed.evidence) ? parsed.evidence : [],
      artifact_type: String(parsed.artifact_type ?? ''),
      artifact:      parsed.artifact ?? null,
    });
  } catch (err: any) {
    console.error('[try/analyze]', err.message);
    return NextResponse.json({ error: 'Analysis failed — try again' }, { status: 500 });
  }
}
