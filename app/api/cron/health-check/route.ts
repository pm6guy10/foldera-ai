/**
 * GET /api/cron/health-check
 *
 * Runs at 15:00 UTC (8am Pacific) — one hour after the daily brief should send.
 * Hits /api/health, and if ANY check fails, sends an alert email to
 * DAILY_BRIEF_TO_EMAIL via Resend.
 *
 * Auth: CRON_SECRET Bearer token.
 */

import { NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';
import { Resend } from 'resend';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authErr = validateCronAuth(request);
  if (authErr) return authErr;

  // Call the health endpoint
  const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://www.foldera.ai';
  let healthData: Record<string, unknown>;

  try {
    const healthRes = await fetch(`${baseUrl}/api/health`, { cache: 'no-store' });
    healthData = await healthRes.json();
  } catch (err: any) {
    healthData = { status: 'degraded', error: `Health endpoint unreachable: ${err.message}` };
  }

  const isHealthy = healthData.status === 'ok';

  if (isHealthy) {
    return NextResponse.json({ ok: true, health: healthData });
  }

  // Something failed — send alert email
  const toEmail = process.env.DAILY_BRIEF_TO_EMAIL;
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'Foldera <brief@foldera.ai>';

  if (!toEmail || !apiKey) {
    console.error('[health-check] Cannot send alert — missing DAILY_BRIEF_TO_EMAIL or RESEND_API_KEY');
    return NextResponse.json({ ok: false, health: healthData, alert_sent: false });
  }

  try {
    const resend = new Resend(apiKey);

    // Build a readable plain-text body
    const lines = [
      'Foldera health check failed.',
      '',
      `Time: ${healthData.ts || new Date().toISOString()}`,
      `Database: ${healthData.db ? 'OK' : 'FAILED'}`,
      `Env vars: ${healthData.env ? 'OK' : 'MISSING'}`,
      `Status: ${healthData.status || 'degraded'}`,
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

    console.log('[health-check] Alert email sent');
    return NextResponse.json({ ok: false, health: healthData, alert_sent: true });
  } catch (err: any) {
    console.error('[health-check] Failed to send alert email:', err.message);
    return NextResponse.json({ ok: false, health: healthData, alert_sent: false, alert_error: err.message });
  }
}
