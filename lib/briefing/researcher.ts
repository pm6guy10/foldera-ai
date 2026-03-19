/**
 * Researcher — deepens the scorer's winning candidate into an insight
 * before the writer produces the artifact.
 *
 * Sits between scorer and writer in the generation pipeline:
 *   scorer → researcher → writer
 *
 * Pass 1: Internal synthesis — cross-references the winning signal cluster
 *         against all 30-day signals to find non-obvious intersections.
 * Pass 2: External enrichment — for career/financial domains, one web-search
 *         Claude call to surface public context the user may not have.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/db/client';
import { decryptWithStatus } from '@/lib/encryption';
import { trackApiCall } from '@/lib/utils/api-tracker';
import { logStructuredEvent } from '@/lib/utils/structured-logger';
import type { ScoredLoop } from './scorer';

// ---------------------------------------------------------------------------
// System-introspection filter — same patterns as pinned-constraints.ts
// ---------------------------------------------------------------------------

const SYSTEM_INTROSPECTION_RE =
  /\b(tkg_signals?|tkg_actions?|tkg_patterns?|signal\s*(?:spike|count|backlog|processing)|unprocessed\s*(?:count|signal)|orchestrator|data\s*pipeline|sync\s*(?:health|error|failure|status)|signal\s*processing\s*stall|foldera\s*(?:system|health|error|log|directive|infrastructure)|decrypt\s*(?:fail|error)|token\s*(?:refresh|expir)|cron\s*(?:job|run|fail)|api\s*(?:usage|spend|rate\s*limit))\b/i;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResearchInsight {
  /** What's true that the user hasn't connected yet */
  synthesis: string;
  /** Signal IDs that contribute to the insight */
  supporting_signals: string[];
  /** Public info the user doesn't have (from web search or knowledge), or null */
  external_context: string | null;
  /** Why this matters NOW — deadline or decay */
  window: string | null;
  /** What the writer should produce and why */
  artifact_instructions: string;
}

