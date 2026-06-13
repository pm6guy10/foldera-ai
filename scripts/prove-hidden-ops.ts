/**
 * Proof: run the hidden-op detector over the REAL recent signal stream and print the
 * ranked result. No goals, no calendar priority — pure consequence-inverse-to-volume.
 *
 * Demonstrates the thesis on live data: the one quiet, pivotal signal ("First day of
 * work at CWU") rises to the top over 600+ GitHub pings and the daily chore reminders.
 *
 * Run:  node scripts/run-local-tsx.cjs scripts/prove-hidden-ops.ts
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { detectHiddenOps, type HiddenOpInput } from '@/lib/signals/hidden-op-detector';

dotenv.config({ path: '.env.local' });

interface SignalRow {
  id: string;
  source: string | null;
  author: string | null;
  type: string | null;
  occurred_at: string | null;
  extracted_dates: unknown;
}

function flatten(rows: SignalRow[]): HiddenOpInput[] {
  const out: HiddenOpInput[] = [];
  for (const r of rows) {
    const dates = Array.isArray(r.extracted_dates) ? r.extracted_dates : [];
    let pushed = false;
    for (let i = 0; i < dates.length; i++) {
      const d = dates[i] as { due?: string; description?: string } | null;
      if (d && typeof d.description === 'string' && d.description.trim()) {
        out.push({
          id: `${r.id}:${i}`,
          source: r.source,
          author: r.author,
          occurredAtIso: r.occurred_at,
          type: r.type,
          dueIso: typeof d.due === 'string' ? d.due : null,
          description: d.description,
        });
        pushed = true;
      }
    }
    // Signals with no dated obligation still count toward sender volume (the noise).
    if (!pushed) {
      out.push({
        id: r.id,
        source: r.source,
        author: r.author,
        occurredAtIso: r.occurred_at,
        type: r.type,
        dueIso: null,
        description: '', // skipped by the detector, but its author still inflates volume
      });
    }
  }
  return out;
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('tkg_signals')
    .select('id, source, author, type, occurred_at, extracted_dates')
    .gte('occurred_at', since)
    .order('occurred_at', { ascending: false })
    .limit(5000);
  if (error) throw error;

  const rows = (data ?? []) as SignalRow[];
  const inputs = flatten(rows);
  const dated = inputs.filter((i) => i.description);

  console.log(`Signals in last 30d: ${rows.length}`);
  console.log(`Dated obligations to rank: ${dated.length}`);
  console.log(`(volume computed over all ${inputs.length} signals)\n`);

  const ops = detectHiddenOps(inputs, { limit: 15 });

  console.log('=== Hidden ops, ranked by consequence (volume-independent) ===');
  for (const o of ops) {
    const when =
      o.daysUntil === null ? '   —  ' : `${o.daysUntil >= 0 ? '+' : ''}${Math.round(o.daysUntil)}d`.padStart(6);
    console.log(
      `  ${String(o.score).padStart(3)}  ${when}  [${o.domain.padEnd(15)}]  ${o.description.slice(0, 64)}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
