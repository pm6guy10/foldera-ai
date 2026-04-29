/**
 * Shared platform health fetch + Resend alert (used by /api/cron/health-check
 * and invoked after daily-brief cron to stay within Vercel Hobby 2-cron limit).
 */

import { Resend } from 'resend';
import { DEFAULT_RESEND_FROM } from '@/lib/email/resend';

export type PlatformHealthAlertResult = {
  ok: boolean;
  health: Record<string, unknown>;
  alert_sent?: boolean;
  alert_error?: string;
};

export type PlatformHealthDepth = 'lite' | 'full';

function resolveHealthBaseUrl(): string {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL.replace(/\/$/, '');
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'https://foldera.ai';
}

const HEALTH_FETCH_RETRIES = 3;
const HEALTH_FETCH_RETRY_MS = 800;

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * GET /api/health with small retries. Routine cron paths should stay on lite health;
 * full schema/RPC proof is reserved for cron-auth/manual operator paths.
 * Transient "fetch failed" from the same region as daily-brief is a known false positive
 * and did not read DB/env.
 */
async function fetchHealthJson(
  baseUrl: string,
  depth: PlatformHealthDepth,
): Promise<Record<string, unknown>> {
  const url = depth === 'full' ? `${baseUrl}/api/health?depth=full` : `${baseUrl}/api/health`;
  const cronSecret = process.env.CRON_SECRET?.trim();
  const init: RequestInit =
    depth === 'full' && cronSecret
      ? {
          cache: 'no-store',
          headers: { 'x-cron-secret': cronSecret },
        }
      : { cache: 'no-store' };
  let lastErr: unknown;
  for (let attempt = 1; attempt <= HEALTH_FETCH_RETRIES; attempt += 1) {
    try {
      const healthRes = await fetch(url, init);
      const healthData = (await healthRes.json()) as Record<string, unknown>;
      if (!healthRes.ok) {
        return {
          ...healthData,
          status: healthData.status ?? 'degraded',
          _httpStatus: healthRes.status,
        };
      }
      return healthData;
    } catch (err: unknown) {
      lastErr = err;
      if (attempt < HEALTH_FETCH_RETRIES) await sleep(HEALTH_FETCH_RETRY_MS);
    }
  }
  const message = lastErr instanceof Error ? lastErr.message : String(lastErr);
  return { status: 'degraded', error: `Health endpoint unreachable: ${message}` };
}

function formatHealthField(
  health: Record<string, unknown>,
  key: 'db' | 'env',
  label: string,
): string {
  const v = health[key];
  if (typeof v === 'boolean') {
    return `${label}: ${v ? 'OK' : 'FAILED'}`;
  }
  if (typeof health.error === 'string' && health.error.includes('unreachable')) {
    return `${label}: UNKNOWN (endpoint not reached — not a live DB/env check)`;
  }
  return `${label}: UNKNOWN`;
}

/**
 * GET /api/health on the deployment; if not ok, email DAILY_BRIEF_TO_EMAIL when Resend is configured.
 * Default is lite for routine post-cron checks; callers may opt into full for cron-auth/manual proof.
 */
export async function runPlatformHealthAlert(
  options: { depth?: PlatformHealthDepth } = {},
): Promise<PlatformHealthAlertResult> {
  const baseUrl = resolveHealthBaseUrl();
  const healthData = await fetchHealthJson(baseUrl, options.depth ?? 'lite');

  const isHealthy = healthData.status === 'ok';

  if (isHealthy) {
    return { ok: true, health: healthData };
  }

  const toEmail = process.env.DAILY_BRIEF_TO_EMAIL;
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || DEFAULT_RESEND_FROM;

  if (!toEmail || !apiKey) {
    console.error('[platform-health] Cannot send alert — missing DAILY_BRIEF_TO_EMAIL or RESEND_API_KEY');
    return { ok: false, health: healthData, alert_sent: false };
  }

  try {
    const resend = new Resend(apiKey);
    const lines = [
      'Foldera health check failed.',
      '',
      `Time: ${String(healthData.ts ?? new Date().toISOString())}`,
      formatHealthField(healthData, 'db', 'Database'),
      formatHealthField(healthData, 'env', 'Env vars'),
      `Status: ${String(healthData.status ?? 'degraded')}`,
      '',
      'Full response:',
      JSON.stringify(healthData, null, 2),
    ];

    await resend.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: 'Foldera health check failed',
      text: lines.join('\n'),
    });

    console.log('[platform-health] Alert email sent');
    return { ok: false, health: healthData, alert_sent: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[platform-health] Failed to send alert email:', message);
    return { ok: false, health: healthData, alert_sent: false, alert_error: message };
  }
}
