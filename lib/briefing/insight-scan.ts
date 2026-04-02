/**
 * Insight Scan — Unsupervised Pattern Detection
 *
 * Takes raw decrypted signals and asks the LLM for unnamed behavioral patterns.
 * Returns 0–2 InsightCandidate objects injected into the scorer pool.
 */

import Anthropic from '@anthropic-ai/sdk';

import { getDailySpend, trackApiCall } from '@/lib/utils/api-tracker';
import { logStructuredEvent } from '@/lib/utils/structured-logger';

const INSIGHT_MODEL = 'claude-haiku-4-5-20251001';
const DAILY_SPEND_SKIP_INSIGHT_USD = 0.5;

export interface InsightCandidate {
  id: string;
  title: string;
  content: string;
  pattern_type: 'behavioral' | 'relational' | 'temporal' | 'contradiction';
  confidence: number;
  evidence_signals: string[];
  suggested_action: 'send_message' | 'write_document';
  suggested_entity?: string;
  suggested_entity_email?: string;
  grounding: string;
}

const PATTERN_TYPES = new Set<InsightCandidate['pattern_type']>([
  'behavioral',
  'relational',
  'temporal',
  'contradiction',
]);

const INSIGHT_PROMPT = `You are reviewing one month of someone's digital footprint: their emails (sent and received), calendar events, file activity, and conversation history. You know their stated goals.

Your job is NOT to find overdue tasks or remind them of things they know. Your job is to find PATTERNS IN THEIR BEHAVIOR that they have not named or recognized.

Examples of what you're looking for:
- They respond to peers within hours but delay 3-5 days when the person has authority over their outcome. They don't know they do this.
- They start strong on new projects (5+ signals/week for 2 weeks) then go completely silent. This has happened 3 times in the data.
- They committed to X and Y, but X and Y contradict each other and they haven't noticed.
- Every time they get a rejection, they start a new project within 48 hours instead of processing the current path.
- They've been emailing about the same unresolved issue with 4 different people and none of them know about the others.
- They say they want A but every action in the last 2 weeks moves toward B.

Examples of what you are NOT looking for:
- "You have unreplied emails" (they know)
- "Your calendar has a conflict" (they can see that)
- "You haven't followed up with X" (that's a reminder)
- "Goal Y has no recent activity" (that's a gap check)

SIGNALS (last 30 days):
{signals}

GOALS:
{goals}

ENTITIES (top contacts by interaction count):
{entities}

Respond with a JSON array of 0-2 patterns. Return an empty array [] if no genuine unnamed pattern exists. Do NOT force a pattern that isn't there.

Each pattern:
{
  "title": "One sentence naming the pattern (not a task)",
  "pattern_type": "behavioral|relational|temporal|contradiction",
  "confidence": 0-100,
  "evidence": "Specific signal references that prove this pattern (use dates and names)",
  "insight": "What this pattern means for the user — the thing they haven't connected",
  "suggested_action": "send_message or write_document",
  "suggested_entity": "Name of person most relevant (if any)",
  "suggested_entity_email": "Their email (if known from signals)",
  "grounding": "List the specific signals by date and content that prove this"
}

Rules:
- Confidence below 60 = don't include it
- Every pattern must reference at least 3 specific signals by date
- The title must name a BEHAVIOR, not a task
- "insight" must explain WHY this matters, not WHAT to do
- If you cannot find a real pattern, return []
- Never fabricate signal data. Only reference what's in the input.
`;

function normalizePatternType(raw: unknown): InsightCandidate['pattern_type'] {
  if (typeof raw === 'string' && PATTERN_TYPES.has(raw as InsightCandidate['pattern_type'])) {
    return raw as InsightCandidate['pattern_type'];
  }
  return 'behavioral';
}

function collectEvidenceSignalIds(
  grounding: string,
  recent: Array<{ id: string; occurred_at: string; author?: string | null }>,
): string[] {
  const g = grounding.toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of recent) {
    const date = new Date(s.occurred_at).toISOString().split('T')[0];
    const hitDate = grounding.includes(date);
    const hitAuthor = s.author && g.includes(String(s.author).toLowerCase());
    if (hitDate || hitAuthor) {
      const id = String(s.id);
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  }
  return out;
}

