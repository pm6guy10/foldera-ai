import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const userId = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  // Find the specific keri failure action
  const { data: keriActions } = await supabase
    .from('tkg_actions')
    .select('id, directive_text, action_type, status, generated_at, execution_result')
    .eq('user_id', userId)
    .eq('status', 'skipped')
    .eq('action_type', 'do_nothing')
    .gte('generated_at', sevenDaysAgo)
    .ilike('directive_text', '%keri%');

  console.log(`Found ${keriActions?.length ?? 0} keri-related skipped do_nothing actions`);
  
  for (const a of keriActions ?? []) {
    console.log('\n=== KERI FAILURE ACTION ===');
    console.log('id:', a.id);
    console.log('generated_at:', a.generated_at);
    console.log('directive_text:', a.directive_text);
    const er = (a.execution_result as Record<string, unknown>) ?? {};
    const genLog = (er.generation_log as Record<string, unknown>) ?? {};
    console.log('generation_log.outcome:', genLog.outcome);
    console.log('generation_log.reason:', genLog.reason);
    const discovery = (genLog.candidateDiscovery as Record<string, unknown>) ?? {};
    const topCandidates = (discovery.topCandidates as Array<Record<string, unknown>>) ?? [];
    console.log(`topCandidates (${topCandidates.length}):`);
    for (const c of topCandidates) {
      console.log(`  ${c.id?.toString().slice(0, 60)} | decision=${c.decision} | sourceSignals=${JSON.stringify(c.sourceSignals ?? [])}`);
    }
    console.log('loop_suppression_keys:', JSON.stringify(er.loop_suppression_keys));
    console.log('loop_suppression_until:', er.loop_suppression_until);
    const oc = (er.original_candidate as Record<string, unknown>) ?? {};
    console.log('original_candidate.blocked_by:', oc.blocked_by);
  }

  // Check current failure suppression keys
  const { data: allFailureActions } = await supabase
    .from('tkg_actions')
    .select('id, directive_text, action_type, status, execution_result, generated_at')
    .eq('user_id', userId)
    .eq('status', 'skipped')
    .eq('action_type', 'do_nothing')
    .gte('generated_at', sevenDaysAgo);

  let activeSuppressionCount = 0;
  for (const a of allFailureActions ?? []) {
    const er = (a.execution_result as Record<string, unknown>) ?? {};
    const genLog = (er.generation_log as Record<string, unknown>) ?? {};
    const reasons = ((genLog.candidateFailureReasons as unknown[]) ?? []).map(r => String(r));
    const reasonStr = reasons.join(' ');
    const PATTERN = /duplicate_|usefulness:|llm_failed:|trigger_lock:|ungrounded_currency|all_candidates_blocked|Selected candidate blocked|stale_date_in_directive|GENERATION_LOOP_DETECTED/i;
    const hasBlockerReason = PATTERN.test(reasonStr) || (typeof genLog.reason === 'string' && PATTERN.test(genLog.reason));
    const blockedBy = typeof (er.original_candidate as Record<string, unknown> | undefined)?.blocked_by === 'string' 
      ? (er.original_candidate as Record<string, unknown>).blocked_by as string 
      : '';
    const hasBlockedBy = PATTERN.test(blockedBy);
    if (genLog.outcome === 'no_send' && hasBlockerReason || hasBlockedBy) {
      activeSuppressionCount++;
    }
  }
  console.log('\nActive failure suppression do_nothing rows in 7d:', activeSuppressionCount);
}

main().catch(console.error);
