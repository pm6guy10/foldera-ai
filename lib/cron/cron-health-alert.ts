/**
 * Shared platform health fetch + Resend alert (used by /api/cron/health-check
 * and invoked after daily-brief cron to stay within Vercel Hobby 2-cron limit).
 */

import { Resend } from 'resend';

export type PlatformHealthAlertResult = {
  ok: boolean;
  health: Record<string, unknown>;
  alert_sent?: boolean;
  alert_error?: string;
};

function resolveHealthBaseUrl(): string {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL.replace(/\/$/, '');
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'https://www.foldera.ai';
}

/**
 * GET /api/health on the deployment; if not ok, email DAILY_BRIEF_TO_EMAIL when Resend is configured.
 */
export async function runPlatformHealthAlert(): Promise<PlatformHealthAlertResult> {
  const baseUrl = resolveHealthBaseUrl();
  let healthData: Record<string, unknown>;

  try {
    const healthRes = await fetch(`${baseUrl}/api/health`, { cache: 'no-store' });
    healthData = (await healthRes.json()) as Record<string, unknown>;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    healthData = { status: 'degraded', error: `Health endpoint unreachable: ${message}` };
  }

  const isHealthy = healthData.status === 'ok';

  if (isHealthy) {
    return { ok: true, health: healthData };
  }

  const toEmail = process.env.DAILY_BRIEF_TO_EMAIL;
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'Foldera <brief@foldera.ai>';

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
      `Database: ${healthData.db ? 'OK' : 'FAILED'}`,
      `Env vars: ${healthData.env ? 'OK' : 'MISSING'}`,
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
