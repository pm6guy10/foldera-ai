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
import { createServerClient } from '@/lib/db/client';
import { extractFromConversation } from '@/lib/extraction/conversation-extractor';
import type { ActionType } from '@/lib/briefing/types';

// ─── Clients ──────────────────────────────────────────────────────────────────

export function getAnthropicClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  return new Anthropic({ apiKey: key });
}

export { createServerClient as getSupabase };

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
  const supabase = createServerClient();
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

  // Self-feeding loop: pipe the agent's analysis back through extraction
  // so future directives can build on agent insights.
  try {
    const feedText = [
      `[Agent Insight — ${agentName} — ${new Date().toISOString().slice(0, 10)}]`,
      `Title: ${draft.title}`,
      `Analysis: ${draft.description}`,
      draft.payload ? `Details: ${JSON.stringify(draft.payload).slice(0, 1000)}` : null,
    ].filter(Boolean).join('\n');
    await extractFromConversation(feedText, userId);
  } catch (feedErr: any) {
    if (!feedErr.message?.includes('already ingested')) {
      console.warn(`[${agentName}] self-feed extraction failed:`, feedErr.message);
    }
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
  const supabase = createServerClient();

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
