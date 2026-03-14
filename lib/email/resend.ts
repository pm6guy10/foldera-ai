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
  id?:                 string;  // tkg_actions row ID for approve/skip deep-links
  directive:           string;
  action_type:         string;
  confidence:          number;
  reason:              string;
  summary?:            string;  // Short one-sentence summary for email card (falls back to directive)
  artifactPreview?:    string;  // Short artifact preview text for the email
  isOutcomeFollowUp?:  boolean; // When true, email uses "It worked" / "Didn't work" links → conviction/outcome
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Email: daily directive ───────────────────────────────────────────────────
//
// Renders individual action cards, one per artifact.
// Each card has a one-sentence summary, Approve button, and Skip link.
// Subject = the most specific artifact summary.

export interface CuttingRoomFloorItem {
  title: string;
  kill_reason: string;
  justification: string;
}

export async function sendDailyDirective({
  to,
  directives,
  date,
  subject,
  outcomeCheck,
  cuttingRoomFloor,
  learningSignal,
}: {
  to:            string;
  directives:    DirectiveItem[];
  date:          string; // YYYY-MM-DD
  subject?:      string; // override default
  outcomeCheck?: string; // "Two days ago I suggested: …. Did it help? Reply YES or NO."
  cuttingRoomFloor?: CuttingRoomFloorItem[];
  learningSignal?:   string; // e.g. "Your approval rate for emails: 80%. I'm weighting those higher."
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
    const reasonText = d.reason ?? '';
    const divider = i > 0
      ? `<tr><td style="padding:0 0 28px 0;"><hr style="border:none;border-top:1px solid #e8e3df;margin:0;" /></td></tr>`
      : '';

    const isOutcome = d.isOutcomeFollowUp && d.id;
    const approveHref = d.id
      ? (isOutcome ? `${baseUrl}/dashboard?action=outcome&id=${d.id}&result=worked` : `${baseUrl}/dashboard?action=approve&id=${d.id}`)
      : `${baseUrl}/dashboard`;
    const skipHref = d.id
      ? (isOutcome ? `${baseUrl}/dashboard?action=outcome&id=${d.id}&result=didnt_work` : `${baseUrl}/dashboard?action=skip&id=${d.id}`)
      : `${baseUrl}/dashboard`;
    const approveLabel = isOutcome ? 'It worked' : 'Approve';
    const skipLabel = isOutcome ? "Didn't work" : 'Skip';

    // Confidence as subtle badge (not the hero element)
    const confidenceBadge = d.confidence > 0
      ? `<span style="display:inline-block;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:10px;color:#a39e97;background:#f3f1ee;border-radius:4px;padding:2px 8px;margin-left:8px;vertical-align:middle;">${d.confidence}% confidence</span>`
      : '';

    // Reason line (one sentence why)
    const reasonHtml = reasonText
      ? `<tr><td style="padding:4px 0 12px 0;"><p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;color:#6b6259;line-height:1.5;">${escapeHtml(reasonText.split('[score=')[0].trim().slice(0, 200))}</p></td></tr>`
      : '';

    // Artifact preview snippet for the email
    let artifactHtml = '';
    if (d.artifactPreview) {
      artifactHtml = `
        <tr>
          <td style="padding:8px 0 16px 0;">
            <div style="background:#f3f1ee;border-radius:8px;padding:12px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;color:#4a453e;line-height:1.5;">
              ${escapeHtml(d.artifactPreview)}
            </div>
          </td>
        </tr>`;
    }

    return `
${divider}
        <tr>
          <td style="padding-bottom:8px;">
            <p style="margin:0;font-size:20px;line-height:1.3;color:#1a1814;font-weight:600;font-family:Georgia,'Times New Roman',serif;">${escapeHtml(summaryText)}${confidenceBadge}</p>
          </td>
        </tr>${reasonHtml}${artifactHtml}
        <tr>
          <td style="padding-bottom:8px;">
            <a href="${approveHref}"
               style="display:inline-block;padding:12px 28px;background:#0d9488;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">
              ${escapeHtml(approveLabel)}
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding-bottom:28px;">
            <a href="${skipHref}"
               style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;color:#8a8178;text-decoration:underline;">
              ${escapeHtml(skipLabel)}
            </a>
          </td>
        </tr>`;
  }).join('\n');

  // ── "What I killed today" section ──
  const killReasonIcon: Record<string, string> = {
    NOISE: '&#128264;',   // muted speaker
    NOT_NOW: '&#9203;',   // hourglass
    TRAP: '&#9888;&#65039;', // warning
  };

  let cuttingRoomHtml = '';
  if (cuttingRoomFloor && cuttingRoomFloor.length > 0) {
    const items = cuttingRoomFloor.slice(0, 5).map(item => {
      const reason = (item.kill_reason ?? '').toUpperCase().replace(' ', '_');
      const icon = killReasonIcon[reason] ?? '&#10006;';
      return `
            <tr>
              <td style="padding:6px 0;">
                <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;color:#8a8178;line-height:1.5;">
                  ${icon} <span style="color:#6b6259;font-weight:600;">${escapeHtml(item.title)}</span>
                </p>
                <p style="margin:2px 0 0 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:11px;color:#a39e97;line-height:1.4;">
                  ${escapeHtml(item.justification)}
                </p>
              </td>
            </tr>`;
    }).join('\n');

    cuttingRoomHtml = `
          <tr>
            <td style="padding-top:24px;border-top:1px solid #e8e3df;">
              <p style="margin:0 0 12px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:10px;letter-spacing:0.15em;color:#c4bdb5;text-transform:uppercase;font-weight:700;">What I deprioritized today</p>
              <table width="100%" cellpadding="0" cellspacing="0">
${items}
              </table>
            </td>
          </tr>`;
  }

  // ── Learning signal line ──
  const learningHtml = learningSignal ? `
          <tr>
            <td style="padding-top:16px;">
              <div style="background:#f0ede8;border-radius:6px;padding:10px 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:11px;color:#6b6259;line-height:1.5;">
                &#9889; ${escapeHtml(learningSignal)}
              </div>
            </td>
          </tr>` : '';

  const outcomeCheckHtml = outcomeCheck ? `
          <tr>
            <td style="padding-top:24px;border-top:1px solid #e8e3df;">
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;color:#6b6259;line-height:1.6;">${escapeHtml(outcomeCheck)}</p>
            </td>
          </tr>` : '';

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
${cuttingRoomHtml}
${learningHtml}
${outcomeCheckHtml}
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
