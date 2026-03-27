/**
 * Conversation Extraction Engine
 *
 * Reads raw conversation text (Claude project exports), extracts decisions,
 * patterns, outcomes, and goals, and writes them into the tkg_ identity graph.
 *
 * Flow:
 *   1. Hash content → deduplicate via tkg_signals.content_hash
 *   2. Write raw signal to tkg_signals (source: 'claude_conversation')
 *   3. Call Claude to extract structured identity data
 *   4. Upsert a 'self' entity for the user in tkg_entities
 *   5. Write extracted decisions to tkg_commitments
 *   6. Merge extracted patterns into tkg_entities.patterns
 *   7. Return extraction summary
 */

import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/db/client';
import { createHash } from 'crypto';
import { sanitizeForPrompt } from '@/lib/utils/prompt-sanitization';
import { encrypt } from '@/lib/encryption';
import { isNonCommitment } from '@/lib/signals/signal-processor';

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  return new Anthropic({ apiKey });
}

// ---------------------------------------------------------------------------
// Extraction types
// ---------------------------------------------------------------------------

export interface ExtractedDecision {
  description: string;
  domain: 'career' | 'finances' | 'family' | 'health' | 'faith' | 'relationships' | 'other';
  context: string | null;
  action_taken: string | null;
  outcome: string | null;
  stakes: 'low' | 'medium' | 'high' | 'critical';
}

export interface ExtractedPattern {
  name: string;
  description: string;
  domain: string;
}

export interface ExtractedGoal {
  description: string;
  domain: string;
  time_horizon: string | null;
}

export interface ExtractionPayload {
  decisions: ExtractedDecision[];
  outcomes: Array<{ decision_description: string; result: string }>;
  patterns: ExtractedPattern[];
  goals: ExtractedGoal[];
}

export interface ExtractionResult {
  signalId: string;
  decisionsWritten: number;
  patternsUpdated: number;
  tokensUsed: number;
  raw: ExtractionPayload;
}

// ---------------------------------------------------------------------------
// Claude extraction prompt (verbatim from pivot spec)
// ---------------------------------------------------------------------------

export type SourceType = 'conversation' | 'email' | 'calendar' | 'agent_output' | 'user_feedback';

const EXTRACTION_JSON_SCHEMA = `
Return JSON matching this schema exactly:
{
  "decisions": [
    {
      "description": "string — what choice was made",
      "domain": "career | finances | family | health | faith | relationships | other",
      "context": "string | null — situational factors",
      "action_taken": "string | null — what was done",
      "outcome": "string | null — result if known",
      "stakes": "low | medium | high | critical"
    }
  ],
  "outcomes": [
    {
      "decision_description": "string — the original decision this confirms",
      "result": "string — what actually happened"
    }
  ],
  "patterns": [
    {
      "name": "string — short label (e.g. 'avoids conflict', 'overthinks offers')",
      "description": "string — fuller explanation",
      "domain": "string"
    }
  ],
  "goals": [
    {
      "description": "string — the desired outcome",
      "domain": "string",
      "time_horizon": "string | null — e.g. '6 months', '2026', 'next quarter'"
    }
  ]
}

Extract only what is explicit or clearly implied. Do not infer. If nothing relevant, return empty arrays.

IMPORTANT: Do NOT extract action items, decisions, or commitments that reference Foldera itself, Foldera directives, deployment notifications, Vercel builds, or system self-review tasks. These are internal system artifacts, not user decisions.`;

