/**
 * Conviction Engine — generates the single highest-leverage action today.
 *
 * Data sources: tkg_signals, tkg_commitments, tkg_entities, tkg_goals
 * Feedback:     tkg_actions (feedback_weight IS NOT NULL — prior approvals/skips)
 * AI model:     claude-sonnet-4-6
 * Output:       ConvictionDirective (one directive, not a report)
 *
 * Learning loop:
 *   executed rows  → feedback_weight  +1.0 → positive signal
 *   skipped rows   → feedback_weight  -0.5 → negative signal
 *   rejected rows  → feedback_weight  -1.0 → strong negative signal
 *   The feedback section in the user prompt penalizes repeated rejects
 *   and boosts patterns that have worked before.
 *
 * Also exports generateBriefing() for backwards compat with
 * /api/briefing/latest (wraps the conviction directive into the old shape).
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import type { ChiefOfStaffBriefing, ConvictionDirective, ActionType, EvidenceItem } from './types';
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
// Conviction engine system prompt
// One directive. No hedging. No lists.
// Includes feedback-loop instructions.
// ---------------------------------------------------------------------------

const CONVICTION_SYSTEM = `You are a conviction engine embedded inside a personal chief-of-staff system.

You have access to this person's complete behavioral history: every decision they have made, every pattern identified in their conversations, every commitment they have taken on, and every goal they have declared.

Your only job is to identify the single highest-leverage action they should take TODAY.

Not a summary. Not a list. One directive.

Evaluate the full context — goals, active commitments, behavioral patterns, recent signals — and surface the action that will move the needle most given what you know about how this person actually behaves (not just what they say they will do).

The action_type must be one of:
- write_document: create a document, plan, or written artifact
- send_message: reach out to a specific person
- make_decision: commit to one path and stop deliberating
- do_nothing: the highest-leverage move is to wait and let something resolve
- schedule: block time or create a calendar commitment
- research: gather specific information before the next decision point

The reason must be one sentence citing specific behavioral evidence from their history (e.g., "You have asked Claude about this job three times in 90 days without acting, and your pattern data shows you stall on high-stakes career decisions when clarity is available").

The evidence array must contain 2-5 specific items from their graph (signal dates, commitment descriptions, pattern names, or goal text) that directly justify this directive.

The confidence score reflects how many times this pattern has appeared and produced a known outcome. 90+ means you have seen this exact scenario resolve this exact way multiple times. Below 50 means the evidence is suggestive but thin.

FEEDBACK LEARNING RULES — when FEEDBACK HISTORY is provided:
- action_types with a negative net weight have been rejected by this person before. Strongly avoid recommending them again unless the behavioral evidence is overwhelming and qualitatively different from the prior rejected cases.
- action_types with a positive net weight have been confirmed effective. Favor them when the evidence supports.
- Look beyond action_type: if the REJECTED section shows a similar directive text or reasoning pattern to what you were about to recommend, that is a strong signal to pivot to a different action type or framing.
- A history of repeated skips on the same pattern is itself a behavioral signal — factor it into your confidence score.

SEARCH FLAGS — set these when the artifact will need current external information:
- requires_search: true if the artifact needs current data from the web (job postings, prices, availability, deadlines, reviews, contact info, event details). False if the artifact can be fully produced from the user's graph data alone.
- search_context: if requires_search is true, describe specifically what to search for (e.g. "WA DOT engineer job posting", "Italian restaurants near downtown Seattle with outdoor seating", "ESD unemployment claim follow-up process Washington state").

Return JSON only — no prose outside the JSON:
{
  "directive": "The action in plain English, written as an instruction to the user",
  "action_type": "write_document | send_message | make_decision | do_nothing | schedule | research",
  "confidence": 0,
  "reason": "One sentence citing specific behavioral evidence",
  "evidence": [
    { "type": "signal | commitment | goal | pattern", "description": "specific item", "date": "YYYY-MM-DD or null" }
  ],
  "fullContext": "2-3 sentences of additional context the user can read if they want more detail",
  "requires_search": false,
  "search_context": null
}`;

// ---------------------------------------------------------------------------
// Build approval-rate section (per-type suppression / boosting)
// Uses status counts — separate from the weight-based feedback section.
// ---------------------------------------------------------------------------

interface ApprovalRow {
  action_type:  string;
  status:       string;
  generated_at: string;
}

function buildApprovalRateSection(rows: ApprovalRow[]): string {
  if (rows.length === 0) return '';

  const byType: Record<string, ApprovalRow[]> = {};
  for (const r of rows) {
    if (!byType[r.action_type]) byType[r.action_type] = [];
    byType[r.action_type].push(r);
  }

  const suppressed: string[] = [];
  const boosted:    string[] = [];
  const consecutive: string[] = [];
  const rateLines:  string[] = [];

  for (const [type, actions] of Object.entries(byType)) {
    const total    = actions.length;
    const approved = actions.filter(a => a.status === 'executed').length;
    const rate     = total > 0 ? approved / total : 0;

    rateLines.push(`  • ${type}: ${approved}/${total} approved (${Math.round(rate * 100)}%)`);

    if (rate < 0.3 && total >= 3) suppressed.push(type);
    if (rate > 0.6 && total >= 2) boosted.push(type);

    const sorted = [...actions].sort(
      (a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime()
    );
    const last3 = sorted.slice(0, 3);
    if (
      last3.length === 3 &&
      last3.every(a =>
        a.status === 'skipped' || a.status === 'draft_rejected' || a.status === 'rejected'
      )
    ) {
      consecutive.push(type);
    }
  }

  const allSuppressed = [...new Set([...suppressed, ...consecutive])];

  let section = '\nAPPROVAL RATES BY ACTION TYPE (last 30 days):';
  section += '\n' + rateLines.join('\n');

  if (boosted.length > 0) {
    section += `\n\nHIGH-APPROVAL TYPES (>60%): ${boosted.join(', ')} — favor these when evidence supports`;
  }
  if (allSuppressed.length > 0) {
    section += `\n\nSUPPRESSED TYPES (approval <30% OR 3 consecutive dismissals): ${allSuppressed.join(', ')}`;
    section += '\n  → DO NOT generate these unless evidence is overwhelming and qualitatively different from prior dismissed cases.';
  }
  if (consecutive.length > 0) {
    section += `\n\nHARD-SUPPRESSED (3 dismissals in a row): ${consecutive.join(', ')}`;
    section += '\n  → HARD SUPPRESS until user signals or behavioral context changes significantly.';
  }

  return section;
}

// ---------------------------------------------------------------------------
// Build feedback section from prior evaluated directives
// ---------------------------------------------------------------------------

interface FeedbackRow {
  id: string;
  action_type: string;
  directive_text: string;
  reason: string;
  status: string;
  feedback_weight: number;
  generated_at: string;
}

function buildFeedbackSection(rows: FeedbackRow[]): string {
  if (rows.length === 0) return '';

  const positive = rows.filter(r => (r.feedback_weight ?? 0) > 0);
  const negative = rows.filter(r => (r.feedback_weight ?? 0) < 0);

  // Net weight per action_type
  const netByType: Record<string, number> = {};
  for (const r of rows) {
    netByType[r.action_type] = (netByType[r.action_type] ?? 0) + (r.feedback_weight ?? 0);
  }

  const netLines = Object.entries(netByType)
    .sort((a, b) => b[1] - a[1])
    .map(([type, weight]) => {
      const sign = weight > 0 ? '+' : '';
      return `  • ${type}: ${sign}${weight.toFixed(1)}`;
    })
    .join('\n');

  const positiveLines = positive
    .slice(0, 5)
    .map(r => `  • [${r.action_type}] "${r.directive_text.slice(0, 120)}" — ${r.reason.slice(0, 100)} (weight: +${r.feedback_weight})`)
    .join('\n');

  const negativeLines = negative
    .slice(0, 5)
    .map(r => {
      const label = r.status === 'rejected' ? 'REJECTED' : 'SKIPPED';
      return `  • [${r.action_type}] "${r.directive_text.slice(0, 120)}" — ${r.reason.slice(0, 100)} (weight: ${r.feedback_weight})`;
    })
    .join('\n');

  return `
FEEDBACK HISTORY (${rows.length} prior directives with user feedback — use to penalize/boost):

NET WEIGHT BY ACTION_TYPE (negative = user has rejected this pattern; positive = confirmed effective):
${netLines}
${positive.length > 0 ? `\nEXECUTED — user approved and ran these directives (positive signal):\n${positiveLines}` : ''}
${negative.length > 0 ? `\nSKIPPED/REJECTED — user passed on these (negative signal — avoid similar patterns):\n${negativeLines}` : ''}`;
}

// ---------------------------------------------------------------------------
// Main export — generateDirective
// ---------------------------------------------------------------------------

export async function generateDirective(userId: string): Promise<ConvictionDirective> {
  const supabase = getSupabase();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Pull all data sources in parallel — including feedback history and approval rates
  const [signalsRes, commitmentsRes, entityRes, goalsRes, feedbackRes, approvalStatsRes] = await Promise.all([
    supabase
      .from('tkg_signals')
      .select('type, source, content, occurred_at')
      .eq('user_id', userId)
      .gte('occurred_at', thirtyDaysAgo)
      .eq('processed', true)
      .order('occurred_at', { ascending: false })
      .limit(15),

    supabase
      .from('tkg_commitments')
      .select('description, category, status, risk_score, risk_factors, made_at, source_context')
      .eq('user_id', userId)
      .in('status', ['active', 'at_risk'])
      .order('risk_score', { ascending: false })
      .limit(25),

    supabase
      .from('tkg_entities')
      .select('patterns, total_interactions')
      .eq('user_id', userId)
      .eq('name', 'self')
      .maybeSingle(),

    supabase
      .from('tkg_goals')
      .select('goal_text, goal_category, priority')
      .eq('user_id', userId)
      .order('priority', { ascending: false })
      .limit(10),

    // Feedback: all rows that have been evaluated (feedback_weight IS NOT NULL)
    supabase
      .from('tkg_actions')
      .select('id, action_type, directive_text, reason, status, feedback_weight, generated_at')
      .eq('user_id', userId)
      .not('feedback_weight', 'is', null)
      .order('generated_at', { ascending: false })
      .limit(30),

    // Approval rates: all acted-on rows (status not pending/draft) for rate calculation
    supabase
      .from('tkg_actions')
      .select('action_type, status, generated_at')
      .eq('user_id', userId)
      .not('status', 'in', '("pending_approval","draft")')
      .gte('generated_at', thirtyDaysAgo)
      .order('generated_at', { ascending: false })
      .limit(100),
  ]);

  const signals     = signalsRes.data ?? [];
  const commitments = commitmentsRes.data ?? [];
  const patterns    = (entityRes.data?.patterns as Record<string, any>) ?? {};
  const goals       = goalsRes.data ?? [];
  const feedback     = (feedbackRes.data    ?? []) as FeedbackRow[];
  const approvalRows = (approvalStatsRes.data ?? []) as ApprovalRow[];

  // Empty graph
  if (signals.length === 0 && commitments.length === 0 && goals.length === 0) {
    return {
      directive: 'Paste your first Claude conversation export into the dashboard to feed the graph.',
      action_type: 'write_document',
      confidence: 0,
      reason: 'The identity graph is empty — no behavioral history to analyze yet.',
      evidence: [],
    };
  }

  // Build context
  const signalLines = signals
    .map(s => `[${(s.occurred_at as string).slice(0, 10)}] ${sanitizeForPrompt((s.content as string).slice(0, 250), 250)}`)
    .join('\n');

  const commitmentLines = commitments
    .map(c => {
      const stakes = (c.risk_factors as any[])?.[0]?.stakes ?? 'unknown';
      return `• [${c.status}, risk ${c.risk_score}/100, stakes:${stakes}] ${c.description}`;
    })
    .join('\n');

  const patternLines = Object.values(patterns)
    .map((p: any) => `• ${p.name} (${p.activation_count}× across domains: ${p.domain}): ${p.description}`)
    .join('\n') || 'None extracted yet.';

  const goalLines = goals.length > 0
    ? goals.map((g: any) => `• [${g.goal_category}, priority ${g.priority}/5] ${g.goal_text}`).join('\n')
    : 'No declared goals yet.';

  // Feedback section (empty string if no history — no noise added)
  const feedbackSection    = buildFeedbackSection(feedback);
  const approvalRateSection = buildApprovalRateSection(approvalRows);

  const userPrompt = `DECLARED GOALS (${goals.length} total — measure every recommendation against these):
${goalLines}

ACTIVE COMMITMENTS (${commitments.length} total):
${commitmentLines || 'None.'}

BEHAVIORAL PATTERNS (from ${Object.keys(patterns).length} identified patterns):
${patternLines}

RECENT SIGNALS (last 30 days, ${signals.length} total):
${signalLines || 'None.'}
${approvalRateSection}
${feedbackSection}
Identify the single highest-leverage action for today. Return only the JSON directive.`;

  // Call Claude
  let parsed: {
    directive: string;
    action_type: ActionType;
    confidence: number;
    reason: string;
    evidence: EvidenceItem[];
    fullContext?: string;
    requires_search?: boolean;
    search_context?: string | null;
  } | null = null;

  try {
    const response = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      temperature: 0.3 as any,
      system: CONVICTION_SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const raw = response.content[0].type === 'text' ? response.content[0].text : '';
    parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
  } catch (err) {
    console.error('[generateDirective] Claude call/parse failed:', err);
  }

  return {
    directive:       parsed?.directive       ?? 'Generation failed — check ANTHROPIC_API_KEY.',
    action_type:     parsed?.action_type     ?? 'research',
    confidence:      parsed?.confidence      ?? 0,
    reason:          parsed?.reason          ?? '',
    evidence:        parsed?.evidence        ?? [],
    fullContext:      parsed?.fullContext,
    requires_search: parsed?.requires_search ?? false,
    search_context:  parsed?.search_context  ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Backwards-compat wrapper — called by /api/briefing/latest
// ---------------------------------------------------------------------------

export async function generateBriefing(userId: string): Promise<ChiefOfStaffBriefing> {
  const supabase = getSupabase();
  const directive = await generateDirective(userId);

  const brief: ChiefOfStaffBriefing = {
    userId,
    briefingDate: today(),
    generatedAt:  new Date(),
    topInsight:   directive.reason,
    confidence:   directive.confidence,
    recommendedAction: directive.directive,
    fullBrief:    directive.fullContext ?? directive.reason,
  };

  // Write to tkg_briefings (best-effort)
  const { error: writeErr } = await supabase.from('tkg_briefings').insert({
    user_id:            userId,
    briefing_date:      brief.briefingDate,
    generated_at:       brief.generatedAt.toISOString(),
    top_insight:        brief.topInsight,
    confidence:         brief.confidence,
    recommended_action: brief.recommendedAction,
    stats: {
      signalsAnalyzed:     0,
      commitmentsReviewed: 0,
      patternsActive:      0,
      fullBrief:           brief.fullBrief,
      directive:           directive,
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
