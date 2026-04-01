import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentJobId } from '@/lib/agents/constants';
import { actionSourceForAgent } from '@/lib/agents/constants';
import { OWNER_USER_ID } from '@/lib/auth/constants';

export interface AgentDraftPayload {
  title: string;
  /** Short headline shown as directive line */
  directiveLine: string;
  /** Longer body (markdown) for the document artifact */
  body: string;
  fixPrompt?: string;
  whatBroke?: string;
  extraExecutionFields?: Record<string, unknown>;
}

/**
 * Insert a DraftQueue row for the owner. Does not send email (status=draft).
 */
export async function insertAgentDraft(
  supabase: SupabaseClient,
  job: AgentJobId,
  payload: AgentDraftPayload,
): Promise<{ id: string } | { error: string }> {
  const actionSource = actionSourceForAgent(job);
  const executionResult: Record<string, unknown> = {
    _title: payload.title,
    _source: actionSource,
    type: 'document',
    title: payload.title,
    content: [
      payload.directiveLine,
      '',
      payload.body,
      payload.fixPrompt ? `\n\n---\n\n## Fix prompt (paste into Cursor)\n\n${payload.fixPrompt}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    agent: {
      job,
      action_source: actionSource,
      what_broke: payload.whatBroke ?? null,
      fix_prompt: payload.fixPrompt ?? null,
      ...(payload.extraExecutionFields ?? {}),
    },
  };

  const { data, error } = await supabase
    .from('tkg_actions')
    .insert({
      user_id: OWNER_USER_ID,
      directive_text: payload.directiveLine,
      action_type: 'research',
      confidence: 72,
      reason: payload.title,
      evidence: [],
      status: 'draft',
      action_source: actionSource,
      execution_result: executionResult,
    })
    .select('id')
    .single();

  if (error || !data) {
    return { error: error?.message ?? 'insert failed' };
  }

  return { id: data.id as string };
}
