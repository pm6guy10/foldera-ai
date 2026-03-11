/**
 * Resend email client + delivery helpers.
 *
 * Required env vars:
 *   RESEND_API_KEY        — from resend.com dashboard
 *   RESEND_FROM_EMAIL     — verified sender, e.g. "Foldera <brief@foldera.ai>"
 *   (optional fallback:  onboarding@resend.dev works on Resend free tier)
 */

import { Resend } from 'resend';

// ─── Client (lazy singleton) ──────────────────────────────────────────────────

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

// ─── Action label map ─────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  write_document: 'WRITE',
  send_message:   'REACH OUT',
  make_decision:  'DECIDE',
  do_nothing:     'WAIT',
  schedule:       'SCHEDULE',
  research:       'RESEARCH',
};

function actionLabel(action_type: string): string {
  return ACTION_LABELS[action_type] ?? action_type.toUpperCase();
}

// ─── Directive item type ──────────────────────────────────────────────────────

export interface DirectiveItem {
  directive:   string;
  action_type: string;
  confidence:  number;
  reason:      string;
}

// ─── Email: daily directive ───────────────────────────────────────────────────
//
// Accepts an array of directives (1 for early days, 2+ for later days).
// subject is optional — defaults to "Your directive for {date}".

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
  const formatted = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month:   'long',
    day:     'numeric',
  });

  const emailSubject = subject ?? `Your directive for ${formatted}`;

  const directiveBlocks = directives.map((d, i) => {
    const label   = actionLabel(d.action_type);
    const divider = i > 0
      ? `<tr><td style="padding:28px 0;"><hr style="border:none;border-top:1px solid #e8e3df;margin:0;" /></td></tr>`
      : '';
    return `
${divider}
          <tr>
            <td style="padding-bottom:28px;">
              <span style="font-family:'Courier New',Courier,monospace;font-size:10px;letter-spacing:0.2em;color:#e8471c;text-transform:uppercase;">${label}</span>
              <span style="font-family:'Courier New',Courier,monospace;font-size:10px;letter-spacing:0.12em;color:#c4bdb5;margin-left:16px;">${d.confidence}%</span>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:24px;">
              <p style="margin:0;font-size:26px;line-height:1.25;letter-spacing:-0.01em;color:#1a1814;font-weight:400;">${d.directive}</p>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:0;">
              <p style="margin:0;font-size:14px;line-height:1.7;color:#8a8178;font-family:Georgia,'Times New Roman',serif;">${d.reason}</p>
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
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
${directiveBlocks}
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
