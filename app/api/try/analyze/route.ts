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
- What are the SPECIFIC variables in their situation? (Exact tensions, named people, stated constraints)

STEP 2 — INFER THE REAL ISSUE:
The thing they wrote about is usually not the thing they're stuck on. The paragraph is the symptom. Find the cause.
- If they mention 3 things, the one with the most hedging language ("but," "keep," "still") is the real issue.
- Distinguish between: "stuck on a decision" vs "avoiding a conversation" vs "losing energy from a slow bleed." They require different artifacts.
- Personal/emotional paralysis (job stays, relationship tension, values conflict) is NOT the same as a practical decision. Don't treat them as equivalent.

STEP 3 — GENERATE DIRECTIVE + ARTIFACT:
The directive must name something they didn't explicitly say. That's the test.
Bad: "Follow up with your contacts about the job" (they already know this)
Bad: "You need to make a decision about your job" (also obvious)
Good: "You're not stuck on the decision — you're stuck because staying feels safe and leaving feels like abandoning your wife's trust."
Good: "Three months of applications that aren't landing is a signal about the role you're targeting, not your energy level."

The directive is a direct statement that reframes their situation. NOT an instruction to do something. NOT "you should." A statement that makes them stop and think: "how did it know that?"

Then generate a FINISHED ARTIFACT. Not a suggestion. The actual work product.
- Stuck on a decision with competing forces → build the decision frame using their SPECIFIC variables
- Avoiding a conversation → draft the exact email or message they need to send
- Need clarity → document with their specific situation analyzed
- Best move is to wait → explain why with evidence from their specific text

ARTIFACT SPECIFICITY RULES:
- For decision artifacts: options MUST name their actual variables, not generic "Option A / Option B"
  Example for job/toxic manager: {"option": "Leave in 60 days with a target role defined", "weight": 0.6, "rationale": "3 months of drift has a cost; a deadline converts paralysis into a plan"}
  NOT: {"option": "Leave the job", "weight": 0.6, "rationale": "Toxic environment is harmful"}
- Each option must weigh their actual stated constraints (pay, relationship, energy, external validation)
- The recommendation must name WHY given their specific situation — not generic advice
- For drafted_email: only if you have a real name/context to write to. Otherwise use decision.

CONFIDENCE CALIBRATION:
- Vague paragraph, no specific situation = 35-40
- Emotional paralysis, personal conflict, values tension — even with names = 40-52
  (You can see the pattern but can't resolve it for them; the artifact frames it, doesn't close it)
- Professional situation with clear next action and enough context to draft real work = 55-70
- Specific request with full context (names, emails, deadlines) = 70-85
NOTE: Confidence is NOT how sure you are about your insight. It's how executable the artifact is without more information from the user.

Return JSON only, no prose:
{
  "directive": "One sentence that names what they can't see. A direct reframe, not an instruction. No 'you should.' Just the observation.",
  "action_type": "send_message | write_document | make_decision | do_nothing | schedule | research",
  "confidence": 0,
  "reason": "One sentence connecting the inference to specific words from their text — quote or paraphrase what they actually said",
  "evidence": [
    { "type": "signal", "description": "specific extracted signal from their paragraph — use their actual words", "date": null }
  ],
  "artifact_type": "drafted_email | document | decision | calendar_event | research_brief | wait_rationale",
  "artifact": "<the actual finished work product as JSON: for drafted_email: {\"to\":\"[their contact if named]\",\"subject\":\"...\",\"body\":\"...\"}, for document: {\"title\":\"...\",\"content\":\"...\"}, for decision: {\"options\":[{\"option\":\"specific option using their variables\",\"weight\":0.0,\"rationale\":\"why given their specific constraints\"}],\"recommendation\":\"specific recommendation citing their situation\"}, for calendar_event: {\"title\":\"...\",\"start\":\"ISO8601\",\"end\":\"ISO8601\",\"description\":\"...\"}, for research_brief: {\"findings\":\"...\",\"sources\":[],\"recommended_action\":\"...\"}, for wait_rationale: {\"context\":\"specific situation from their text\",\"evidence\":\"specific reason from their text why waiting is right\"}>"
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