const SOURCE_PROMPTS: Record<SourceType, string> = {
  conversation: `You are building an identity graph for a personal chief of staff system.

Read this conversation and extract:
(1) Decisions made — what choice was made, what domain, what context, what stakes.
(2) Outcomes confirmed — results of past decisions, positive or negative.
(3) Behavioral patterns — recurring tendencies, named if possible.
(4) Active goals — stated desired outcomes with time horizons.
${EXTRACTION_JSON_SCHEMA}`,

  email: `You are building an identity graph for a personal chief of staff system.

Read this email thread and extract:
(1) Commitments made — "I'll send by Friday", "Let's meet next week", promises to others.
(2) Response patterns — how quickly does this person reply? Do they avoid certain topics?
(3) Relationship signals — tone, formality level, frequency of contact.
(4) Delegation signals — tasks assigned to or by this person.
(5) Avoidance patterns — long reply delays, vague responses, topic dodging.
(6) Decisions and outcomes — choices made, results confirmed.
(7) Goals mentioned or implied.
${EXTRACTION_JSON_SCHEMA}`,

  calendar: `You are building an identity graph for a personal chief of staff system.

Read this calendar data and extract:
(1) Time allocation patterns — what does this person spend time on?
(2) Priority conflicts — overlapping commitments, over-scheduled days.
(3) Cancellation frequency — how often are events cancelled or rescheduled?
(4) Recurring commitments — weekly standups, regular 1:1s, habits.
(5) Goals implied by scheduling patterns.
${EXTRACTION_JSON_SCHEMA}`,

  agent_output: `You are building an identity graph for a personal chief of staff system.

Read this agent-generated output and extract ONLY actionable findings:
(1) Decisions that were recommended and whether they were executed.
(2) Outcomes from prior agent recommendations.
(3) Patterns in what the user approves vs skips.
Do NOT extract the agent's reasoning or meta-commentary — only concrete user-relevant data.
${EXTRACTION_JSON_SCHEMA}`,

  user_feedback: `You are building an identity graph for a personal chief of staff system.

Read this user feedback (approve/skip patterns) and extract:
(1) Preference signals — what types of actions does this user value?
(2) Avoidance patterns — what types of suggestions get consistently skipped?
(3) Decision patterns — how quickly does the user decide? Do they skip then come back?
(4) Priority shifts — has the user's focus changed based on recent approvals?
${EXTRACTION_JSON_SCHEMA}`,
};

const EXTRACTION_SYSTEM = SOURCE_PROMPTS.conversation;

