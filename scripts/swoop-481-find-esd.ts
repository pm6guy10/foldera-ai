/**
 * #481 hail-mary: find the REAL ESD waiver thread + other high-consequence
 * threads across the FULL signal history. Read-only. No paid API calls.
 * Owner data, owner machine, owner keys. PII -> gitignored local file only.
 */
import { OWNER_USER_ID } from '../lib/auth/constants';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { decryptWithStatus } from '../lib/encryption';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const OWNER = OWNER_USER_ID;

// Theme buckets — the high-consequence threads #481 says are "already in your data".
const THEMES: Record<string, string[]> = {
  ESD_WAIVER: ['7,199', '7199', 'overpayment', 'esd.wa', 'employment security department', 'benefit overpayment', 'waiver of overpayment', 'collection of overpayment'],
  JOB_MAS3: ['mas3', 'mas 3', 'management analyst', 'job offer', 'conditional offer', 'background check', 'references', 'start date', 'governmentjobs', 'neogov', 'onboarding'],
  ASSESSMENT: ['assessment', 'reference check', 'skills test', 'take-home', 'deadline to complete'],
  PAYMENT: ['declined', 'payment failed', 'card declined', 'past due', 'autopay', 'overdue'],
};

function decode(row: Record<string, unknown>): { text: string; ok: boolean } {
  const plain = (row.content as string) || '';
  if (!plain) return { text: '', ok: true };
  const r = decryptWithStatus(plain);
  return { text: r.plaintext, ok: !r.usedFallback };
}

async function main() {
  // Paginate past the 1000-row PostgREST cap.
  const PAGE = 1000;
  let from = 0;
  const rows: Record<string, unknown>[] = [];
  for (;;) {
    const { data, error } = await sb
      .from('tkg_signals')
      .select('id,source,type,occurred_at,author,content')
      .eq('user_id', OWNER)
      .order('occurred_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) { console.error('QUERY ERROR', error); return; }
    if (!data || data.length === 0) break;
    rows.push(...(data as Record<string, unknown>[]));
    if (data.length < PAGE) break;
    from += PAGE;
    if (from > 20000) break; // safety
  }

  let decOk = 0, decFail = 0, empty = 0;
  const oldest = rows[rows.length - 1]?.occurred_at;
  const newest = rows[0]?.occurred_at;

  type Hit = { theme: string; score: number; date: string; author: string; source: string; type: string; id: string; text: string };
  const hits: Hit[] = [];

  for (const r of rows) {
    const { text, ok } = decode(r);
    if (!text) { empty++; continue; }
    if (ok) decOk++; else { decFail++; continue; } // only theme-match decryptable rows
    const lower = text.toLowerCase();
    for (const [theme, kws] of Object.entries(THEMES)) {
      let score = 0;
      for (const k of kws) if (lower.includes(k)) score += 1;
      if (score > 0) {
        hits.push({ theme, score, date: String(r.occurred_at ?? '').slice(0, 16), author: String(r.author ?? ''), source: String(r.source ?? ''), type: String(r.type ?? ''), id: String(r.id), text });
      }
    }
  }

  hits.sort((a, b) => (a.theme.localeCompare(b.theme)) || b.score - a.score || b.date.localeCompare(a.date));

  const fs = await import('fs');
  const out: string[] = [];
  out.push(`# #481 swoop source dump — ${new Date().toISOString()}`);
  out.push(`# owner ${OWNER}`);
  out.push(`# rows=${rows.length} window ${String(oldest).slice(0,10)} .. ${String(newest).slice(0,10)}`);
  out.push(`# decrypt: ok=${decOk} fail=${decFail} empty=${empty}`);
  for (const h of hits) {
    out.push(`\n===== ${h.theme} score=${h.score} | ${h.date} | ${h.type} | ${h.source} | author=${h.author} | id=${h.id}`);
    out.push(h.text);
  }
  fs.writeFileSync('.swoop-481/source-dump.txt', out.join('\n'), 'utf8');

  // Redacted console index.
  console.log(`rows=${rows.length} window ${String(oldest).slice(0,10)}..${String(newest).slice(0,10)}`);
  console.log(`decrypt ok=${decOk} fail=${decFail} empty=${empty}  (fail% = ${(100*decFail/Math.max(1,decOk+decFail)).toFixed(1)})`);
  const byTheme: Record<string, number> = {};
  for (const h of hits) byTheme[h.theme] = (byTheme[h.theme] ?? 0) + 1;
  console.log('theme hits:', JSON.stringify(byTheme));
  for (const t of Object.keys(THEMES)) {
    const top = hits.filter(h => h.theme === t).slice(0, 6);
    console.log(`\n[${t}]`);
    for (const h of top) console.log(`  score=${h.score} | ${h.date} | ${h.type} | ${h.source} | id=${h.id}`);
  }
}

main().catch(console.error);
