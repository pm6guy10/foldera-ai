/**
 * #481 verify (a): classify WHY signals fail to decrypt. Pure stats, no PII.
 * For each row that fails decryptWithStatus, inspect the byte structure:
 *  - valid_gcm_authfail: base64 decodes to >= 29 bytes (IV12+TAG16+>=1) BUT
 *    decrypt auth fails -> encrypted with a DIFFERENT/missing key (key gap).
 *  - too_short / not_base64: stored plaintext or a non-GCM encoding
 *    (format gap — and the hydrate path drops these too).
 * This distinguishes "set ENCRYPTION_KEY_LEGACY" from "fix ingestion encoding".
 */
import { OWNER_USER_ID } from '../lib/auth/constants';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { decryptWithStatus } from '../lib/encryption';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const MIN_GCM = 12 + 16 + 1;

function classify(content: string): 'ok' | 'valid_gcm_authfail' | 'too_short' | 'not_base64' | 'empty' {
  if (!content) return 'empty';
  if (!decryptWithStatus(content).usedFallback) return 'ok';
  // failed — inspect structure
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(content.slice(0, 64))) return 'not_base64';
  let buf: Buffer;
  try { buf = Buffer.from(content, 'base64'); } catch { return 'not_base64'; }
  if (buf.length < MIN_GCM) return 'too_short';
  // re-encoding round-trips and length looks like GCM → structurally valid ciphertext we can't auth
  return buf.toString('base64').replace(/=+$/, '') === content.replace(/=+$/, '').replace(/\s/g, '')
    ? 'valid_gcm_authfail'
    : 'too_short';
}

async function main() {
  const PAGE = 1000; let from = 0; const rows: Record<string, unknown>[] = [];
  for (;;) {
    const { data, error } = await sb.from('tkg_signals')
      .select('content,source').eq('user_id', OWNER_USER_ID)
      .order('occurred_at', { ascending: false }).range(from, from + PAGE - 1);
    if (error) { console.error(error); return; }
    if (!data || data.length === 0) break;
    rows.push(...(data as Record<string, unknown>[]));
    if (data.length < PAGE) break; from += PAGE; if (from > 20000) break;
  }
  const tally: Record<string, number> = {};
  const failBySource: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    const c = classify((r.content as string) || '');
    tally[c] = (tally[c] ?? 0) + 1;
    if (c !== 'ok' && c !== 'empty') {
      const s = String(r.source ?? 'unknown');
      (failBySource[s] ??= {})[c] = (failBySource[s][c] ?? 0) + 1;
    }
  }
  console.log(`rows=${rows.length}`);
  console.log('overall:', JSON.stringify(tally, null, 0));
  console.log('\nfailure class by source:');
  for (const s of Object.keys(failBySource).sort()) {
    console.log(`  ${s.padEnd(20)} ${JSON.stringify(failBySource[s])}`);
  }
}
main().catch(console.error);
