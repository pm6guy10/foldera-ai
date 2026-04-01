import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentJobId } from '@/lib/agents/constants';
import { actionSourceForAgent } from '@/lib/agents/constants';

/**
 * Load recent skips for this agent so prompts can say "do not repeat these patterns."
 */
export async function buildSkipAvoidanceBlock(
  supabase: SupabaseClient,
  job: AgentJobId,
): Promise<string> {
  const src = actionSourceForAgent(job);
  const { data, error } = await supabase
    .from('tkg_actions')
    .select('directive_text, reason, skip_reason, generated_at')
    .eq('status', 'skipped')
    .eq('action_source', src)
    .order('generated_at', { ascending: false })
    .limit(12);

  if (error || !data?.length) {
    return '';
  }

  const lines = data.map((row, i) => {
    const hint = [
      `${i + 1}. ${String(row.directive_text ?? '').slice(0, 200)}`,
      row.skip_reason ? `   skip_reason: ${row.skip_reason}` : '',
      row.reason ? `   reason: ${String(row.reason).slice(0, 160)}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    return hint;
  });

  return [
    'The operator previously skipped suggestions like the following. Avoid repeating the same framing, channel, or angle:',
    '',
    ...lines,
    '',
  ].join('\n');
}
