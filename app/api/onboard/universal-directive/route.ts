/**
 * GET /api/onboard/universal-directive
 *
 * Public route — no auth required.
 *
 * Pulls the 3 highest-activation patterns from the identity graph
 * (INGEST_USER_ID), runs them through Claude to produce a universal
 * directive that feels personally true to any visitor.
 *
 * Confidence is derived from the top pattern's activation_count.
 * Falls back to a hardcoded high-confidence directive if anything fails.
 *
 * In-memory cache (1 hr TTL) — universal result is the same for all
 * anonymous visitors so we don't want a Claude call per page load.
 */

import { NextResponse }   from 'next/server';
import { createClient }   from '@supabase/supabase-js';
import Anthropic          from '@anthropic-ai/sdk';

export const dynamic = 'force-dynamic';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DirectiveResult {
  directive:   string;
  action_type: string;
  confidence:  number;
  reason:      string;
}

interface Pattern {
  name:             string;
  description:      string;
  domain:           string;
  activation_count: number;
}

// ─── Fallback ────────────────────────────────────────────────────────────────

const FALLBACK: DirectiveResult = {
  directive:   "You already know what to do. You're stalling because doing it makes it real.",
  action_type: 'DECIDE',
  confidence:  91,
  reason:      'Every person who lands here is avoiding one specific thing. This is it.',
};

// ─── In-memory cache (1 hr) ──────────────────────────────────────────────────

let cached: DirectiveResult | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ─── Clients ─────────────────────────────────────────────────────────────────

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

let _anthropic: Anthropic | null = null;
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

// ─── Action type label map ────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  write_document: 'WRITE',
  send_message:   'REACH OUT',
  make_decision:  'DECIDE',
  do_nothing:     'WAIT',
  schedule:       'SCHEDULE',
  research:       'RESEARCH',
};

// ─── Route ───────────────────────────────────────────────────────────────────

export async function GET() {
  // Serve from cache if fresh
  if (cached && Date.now() - cachedAt < CACHE_TTL_MS) {
    return NextResponse.json(cached);
  }

  const userId = process.env.INGEST_USER_ID;
  if (!userId) return NextResponse.json(FALLBACK);

  try {
    const supabase = getSupabase();

    // Pull the identity graph patterns for the ingest user
    const { data: entity, error } = await supabase
      .from('tkg_entities')
      .select('patterns')
      .eq('user_id', userId)
      .eq('name', 'self')
      .maybeSingle();

    if (error) throw error;

    const patternsMap = (entity?.patterns as Record<string, Pattern>) ?? {};
    const topPatterns = Object.values(patternsMap)
      .sort((a, b) => (b.activation_count ?? 0) - (a.activation_count ?? 0))
      .slice(0, 3);

    if (topPatterns.length === 0) return NextResponse.json(FALLBACK);

    // Confidence: scale activation_count of the top pattern into 75–95 range
    const topCount    = topPatterns[0].activation_count ?? 1;
    const confidence  = Math.min(95, 75 + Math.round(topCount * 1.5));

    const patternLines = topPatterns
      .map(p => `• "${p.name}" (seen ${p.activation_count}× in domain: ${p.domain}) — ${p.description}`)
      .join('\n');

    // Ask Claude for a universal directive from these patterns
    const response = await getAnthropic().messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 300,
      system: `You are a conviction engine. Your job is to surface the single most universally true insight that emerges from recurring behavioral patterns.

This directive will be shown to someone who just arrived — they haven't shared anything yet. It must feel privately, uncomfortably true to anyone who is stuck, avoiding a decision, or circling the same problem.

The best directives don't ask questions. They make a statement that lands like recognition — the reader thinks "how did it know?"

Return JSON only:
{
  "directive": "1–2 sentence direct statement of truth. No hedging. No 'you might'. Write as if you already know.",
  "action_type": "make_decision | do_nothing | send_message | write_document | schedule | research",
  "reason": "One sentence — what pattern makes this universally true?"
}`,
      messages: [{
        role:    'user',
        content: `These are the 3 most repeatedly-observed behavioral patterns from hundreds of conversations:\n\n${patternLines}\n\nGenerate the single most universally true directive from these patterns.`,
      }],
    });

    const raw    = response.content[0].type === 'text' ? response.content[0].text : '';
    const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());

    const result: DirectiveResult = {
      directive:   parsed.directive,
      action_type: ACTION_LABELS[parsed.action_type] ?? 'DECIDE',
      confidence,
      reason:      parsed.reason,
    };

    // Cache and return
    cached   = result;
    cachedAt = Date.now();
    return NextResponse.json(result);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[universal-directive]', msg);
    return NextResponse.json(FALLBACK);
  }
}