interface SignalRow {
  id: string;
  content: string;
  source: string;
  created_at: string;
  signal_type: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RESEARCHER_MODEL = 'claude-sonnet-4-20250514';
const SIGNAL_LOOKBACK_DAYS = 30;
const MAX_SIGNALS_FOR_PROMPT = 40;
const RESEARCHER_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let anthropicClient: Anthropic | null = null;

function getAnthropic(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

function isSelfReferentialSignal(content: string): boolean {
  return content.startsWith('[Foldera Directive') || content.startsWith('[Foldera \u00b7 20');
}

/**
 * Load all readable signals for a user from the last 30 days.
 * Skips decrypt-fallback rows and self-referential signals.
 */
async function loadRecentSignals(userId: string): Promise<SignalRow[]> {
  const supabase = createServerClient();
  const since = new Date(Date.now() - SIGNAL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('tkg_signals')
    .select('id, content, source, created_at, signal_type')
    .eq('user_id', userId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error || !data) return [];

  const readable: SignalRow[] = [];
  for (const row of data) {
    if (!row.content || typeof row.content !== 'string') continue;
    const { plaintext, usedFallback } = decryptWithStatus(row.content);
    if (usedFallback) continue;
    if (isSelfReferentialSignal(plaintext)) continue;
    readable.push({
      id: row.id,
      content: plaintext.slice(0, 500),
      source: row.source ?? 'unknown',
      created_at: row.created_at,
      signal_type: row.signal_type ?? null,
    });
  }

  return readable;
}

/**
 * Build the internal synthesis prompt.
 * Asks Claude to find non-obvious intersections between the winning
 * candidate's signal cluster and all other recent signals.
 */
function buildSynthesisPrompt(winner: ScoredLoop, signals: SignalRow[]): string {
  const winnerSignalIds = new Set(
    (winner.sourceSignals ?? []).map((s) => s.id).filter(Boolean),
  );

  const winnerSignals = signals.filter((s) => winnerSignalIds.has(s.id));
  const otherSignals = signals
    .filter((s) => !winnerSignalIds.has(s.id))
    .slice(0, MAX_SIGNALS_FOR_PROMPT);

  const winnerDomain = winner.matchedGoal?.category ?? 'general';
  const today = new Date().toISOString().slice(0, 10);

  const winnerBlock = winnerSignals.length > 0
    ? winnerSignals.map((s) => `[${s.created_at.slice(0, 10)}] [${s.source}] ${s.content}`).join('\n')
    : winner.content;

  const otherBlock = otherSignals.length > 0
    ? otherSignals.map((s) => `[${s.created_at.slice(0, 10)}] [${s.source}] ${s.content}`).join('\n')
    : 'No additional signals.';

  return `TODAY: ${today}
DOMAIN: ${winnerDomain}
WINNING_CANDIDATE: ${winner.title}
WINNING_CONTENT: ${winner.content}

WINNING_SIGNALS:
${winnerBlock}

ALL_OTHER_RECENT_SIGNALS:
${otherBlock}

Given these signals about the "${winnerDomain}" domain, find what is true about this person's situation that they likely haven't synthesized. Do not restate what they already know.

Look specifically for:
- Temporal collisions: two events whose timing creates an opportunity or risk they haven't seen
- Financial implications: salary, bills, benefits, payments that interact with the winning domain
- Relationship gaps: people connected to this domain who haven't been contacted, or whose last contact is decaying
- Dependency chains: thing A must happen before thing B, and thing B has a deadline

Return strict JSON only:
{
  "synthesis": "One paragraph stating the non-obvious intersection. Be specific — name people, dates, amounts.",
  "supporting_signal_ids": ["id1", "id2"],
  "window": "Why this matters NOW — the specific deadline or decay point, or null if no time pressure",
  "artifact_instructions": "What the writer should produce to capture this insight's value, and why that artifact type is correct"
}

If you cannot find any non-obvious intersection beyond what the user already knows, return:
{"synthesis": null}`;
}

/**
 * Build the external enrichment prompt for career/financial domains.
 */
function buildExternalEnrichmentPrompt(winner: ScoredLoop, synthesis: string): string {
  const domain = winner.matchedGoal?.category ?? 'general';

  let searchFocus: string;
  if (domain === 'career') {
    searchFocus = 'WAC rules, agency-specific policies, salary schedules, benefits eligibility, hiring process timelines';
  } else {
    searchFocus = 'statute text, deadline rules, program eligibility interactions, tax implications';
  }

  return `The user's situation: ${synthesis}

Domain: ${domain}
Search focus: ${searchFocus}

Find one specific piece of public information that is directly relevant to this situation. Look for official policies, deadlines, eligibility rules, or regulatory requirements that interact with what the user is doing.

Return strict JSON only:
{
  "external_context": "The specific public fact and its source, or null if nothing relevant found"
}

If no relevant public information exists, return:
{"external_context": null}`;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Research the winning candidate to produce a deeper insight.
 *
 * Returns null if:
 * - No non-obvious insight found
 * - API call fails
 * - System introspection detected
 * - Execution exceeds 15 seconds
 */
export async function researchWinner(
  userId: string,
  winner: ScoredLoop,
): Promise<ResearchInsight | null> {
  const startTime = Date.now();

  try {
    // Load all recent signals for cross-referencing
    const signals = await loadRecentSignals(userId);

    if (signals.length === 0) {
      logStructuredEvent({
        event: 'researcher_skip',
        userId,
        artifactType: null,
        generationStatus: 'no_signals',
        details: { scope: 'researcher' },
      });
      return null;
    }

    // Pass 1: Internal synthesis
    const synthesisPrompt = buildSynthesisPrompt(winner, signals);

    const synthesisResponse = await getAnthropic().messages.create({
      model: RESEARCHER_MODEL,
      max_tokens: 800,
      temperature: 0.1,
      system: 'You are a research analyst finding non-obvious connections in a person\'s life data. You produce facts and their implications — never consulting advice. Do not reference Foldera, data pipelines, signal processing, or any internal infrastructure.',
      messages: [{ role: 'user', content: synthesisPrompt }],
    });

    await trackApiCall({
      userId,
      model: RESEARCHER_MODEL,
      inputTokens: synthesisResponse.usage.input_tokens,
      outputTokens: synthesisResponse.usage.output_tokens,
      callType: 'researcher_synthesis',
    });

    const synthesisRaw = synthesisResponse.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    let synthesisResult: {
      synthesis: string | null;
      supporting_signal_ids?: string[];
      window?: string | null;
      artifact_instructions?: string;
    };
    try {
      const cleaned = synthesisRaw.replace(/```json\n?|\n?```/g, '').trim();
      synthesisResult = JSON.parse(cleaned);
    } catch {
      logStructuredEvent({
        event: 'researcher_parse_error',
        level: 'warn',
        userId,
        artifactType: null,
        generationStatus: 'parse_error',
        details: { scope: 'researcher' },
      });
      return null;
    }

    // No insight found
    if (!synthesisResult.synthesis || typeof synthesisResult.synthesis !== 'string') {
      logStructuredEvent({
        event: 'researcher_no_insight',
        userId,
        artifactType: null,
        generationStatus: 'no_insight',
        details: { scope: 'researcher' },
      });
      return null;
    }

    // System introspection check
    if (SYSTEM_INTROSPECTION_RE.test(synthesisResult.synthesis)) {
      logStructuredEvent({
        event: 'researcher_blocked',
        level: 'warn',
        userId,
        artifactType: null,
        generationStatus: 'system_introspection',
        details: { scope: 'researcher' },
      });
      return null;
    }

    const insight: ResearchInsight = {
      synthesis: synthesisResult.synthesis,
      supporting_signals: (synthesisResult.supporting_signal_ids ?? []).filter(
        (id): id is string => typeof id === 'string' && id.length > 0,
      ),
      external_context: null,
      window: typeof synthesisResult.window === 'string' ? synthesisResult.window : null,
      artifact_instructions: typeof synthesisResult.artifact_instructions === 'string'
        ? synthesisResult.artifact_instructions
        : 'Draft the artifact around the insight synthesis.',
    };

    // Check time budget before Pass 2
    const elapsed = Date.now() - startTime;
    if (elapsed > RESEARCHER_TIMEOUT_MS * 0.7) {
      logStructuredEvent({
        event: 'researcher_skip_enrichment',
        userId,
        artifactType: null,
        generationStatus: 'time_budget_exhausted',
        details: { scope: 'researcher', elapsed_ms: elapsed },
      });
      logResearcherTiming(userId, startTime);
      return insight;
    }

    // Pass 2: External enrichment (career/financial only)
    const goalCategory = winner.matchedGoal?.category;
    if (goalCategory === 'career' || goalCategory === 'financial') {
      try {
        const enrichmentPrompt = buildExternalEnrichmentPrompt(winner, insight.synthesis);

        const enrichmentResponse = await getAnthropic().messages.create({
          model: RESEARCHER_MODEL,
          max_tokens: 400,
          temperature: 0,
          system: 'You are a research assistant. Return only verifiable public facts with sources. If you are not confident in the information, return null.',
          messages: [{ role: 'user', content: enrichmentPrompt }],
        });

        await trackApiCall({
          userId,
          model: RESEARCHER_MODEL,
          inputTokens: enrichmentResponse.usage.input_tokens,
          outputTokens: enrichmentResponse.usage.output_tokens,
          callType: 'researcher_enrichment',
        });

        const enrichmentRaw = enrichmentResponse.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('');

        try {
          const cleaned = enrichmentRaw.replace(/```json\n?|\n?```/g, '').trim();
          const enrichmentResult = JSON.parse(cleaned) as { external_context?: string | null };
          if (typeof enrichmentResult.external_context === 'string' && enrichmentResult.external_context.length > 0) {
            // System introspection check on external context too
            if (!SYSTEM_INTROSPECTION_RE.test(enrichmentResult.external_context)) {
              insight.external_context = enrichmentResult.external_context;
            }
          }
        } catch {
          // Parse failure on enrichment is non-fatal
        }
      } catch {
        // Enrichment API failure is non-fatal — we still have the synthesis
        logStructuredEvent({
          event: 'researcher_enrichment_error',
          level: 'warn',
          userId,
          artifactType: null,
          generationStatus: 'enrichment_api_error',
          details: { scope: 'researcher' },
        });
      }
    }

    logResearcherTiming(userId, startTime);
    return insight;
  } catch (error) {
    logStructuredEvent({
      event: 'researcher_error',
      level: 'error',
      userId,
      artifactType: null,
      generationStatus: 'researcher_failed',
      details: {
        scope: 'researcher',
        error: error instanceof Error ? error.message : String(error),
      },
    });
    return null;
  }
}

function logResearcherTiming(userId: string, startTime: number): void {
  const elapsed = Date.now() - startTime;
  logStructuredEvent({
    event: 'researcher_complete',
    userId,
    artifactType: null,
    generationStatus: 'researcher_done',
    details: {
      scope: 'researcher',
      elapsed_ms: elapsed,
      within_budget: elapsed <= RESEARCHER_TIMEOUT_MS,
    },
  });
}
