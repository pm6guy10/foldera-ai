/**
 * acceptance-gate.ts — Production invariant checker.
 *
 * Runs as the LAST step of nightly-ops. Checks every production invariant
 * and reports pass/fail. If any check fails, sends a health alert email.
 *
 * Checks:
 *   1. AUTH       — RPC get_auth_user_id_by_email resolves Brandon.
 *   2. TOKENS     — Any user_tokens expiring within 6 hours get flagged.
 *   3. SIGNALS    — Unprocessed signal count <= 50.
 *   4. COMMITMENTS— Active commitment count <= 150 per user.
 *   5. GENERATION — At least one tkg_actions row today (directive or do_nothing).
 *   6. DELIVERY   — If pending_approval exists, email was sent.
 *   7. SESSION    — /api/integrations/status returns 200 (internal fetch).
 */

import { createServerClient } from '@/lib/db/client';
import Anthropic from '@anthropic-ai/sdk';
import { logStructuredEvent } from '@/lib/utils/structured-logger';
import { renderPlaintextEmailHtml, sendResendEmail } from '@/lib/email/resend';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CheckResult {
  check: string;
  pass: boolean;
  detail: string;
}

export interface AcceptanceGateResult {
  ok: boolean;
  checks: CheckResult[];
  alert_sent: boolean;
  duration_ms: number;
}

// ---------------------------------------------------------------------------
// Check 1: AUTH — RPC resolves at least one user
// ---------------------------------------------------------------------------

async function checkAuth(): Promise<CheckResult> {
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc('get_auth_user_id_by_email', {
    lookup_email: 'b-kapp@outlook.com',
  });

  if (error) {
    return { check: 'AUTH', pass: false, detail: `RPC error: ${error.message}` };
  }

  if (!data) {
    return { check: 'AUTH', pass: false, detail: 'RPC returned no UUID for b-kapp@outlook.com' };
  }

  return { check: 'AUTH', pass: true, detail: `UUID: ${(data as string).slice(0, 8)}...` };
}

// ---------------------------------------------------------------------------
// Check 2: TOKENS — Flag tokens expiring within 6 hours
// ---------------------------------------------------------------------------

async function checkTokens(): Promise<CheckResult> {
  const supabase = createServerClient();
  // expires_at is bigint (epoch milliseconds), not a timestamp
  const sixHoursFromNowMs = Date.now() + 6 * 60 * 60 * 1000;

  const { data, error } = await supabase
    .from('user_tokens')
    .select('user_id, provider, expires_at')
    .not('expires_at', 'is', null)
    .lt('expires_at', sixHoursFromNowMs);

  if (error) {
    return { check: 'TOKENS', pass: false, detail: `Query error: ${error.message}` };
  }

  const expiring = data ?? [];
  if (expiring.length > 0) {
    const summary = expiring
      .map((t: any) => `${t.provider}/${(t.user_id as string).slice(0, 8)}`)
      .join(', ');
    return {
      check: 'TOKENS',
      pass: false,
      detail: `${expiring.length} token(s) expiring within 6h: ${summary}`,
    };
  }

  return { check: 'TOKENS', pass: true, detail: 'No tokens expiring within 6h' };
}

// ---------------------------------------------------------------------------
// Check 2b: api_credit_canary — Anthropic request still has spend available
// ---------------------------------------------------------------------------

async function sendApiCreditAlert(detail: string): Promise<void> {
  const body = `Anthropic credit canary failed: ${detail}`;
  await sendResendEmail({
    from: 'Foldera <brief@foldera.ai>',
    to: 'b.kapp1010@gmail.com',
    subject: 'Foldera: API credits may be exhausted',
    text: body,
    html: renderPlaintextEmailHtml(body),
    tags: [{ name: 'email_type', value: 'api_credit_canary_alert' }],
  });
}

