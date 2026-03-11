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
  id?:         string;  // tkg_actions row ID for approve/skip deep-links
  directive:   string;
  action_type: string;
  confidence:  number;
  reason:      string;
  summary?:    string;  // Short one-sentence summary for email card (falls back to directive)
}

// ─── Email: daily directive ───────────────────────────────────────────────────
//
// Renders individual action cards, one per artifact.
// Each card has a one-sentence summary, Approve button, and Skip link.
// Subject = the most specific artifact summary.

export async function sendDailyDirective({
  to,
  directives,
  date,
  subject,
}: {
  to:          string;
  directives:  DirectiveItem[];
  date:        string; // YYYY-MM-DD
  subject?:    string; // override default
}) {
  const baseUrl = (process.env.NEXTAUTH_URL ?? 'https://foldera.ai').replace(/\/$/, '');

  // Subject: use override, or derive from the most specific artifact
  const emailSubject = subject ?? (
    directives.length > 0
      ? (directives[0].summary ?? directives[0].directive)
      : `Your morning read — ${date}`
  );

  const cards = directives.map((d, i) => {
    const summaryText = d.summary ?? d.directive;
    const divider = i > 0
      ? `<tr><td style="padding:0 0 28px 0;"><hr style="border:none;border-top:1px solid #e8e3df;margin:0;" /></td></tr>`
      : '';

    const approveHref = d.id
      ? `${baseUrl}/dashboard?action=approve&id=${d.id}`
      : `${baseUrl}/dashboard`;
    const skipHref = d.id
      ? `${baseUrl}/dashboard?action=skip&id=${d.id}`
      : `${baseUrl}/dashboard`;

    return `
${divider}
        <tr>
          <td style="padding-bottom:12px;">
            <p style="margin:0;font-size:18px;line-height:1.4;color:#1a1814;font-weight:500;font-family:Georgia,'Times New Roman',serif;">${summaryText}</p>
          </td>
        </tr>
        <tr>
          <td style="padding-bottom:8px;">
            <a href="${approveHref}"
               style="display:inline-block;padding:10px 24px;background:#16a34a;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">
              Approve
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding-bottom:28px;">
            <a href="${skipHref}"
               style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;color:#8a8178;text-decoration:underline;">
              Skip
            </a>
          </td>
        </tr>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${emailSubject}</title>
</head>
<body style="margin:0;padding:0;background:#f9f7f4;font-family:Georgia,'Times New Roman',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f7f4;padding:48px 24px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
          <tr>
            <td style="padding-bottom:32px;">
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:11px;letter-spacing:0.15em;color:#c4bdb5;text-transform:uppercase;">Foldera · ${date}</p>
            </td>
          </tr>
${cards}
          <tr>
            <td style="padding-top:8px;border-top:1px solid #e8e3df;">
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:11px;color:#c4bdb5;">
                <a href="${baseUrl}/dashboard" style="color:#c4bdb5;text-decoration:none;">Open dashboard</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return getResend().emails.send({
    from:    process.env.RESEND_FROM_EMAIL ?? 'Foldera <onboarding@resend.dev>',
    to,
    subject: emailSubject,
    html,
  });
}
