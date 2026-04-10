import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const OWNER = process.env.INGEST_USER_ID!;

async function main() {
  console.log('OWNER:', OWNER);

  // Latest actions
  const { data: latest } = await sb.from('tkg_actions')
    .select('id,action_type,confidence,created_at,artifact_type,generation_log,winner_summary')
    .eq('user_id', OWNER)
    .order('created_at', { ascending: false })
    .limit(5);
  console.log('\n=== LATEST ACTIONS ===');
  for (const a of latest ?? []) {
    console.log({
      id: a.id,
      action_type: a.action_type,
      confidence: a.confidence,
      artifact_type: a.artifact_type,
      created_at: a.created_at,
      winner_type: a.generation_log?.winner_type,
      winner_entity: a.generation_log?.winner_entity,
      winner_summary: a.winner_summary?.slice?.(0, 120),
      scorer_ev: a.generation_log?.scorer_ev,
      stage: a.generation_log?.stage,
      rejection_reason: a.generation_log?.rejection_reason,
    });
  }

  // Top candidates from last generation_log
  const last = latest?.[0];
  if (last?.generation_log?.candidates) {
    console.log('\n=== LAST GEN CANDIDATES ===');
    const cands = last.generation_log.candidates as any[];
    for (const c of cands.slice(0, 10)) {
      console.log({
        type: c.type,
        entity: c.entity_name ?? c.entity,
        ev: c.ev ?? c.expected_value,
        score: c.score,
        reason: c.rejection_reason ?? c.skip_reason,
      });
    }
  }

  // Recent signal counts by source
  const { data: sigCounts } = await sb.from('tkg_signals')
    .select('source')
    .eq('user_id', OWNER)
    .gte('occurred_at', new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString());
  const bySrc: Record<string, number> = {};
  for (const s of sigCounts ?? []) {
    bySrc[s.source] = (bySrc[s.source] ?? 0) + 1;
  }
  console.log('\n=== SIGNALS LAST 7D BY SOURCE ===', bySrc);

  // Unprocessed signals
  const { count: unprocessed } = await sb.from('tkg_signals')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', OWNER)
    .eq('processed', false);
  console.log('\n=== UNPROCESSED SIGNALS ===', unprocessed);

  // Commitment sample (non-suppressed)
  const { data: commitments } = await sb.from('tkg_commitments')
    .select('id,title,status,due_date,commitment_type,source_id,created_at')
    .eq('user_id', OWNER)
    .is('suppressed_at', null)
    .order('created_at', { ascending: false })
    .limit(10);
  console.log('\n=== RECENT COMMITMENTS (non-suppressed) ===');
  for (const c of commitments ?? []) {
    console.log({
      id: c.id,
      title: c.title?.slice(0, 80),
      status: c.status,
      due_date: c.due_date,
      type: c.commitment_type,
      source_id: c.source_id,
    });
  }

  // Check orphan rate
  const { data: orphanCheck } = await sb.rpc('exec_sql' as any, {
    sql: `SELECT COUNT(*) as orphan_count FROM tkg_commitments c
          LEFT JOIN tkg_signals s ON s.id = c.source_id
          WHERE c.user_id = '${OWNER}' AND c.suppressed_at IS NULL AND c.source_id IS NOT NULL AND s.id IS NULL`
  }).maybeSingle();
  console.log('\n=== ORPHAN COMMITMENTS (source_id has no matching signal) ===', orphanCheck);

  // Top entities by interaction count
  const { data: topEntities } = await sb.from('tkg_entities')
    .select('id,name,entity_type,interaction_count,last_interaction')
    .eq('user_id', OWNER)
    .order('interaction_count', { ascending: false })
    .limit(15);
  console.log('\n=== TOP ENTITIES ===');
  for (const e of topEntities ?? []) {
    console.log({ name: e.name, type: e.entity_type, interactions: e.interaction_count, last: e.last_interaction });
  }
}

main().catch(console.error);