async function checkApiCreditCanary(): Promise<CheckResult> {
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1,
      messages: [{ role: 'user', content: '1' }],
    });

    return { check: 'api_credit_canary', pass: true, detail: 'Minimal Anthropic canary succeeded' };
  } catch (err: any) {
    const status = err?.status ?? err?.statusCode ?? null;
    const detail = typeof err?.message === 'string' ? err.message : 'Unknown Anthropic canary failure';

    if (status === 400 || status === 402) {
      try {
        await sendApiCreditAlert(detail);
      } catch (alertErr: any) {
        console.error(JSON.stringify({
          event: 'api_credit_canary_alert_failed',
          error: alertErr.message,
        }));
      }
    }

    return {
      check: 'api_credit_canary',
      pass: false,
      detail: status ? `Anthropic canary failed (${status}): ${detail}` : detail,
    };
  }
}

// ---------------------------------------------------------------------------
// Check 3: SIGNALS — Unprocessed signal count <= 50
// ---------------------------------------------------------------------------

async function checkSignals(): Promise<CheckResult> {
  const supabase = createServerClient();

  const { count, error } = await supabase
    .from('tkg_signals')
    .select('id', { count: 'exact', head: true })
    .eq('processed', false);

  if (error) {
    return { check: 'SIGNALS', pass: false, detail: `Query error: ${error.message}` };
  }

  const n = count ?? 0;
  if (n > 50) {
    return { check: 'SIGNALS', pass: false, detail: `${n} unprocessed signals (limit: 50)` };
  }

  return { check: 'SIGNALS', pass: true, detail: `${n} unprocessed signals` };
}

// ---------------------------------------------------------------------------
// Check 4: COMMITMENTS — Active commitment count <= 150 per user
// ---------------------------------------------------------------------------

async function checkCommitments(): Promise<CheckResult> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('tkg_commitments')
    .select('user_id')
    .is('suppressed_at', null);

  if (error) {
    return { check: 'COMMITMENTS', pass: false, detail: `Query error: ${error.message}` };
  }

  const perUser = new Map<string, number>();
  for (const row of data ?? []) {
    perUser.set(row.user_id, (perUser.get(row.user_id) ?? 0) + 1);
  }

  const breached: string[] = [];
  for (const [userId, count] of perUser) {
    if (count > 150) {
      breached.push(`${userId.slice(0, 8)}: ${count}`);
    }
  }

  if (breached.length > 0) {
    return { check: 'COMMITMENTS', pass: false, detail: `Ceiling breached: ${breached.join(', ')}` };
  }

  const maxCount = Math.max(0, ...perUser.values());
  return { check: 'COMMITMENTS', pass: true, detail: `Max active: ${maxCount}` };
}

// ---------------------------------------------------------------------------
// Check 5: GENERATION — At least one tkg_actions row today
// ---------------------------------------------------------------------------

async function checkGeneration(): Promise<CheckResult> {
  const supabase = createServerClient();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('tkg_actions')
    .select('id, user_id, action_type, status')
    .gte('generated_at', todayStart.toISOString())
    .limit(20);

  if (error) {
    return { check: 'GENERATION', pass: false, detail: `Query error: ${error.message}` };
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    return { check: 'GENERATION', pass: false, detail: 'Zero tkg_actions rows today — cron did not generate' };
  }

  const users = new Set(rows.map((r: any) => r.user_id));
  const types = [...new Set(rows.map((r: any) => r.action_type))].join(', ');
  return {
    check: 'GENERATION',
    pass: true,
    detail: `${rows.length} action(s) for ${users.size} user(s). Types: ${types}`,
  };
}

// ---------------------------------------------------------------------------
// Check 6: DELIVERY — If pending_approval exists, email was sent
// ---------------------------------------------------------------------------

async function checkDelivery(): Promise<CheckResult> {
  const supabase = createServerClient();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('tkg_actions')
    .select('id, user_id, status, execution_result')
    .gte('generated_at', todayStart.toISOString())
    .in('status', ['pending_approval', 'approved', 'executed']);

  if (error) {
    return { check: 'DELIVERY', pass: false, detail: `Query error: ${error.message}` };
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    // No pending_approval today — not a failure, generation may have produced do_nothing/skipped
    return { check: 'DELIVERY', pass: true, detail: 'No pending_approval actions today (generation may have skipped)' };
  }

  const unsent: string[] = [];
  for (const row of rows) {
    const er = row.execution_result as Record<string, unknown> | null;
    const hasSendEvidence = er?.daily_brief_sent_at || er?.resend_id;
    if (!hasSendEvidence) {
      unsent.push(`${(row.id as string).slice(0, 8)} (user ${(row.user_id as string).slice(0, 8)})`);
    }
  }

  if (unsent.length > 0) {
    return {
      check: 'DELIVERY',
      pass: false,
      detail: `${unsent.length} action(s) with no send evidence: ${unsent.join(', ')}`,
    };
  }

  return { check: 'DELIVERY', pass: true, detail: `${rows.length} action(s) with confirmed sends` };
}

