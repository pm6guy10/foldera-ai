/**
 * Resend email client + delivery helpers.
 *
 * Required env vars:
 *   RESEND_API_KEY        — from resend.com dashboard
 *   RESEND_FROM_EMAIL     — verified sender, e.g. "Foldera <brief@foldera.ai>"
 *   NEXTAUTH_URL          — base URL for approve/skip deep-links
 */

import { Resend } from 'resend';

// ─── Client (lazy singleton) ──────────────────────────────────────────────────

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

// ─── Directive item type ──────────────────────────────────────────────────────

export interface DirectiveItem {
  id?:                 string;
  directive:           string;
  action_type:         string;
  confidence:          number;
  reason:              string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Email: daily directive ───────────────────────────────────────────────────
//
// Dark theme. One directive. Approve or Skip. Nothing else.

export async function sendDailyDirective({
  to,
  directives,
  date,
  subject,
}: {
  to:            string;
  directives:    DirectiveItem[];
  date:          string;
  subject?:      string;
}) {
  const baseUrl = (process.env.NEXTAUTH_URL ?? 'https://foldera.ai').replace(/\/$/, '');
  const d = directives[0]; // Single directive or none

  // "Nothing today" email
  if (!d) {
    const nothingSubject = subject ?? 'Foldera: Nothing today';
    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#0a0a0f;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:48px 24px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr><td style="padding-bottom:32px;">
          <p style="margin:0;font-family:system-ui,-apple-system,sans-serif;font-size:11px;letter-spacing:0.15em;color:#52525b;text-transform:uppercase;">Foldera &middot; ${date}</p>
        </td></tr>
        <tr><td style="padding-bottom:24px;">
          <p style="margin:0;font-family:system-ui,-apple-system,sans-serif;font-size:18px;font-weight:600;color:#e2e8f0;">Nothing today.</p>
        </td></tr>
        <tr><td>
          <p style="margin:0;font-family:system-ui,-apple-system,sans-serif;font-size:14px;color:#71717a;line-height:1.6;">Nothing cleared the bar. Foldera is watching.</p>
        </td></tr>
        <tr><td style="padding-top:32px;border-top:1px solid #27272a;margin-top:32px;">
          <p style="margin:0;font-family:system-ui,-apple-system,sans-serif;font-size:11px;"><a href="${baseUrl}/dashboard" style="color:#52525b;text-decoration:none;">Open dashboard</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    return getResend().emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? 'Foldera <onboarding@resend.dev>',
      to,
      subject: nothingSubject,
      html,
    });
  }

  // Single directive email
  const emailSubject = subject ?? `Foldera: ${d.directive.split(/\s+/).slice(0, 6).join(' ')}`;
  const reasonText = d.reason?.split('[score=')[0].trim() ?? '';

  const approveHref = d.id ? `${baseUrl}/dashboard?action=approve&id=${d.id}` : `${baseUrl}/dashboard`;
  const skipHref = d.id ? `${baseUrl}/dashboard?action=skip&id=${d.id}` : `${baseUrl}/dashboard`;

  const reasonHtml = reasonText
    ? `<tr><td style="padding:8px 0 24px 0;"><p style="margin:0;font-family:system-ui,-apple-system,sans-serif;font-size:14px;color:#a1a1aa;line-height:1.6;">${escapeHtml(reasonText.slice(0, 200))}</p></td></tr>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#0a0a0f;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:48px 24px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <!-- Header -->
        <tr><td style="padding-bottom:32px;">
          <p style="margin:0;font-family:system-ui,-apple-system,sans-serif;font-size:11px;letter-spacing:0.15em;color:#52525b;text-transform:uppercase;">Foldera &middot; ${date}</p>
        </td></tr>

        <!-- Directive -->
        <tr><td style="padding-bottom:8px;">
          <p style="margin:0;font-family:system-ui,-apple-system,sans-serif;font-size:18px;font-weight:600;color:#e2e8f0;line-height:1.4;">${escapeHtml(d.directive)}</p>
        </td></tr>

        <!-- Why -->
        ${reasonHtml}

        <!-- Buttons -->
        <tr><td style="padding-bottom:12px;">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="padding-right:12px;">
              <a href="${approveHref}" style="display:inline-block;padding:12px 32px;background:#059669;color:#ffffff;font-family:system-ui,-apple-system,sans-serif;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">Approve</a>
            </td>
            <td>
              <a href="${skipHref}" style="display:inline-block;padding:12px 32px;background:transparent;color:#71717a;font-family:system-ui,-apple-system,sans-serif;font-size:14px;font-weight:500;text-decoration:none;border-radius:8px;border:1px solid #3f3f46;">Skip</a>
            </td>
          </tr></table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding-top:32px;border-top:1px solid #27272a;">
          <p style="margin:0;font-family:system-ui,-apple-system,sans-serif;font-size:11px;"><a href="${baseUrl}/dashboard" style="color:#52525b;text-decoration:none;">Open dashboard</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return getResend().emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? 'Foldera <onboarding@resend.dev>',
    to,
    subject: emailSubject,
    html,
  });
}
