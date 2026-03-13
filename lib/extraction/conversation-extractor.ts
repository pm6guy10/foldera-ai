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

Extract only what is explicit or clearly implied. Do not infer. If nothing relevant, return empty arrays.`;

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
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    temperature: 0.1 as any,
    system: systemPrompt,
    messages: [{ role: 'user', content: sanitizeForPrompt(text, 40000) }],
  });

  const raw = response.content[0].type === 'text' ? response.content[0].text : '';
  const tokensUsed = (response.usage.input_tokens ?? 0) + (response.usage.output_tokens ?? 0);

  let payload: ExtractionPayload = { decisions: [], outcomes: [], patterns: [], goals: [] };
  try {
    const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
    payload = JSON.parse(cleaned);
  } catch {
    console.error('[conversation-extractor] Failed to parse Claude response:', raw.slice(0, 200));
  }

  // 4. Get or create 'self' entity for the user
  // No unique constraint on (user_id, name) exists yet, so select first to avoid duplicates
  let { data: selfEntity } = await supabase
    .from('tkg_entities')
    .select('id')
    .eq('user_id', userId)
    .eq('name', 'self')
    .maybeSingle();

  if (!selfEntity) {
    const { data: created } = await supabase
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
    selfEntity = created;
  }

  const selfId = selfEntity?.id;

  // 5. Write decisions → tkg_commitments
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

    const { error: commitError } = await supabase.from('tkg_commitments').insert(rows);
    if (!commitError) decisionsWritten = rows.length;
    else console.error('[conversation-extractor] Commitment write error:', commitError.message);
  }

  // 6. Merge patterns into tkg_entities.patterns JSONB
  let patternsUpdated = 0;
  if (selfId && payload.patterns.length > 0) {
    // Fetch current patterns blob
    const { data: entityRow } = await supabase
      .from('tkg_entities')
      .select('patterns')
      .eq('id', selfId)
      .single();

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

    if (!patternError) patternsUpdated = payload.patterns.length;
    else console.error('[conversation-extractor] Pattern write error:', patternError.message);
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
      const { data: existing } = await supabase
        .from('tkg_goals')
        .select('id, status')
        .eq('user_id', userId)
        .eq('goal_text', g.description)
        .maybeSingle();

      if (existing) {
        // Update metadata but never overwrite status (user may have marked it achieved/abandoned)
        await supabase
          .from('tkg_goals')
          .update({
            goal_type,
            time_horizon: g.time_horizon ?? null,
            source_conversation_id: signal.id,
            entity_id: selfId ?? null,
            confidence: Math.min(100, ((await supabase
              .from('tkg_goals')
              .select('confidence')
              .eq('id', existing.id)
              .single()).data?.confidence ?? 50) + 5),
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
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

        await supabase
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
      }
    }
  }

  // 8. Mark signal as processed
  await supabase
    .from('tkg_signals')
    .update({ processed: true })
    .eq('id', signal.id);

  return {
    signalId: signal.id,
    decisionsWritten,
    patternsUpdated,
    tokensUsed,
    raw: payload,
  };
}
