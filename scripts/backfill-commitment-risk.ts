/**
 * One-time backfill: compute real risk_score / due_confidence / implied_due_at on
 * existing active commitments, using the SAME deterministic function the write
 * paths now call (lib/signals/commitment-risk.ts) — zero drift between backfill
 * and future inserts.
 *
 * Historically every active commitment carried risk_score:0 and due_confidence:0.5,
 * so the Right Now scorer's pool admission (`.order('risk_score').limit(50)`) and
 * near-duplicate dedup (keep highest risk_score) were both arbitrary. This makes
 * the real high-value commitments win pool admission and dedup.
 *
 * Run:  DRY=1 node scripts/run-local-tsx.cjs scripts/backfill-commitment-risk.ts   (preview)
 *       node scripts/run-local-tsx.cjs scripts/backfill-commitment-risk.ts          (apply)
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { computeCommitmentRisk } from '@/lib/signals/commitment-risk';

dotenv.config({ path: '.env.local' });

const DRY = process.env.DRY === '1' || process.env.DRY === 'true';

interface CommitmentRow {
  id: string;
  user_id: string;
  category: string | null;
  description: string | null;
  due_at: string | null;
  made_at: string | null;
  created_at: string | null;
  promisor_id: string | null;
  promisee_id: string | null;
  risk_score: number | null;
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Self-entity id per user → lets us compute direction (owed-by-you vs owed-to-you).
  const { data: selfEntities, error: selfErr } = await supabase
    .from('tkg_entities')
    .select('id, user_id')
    .eq('name', 'self');
  if (selfErr) throw selfErr;
  const selfByUser = new Map<string, string>();
  for (const e of selfEntities ?? []) selfByUser.set(e.user_id as string, e.id as string);

  const { data: rows, error } = await supabase
    .from('tkg_commitments')
    .select('id, user_id, category, description, due_at, made_at, created_at, promisor_id, promisee_id, risk_score')
    .eq('status', 'active');
  if (error) throw error;

  const commitments = (rows ?? []) as CommitmentRow[];
  console.log(`Active commitments: ${commitments.length}`);
  console.log(`Mode: ${DRY ? 'DRY RUN (no writes)' : 'APPLY'}`);

  let updated = 0;
  const previews: Array<{ desc: string; before: number; after: number; cat: string }> = [];

  for (const c of commitments) {
    const selfId = selfByUser.get(c.user_id);
    const risk = computeCommitmentRisk({
      category: c.category,
      description: c.description,
      dueAt: c.due_at,
      promisorIsSelf: Boolean(selfId) && c.promisor_id === selfId,
      promiseeIsSelf: Boolean(selfId) && c.promisee_id === selfId,
      madeAtIso: c.made_at ?? c.created_at,
    });

    previews.push({
      desc: (c.description ?? '').slice(0, 60),
      before: c.risk_score ?? 0,
      after: risk.risk_score,
      cat: c.category ?? 'other',
    });

    if (!DRY) {
      const { error: upErr } = await supabase
        .from('tkg_commitments')
        .update({
          risk_score: risk.risk_score,
          due_confidence: risk.due_confidence,
          implied_due_at: risk.implied_due_at,
        })
        .eq('id', c.id);
      if (upErr) throw upErr;
    }
    updated += 1;
  }

  previews.sort((a, b) => b.after - a.after);
  console.log('\n=== Top 12 by new risk_score ===');
  for (const p of previews.slice(0, 12)) {
    console.log(`  ${String(p.after).padStart(3)} (was ${p.before})  [${p.cat}]  ${p.desc}`);
  }
  console.log('\n=== Bottom 8 by new risk_score ===');
  for (const p of previews.slice(-8)) {
    console.log(`  ${String(p.after).padStart(3)} (was ${p.before})  [${p.cat}]  ${p.desc}`);
  }
  console.log(`\n${DRY ? 'Would update' : 'Updated'} ${updated} rows.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
