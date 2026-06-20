/**
 * #481 finding B: characterize the signal decrypt-failure rate by month.
 * Pure stats — NO content, NO PII printed. Distinguishes "key rotation"
 * (failures cluster in a recent contiguous window) from "uniform corruption".
 */
import { OWNER_USER_ID } from '../lib/auth/constants';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { decryptWithStatus } from '../lib/encryption';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const PAGE = 1000;
  let from = 0;
  const rows: Record<string, unknown>[] = [];
  for (;;) {
    const { data, error } = await sb
      .from('tkg_signals')
      .select('occurred_at,content,source')
      .eq('user_id', OWNER_USER_ID)
      .order('occurred_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) { console.error(error); return; }
    if (!data || data.length === 0) break;
    rows.push(...(data as Record<string, unknown>[]));
    if (data.length < PAGE) break;
    from += PAGE;
    if (from > 20000) break;
  }

  const byMonth = new Map<string, { ok: number; fail: number }>();
  const bySource = new Map<string, { ok: number; fail: number }>();
  for (const r of rows) {
    const month = String(r.occurred_at ?? '').slice(0, 7) || 'unknown';
    const src = String(r.source ?? 'unknown');
    const content = (r.content as string) || '';
    const ok = content ? !decryptWithStatus(content).usedFallback : true;
    const m = byMonth.get(month) ?? { ok: 0, fail: 0 };
    const s = bySource.get(src) ?? { ok: 0, fail: 0 };
    if (ok) { m.ok++; s.ok++; } else { m.fail++; s.fail++; }
    byMonth.set(month, m); bySource.set(src, s);
  }

  console.log(`total rows: ${rows.length}`);
  console.log('\nMONTH    ok   fail  fail%');
  for (const month of [...byMonth.keys()].sort()) {
    const { ok, fail } = byMonth.get(month)!;
    const pct = (100 * fail / Math.max(1, ok + fail)).toFixed(0);
    console.log(`${month}  ${String(ok).padStart(4)} ${String(fail).padStart(5)}  ${pct.padStart(3)}%`);
  }
  console.log('\nSOURCE          ok   fail  fail%');
  for (const src of [...bySource.keys()].sort()) {
    const { ok, fail } = bySource.get(src)!;
    const pct = (100 * fail / Math.max(1, ok + fail)).toFixed(0);
    console.log(`${src.padEnd(14)} ${String(ok).padStart(4)} ${String(fail).padStart(5)}  ${pct.padStart(3)}%`);
  }
}

main().catch(console.error);
