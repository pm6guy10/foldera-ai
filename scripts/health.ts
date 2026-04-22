/**
 * Production health gate: Supabase read-only checks for the audit user.
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *      AUDIT_USER_ID (optional) or OWNER_USER_ID (required if AUDIT unset).
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { STALE_PENDING_APPROVAL_MAX_AGE_HOURS } from '../lib/config/constants';
import {
  isDevForceFreshAutoSuppressedExecutionResult,
  selectLatestMeaningfulGenerationRow,
  summarizeRepeatedDirectiveHealth,
} from '../lib/cron/duplicate-truth';
import {
  blockingCheck,
  buildRepeatedDirectiveCheck,
  countBlockingFailures,
  isHealthCiRelaxedMode,
  type HealthCheckRow,
  warningCheck,
} from './health-checks';

config({ path: resolve(process.cwd(), '.env.local') });

const TWENTY_FIVE_H_MS = 25 * 60 * 60 * 1000;
const TWENTY_FOUR_H_MS = 24 * 60 * 60 * 1000;
const MAIL_TYPES = ['email_received', 'email_sent'] as const;

function formatPtHeader(): string {
  const now = new Date();
  const d = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => d.find((x) => x.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')} PT`;
}

function relAgo(iso: string | null | undefined, now: number): string {
  if (!iso) return 'never';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 'invalid time';
  const diff = now - t;
  if (diff < 0) return '0m ago';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h >= 48) return `${Math.floor(h / 24)}d ago`;
  if (h > 0) return `${h}h ago`;
  return `${m}m ago`;
}

function isFresh(iso: string | null | undefined, now: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && now - t <= TWENTY_FIVE_H_MS;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const userId = (process.env.AUDIT_USER_ID || process.env.OWNER_USER_ID || '').trim();

  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  if (!userId) {
    console.error('Missing AUDIT_USER_ID or OWNER_USER_ID');
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const now = Date.now();
  const checks: HealthCheckRow[] = [];

  // Transient undici/Node "fetch failed" to Supabase should not red the gate once.
  const USER_TOKEN_RETRIES = 3;
  let tokenRows: {
    provider: string;
    last_synced_at: string | null;
    disconnected_at: string | null;
  }[] | null = null;
  let tokErr: { message: string } | null = null;
  for (let attempt = 1; attempt <= USER_TOKEN_RETRIES; attempt++) {
    const { data, error } = await supabase
      .from('user_tokens')
      .select('provider, last_synced_at, disconnected_at')
      .eq('user_id', userId)
      .in('provider', ['google', 'microsoft']);
    if (!error) {
      tokenRows = data ?? null;
      tokErr = null;
      break;
    }
    tokErr = error;
    if (attempt < USER_TOKEN_RETRIES) {
      const delayMs = 500 * 2 ** (attempt - 1);
      console.error(`user_tokens query attempt ${attempt}/${USER_TOKEN_RETRIES} failed: ${error.message} — retry in ${delayMs}ms`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  if (tokErr) {
    console.error('user_tokens query failed:', tokErr.message);
    process.exit(1);
  }

  const active = (tokenRows ?? []).filter((r) => r.disconnected_at == null);
  const googleConnected = active.some((r) => r.provider === 'google');
  const msConnected = active.some((r) => r.provider === 'microsoft');

  async function newestMailOccurred(source: 'gmail' | 'outlook'): Promise<string | null> {
    const { data, error } = await supabase
      .from('tkg_signals')
      .select('occurred_at')
      .eq('user_id', userId)
      .eq('source', source)
      .in('type', [...MAIL_TYPES])
      .order('occurred_at', { ascending: false, nullsFirst: false })
      .limit(1);
    if (error) throw new Error(`${source} signals: ${error.message}`);
    return data?.[0]?.occurred_at ?? null;
  }

  // Gmail fresh
  try {
    if (!googleConnected) {
      checks.push(warningCheck('Gmail fresh', '(no Google mailbox connected)'));
    } else {
      const newest = await newestMailOccurred('gmail');
      const fresh = isFresh(newest, now);
      checks.push(
        fresh
          ? warningCheck('Gmail fresh', relAgo(newest, now), 'pass')
          : warningCheck('Gmail stale', `${relAgo(newest, now)} — check sync / ingest`),
      );
    }
  } catch (e) {
    checks.push(
      warningCheck(
        'Gmail fresh',
        `query error: ${e instanceof Error ? e.message : String(e)}`,
      ),
    );
  }

  // Outlook fresh
  try {
    if (!msConnected) {
      checks.push(warningCheck('Outlook fresh', '(no Microsoft mailbox connected)'));
    } else {
      const newest = await newestMailOccurred('outlook');
      const fresh = isFresh(newest, now);
      checks.push(
        fresh
          ? warningCheck('Outlook fresh', relAgo(newest, now), 'pass')
          : warningCheck('Outlook stale', `${relAgo(newest, now)} — check sync / ingest`),
      );
    }
  } catch (e) {
    checks.push(
      warningCheck(
        'Outlook fresh',
        `query error: ${e instanceof Error ? e.message : String(e)}`,
      ),
    );
  }

  // No pending_approval older than STALE_PENDING_APPROVAL_MAX_AGE_HOURS (cron auto-drains on daily-generate)
  try {
    const staleCutoff = new Date(
      now - STALE_PENDING_APPROVAL_MAX_AGE_HOURS * 60 * 60 * 1000,
    ).toISOString();
    const { count: staleCount, error } = await supabase
      .from('tkg_actions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'pending_approval')
      .lt('generated_at', staleCutoff);

    if (error) throw new Error(error.message);
    const n = staleCount ?? 0;
    checks.push(
      blockingCheck(
        `No stale pending_approval (>${STALE_PENDING_APPROVAL_MAX_AGE_HOURS}h)`,
        n === 0,
        undefined,
        `${n} row${n === 1 ? '' : 's'} older than ${STALE_PENDING_APPROVAL_MAX_AGE_HOURS}h — check daily-generate / cron`,
      ),
    );
  } catch (e) {
    checks.push(
      blockingCheck(
        'Stale pending_approval',
        false,
        undefined,
        e instanceof Error ? e.message : String(e),
      ),
    );
  }

  // No directive repeated 3+ in 24h
  try {
    const since = new Date(now - TWENTY_FOUR_H_MS).toISOString();
    const { data: acts, error } = await supabase
      .from('tkg_actions')
      .select('directive_text, generated_at, reason, execution_result')
      .eq('user_id', userId)
      .gte('generated_at', since);

    if (error) throw new Error(error.message);
    const repeated = summarizeRepeatedDirectiveHealth(
      (acts ?? []).map((row) => ({
        directive_text: row.directive_text,
        generated_at: row.generated_at,
        reason: row.reason,
        protective_duplicate_block:
          Boolean(
            row.execution_result &&
            typeof row.execution_result === 'object' &&
            (row.execution_result as Record<string, unknown>).protective_duplicate_block === true,
          ),
        verification_stub_persist:
          Boolean(
            row.execution_result &&
            typeof row.execution_result === 'object' &&
            (row.execution_result as Record<string, unknown>).verification_stub_persist === true,
          ),
        dev_force_fresh_auto_suppressed:
          isDevForceFreshAutoSuppressedExecutionResult(row.execution_result),
      })),
      now,
    );
    const repCheck = buildRepeatedDirectiveCheck(repeated, (iso) => relAgo(iso, now));
    if (
      isHealthCiRelaxedMode() &&
      repCheck.group === 'blocking' &&
      repCheck.status === 'fail'
    ) {
      const withoutIcon = repCheck.line.replace(/^[✓✗⚠]\s+/, '');
      checks.push(
        warningCheck(
          'Repeated directive (CI: warn-only; run `npm run health` locally for strict)',
          withoutIcon,
          'warn',
        ),
      );
    } else {
      checks.push(repCheck);
    }
  } catch (e) {
    checks.push(
      blockingCheck(
        'Repeated directive',
        false,
        undefined,
        e instanceof Error ? e.message : String(e),
      ),
    );
  }

  // Mail cursors
  try {
    const mailTokens = active.filter((r) => r.provider === 'google' || r.provider === 'microsoft');
    if (mailTokens.length === 0) {
      checks.push(warningCheck('Mail cursors current', '(no connected google/microsoft tokens)'));
    } else {
      const stale: string[] = [];
      for (const r of mailTokens) {
        if (!isFresh(r.last_synced_at, now)) {
          stale.push(`${r.provider} ${relAgo(r.last_synced_at, now)}`);
        }
      }
      checks.push(
        stale.length === 0
          ? warningCheck('Mail cursors current', undefined, 'pass')
          : warningCheck('Mail cursors stale', stale.join('; ')),
      );
    }
  } catch (e) {
    checks.push(
      warningCheck(
        'Mail cursors',
        e instanceof Error ? e.message : String(e),
      ),
    );
  }

  // Last generation row
  try {
    const { data: byGen, error: e1 } = await supabase
      .from('tkg_actions')
      .select('action_type, directive_text, generated_at, execution_result')
      .eq('user_id', userId)
      .not('generated_at', 'is', null)
      .order('generated_at', { ascending: false, nullsFirst: false })
      .limit(10);

    if (e1) throw new Error(e1.message);

    let latest = selectLatestMeaningfulGenerationRow(byGen ?? []);
    if (!latest) {
      const { data: byGenerated, error: e2 } = await supabase
        .from('tkg_actions')
        .select('action_type, directive_text, generated_at, execution_result')
        .eq('user_id', userId)
        .order('generated_at', { ascending: false })
        .limit(10);
      if (e2) throw new Error(e2.message);
      latest = selectLatestMeaningfulGenerationRow(byGenerated ?? []);
    }

    if (!latest) {
      checks.push(warningCheck('Last generation', 'no tkg_actions rows for user'));
    } else {
      const dir = latest.directive_text ?? '';
      const genFailed = dir.includes('__GENERATION_FAILED__');
      const isDoNothing = latest.action_type === 'do_nothing';

      if (genFailed) {
        checks.push(warningCheck('Last generation', 'GENERATION_FAILED'));
      } else if (isDoNothing) {
        checks.push(warningCheck('Last generation', 'do_nothing'));
      } else {
        checks.push(warningCheck('Last generation', latest.action_type ?? 'unknown', 'pass'));
      }
    }
  } catch (e) {
    checks.push(
      warningCheck(
        'Last generation',
        e instanceof Error ? e.message : String(e),
      ),
    );
  }

  const failing = countBlockingFailures(checks);
  console.log(`FOLDERA HEALTH — ${formatPtHeader()}`);
  console.log('');
  console.log('BLOCKING');
  for (const check of checks.filter((c) => c.group === 'blocking')) console.log(check.line);
  console.log('');
  console.log('WARNING');
  for (const check of checks.filter((c) => c.group === 'warning')) console.log(check.line);
  console.log('');
  console.log(`RESULT: ${failing} FAILING`);

  process.exit(failing > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
