/**
 * Chief-of-Staff Briefing Generator — Phase 1 Rewrite
 *
 * Data sources: tkg_signals, tkg_commitments, tkg_entities (identity graph)
 * AI model:     claude-sonnet-4-6
 * Output:       ChiefOfStaffBriefing + writes to tkg_briefings
 *
 * Old signature: generateBriefing(userId, scanResult, relationshipMap, config)
 * New signature: generateBriefing(userId)
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import type { ChiefOfStaffBriefing } from './types';
import { sanitizeForPrompt } from '@/lib/utils/prompt-sanitization';

// ---------------------------------------------------------------------------
// Clients (lazy)
// ---------------------------------------------------------------------------

let _anthropic: Anthropic | null = null;
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ---------------------------------------------------------------------------
// Chief-of-Staff system prompt (from pivot spec)
// ---------------------------------------------------------------------------

const COS_SYSTEM = `You are a chief of staff who has been embedded with this person for months. You have read everything. You know their patterns, their goals, their decisions, what has worked and what hasn't.

Your job is to walk in the room and tell them exactly what they need to know today — without being asked.

Write a morning brief: 3-5 lines maximum. Lead with the single most important thing. Include a confidence score (0-100) on your primary recommendation, based on how many times similar decisions have produced similar outcomes in their history. End with one specific action.

Do not hedge. Do not list options. Give a verdict.

Return JSON only:
{
  "topInsight": "The single most important thing right now",
  "confidence": 0,
  "recommendedAction": "One specific action to take today",
  "fullBrief": "Full 3-5 line morning brief prose"
}`;

// ---------------------------------------------------------------------------
// Main export — kept as generateBriefing to preserve existing route wiring
// ---------------------------------------------------------------------------

export async function generateBriefing(userId: string): Promise<ChiefOfStaffBriefing> {
  const supabase = getSupabase();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Query the identity graph in parallel
  const [signalsRes, commitmentsRes, entityRes] = await Promise.all([
    supabase
      .from('tkg_signals')
      .select('type, source, content, occurred_at')
      .eq('user_id', userId)
      .gte('occurred_at', thirtyDaysAgo)
      .order('occurred_at', { ascending: false })
      .limit(10),

    supabase
      .from('tkg_commitments')
      .select('description, category, status, risk_score, risk_factors, made_at')
      .eq('user_id', userId)
      .in('status', ['active', 'at_risk'])
      .order('risk_score', { ascending: false })
      .limit(20),

    supabase
      .from('tkg_entities')
      .select('patterns, total_interactions')
      .eq('user_id', userId)
      .eq('name', 'self')
      .maybeSingle(),
  ]);

  const signals = signalsRes.data ?? [];
  const commitments = commitmentsRes.data ?? [];
  const patterns = (entityRes.data?.patterns as Record<string, any>) ?? {};

  // Empty graph — return a prompt to feed data
  if (signals.length === 0 && commitments.length === 0) {
    return {
      userId,
      briefingDate: today(),
      generatedAt: new Date(),
      topInsight: 'No conversation history loaded yet.',
      confidence: 0,
      recommendedAction: 'Paste a Claude conversation export into POST /api/extraction/ingest to get started.',
      fullBrief: 'Your identity graph is empty. Feed it your first conversation and check back tomorrow.',
    };
  }

  // Build context string for Claude
  const signalLines = signals
    .map(s => `[${s.source}] ${(s.occurred_at as string).slice(0, 10)}: ${sanitizeForPrompt((s.content as string).slice(0, 300), 300)}`)
    .join('\n');

  const commitmentLines = commitments
    .map(c => {
      const stakes = (c.risk_factors as any[])?.[0]?.stakes ?? 'unknown';
      return `• ${c.description} [${c.status}, risk ${c.risk_score}/100, stakes: ${stakes}]`;
    })
    .join('\n');

  const patternLines = Object.values(patterns)
    .map((p: any) => `• ${p.name}: ${p.description} (seen ${p.activation_count}×)`)
    .join('\n') || 'None extracted yet.';

  const userPrompt = `RECENT SIGNALS (last 30 days, ${signals.length} total):
${signalLines || 'None.'}

ACTIVE COMMITMENTS (${commitments.length} total):
${commitmentLines || 'None.'}

BEHAVIORAL PATTERNS:
${patternLines}

Write the morning brief.`;

  // Call Claude
  let parsed: { topInsight: string; confidence: number; recommendedAction: string; fullBrief: string } | null = null;

  try {
    const response = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      temperature: 0.4 as any,
      system: COS_SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const raw = response.content[0].type === 'text' ? response.content[0].text : '';
    parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
  } catch (err) {
    console.error('[generateBriefing] Claude call/parse failed:', err);
  }

  const brief: ChiefOfStaffBriefing = {
    userId,
    briefingDate: today(),
    generatedAt: new Date(),
    topInsight: parsed?.topInsight ?? 'Generation failed — check ANTHROPIC_API_KEY.',
    confidence: parsed?.confidence ?? 0,
    recommendedAction: parsed?.recommendedAction ?? '',
    fullBrief: parsed?.fullBrief ?? '',
  };

  // Write to tkg_briefings (best-effort — don't throw if write fails)
  const { error: writeErr } = await supabase.from('tkg_briefings').insert({
    user_id: userId,
    briefing_date: brief.briefingDate,
    generated_at: brief.generatedAt.toISOString(),
    top_insight: brief.topInsight,
    confidence: brief.confidence,
    recommended_action: brief.recommendedAction,
    stats: {
      signalsAnalyzed: signals.length,
      commitmentsReviewed: commitments.length,
      patternsActive: Object.keys(patterns).length,
    },
  });

  if (writeErr) {
    console.error('[generateBriefing] tkg_briefings write failed:', writeErr.message);
  }

  return brief;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