export async function runInsightScan(args: {
  userId: string;
  decryptedSignals: Array<{
    id: string;
    content: string;
    source: string;
    type: string | null;
    occurred_at: string;
    author?: string | null;
  }>;
  goals: Array<{ goal_text: string; priority: number; goal_category: string }>;
  entities: Array<{
    name: string;
    total_interactions: number;
    primary_email?: string | null;
    last_interaction?: string | null;
  }>;
}): Promise<InsightCandidate[]> {
  const { userId, decryptedSignals, goals, entities } = args;

  const spend = await getDailySpend(userId);
  if (spend > DAILY_SPEND_SKIP_INSIGHT_USD) {
    logStructuredEvent({
      event: 'insight_scan_skipped',
      level: 'info',
      userId,
      artifactType: null,
      generationStatus: 'insight_scan_skipped_spend_guard',
      details: {
        scope: 'insight_scan',
        reason: 'daily_spend_above_threshold',
        threshold_usd: DAILY_SPEND_SKIP_INSIGHT_USD,
        spend_usd: Math.round(spend * 10_000) / 10_000,
      },
    });
    return [];
  }

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recent = decryptedSignals
    .filter((s) => new Date(s.occurred_at).getTime() > thirtyDaysAgo)
    .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());

  if (recent.length < 10) {
    logStructuredEvent({
      event: 'insight_scan_skipped',
      level: 'info',
      userId,
      artifactType: null,
      generationStatus: 'insight_scan_skipped_low_signal_count',
      details: {
        scope: 'insight_scan',
        reason: 'insufficient_signals_last_30d',
        recent_signal_count: recent.length,
        min_required: 10,
      },
    });
    return [];
  }

  const signalText = recent
    .slice(0, 150)
    .map((s) => {
      const date = new Date(s.occurred_at).toISOString().split('T')[0];
      const src = s.source ?? 'unknown';
      const author = s.author ? ` [${s.author}]` : '';
      const content = (s.content ?? '').slice(0, 300);
      return `${date} | ${src}${author} | ${content}`;
    })
    .join('\n');

  const goalText = goals
    .filter((g) => !['onboarding_bucket', 'onboarding_marker'].includes(g.goal_category))
    .map((g) => `[P${g.priority}] ${g.goal_text}`)
    .join('\n');

  const entityText = entities
    .slice(0, 20)
    .map((e) => {
      const email = e.primary_email ? ` <${e.primary_email}>` : '';
      const last = e.last_interaction
        ? ` (last: ${new Date(e.last_interaction).toISOString().split('T')[0]})`
        : '';
      return `${e.name}${email} — ${e.total_interactions} interactions${last}`;
    })
    .join('\n');

  const prompt = INSIGHT_PROMPT
    .replace('{signals}', signalText)
    .replace('{goals}', goalText || '(none stated)')
    .replace('{entities}', entityText || '(none)');

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: INSIGHT_MODEL,
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    await trackApiCall({
      userId,
      model: INSIGHT_MODEL,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      callType: 'insight_scan',
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as unknown;
    if (!Array.isArray(parsed)) return [];

    const candidates: InsightCandidate[] = [];
    for (const raw of parsed.slice(0, 2)) {
      if (!raw || typeof raw !== 'object') continue;
      const p = raw as Record<string, unknown>;
      const title = typeof p.title === 'string' ? p.title.trim() : '';
      const confidence = typeof p.confidence === 'number' ? p.confidence : 0;
      const evidence = typeof p.evidence === 'string' ? p.evidence.trim() : '';
      const insight = typeof p.insight === 'string' ? p.insight.trim() : '';
      const grounding = typeof p.grounding === 'string' ? p.grounding.trim() : '';
      if (!title || confidence < 60 || !evidence || !insight || !grounding) continue;

      const evidenceSignalIds = collectEvidenceSignalIds(grounding, recent);
      if (evidenceSignalIds.length < 3) continue;

      const suggestedRaw = typeof p.suggested_action === 'string' ? p.suggested_action : 'send_message';
      const suggested_action = suggestedRaw === 'write_document' ? 'write_document' : 'send_message';
      const suggested_entity = typeof p.suggested_entity === 'string' ? p.suggested_entity.trim() : undefined;
      const suggested_entity_email =
        typeof p.suggested_entity_email === 'string' ? p.suggested_entity_email.trim() : undefined;

      candidates.push({
        id: `insight_${normalizePatternType(p.pattern_type)}_${Date.now()}_${candidates.length}`,
        title,
        content: `${title}\n\n${insight}\n\nEvidence: ${evidence}`,
        pattern_type: normalizePatternType(p.pattern_type),
        confidence: Math.min(Math.round(confidence), 95),
        evidence_signals: evidenceSignalIds.slice(0, 8),
        suggested_action,
        suggested_entity: suggested_entity || undefined,
        suggested_entity_email: suggested_entity_email || undefined,
        grounding,
      });
    }

    return candidates;
  } catch (err) {
    console.error('[insight-scan] Failed:', err);
    return [];
  }
}
