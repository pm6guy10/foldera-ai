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
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { sanitizeForPrompt } from '@/lib/utils/prompt-sanitization';

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  return new Anthropic({ apiKey });
}

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key);
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

const EXTRACTION_SYSTEM = `You are building an identity graph for a personal chief of staff system.

Read this conversation and extract:
(1) Decisions made — what choice was made, what domain, what context, what stakes.
(2) Outcomes confirmed — results of past decisions, positive or negative.
(3) Behavioral patterns — recurring tendencies, named if possible.
(4) Active goals — stated desired outcomes with time horizons.

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

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function extractFromConversation(
  text: string,
  userId: string
): Promise<ExtractionResult> {
  const supabase = getSupabaseClient();
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
      source: 'claude_conversation',
      source_id: contentHash.slice(0, 16),
      type: 'document_created',
      content: text,
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

  // 3. Extract with Claude
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    temperature: 0.1 as any,
    system: EXTRACTION_SYSTEM,
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

  // 4. Upsert 'self' entity for the user
  const { data: selfEntity } = await supabase
    .from('tkg_entities')
    .upsert(
      {
        user_id: userId,
        type: 'person',
        name: 'self',
        display_name: 'You',
        emails: [],
        patterns: {},
      },
      { onConflict: 'user_id,name', ignoreDuplicates: false }
    )
    .select('id')
    .single();

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
      source: 'claude_conversation',
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

  // 7. Mark signal as processed
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