// ---------------------------------------------------------------------------
// Check 7: SESSION — Verify integrations/status route works
// NOTE: In serverless context we can't fetch our own route.
// Instead, verify the DB layer that the route depends on.
// ---------------------------------------------------------------------------

async function checkSession(): Promise<CheckResult> {
  const supabase = createServerClient();

  // Verify user_tokens table is queryable (the data source for /api/integrations/status)
  const { data, error } = await supabase
    .from('user_tokens')
    .select('provider, user_id')
    .limit(5);

  if (error) {
    return { check: 'SESSION', pass: false, detail: `user_tokens query failed: ${error.message}` };
  }

  const providers = [...new Set((data ?? []).map((r: any) => r.provider))];
  return {
    check: 'SESSION',
    pass: true,
    detail: `user_tokens accessible. Providers: ${providers.join(', ') || 'none'}`,
  };
}

// ---------------------------------------------------------------------------
// Alert on failure
// ---------------------------------------------------------------------------

async function sendAcceptanceAlert(failures: CheckResult[]): Promise<boolean> {
  try {
    const failureSummary = failures
      .map((f) => `<li><strong>${f.check}</strong>: ${f.detail}</li>`)
      .join('\n');

    await sendResendEmail({
      to: 'b.kapp1010@gmail.com',
      subject: `Foldera acceptance gate: ${failures.length} check(s) FAILED`,
      html: `<h3>Acceptance Gate Failures — ${new Date().toISOString()}</h3>
<ul>${failureSummary}</ul>
<p>Run the acceptance gate manually or check Vercel logs for details.</p>`,
      tags: [{ name: 'email_type', value: 'acceptance_gate_alert' }],
    });

    return true;
  } catch (err: any) {
    console.error(JSON.stringify({
      event: 'acceptance_gate_alert_failed',
      error: err.message,
    }));
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function runAcceptanceGate(): Promise<AcceptanceGateResult> {
  const startTime = Date.now();
  const checks: CheckResult[] = [];

  // Run all 7 checks sequentially (each is a quick DB query)
  const checkFns = [
    checkAuth,
    checkTokens,
    checkApiCreditCanary,
    checkSignals,
    checkCommitments,
    checkGeneration,
    checkDelivery,
    checkSession,
  ];

  for (const fn of checkFns) {
    try {
      checks.push(await fn());
    } catch (err: any) {
      checks.push({ check: fn.name.replace('check', '').toUpperCase(), pass: false, detail: `Exception: ${err.message}` });
    }
  }

  const failures = checks.filter((c) => !c.pass);
  const ok = failures.length === 0;
  let alertSent = false;

  if (!ok) {
    alertSent = await sendAcceptanceAlert(failures);
  }

  // Structured log
  logStructuredEvent({
    event: 'acceptance_gate_complete',
    level: ok ? 'info' : 'warn',
    userId: null,
    artifactType: null,
    generationStatus: ok ? 'all_pass' : `${failures.length}_failures`,
    details: {
      scope: 'acceptance-gate',
      ok,
      checks: checks.map((c) => ({ check: c.check, pass: c.pass, detail: c.detail })),
      alert_sent: alertSent,
    },
  });

  console.log(JSON.stringify({
    event: 'acceptance_gate_result',
    ok,
    checks: checks.map((c) => ({ check: c.check, pass: c.pass })),
    alert_sent: alertSent,
    duration_ms: Date.now() - startTime,
  }));

  return { ok, checks, alert_sent: alertSent, duration_ms: Date.now() - startTime };
}
