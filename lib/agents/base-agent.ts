/**
 * Base Agent Infrastructure
 *
 * All specialist agents share this base. Each agent:
 *  1. Gathers relevant data from Supabase
 *  2. Calls Claude with a role-specific system prompt
 *  3. Parses Claude's structured output into draft proposals
 *  4. Writes proposals to tkg_actions (status='draft') via createDraft()
 *
 * Brandon approves or skips in DraftQueue. Nothing executes without his tap.
 * Skipped drafts feed back as -0.5 weight so future runs adjust.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import type { ActionType } from '@/lib/briefing/types';

// ─── Clients ──────────────────────────────────────────────────────────────────

export function getAnthropicClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  return new Anthropic({ apiKey: key });
}

export function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ─── Draft creation ───────────────────────────────────────────────────────────

export interface AgentDraft {
  title:       string;       // Short label shown in DraftQueue
  description: string;       // One sentence: "Agent wants to…"
  action_type: ActionType;
  payload:     Record<string, unknown>;  // Stored in execution_result
}

/**
 * Write one draft proposal from an agent into tkg_actions.
 * Returns the created row ID, or null on failure.
 */
export async function createDraft(
  userId: string,
  agentName: string,
  draft: AgentDraft,
): Promise<string | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('tkg_actions')
    .insert({
      user_id:        userId,
      directive_text: draft.description,
      action_type:    draft.action_type,
      confidence:     0,
      reason:         draft.title,
      evidence:       [],
      status:         'draft',
      generated_at:   new Date().toISOString(),
      execution_result: {
        ...draft.payload,
        _title:  draft.title,
        _source: agentName,
        _agent:  agentName,
      },
    })
    .select('id')
    .single();

  if (error) {
    console.error(`[${agentName}] draft insert failed:`, error.message);
    return null;
  }
  return data.id;
}

// ─── Claude call helper ───────────────────────────────────────────────────────

/**
 * Ask Claude to analyze a situation and return structured draft proposals.
 * The system prompt defines the agent persona and output schema.
 * Returns parsed JSON or null on failure.
 */
export async function agentThink(
  systemPrompt: string,
  userContent:  string,
  agentName:    string,
): Promise<unknown> {
  const client = getAnthropicClient();
  try {
    const response = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 2048,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userContent }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    // Extract JSON from the response (may be wrapped in ```json ... ```)
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) ??
                      text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (!jsonMatch) {
      console.warn(`[${agentName}] no JSON found in response`);
      return null;
    }
    return JSON.parse(jsonMatch[1] ?? jsonMatch[0]);
  } catch (err: any) {
    console.error(`[${agentName}] Claude call failed:`, err.message);
    return null;
  }
}

// ─── Shared data helpers ──────────────────────────────────────────────────────

/** Basic snapshot of the app's current tkg_ state */
export async function getAppSnapshot(userId: string) {
  const supabase = getSupabase();

  const [signals, actions, patterns] = await Promise.all([
    supabase.from('tkg_signals').select('id, source, type, occurred_at').eq('user_id', userId).order('occurred_at', { ascending: false }).limit(20),
    supabase.from('tkg_actions').select('id, directive_text, action_type, status, feedback_weight, generated_at').eq('user_id', userId).order('generated_at', { ascending: false }).limit(30),
    supabase.from('tkg_patterns').select('id, name, description').eq('user_id', userId).limit(10),
  ]);

  return {
    signals:  signals.data ?? [],
    actions:  actions.data ?? [],
    patterns: patterns.data ?? [],
  };
}