async function cleanupSignalForRetry(
  supabase: ReturnType<typeof createServerClient>,
  signalId: string,
): Promise<void> {
  const { error } = await supabase
    .from('tkg_signals')
    .update({ processed: true })
    .eq('id', signalId);
  if (error) {
    console.error('[conversation-extractor] Failed to mark signal as failed after extraction failure:', error.message);
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function extractFromConversation(
  text: string,
  userId: string,
  source_type: SourceType = 'conversation',
): Promise<ExtractionResult> {
  const supabase = createServerClient();
  const anthropic = getAnthropicClient();

  // 1. Deduplicate by content hash
  const contentHash = createHash('sha256').update(text).digest('hex');

  const { data: existing } = await supabase
    .from('tkg_signals')
    .select('id')
    .eq('user_id', userId)
    .eq('content_hash', contentHash)
    .eq('processed', true)
    .maybeSingle();

  if (existing) {
    throw new Error(`Conversation already ingested (signal ${existing.id})`);
  }

  // 2. Write raw signal
  const { data: signal, error: signalError } = await supabase
    .from('tkg_signals')
    .insert({
      user_id: userId,
      source: 'uploaded_document',
      source_id: contentHash.slice(0, 16),
      type: 'document_created',
      content: encrypt(text),
      content_hash: contentHash,
      author: 'user',
      recipients: [],
      occurred_at: new Date().toISOString(),
      processed: false,
    })
    .select('id')
    .single();

  if (signalError || !signal) {
    throw new Error(`Failed to write signal: ${signalError?.message}`);
  }

  // 3. Extract with Claude (source-specific prompt)
  const systemPrompt = SOURCE_PROMPTS[source_type] ?? EXTRACTION_SYSTEM;
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    temperature: 0.1 as any,
    system: systemPrompt,
    messages: [{ role: 'user', content: sanitizeForPrompt(text, 40000) }],
  });

  const raw = response.content[0].type === 'text' ? response.content[0].text : '';
  const tokensUsed = (response.usage.input_tokens ?? 0) + (response.usage.output_tokens ?? 0);

  let payload: ExtractionPayload = { decisions: [], outcomes: [], patterns: [], goals: [] };
  try {
    const cleaned = raw.replace(/```(?:json|JSON)?\s*\n?/g, '').trim();
    payload = JSON.parse(cleaned);
  } catch {
    await cleanupSignalForRetry(supabase, signal.id);
    throw new Error(`Failed to parse Claude extraction response: ${raw.slice(0, 200)}`);
  }

  try {
    // 4. Get or create 'self' entity for the user
  // No unique constraint on (user_id, name) exists yet, so select first to avoid duplicates
  let { data: selfEntity } = await supabase
    .from('tkg_entities')
    .select('id')
    .eq('user_id', userId)
    .eq('name', 'self')
    .maybeSingle();

  if (!selfEntity) {
    const { data: created, error: createSelfError } = await supabase
      .from('tkg_entities')
      .insert({
        user_id: userId,
        type: 'person',
        name: 'self',
        display_name: 'You',
        emails: [],
        patterns: {},
      })
      .select('id')
      .single();
    if (createSelfError) {
      throw new Error(`Failed to create self entity: ${createSelfError.message}`);
    }
    selfEntity = created;
  }

  const selfId = selfEntity?.id;

  // 5. Write decisions → tkg_commitments (with dedup gate)
  let decisionsWritten = 0;
  if (selfId && payload.decisions.length > 0) {
    const rows = payload.decisions.map((d) => ({
      user_id: userId,
      promisor_id: selfId,
      promisee_id: selfId,
      description: d.description,
      canonical_form: `DECISION:${d.domain}:${d.description.slice(0, 60).replace(/\s+/g, '_')}`,
      category: 'make_decision',
      made_at: new Date().toISOString(),
      source: 'uploaded_document',
      source_id: signal.id,
      source_context: d.context,
      status: d.outcome ? 'fulfilled' : 'active',
      resolution: d.outcome ? { outcome: d.outcome, resolvedAt: new Date().toISOString() } : null,
      risk_factors: [{ stakes: d.stakes }],
    }));

    // Dedup: check which canonical_forms already exist for this user
    const canonicalForms = rows.map((r) => r.canonical_form);
    const { data: existingRows, error: existingRowsError } = await supabase
      .from('tkg_commitments')
      .select('canonical_form')
      .eq('user_id', userId)
      .in('canonical_form', canonicalForms);
    if (existingRowsError) {
      throw new Error(`Failed to query existing commitments: ${existingRowsError.message}`);
    }
    const existingSet = new Set((existingRows ?? []).map((r) => r.canonical_form));
    const newRows = rows.filter((r) => !existingSet.has(r.canonical_form) && !isNonCommitment(r.description));

    if (newRows.length > 0) {
      const { error: commitError } = await supabase.from('tkg_commitments').insert(newRows);
      if (commitError) {
        throw new Error(`Commitment write error: ${commitError.message}`);
      }
      decisionsWritten = newRows.length;
    }
  }

  // 6. Merge patterns into tkg_entities.patterns JSONB
  let patternsUpdated = 0;
  if (selfId && payload.patterns.length > 0) {
    // Fetch current patterns blob
    const { data: entityRow, error: entityRowError } = await supabase
      .from('tkg_entities')
      .select('patterns')
      .eq('id', selfId)
      .single();
    if (entityRowError) {
      throw new Error(`Pattern fetch error: ${entityRowError.message}`);
    }

    const existing = (entityRow?.patterns as Record<string, any>) || {};
    const merged = { ...existing };

    for (const p of payload.patterns) {
      const key = p.name.toLowerCase().replace(/\s+/g, '_');
      merged[key] = {
        name: p.name,
        description: p.description,
        domain: p.domain,
        last_seen: new Date().toISOString(),
        activation_count: ((merged[key]?.activation_count as number) || 0) + 1,
      };
    }

    const { error: patternError } = await supabase
      .from('tkg_entities')
      .update({ patterns: merged, patterns_updated_at: new Date().toISOString() })
      .eq('id', selfId);

    if (patternError) {
      throw new Error(`Pattern write error: ${patternError.message}`);
    }
    patternsUpdated = payload.patterns.length;
  }

  // 7. Persist extracted goals → tkg_goals (upsert by user_id + goal_text match)
  if (payload.goals.length > 0) {
    for (const g of payload.goals) {
      if (!g.description?.trim()) continue;

      // Derive goal_type from time_horizon string
      const th = (g.time_horizon ?? '').toLowerCase();
      let goal_type: 'short_term' | 'long_term' | 'recurring' = 'long_term';
      if (/recurring|weekly|monthly|every|daily|annual/.test(th)) {
        goal_type = 'recurring';
      } else if (/week|month|quarter|next |soon|immediate|30 day|60 day|90 day/.test(th)) {
        goal_type = 'short_term';
      }

      // Check if this goal already exists for this user
      const { data: existing, error: existingGoalError } = await supabase
        .from('tkg_goals')
        .select('id, status')
        .eq('user_id', userId)
        .eq('goal_text', g.description)
        .maybeSingle();
      if (existingGoalError) {
        throw new Error(`Goal lookup error: ${existingGoalError.message}`);
      }

      if (existing) {
        // Update metadata but never overwrite status (user may have marked it achieved/abandoned)
        const { data: currentGoal, error: currentGoalError } = await supabase
          .from('tkg_goals')
          .select('confidence, priority')
          .eq('id', existing.id)
          .single();
        if (currentGoalError) {
          throw new Error(`Goal metadata fetch error: ${currentGoalError.message}`);
        }

        const currentConfidence = currentGoal?.confidence ?? 50;
        const currentPriority = currentGoal?.priority ?? 3;
        let newConfidence = Math.min(100, currentConfidence + 5);
        let newPriority = currentPriority;

        // Goal priority promotion: if confidence reaches 80 and priority < 5,
        // promote priority by 1 and reset confidence to 60 so next promotion
        // requires another ~4 reinforcements.
        if (newConfidence >= 80 && currentPriority < 5) {
          newPriority = currentPriority + 1;
          newConfidence = 60;
          console.log(`[conversation-extractor] goal_promoted: "${g.description.slice(0, 80)}" priority ${currentPriority} → ${newPriority}`);
        }

        const { error: updateGoalError } = await supabase
          .from('tkg_goals')
          .update({
            goal_type,
            time_horizon: g.time_horizon ?? null,
            source_conversation_id: signal.id,
            entity_id: selfId ?? null,
            confidence: newConfidence,
            priority: newPriority,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
        if (updateGoalError) {
          throw new Error(`Goal update error: ${updateGoalError.message}`);
        }
      } else {
        // -------------------------------------------------------------------
        // Goal consolidation (fuzzy dedup): before inserting, check for
        // semantic near-duplicates using Jaccard similarity on word sets.
        // -------------------------------------------------------------------
        const GOAL_STOP_WORDS = new Set([
          'the', 'a', 'an', 'is', 'at', 'to', 'for', 'and', 'or', 'in',
          'of', 'with', 'on', 'by', 'from', 'that', 'this', 'be', 'as',
        ]);

        function goalWords(text: string): Set<string> {
          return new Set(
            text.toLowerCase()
              .replace(/[^a-z0-9\s]/g, ' ')
              .split(/\s+/)
              .filter(w => w.length >= 2 && !GOAL_STOP_WORDS.has(w)),
          );
        }

        function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
          if (a.size === 0 && b.size === 0) return 1;
          let intersection = 0;
          for (const word of a) {
            if (b.has(word)) intersection++;
          }
          const union = new Set([...a, ...b]).size;
          return union > 0 ? intersection / union : 0;
        }

        const { data: allActiveGoals, error: allActiveGoalsError } = await supabase
          .from('tkg_goals')
          .select('id, goal_text, confidence')
          .eq('user_id', userId)
          .eq('status', 'active');
        if (allActiveGoalsError) {
          throw new Error(`Goal consolidation query error: ${allActiveGoalsError.message}`);
        }

        const newGoalWords = goalWords(g.description);
        let consolidated = false;

        for (const existingGoal of (allActiveGoals ?? [])) {
          const existingWords = goalWords(existingGoal.goal_text);
          const sim = jaccardSimilarity(newGoalWords, existingWords);
          if (sim > 0.5) {
            // Near-duplicate — reinforce existing goal instead of inserting
            const { error: consolidateError } = await supabase
              .from('tkg_goals')
              .update({
                confidence: Math.min(100, (existingGoal.confidence ?? 50) + 5),
                updated_at: new Date().toISOString(),
              })
              .eq('id', existingGoal.id);
            if (consolidateError) {
              throw new Error(`Goal consolidation update error: ${consolidateError.message}`);
            }
            console.log(`[conversation-extractor] goal_consolidated: "${g.description.slice(0, 60)}" → existing "${existingGoal.goal_text.slice(0, 60)}" (sim=${sim.toFixed(2)})`);
            consolidated = true;
            break;
          }
        }

        if (!consolidated) {
          // Insert new goal — map extractor domain to allowed goal_category values
          const domainMap: Record<string, string> = {
            career: 'career',
            financial: 'financial',
            finances: 'financial',
            relationship: 'relationship',
            relationships: 'relationship',
            health: 'health',
            project: 'project',
          };
          const goal_category = domainMap[g.domain?.toLowerCase() ?? ''] ?? 'other';

          const { error: insertGoalError } = await supabase
            .from('tkg_goals')
            .insert({
              user_id: userId,
              goal_text: g.description,
              goal_category,
              goal_type,
              time_horizon: g.time_horizon ?? null,
              source_conversation_id: signal.id,
              entity_id: selfId ?? null,
              status: 'active',
              confidence: 60,
              priority: 3,
              source: 'extracted',
              updated_at: new Date().toISOString(),
            });
          if (insertGoalError) {
            throw new Error(`Goal insert error: ${insertGoalError.message}`);
          }
        }
      }
    }
  }

  // 8a. Persist extracted outcomes — update matched commitments or insert outcome_confirmed signals
  if (payload.outcomes && payload.outcomes.length > 0) {
    const { data: openCommitments } = await supabase
      .from('tkg_commitments')
      .select('id, description')
      .eq('user_id', userId)
      .is('resolution', null)
      .eq('status', 'active')
      .limit(30);

    const tokenize = (s: string): Set<string> =>
      new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w) => w.length > 2));

    const jaccard = (a: Set<string>, b: Set<string>): number => {
      if (a.size === 0 && b.size === 0) return 1;
      let intersection = 0;
      for (const w of a) { if (b.has(w)) intersection++; }
      return intersection / (a.size + b.size - intersection);
    };

    for (const outcome of payload.outcomes) {
      if (!outcome.decision_description || !outcome.result) continue;
      const outcomeWords = tokenize(outcome.decision_description);

      const match = (openCommitments ?? []).find(
        (c) => jaccard(tokenize(c.description), outcomeWords) > 0.55,
      );

      if (match) {
        await supabase
          .from('tkg_commitments')
          .update({
            status: 'fulfilled',
            resolution: { outcome: outcome.result, resolvedAt: new Date().toISOString() },
          })
          .eq('id', match.id);
      } else {
        // No matching commitment — insert as outcome_confirmed signal for scorer context
        await supabase.from('tkg_signals').insert({
          user_id: userId,
          source: 'extraction',
          source_id: signal.id,
          type: 'outcome_confirmed',
          content: encrypt(
            JSON.stringify({
              description: outcome.decision_description,
              result: outcome.result,
              extractedAt: new Date().toISOString(),
            }),
          ),
          processed: true,
        });
      }
    }
  }

  // 8. Mark signal as processed
  const { error: markProcessedError } = await supabase
    .from('tkg_signals')
    .update({ processed: true })
    .eq('id', signal.id);
  if (markProcessedError) {
    throw new Error(`Signal processed update error: ${markProcessedError.message}`);
  }

    return {
      signalId: signal.id,
      decisionsWritten,
      patternsUpdated,
      tokensUsed,
      raw: payload,
    };
  } catch (error) {
    await cleanupSignalForRetry(supabase, signal.id);
    throw error;
  }
}
