/**
 * Conviction Engine — the brain.
 *
 * Generates the single highest-leverage action today.
 * Not a summary. Not a recommendation. A specific directive with a finished artifact.
 *
 * Data sources: tkg_signals, tkg_commitments, tkg_entities, tkg_goals, tkg_actions (feedback)
 * AI model:     directive = claude-sonnet-4-20250514
 *               artifact  = claude-haiku-4-5-20251001 (via artifact-generator.ts)
 * Output:       ConvictionDirective (one directive + embedded artifact)
 *
 * Learning loop:
 *   executed rows  → feedback_weight  +1.0 → positive signal
 *   skipped rows   → feedback_weight  -0.5 → negative signal
 *   rejected rows  → feedback_weight  -1.0 → strong negative signal
 *
 * Also exports generateBriefing() for backwards compat with /api/briefing/latest.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/db/client';
import type { ChiefOfStaffBriefing, ConvictionDirective, ActionType, EvidenceItem } from './types';
import { sanitizeForPrompt } from '@/lib/utils/prompt-sanitization';
import { getCoolingRelationships } from '@/lib/relationships/tracker';
import { trackApiCall, isOverDailyLimit } from '@/lib/utils/api-tracker';
import { decrypt } from '@/lib/encryption';

// ---------------------------------------------------------------------------
// Clients (lazy)
// ---------------------------------------------------------------------------

let _anthropic: Anthropic | null = null;
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

// ---------------------------------------------------------------------------
// Chief-of-Staff system prompt
// Replaced: summarizer → strategic thinker
// ---------------------------------------------------------------------------

const CONVICTION_SYSTEM = `You are a chief of staff who knows everything about this person. You have their goals, behavioral patterns, commitments, approval/skip history, and current signals.

Your job is NOT to summarize. Your job is to find the ONE thing they should do today that they haven't thought of yet.

Rules:
- NEVER repeat a directive the user already approved. If they approved "wait on MAS3" yesterday, find the next thing.
- NEVER produce a directive the user obviously knows. "Be present with family" is a greeting card, not insight.
- Every directive MUST include a concrete artifact: drafted email, specific task with deadline, document to review, decision with two options. No artifact = not a directive.
- Scan ALL data sources not just the loudest signal. Check: approaching deadlines, unanswered threads, commitments not acted on, patterns predicting failure, calendar gaps, financial triggers, relationship maintenance.
- Before outputting, test: "Would a $200/hr chief of staff say this or be embarrassed?" If embarrassed, go deeper.
- When the strategic answer is "do nothing today," surface a DIFFERENT domain. Career quiet? Surface family, financial, health, or project task. Never go dark because one thread paused.

ALREADY APPROVED (last 7 days) — do not repeat or rephrase these:
{APPROVED_SECTION}

SKIPPED (last 7 days) — do not regenerate similar unless new evidence:
{SKIPPED_SECTION}

ACTIVE GOALS — every directive must connect to one:
{GOALS_SECTION}

CONFIRMED PATTERNS (detection_count >= 3) — predictive inputs:
{PATTERNS_SECTION}

Output JSON only — no prose outside the JSON:
{
  "directive": "one sentence imperative",
  "artifact_type": "drafted_email | document | decision | calendar_event | research_brief | wait_rationale",
  "artifact": <the actual finished work product as a JSON object — for drafted_email: {"to":"...","subject":"...","body":"..."}, for document: {"title":"...","content":"..."}, for calendar_event: {"title":"...","start":"ISO8601","end":"ISO8601","description":"..."}, for research_brief: {"findings":"...","sources":[],"recommended_action":"..."}, for decision: {"options":[{"option":"...","weight":0.0,"rationale":"..."}],"recommendation":"..."}, for wait_rationale: {"context":"...","evidence":"..."}>,
  "evidence": "one sentence citing specific data",
  "domain": "career | family | financial | health | project",
  "why_now": "one sentence why today"
}`;

// ---------------------------------------------------------------------------
// Approval rate section builder
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
// Feedback section builder
// ---------------------------------------------------------------------------

interface FeedbackRow {
  id: string;
  action_type: string;
  directive_text: string;
  reason: string;
  status: string;
  feedback_weight: number;
  generated_at: string;
  skip_reason?: string | null;
}

function buildFeedbackSection(rows: FeedbackRow[]): string {
  if (rows.length === 0) return '';

  const positive = rows.filter(r => (r.feedback_weight ?? 0) > 0);
  const negative = rows.filter(r => (r.feedback_weight ?? 0) < 0);

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
      const skipInfo = r.skip_reason ? ` reason: ${r.skip_reason}` : '';
      return `  • ${label} [${r.action_type}]${skipInfo} "${r.directive_text.slice(0, 120)}" — ${r.reason.slice(0, 100)} (weight: ${r.feedback_weight})`;
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
// Map artifact_type → action_type for backwards compat
// ---------------------------------------------------------------------------

const ARTIFACT_TYPE_TO_ACTION_TYPE: Record<string, ActionType> = {
  drafted_email:   'send_message',
  document:        'write_document',
  decision:        'make_decision',
  calendar_event:  'schedule',
  research_brief:  'research',
  wait_rationale:  'do_nothing',
};

// ---------------------------------------------------------------------------
// Main export — generateDirective
// ---------------------------------------------------------------------------

export async function generateDirective(userId: string, count: number = 1): Promise<ConvictionDirective> {
  // Check daily spend cap before any generation
  const overLimit = await isOverDailyLimit();
  if (overLimit) {
    console.warn('[generateDirective] Daily spend cap reached — skipping generation');
    return {
      directive: 'Daily AI budget reached. Foldera will resume tomorrow.',
      action_type: 'do_nothing',
      confidence: 0,
      reason: 'Daily spend cap of $1.50 reached. Generation paused until UTC midnight.',
      evidence: [],
    };
  }

  const supabase = createServerClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo  = new Date(Date.now() -  7 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // Pull all data sources in parallel
  const [
    signalsRes, commitmentsRes, entityRes, goalsRes,
    currentPrioritiesRes, feedbackRes, approvalStatsRes,
    calendarRes, avoidanceRes, activeGoalsRes, recentOutcomesRes,
    // New: approved last 7d, skipped last 7d, confirmed patterns
    approvedRecentRes, skippedRecentRes, confirmedPatternsGoalsRes,
  ] = await Promise.all([
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
      .select('goal_text, goal_category, priority, time_horizon')
      .eq('user_id', userId)
      .order('priority', { ascending: false })
      .limit(10),

    supabase
      .from('tkg_goals')
      .select('goal_text, goal_category')
      .eq('user_id', userId)
      .eq('current_priority', true)
      .limit(3),

    supabase
      .from('tkg_actions')
      .select('id, action_type, directive_text, reason, status, feedback_weight, generated_at, skip_reason')
      .eq('user_id', userId)
      .not('feedback_weight', 'is', null)
      .order('generated_at', { ascending: false })
      .limit(30),

    supabase
      .from('tkg_actions')
      .select('action_type, status, generated_at')
      .eq('user_id', userId)
      .not('status', 'in', '("pending_approval","draft")')
      .gte('generated_at', thirtyDaysAgo)
      .order('generated_at', { ascending: false })
      .limit(100),

    supabase
      .from('tkg_signals')
      .select('content, occurred_at')
      .eq('user_id', userId)
      .in('source', ['google_calendar', 'outlook_calendar', 'calendar_sync'])
      .gte('occurred_at', new Date().toISOString())
      .lte('occurred_at', sevenDaysFromNow)
      .order('occurred_at', { ascending: true })
      .limit(10),

    supabase
      .from('tkg_signals')
      .select('content, occurred_at')
      .eq('user_id', userId)
      .eq('type', 'draft_avoidance')
      .gte('occurred_at', thirtyDaysAgo)
      .order('occurred_at', { ascending: false })
      .limit(5),

    supabase
      .from('tkg_goals')
      .select('goal_text, goal_type')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(5),

    supabase
      .from('tkg_signals')
      .select('outcome_label, content, created_at')
      .eq('user_id', userId)
      .not('outcome_label', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10),

    // ALREADY APPROVED last 7 days — pass to Claude: do not repeat
    supabase
      .from('tkg_actions')
      .select('directive_text, action_type, generated_at')
      .eq('user_id', userId)
      .eq('status', 'executed')
      .gte('generated_at', sevenDaysAgo)
      .order('generated_at', { ascending: false })
      .limit(10),

    // SKIPPED last 7 days — pass to Claude: do not repeat similar
    supabase
      .from('tkg_actions')
      .select('directive_text, action_type, skip_reason, generated_at')
      .eq('user_id', userId)
      .in('status', ['skipped', 'draft_rejected', 'rejected'])
      .gte('generated_at', sevenDaysAgo)
      .order('generated_at', { ascending: false })
      .limit(10),

    // Active goals — every directive must connect to one
    supabase
      .from('tkg_goals')
      .select('goal_text, goal_category, priority')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('priority', { ascending: false })
      .limit(10),
  ]);

  const signals          = (signalsRes.data ?? []).map((s: any) => ({ ...s, content: decrypt(s.content as string ?? '') }));
  const commitments      = commitmentsRes.data ?? [];
  const patterns         = (entityRes.data?.patterns as Record<string, any>) ?? {};
  const goals            = goalsRes.data ?? [];
  const currentPriorities = currentPrioritiesRes.data ?? [];
  const feedback         = (feedbackRes.data    ?? []) as FeedbackRow[];
  const approvalRows     = (approvalStatsRes.data ?? []) as ApprovalRow[];
  const calendarEvents   = (calendarRes.data ?? []).map((s: any) => ({ ...s, content: decrypt(s.content as string ?? '') }));
  const avoidanceSignals = (avoidanceRes.data ?? []).map((s: any) => ({ ...s, content: decrypt(s.content as string ?? '') }));
  const activeGoals      = activeGoalsRes.data ?? [];
  const recentOutcomes   = (recentOutcomesRes.data ?? []).map((s: any) => ({ ...s, content: decrypt(s.content as string ?? '') }));
  const approvedRecent   = approvedRecentRes.data ?? [];
  const skippedRecent    = skippedRecentRes.data ?? [];
  const confirmedGoals   = confirmedPatternsGoalsRes.data ?? [];

  // Empty graph
  if (signals.length === 0 && commitments.length === 0 && goals.length === 0) {
    return {
      directive: 'Your graph is empty. Add conversation or email data to get personalized actions.',
      action_type: 'write_document',
      confidence: 0,
      reason: 'No behavioral history yet — add data to unlock suggestions.',
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

  // Confirmed patterns (detection_count >= 3 via activation_count in stored JSON)
  // Cap at 20 to keep prompt size manageable
  const confirmedPatternLines = Object.values(patterns)
    .filter((p: any) => (p.activation_count ?? 0) >= 3)
    .sort((a: any, b: any) => (b.activation_count ?? 0) - (a.activation_count ?? 0))
    .slice(0, 20)
    .map((p: any) => `• ${p.name} (${p.activation_count}× / domain:${p.domain}): ${p.description}`)
    .join('\n') || 'None with 3+ confirmations yet.';

  const goalLines = goals.length > 0
    ? goals.map((g: any) => `• [${g.goal_category}, priority ${g.priority}/5] ${g.goal_text}`).join('\n')
    : 'No declared goals yet.';

  const feedbackSection     = buildFeedbackSection(feedback);
  const approvalRateSection = buildApprovalRateSection(approvalRows);

  const currentPriorityLines = currentPriorities.length > 0
    ? currentPriorities.map((p: any) => `• [${p.goal_category}] ${p.goal_text}`).join('\n')
    : 'None set — use all goals equally.';

  const now = new Date();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const todayStr = `${dayNames[now.getDay()]} ${monthNames[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;

  const calendarLines = calendarEvents.length > 0
    ? calendarEvents.map((e: any) => `  • ${(e.content as string).slice(0, 120)} (${new Date(e.occurred_at as string).toLocaleDateString()})`).join('\n')
    : '  No upcoming events synced.';

  const milestonesFromGoals = goals
    .filter((g: any) => g.time_horizon)
    .map((g: any) => `  • ${g.goal_text} (${g.time_horizon})`)
    .join('\n');

  const temporalBlock = `TODAY: ${todayStr}
Calendar next 7 days:
${calendarLines}
${milestonesFromGoals ? `MILESTONES:\n${milestonesFromGoals}` : ''}`;

  // Cooling relationships
  let coolingSection = '';
  try {
    coolingSection = await getCoolingRelationships(userId);
  } catch { /* silent */ }

  // Avoidance signals
  const avoidanceLines = avoidanceSignals.length > 0
    ? avoidanceSignals.map((s: any) => `  • ${(s.content as string).slice(0, 150)}`).join('\n')
    : '';
  const avoidanceSection = avoidanceLines
    ? `\nAVOIDANCE SIGNALS (drafts sitting unsent >48h — decisions being avoided):\n${avoidanceLines}`
    : '';

  const activeGoalsBlock = activeGoals.length > 0
    ? `\nACTIVE GOALS (extracted from your conversations — measured against every directive):\n` +
      activeGoals.map((g: any) => `- ${g.goal_text}${g.goal_type ? ` (${g.goal_type})` : ''}`).join('\n')
    : '';

  const recentOutcomesBlock = recentOutcomes.length > 0
    ? `\nRECENT OUTCOMES (what you confirmed worked or didn't — use to weight similar directives):\n` +
      recentOutcomes.map((o: any) => {
        const summary = (o.content as string).replace(/^Outcome confirmed: [A-Z_]+ — /, '').slice(0, 150);
        return `- ${o.outcome_label}: ${summary}`;
      }).join('\n')
    : '';

  // NEW: Already approved last 7 days
  const approvedSection = approvedRecent.length > 0
    ? approvedRecent.map((a: any) => `  • [${a.action_type}] ${a.directive_text.slice(0, 120)}`).join('\n')
    : '  None in last 7 days.';

  // NEW: Skipped last 7 days
  const skippedSection = skippedRecent.length > 0
    ? skippedRecent.map((a: any) => {
        const reason = a.skip_reason ? ` (${a.skip_reason})` : '';
        return `  • [${a.action_type}]${reason} ${a.directive_text.slice(0, 120)}`;
      }).join('\n')
    : '  None in last 7 days.';

  // NEW: Active goals for patterns section
  const confirmedGoalsSection = confirmedGoals.length > 0
    ? confirmedGoals.map((g: any) => `  • [${g.goal_category}, p${g.priority}] ${g.goal_text}`).join('\n')
    : '  No active goals.';

  // Build the system prompt with injected sections
  const systemPrompt = CONVICTION_SYSTEM
    .replace('{APPROVED_SECTION}', approvedSection)
    .replace('{SKIPPED_SECTION}', skippedSection)
    .replace('{GOALS_SECTION}', confirmedGoalsSection)
    .replace('{PATTERNS_SECTION}', confirmedPatternLines);

  const countInstruction = count > 1
    ? `Identify the top ${count} highest-leverage actions for today, ranked by confidence. Return a JSON array of ${count} directive objects.`
    : 'Identify the single highest-leverage action for today. Return only the JSON directive.';

  const userPrompt = `${temporalBlock}

CURRENT PRIORITIES — what matters most right now (${currentPriorities.length}):
${currentPriorityLines}

DECLARED GOALS (${goals.length} total — measure every recommendation against these):
${goalLines}

ACTIVE COMMITMENTS (${commitments.length} total):
${commitmentLines || 'None.'}

BEHAVIORAL PATTERNS (top 20 of ${Object.keys(patterns).length} by frequency):
${Object.values(patterns).sort((a: any, b: any) => (b.activation_count ?? 0) - (a.activation_count ?? 0)).slice(0, 20).map((p: any) => `• ${p.name} (${p.activation_count}×): ${p.description}`).join('\n') || 'None extracted yet.'}

RECENT SIGNALS (last 30 days, ${signals.length} total):
${signalLines || 'None.'}
${coolingSection}
${avoidanceSection}
${approvalRateSection}
${feedbackSection}
${activeGoalsBlock}
${recentOutcomesBlock}
${countInstruction}`;

  // Call Claude — sonnet-4-20250514 for the final directive
  const MODEL = 'claude-sonnet-4-20250514';

  type ParsedDirective = {
    directive: string;
    artifact_type: string;
    artifact?: any;
    confidence: number;
    evidence: string;
    domain?: string;
    why_now?: string;
    // Legacy fields (fallback compat)
    action_type?: ActionType;
    reason?: string;
    fullContext?: string;
    requires_search?: boolean;
    search_context?: string | null;
  };

  let parsed: ParsedDirective | null = null;

  try {
    const response = await getAnthropic().messages.create({
      model: MODEL,
      max_tokens: count > 1 ? 4000 : 2000,
      temperature: 0.3 as any,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    // Track API usage
    await trackApiCall({
      userId,
      model: MODEL,
      inputTokens:  response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      callType: 'directive',
    });

    const raw = response.content[0].type === 'text' ? response.content[0].text : '';
    const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
    const result = JSON.parse(cleaned);

    if (Array.isArray(result)) {
      parsed = result[0] ?? null;
    } else {
      parsed = result;
    }
  } catch (err) {
    console.error('[generateDirective] Claude call/parse failed:', err);
  }

  if (!parsed) {
    return {
      directive: 'Generation failed — check ANTHROPIC_API_KEY.',
      action_type: 'research',
      confidence: 0,
      reason: '',
      evidence: [],
    };
  }

  // Map artifact_type → action_type for backwards compat
  const actionType: ActionType =
    parsed.action_type ??
    ARTIFACT_TYPE_TO_ACTION_TYPE[parsed.artifact_type] ??
    'research';

  // Normalise evidence — new format is a string, old format is an array
  const evidenceItems: EvidenceItem[] = typeof parsed.evidence === 'string'
    ? [{ type: 'signal', description: parsed.evidence, date: null as any }]
    : (Array.isArray(parsed.evidence) ? parsed.evidence : []);

  // ---------------------------------------------------------------------------
  // Bayesian confidence: deterministic math, not LLM guess
  // Formula: ((successful_outcomes + 1) / (total_activations + 2)) * 100
  // Laplace smoothing → 50% cold start, improves with each outcome signal
  // ---------------------------------------------------------------------------
  const bDomain = parsed.domain ?? 'general';
  const patternHash = `${actionType}:${bDomain}`;
  let mathConfidence = 50; // Laplace prior before any data

  try {
    const { data: pm } = await supabase
      .from('tkg_pattern_metrics')
      .select('total_activations, successful_outcomes, failed_outcomes')
      .eq('user_id', userId)
      .eq('pattern_hash', patternHash)
      .maybeSingle();

    const successes  = pm?.successful_outcomes ?? 0;
    const total      = pm?.total_activations   ?? 0;
    mathConfidence   = Math.round(((successes + 1) / (total + 2)) * 100);

    // Increment total_activations: each generated directive is an activation
    await supabase.from('tkg_pattern_metrics').upsert(
      {
        user_id:             userId,
        pattern_hash:        patternHash,
        category:            actionType,
        domain:              bDomain,
        total_activations:   (pm?.total_activations   ?? 0) + 1,
        successful_outcomes: pm?.successful_outcomes  ?? 0,
        failed_outcomes:     pm?.failed_outcomes      ?? 0,
        updated_at:          new Date().toISOString(),
      },
      { onConflict: 'user_id,pattern_hash' },
    );
  } catch (pmErr: any) {
    console.warn('[generateDirective] pattern_metrics unavailable, using prior 50:', pmErr.message);
  }

  return {
    directive:       parsed.directive       ?? 'Generation failed.',
    action_type:     actionType,
    confidence:      mathConfidence,
    reason:          parsed.reason          ?? parsed.why_now ?? parsed.evidence ?? '',
    evidence:        evidenceItems,
    fullContext:      parsed.why_now ?? parsed.fullContext,
    // Embed the artifact inline so callers can skip a separate artifact-generator call
    embeddedArtifact: parsed.artifact       ?? undefined,
    embeddedArtifactType: parsed.artifact_type ?? undefined,
    domain:          parsed.domain          ?? undefined,
    why_now:         parsed.why_now         ?? undefined,
    requires_search: parsed.requires_search ?? false,
    search_context:  parsed.search_context  ?? undefined,
  } as ConvictionDirective & { embeddedArtifact?: any; embeddedArtifactType?: string; domain?: string; why_now?: string };
}

/**
 * Generate multiple directives in one batch call.
 * Returns an array of ConvictionDirective, ranked by confidence.
 */
export async function generateMultipleDirectives(
  userId: string,
  count: number = 3,
): Promise<ConvictionDirective[]> {
  const directives: ConvictionDirective[] = [];
  for (let i = 0; i < count; i++) {
    try {
      const d = await generateDirective(userId);
      directives.push(d);
    } catch (err) {
      console.error(`[generateMultipleDirectives] directive ${i} failed:`, err);
    }
  }
  directives.sort((a, b) => b.confidence - a.confidence);
  return directives;
}

// ---------------------------------------------------------------------------
// Backwards-compat wrapper — called by /api/briefing/latest
// ---------------------------------------------------------------------------

export async function generateBriefing(userId: string): Promise<ChiefOfStaffBriefing> {
  const supabase = createServerClient();
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
