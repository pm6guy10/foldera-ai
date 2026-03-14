/**
 * Conviction Engine — the brain.
 *
 * Flow (v2 — scorer-first):
 *   1. scorer.ts ranks all open loops by stakes * urgency * tractability
 *   2. Winning loop + its context passed to LLM
 *   3. LLM drafts ONE artifact for that specific situation — it does NOT choose what to work on
 *   4. Bayesian confidence from tkg_pattern_metrics
 *
 * Data sources: tkg_signals, tkg_commitments, tkg_entities, tkg_goals, tkg_actions (feedback)
 * AI model:     directive = claude-sonnet-4-20250514
 * Output:       ConvictionDirective (one directive + embedded artifact)
 *
 * Also exports generateBriefing() for backwards compat with /api/briefing/latest.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/db/client';
import type { ChiefOfStaffBriefing, ConvictionDirective, ActionType, EvidenceItem } from './types';
import { trackApiCall, isOverDailyLimit } from '@/lib/utils/api-tracker';
import { scoreOpenLoops } from './scorer';
import type { ScoredLoop, ScorerResult, DeprioritizedLoop } from './scorer';

// ---------------------------------------------------------------------------
// Clients (lazy)
// ---------------------------------------------------------------------------

let _anthropic: Anthropic | null = null;
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

// ---------------------------------------------------------------------------
// Focused system prompt — LLM writes, does not choose
// ---------------------------------------------------------------------------

const FOCUSED_SYSTEM = `You are drafting ONE artifact for ONE specific situation. The situation has already been selected by a scoring algorithm. Your job is to write the artifact using the real names, dates, and details from the data below.

Do not choose what to work on. That decision is already made.

RULES:
- Use REAL names, email addresses, dates, and details from the SIGNAL DATA below. They are there.
- NEVER use placeholders: [Name], [email@example.com], [Company], [Date], TBD, $____. If you cannot find a specific value in the data, use a decision artifact instead.
- The one-tap test: Could the user approve this right now with zero editing? If no, rewrite.
- For drafted_email: "to" must be a real email address from the signals. No email visible? Use decision artifact instead.
- For document: every value must be filled from the data. Any blank = use decision artifact instead.
- For decision: pre-fill every option with specifics from the signal data. "Leave in 60 days targeting $X+" not "Option A: leave."
- For wait_rationale: cite a SPECIFIC prior outcome with date and result.

LONG-TERM MEMORY (weekly summaries of past signals — use for context, patterns, and relationship history):
{MEMORY_SECTION}

ALREADY APPROVED (do not repeat):
{APPROVED_SECTION}

SKIPPED (do not regenerate similar):
{SKIPPED_SECTION}

CUTTING ROOM FLOOR:
Below the main artifact, you MUST include a "cutting_room_floor" array in your JSON output. This section lists things the user does NOT need to worry about today — the system already evaluated and killed them. For each item, translate the mathematical kill reason into a ruthless, plainly worded one-sentence justification. Be specific: name the person, topic, or commitment. The user should feel RELIEF reading this list, not guilt.

Kill reason types:
- NOISE: High urgency but low stakes. Feels pressing but doesn't move a priority forward.
- NOT NOW: High stakes but low urgency. Important but today isn't the day.
- TRAP: High stakes and urgency but low tractability. History shows low follow-through on this type.

Output JSON only:
{
  "directive": "one sentence imperative naming a specific person or commitment",
  "artifact_type": "drafted_email | document | decision | calendar_event | research_brief | wait_rationale | growth_reply",
  "artifact": <the finished work product as JSON>,
  "evidence": "one sentence citing specific data from below",
  "domain": "career | family | financial | health | project | growth",
  "why_now": "one sentence why today",
  "cutting_room_floor": [
    {"title": "short label", "kill_reason": "NOISE | NOT_NOW | TRAP", "justification": "one ruthless sentence why this doesn't deserve attention today"}
  ]
}`;

// ---------------------------------------------------------------------------
// Map artifact_type -> action_type for backwards compat
// ---------------------------------------------------------------------------

const ARTIFACT_TYPE_TO_ACTION_TYPE: Record<string, ActionType> = {
  drafted_email:   'send_message',
  growth_reply:    'send_message',
  document:        'write_document',
  decision:        'make_decision',
  calendar_event:  'schedule',
  research_brief:  'research',
  wait_rationale:  'do_nothing',
};

// ---------------------------------------------------------------------------
// Action type labels for prompt
// ---------------------------------------------------------------------------

const ACTION_TYPE_HINTS: Record<string, string> = {
  send_message:   'drafted_email',
  write_document: 'document',
  make_decision:  'decision',
  schedule:       'calendar_event',
  research:       'research_brief',
  do_nothing:     'wait_rationale',
};

// ---------------------------------------------------------------------------
// Growth domain detection (mirrors scorer.ts inferDomain for growth)
// ---------------------------------------------------------------------------

function inferDomainFromContent(text: string): string {
  const lower = text.toLowerCase();
  if (/\bgrowth.signal\b|growth_reddit|growth_twitter|growth_hackernews|acquire.*user|paying.*user|customer.*base|growth.*scanner|convert.*visitor/.test(lower)) return 'growth';
  return '';
}

// ---------------------------------------------------------------------------
// Main export — generateDirective
// ---------------------------------------------------------------------------

export async function generateDirective(userId: string): Promise<ConvictionDirective> {
  // Check daily spend cap
  const overLimit = await isOverDailyLimit();
  if (overLimit) {
    console.warn('[generateDirective] Daily spend cap reached');
    return {
      directive: 'Daily AI budget reached. Foldera will resume tomorrow.',
      action_type: 'do_nothing',
      confidence: 0,
      reason: 'Daily spend cap of $1.50 reached.',
      evidence: [],
    };
  }

  // -----------------------------------------------------------------------
  // 1. SCORER PICKS
  // -----------------------------------------------------------------------

  const scorerResult = await scoreOpenLoops(userId);

  if (!scorerResult || scorerResult.winner.score < 0.5) {
    const winner = scorerResult?.winner;
    const reason = winner
      ? `Highest scorer: "${winner.title.slice(0, 80)}" at ${winner.score.toFixed(2)} (${winner.breakdown.stakes}S * ${winner.breakdown.urgency.toFixed(2)}U * ${winner.breakdown.tractability.toFixed(2)}T * ${winner.breakdown.freshness?.toFixed(2) ?? '1.00'}F) — below 0.5 threshold`
      : 'No open loops found in the graph';
    console.log(`[generateDirective] do_nothing — ${reason}`);
    return {
      directive: winner
        ? `No urgent open loops today. Highest candidate: "${winner.title.slice(0, 60)}" scored ${winner.score.toFixed(1)}/5.0, not high enough to act.`
        : 'Your graph is empty. Add conversation or email data to get personalized actions.',
      action_type: 'do_nothing',
      confidence: 0,
      reason,
      evidence: [],
    };
  }

  const { winner, deprioritized } = scorerResult;

  console.log(`[generateDirective] Winner: "${winner.title.slice(0, 80)}" score=${winner.score.toFixed(2)} type=${winner.suggestedActionType}`);

  // -----------------------------------------------------------------------
  // 2. QUERY APPROVED/SKIPPED FOR DEDUP
  // -----------------------------------------------------------------------

  const supabase = createServerClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [approvedRecentRes, skippedRecentRes, signalSummariesRes] = await Promise.all([
    supabase
      .from('tkg_actions')
      .select('directive_text, action_type')
      .eq('user_id', userId)
      .eq('status', 'executed')
      .gte('generated_at', sevenDaysAgo)
      .order('generated_at', { ascending: false })
      .limit(10),
    supabase
      .from('tkg_actions')
      .select('directive_text, action_type, skip_reason')
      .eq('user_id', userId)
      .in('status', ['skipped', 'draft_rejected', 'rejected'])
      .gte('generated_at', sevenDaysAgo)
      .order('generated_at', { ascending: false })
      .limit(10),
    supabase
      .from('signal_summaries')
      .select('week_start, signal_count, summary, emotional_tone, themes, people')
      .eq('user_id', userId)
      .order('week_start', { ascending: false })
      .limit(12),
  ]);

  const approvedSection = (approvedRecentRes.data ?? []).length > 0
    ? (approvedRecentRes.data ?? []).map((a: any) => `  - [${a.action_type}] ${a.directive_text.slice(0, 120)}`).join('\n')
    : '  None.';

  const skippedSection = (skippedRecentRes.data ?? []).length > 0
    ? (skippedRecentRes.data ?? []).map((a: any) => {
        const reason = a.skip_reason ? ` (${a.skip_reason})` : '';
        return `  - [${a.action_type}]${reason} ${a.directive_text.slice(0, 120)}`;
      }).join('\n')
    : '  None.';

  const memorySection = (signalSummariesRes.data ?? []).length > 0
    ? (signalSummariesRes.data ?? []).map((s: any) => {
        const themes = Array.isArray(s.themes) && s.themes.length > 0 ? ` Themes: ${s.themes.join(', ')}.` : '';
        const people = Array.isArray(s.people) && s.people.length > 0 ? ` People: ${s.people.join(', ')}.` : '';
        return `  - ${s.summary}${themes}${people}`;
      }).join('\n')
    : '  No long-term memory yet.';

  // -----------------------------------------------------------------------
  // 3. BUILD FOCUSED PROMPT
  // -----------------------------------------------------------------------

  const systemPrompt = FOCUSED_SYSTEM
    .replace('{MEMORY_SECTION}', memorySection)
    .replace('{APPROVED_SECTION}', approvedSection)
    .replace('{SKIPPED_SECTION}', skippedSection);

  const suggestedArtifact = ACTION_TYPE_HINTS[winner.suggestedActionType] ?? 'decision';

  const now = new Date();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const todayStr = `${dayNames[now.getDay()]} ${monthNames[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;

  // Build relationship context section if available
  const relationshipSection = (winner as any).relationshipContext
    ? `\nRELATIONSHIP CONTEXT:\n${(winner as any).relationshipContext}\n`
    : '';

  // Build emergent pattern section if this is an emergent winner
  const isAntiPattern = winner.id.startsWith('antipattern-');
  const isDivergence = winner.id.startsWith('divergence-');
  const emergentSection = isAntiPattern
    ? `\nANTI-PATTERN INTERCEPT — Normal task generation has been SUSPENDED. The scoring algorithm detected a behavioral anti-pattern that must be addressed before any more tasks are served. This is not a suggestion; it is a system override.

Your artifact MUST:
1. Name the anti-pattern directly and plainly. No hedging.
2. Present the specific numbers from the data (signal counts, approval rates, ratios).
3. End with a single forced-choice decision. Not "consider" — DECIDE.
4. The tone is direct, not cruel. A chief of staff who respects the principal enough to say the uncomfortable thing.

Do NOT generate a regular task. The user does not need another task. They need to see what they are actually doing.\n`
    : isDivergence
    ? `\nPREFERENCE DIVERGENCE DETECTED — The user's stated goals and their actual behavior have diverged significantly. This is a meta-observation, not a task.

Your artifact MUST:
1. State what the user SAID their priority is (with their exact goal text and priority number).
2. State what their BEHAVIOR shows (with signal counts and specific examples).
3. Frame this as a decision artifact with two options: "Change the goal to match reality" vs "Recommit to the stated goal and redirect effort."
4. Be specific about what redirecting would look like (concrete next actions).
5. Never judge — just hold up the mirror with data.\n`
    : winner.type === 'emergent'
    ? `\nEMERGENT PATTERN DETECTED — this is a meta-observation about the user's behavior, not a regular open loop. Draft an insight artifact that surfaces this pattern with specific data. The user should feel seen, not judged.\n`
    : '';

  // Build growth artifact section if this is a growth signal
  const isGrowthSignal = winner.matchedGoal?.category === 'growth' ||
    inferDomainFromContent(winner.content) === 'growth';
  const growthSection = isGrowthSignal
    ? `\nGROWTH ACTION — This signal is a user acquisition opportunity. The conviction engine scored this growth action higher than any personal action today. Your artifact is a COMPLETE REPLY ready to paste.

RULES (from GROWTH.md — non-negotiable):
1. Reference something SPECIFIC from their post. Quote or paraphrase what they said.
2. Lead with empathy, not product. Make them feel seen first.
3. NO PITCH in the first message. Zero mention of Foldera by name.
4. The CTA is a question or shared experience — not a link, not a demo request.
5. Maximum 3 sentences. Sound like a human, not a startup founder.
6. For Reddit: write as a Reddit comment reply.
7. For Twitter/X: write as a reply tweet (under 280 chars).
8. For Hacker News: write as an HN comment.

Use artifact_type "growth_reply" with this JSON shape:
{
  "type": "growth_reply",
  "platform": "reddit | twitter | hackernews",
  "post_url": "<URL from the signal data>",
  "post_author": "<author from the signal data>",
  "reply_text": "<the complete 2-3 sentence reply ready to paste>",
  "angle": "<one sentence: what empathy angle you used>",
  "ref_tag": "<platform>-<post_id> (for conversion tracking)"
}

Brandon will copy-paste this reply. It must be perfect on first read.\n`
    : '';

  // Build compound directive section if this is a cross-loop merge
  const compoundSection = winner.type === 'compound' && winner.connectionType
    ? `\nCROSS-LOOP COMPOUND DIRECTIVE — The scoring algorithm found a CONNECTION between two separate loops. Connection type: ${winner.connectionType}. Reason: ${winner.connectionReason ?? 'linked loops'}.

Your artifact MUST address BOTH loops in a single action. Examples:
- same_person: "Finish the proposal today so you can send it to Sarah tomorrow as promised."
- temporal_dependency: "Do X first because Y depends on it being done."
- resource_conflict: "Prioritize X over Y because [reason from data]."

The user should see ONE directive that handles BOTH situations. This is the output no other product can generate because it requires the full identity graph to see the connection.\n`
    : '';

  // Build deprioritized section for the LLM
  const deprioritizedSection = deprioritized.length > 0
    ? `\nDEPRIORITIZED LOOPS (include these in cutting_room_floor — translate kill reasons into plain language):
${deprioritized.map((d, i) => `${i + 1}. [${d.killReason.toUpperCase()}] "${d.title.slice(0, 100)}" (score ${d.score.toFixed(2)}) — ${d.killExplanation}`).join('\n')}\n`
    : '';

  const userPrompt = `TODAY: ${todayStr}

THE SITUATION (selected by scoring algorithm — score ${winner.score.toFixed(2)}/5.0):
Type: ${winner.type}
Title: ${winner.title}
Full context: ${winner.content}
${winner.matchedGoal ? `\nMATCHED GOAL (priority ${winner.matchedGoal.priority}/5): ${winner.matchedGoal.text}` : ''}

SCORE BREAKDOWN:
- Stakes: ${winner.breakdown.stakes} (${winner.matchedGoal ? `matched goal priority ${winner.matchedGoal.priority}` : 'no goal match, default 1.0'})
- Urgency: ${winner.breakdown.urgency.toFixed(2)}
- Tractability: ${winner.breakdown.tractability.toFixed(2)}
- Freshness: ${winner.breakdown.freshness?.toFixed(2) ?? '1.00'} (1.0 = never surfaced, lower = recently generated)
${relationshipSection}${emergentSection}${compoundSection}${growthSection}
SUGGESTED ARTIFACT TYPE: ${suggestedArtifact}
(You may override if the data supports a different type, but justify.)

RELATED SIGNAL DATA (${winner.relatedSignals.length} signals with keyword overlap):
${winner.relatedSignals.length > 0 ? winner.relatedSignals.map((s, i) => `--- Signal ${i + 1} ---\n${s.slice(0, 600)}`).join('\n\n') : 'No related signals found. Use the situation context above.'}
${deprioritizedSection}
Draft the artifact now. Use real names and details from the data above.`;

  // -----------------------------------------------------------------------
  // 4. CALL CLAUDE
  // -----------------------------------------------------------------------

  const MODEL = 'claude-sonnet-4-20250514';

  type CuttingRoomFloorItem = {
    title: string;
    kill_reason: string;
    justification: string;
  };

  type ParsedDirective = {
    directive: string;
    artifact_type: string;
    artifact?: any;
    evidence: string;
    domain?: string;
    why_now?: string;
    action_type?: ActionType;
    reason?: string;
    cutting_room_floor?: CuttingRoomFloorItem[];
  };

  function hasBlankPlaceholders(text: string): boolean {
    return /\$_{2,}|_{4,}|\[.*?\]|TBD|\?{3,}|__\/__|\(\s*date\s*\)|\(\s*amount\s*\)/i.test(text);
  }

  let parsed: ParsedDirective | null = null;

  try {
    const response = await getAnthropic().messages.create({
      model: MODEL,
      max_tokens: 2000,
      temperature: 0.3 as any,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    await trackApiCall({
      userId,
      model: MODEL,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      callType: 'directive',
    });

    const raw = response.content[0].type === 'text' ? response.content[0].text : '';
    const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
    const result = JSON.parse(cleaned);
    parsed = Array.isArray(result) ? result[0] ?? null : result;

    // Retry if document has blank placeholders
    if (
      parsed &&
      (parsed.artifact_type === 'document' || parsed.artifact_type === 'write_document') &&
      parsed.artifact &&
      hasBlankPlaceholders(JSON.stringify(parsed.artifact))
    ) {
      console.log('[generateDirective] Document has placeholders — retrying as decision');
      const retryResponse = await getAnthropic().messages.create({
        model: MODEL,
        max_tokens: 2000,
        temperature: 0.3 as any,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt },
          { role: 'assistant', content: raw },
          { role: 'user', content: 'Your document has blank placeholders. Use a "decision" artifact instead. Frame the choice with specifics from the data. Return JSON only.' },
        ],
      });

      await trackApiCall({
        userId,
        model: MODEL,
        inputTokens: retryResponse.usage.input_tokens,
        outputTokens: retryResponse.usage.output_tokens,
        callType: 'directive_retry',
      });

      try {
        const retryRaw = retryResponse.content[0].type === 'text' ? retryResponse.content[0].text : '';
        const retryResult = JSON.parse(retryRaw.replace(/```json\n?|\n?```/g, '').trim());
        parsed = Array.isArray(retryResult) ? retryResult[0] ?? parsed : retryResult;
      } catch {
        // keep original
      }
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

  // -----------------------------------------------------------------------
  // 5. POST-PROCESS
  // -----------------------------------------------------------------------

  const actionType: ActionType =
    parsed.action_type ??
    ARTIFACT_TYPE_TO_ACTION_TYPE[parsed.artifact_type] ??
    'research';

  // Append score breakdown to evidence
  const freshnessStr = (winner.breakdown as any).freshness?.toFixed(2) ?? '1.00';
  const scoreEvidence = `[score=${winner.score.toFixed(2)}: ${winner.breakdown.stakes}S*${winner.breakdown.urgency.toFixed(2)}U*${winner.breakdown.tractability.toFixed(2)}T*${freshnessStr}F]`;
  const evidenceStr = typeof parsed.evidence === 'string'
    ? `${parsed.evidence} ${scoreEvidence}`
    : scoreEvidence;
  const evidenceItems: EvidenceItem[] = [{ type: 'signal', description: evidenceStr, date: null as any }];

  // Bayesian confidence
  const bDomain = parsed.domain ?? winner.matchedGoal?.category ?? 'general';
  const patternHash = `${actionType}:${bDomain}`;
  let mathConfidence = 50;

  try {
    const { data: pm } = await supabase
      .from('tkg_pattern_metrics')
      .select('total_activations, successful_outcomes, failed_outcomes')
      .eq('user_id', userId)
      .eq('pattern_hash', patternHash)
      .maybeSingle();

    const successes = pm?.successful_outcomes ?? 0;
    const total = pm?.total_activations ?? 0;
    mathConfidence = Math.round(((successes + 1) / (total + 2)) * 100);

    await supabase.from('tkg_pattern_metrics').upsert(
      {
        user_id: userId,
        pattern_hash: patternHash,
        category: actionType,
        domain: bDomain,
        total_activations: (pm?.total_activations ?? 0) + 1,
        successful_outcomes: pm?.successful_outcomes ?? 0,
        failed_outcomes: pm?.failed_outcomes ?? 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,pattern_hash' },
    );
  } catch (pmErr: any) {
    console.warn('[generateDirective] pattern_metrics unavailable:', pmErr.message);
  }

  return {
    directive: parsed.directive ?? 'Generation failed.',
    action_type: actionType,
    confidence: mathConfidence,
    reason: parsed.reason ?? parsed.why_now ?? parsed.evidence ?? '',
    evidence: evidenceItems,
    fullContext: parsed.why_now,
    embeddedArtifact: parsed.artifact ?? undefined,
    embeddedArtifactType: parsed.artifact_type ?? undefined,
    domain: parsed.domain ?? bDomain,
    why_now: parsed.why_now ?? undefined,
    cutting_room_floor: parsed.cutting_room_floor ?? [],
    requires_search: false,
    search_context: undefined,
  } as ConvictionDirective & { embeddedArtifact?: any; embeddedArtifactType?: string; domain?: string; why_now?: string; cutting_room_floor?: any[] };
}

/**
 * Generate multiple directives in one batch call.
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
    generatedAt: new Date(),
    topInsight: directive.reason,
    confidence: directive.confidence,
    recommendedAction: directive.directive,
    fullBrief: directive.fullContext ?? directive.reason,
  };

  const { error: writeErr } = await supabase.from('tkg_briefings').insert({
    user_id: userId,
    briefing_date: brief.briefingDate,
    generated_at: brief.generatedAt.toISOString(),
    top_insight: brief.topInsight,
    confidence: brief.confidence,
    recommended_action: brief.recommendedAction,
    stats: {
      signalsAnalyzed: 0,
      commitmentsReviewed: 0,
      patternsActive: 0,
      fullBrief: brief.fullBrief,
      directive,
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
