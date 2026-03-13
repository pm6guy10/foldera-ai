/**
 * Waitlist Conversion Campaign
 *
 * One-time script. Sends a personalized invite to every uninvited waitlist
 * email and marks invited_at in Supabase.
 *
 * Usage:
 *   node scripts/convert-waitlist.mjs
 *
 * Required env vars (loaded from .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   RESEND_API_KEY
 *   RESEND_FROM_EMAIL
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// ── Env loader (mirrors other scripts) ──────────────────────────────────────
function loadEnv() {
  const envPath = resolve(process.cwd(), '.env.local');
  let raw;
  try {
    raw = readFileSync(envPath, 'utf-8');
  } catch {
    console.error('[convert-waitlist] .env.local not found — run from project root');
    process.exit(1);
  }

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

// ── Validate required env vars ───────────────────────────────────────────────
const SUPABASE_URL        = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY      = process.env.RESEND_API_KEY;
const FROM_EMAIL          = process.env.RESEND_FROM_EMAIL ?? 'brandon@foldera.ai';

const missing = [
  !SUPABASE_URL        && 'NEXT_PUBLIC_SUPABASE_URL',
  !SUPABASE_SERVICE_KEY && 'SUPABASE_SERVICE_ROLE_KEY',
  !RESEND_API_KEY      && 'RESEND_API_KEY',
].filter(Boolean);

if (missing.length) {
  console.error('[convert-waitlist] Missing env vars:', missing.join(', '));
  process.exit(1);
}

// ── Clients ──────────────────────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const resend   = new Resend(RESEND_API_KEY);

// ── Email template ───────────────────────────────────────────────────────────
function buildEmail(email) {
  const startUrl = 'https://foldera.ai/start';

  const text = `You signed up early. The conviction engine is running.

Foldera reads your email, builds a model of how you work, and delivers finished work every morning. You just approve or skip.

Your first 14 days are free. No credit card.

Start now: ${startUrl}

— Brandon, Foldera`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Foldera is live. You're in.</title>
</head>
<body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;">
    <tr>
      <td align="center" style="padding:48px 16px;">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0"
               style="max-width:520px;width:100%;background:#18181b;border:1px solid #27272a;border-radius:12px;">
          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 0;">
              <p style="margin:0;font-size:13px;font-weight:600;letter-spacing:0.08em;
                         color:#22d3ee;text-transform:uppercase;">Foldera</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:24px 40px 32px;">
              <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#e4e4e7;">
                You signed up early. The conviction engine is running.
              </p>
              <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#e4e4e7;">
                Foldera reads your email, builds a model of how you work, and delivers
                finished work every morning. You just approve or skip.
              </p>
              <p style="margin:0 0 32px;font-size:16px;line-height:1.6;color:#e4e4e7;">
                Your first 14 days are free. No credit card.
              </p>

              <!-- CTA -->
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:8px;background:#22d3ee;">
                    <a href="${startUrl}"
                       style="display:inline-block;padding:14px 28px;font-size:15px;
                              font-weight:600;color:#09090b;text-decoration:none;
                              border-radius:8px;letter-spacing:0.01em;">
                      Start now &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Signature -->
          <tr>
            <td style="padding:0 40px 32px;border-top:1px solid #27272a;">
              <p style="margin:24px 0 0;font-size:14px;color:#71717a;line-height:1.5;">
                — Brandon, Foldera
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { text, html };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('[convert-waitlist] Querying uninvited waitlist entries…');

  const { data: rows, error } = await supabase
    .from('waitlist')
    .select('id, email')
    .is('invited_at', null)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[convert-waitlist] Supabase query failed:', error.message);
    process.exit(1);
  }

  if (!rows || rows.length === 0) {
    console.log('[convert-waitlist] No uninvited emails found. All done.');
    return;
  }

  console.log(`[convert-waitlist] Found ${rows.length} email(s) to invite.`);

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const { text, html } = buildEmail(row.email);

    try {
      const { error: sendErr } = await resend.emails.send({
        from:    FROM_EMAIL,
        to:      row.email,
        subject: "Foldera is live. You're in.",
        text,
        html,
        tags:    [{ name: 'email_type', value: 'waitlist_invite' }],
      });

      if (sendErr) {
        console.error(`[convert-waitlist] Resend error for ${row.email}:`, sendErr.message);
        failed++;
        continue;
      }

      // Mark as invited
      const { error: updateErr } = await supabase
        .from('waitlist')
        .update({ invited_at: new Date().toISOString() })
        .eq('id', row.id);

      if (updateErr) {
        console.warn(`[convert-waitlist] invited_at update failed for ${row.email}:`, updateErr.message);
      }

      console.log(`[convert-waitlist] ✓ Sent to ${row.email}`);
      sent++;
    } catch (err) {
      console.error(`[convert-waitlist] Unexpected error for ${row.email}:`, err.message ?? err);
      failed++;
    }

    // Brief pause between sends to respect Resend rate limits
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n[convert-waitlist] Done. Sent: ${sent} | Failed: ${failed}`);
}

main().catch(err => {
  console.error('[convert-waitlist] Fatal:', err);
  process.exit(1);
});
