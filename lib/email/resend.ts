/**
 * Resend email client + delivery helpers.
 *
 * Required env vars:
 *   RESEND_API_KEY        — from resend.com dashboard
 *   RESEND_FROM_EMAIL     — verified sender, e.g. "Foldera <brief@foldera.ai>"
 *   NEXTAUTH_URL          — base URL for approve/skip deep-links
 */

import { Resend } from 'resend';
import type { ConvictionArtifact } from '@/lib/briefing/types';

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

export interface DirectiveItem {
  id?: string;
  directive: string;
  action_type: string;
  confidence: number;
  reason: string;
  artifact?: ConvictionArtifact | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function clipText(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function renderField(label: string, value: string): string {
  return `<tr>
    <td style="padding:0 0 10px 0;">
      <div style="font-family:system-ui,-apple-system,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#71717a;margin-bottom:4px;">${escapeHtml(label)}</div>
      <div style="font-family:system-ui,-apple-system,sans-serif;font-size:14px;color:#e4e4e7;line-height:1.6;white-space:pre-wrap;">${escapeHtml(value)}</div>
    </td>
  </tr>`;
}

function renderArtifactHtml(artifact: ConvictionArtifact | null | undefined): string {
  if (!artifact) {
    return '';
  }

  if (artifact.type === 'email') {
    return `
      ${renderField('Finished Artifact', 'Draft Email')}
      ${renderField('To', artifact.to)}
      ${renderField('Subject', artifact.subject)}
      ${renderField('Body', clipText(artifact.body, 2400))}
    `;
  }

  if (artifact.type === 'document') {
    return `
      ${renderField('Finished Artifact', 'Document')}
      ${renderField('Title', artifact.title)}
      ${renderField('Content', clipText(artifact.content, 2400))}
    `;
  }

  if (artifact.type === 'calendar_event') {
    return `
      ${renderField('Finished Artifact', 'Calendar Hold')}
      ${renderField('Title', artifact.title)}
      ${renderField('Time', `${artifact.start} to ${artifact.end}`)}
      ${artifact.description ? renderField('Details', clipText(artifact.description, 1000)) : ''}
    `;
  }

  if (artifact.type === 'research_brief') {
    const sources = artifact.sources.slice(0, 5).map((source) => `• ${source}`).join('\n');
    return `
      ${renderField('Finished Artifact', 'Research Brief')}
      ${renderField('Findings', clipText(artifact.findings, 2200))}
      ${renderField('Recommended Action', clipText(artifact.recommended_action, 600))}
      ${sources ? renderField('Sources', sources) : ''}
    `;
  }

  if (artifact.type === 'decision_frame') {
    const recommendation = artifact.recommendation || artifact.options[0]?.option || 'No recommendation captured.';
    const options = artifact.options
      .slice(0, 2)
      .map((option) => {
        const weight = typeof option.weight === 'number' ? `${Math.round(option.weight * 100)}%` : '';
        return `${option.option}${weight ? ` (${weight})` : ''}${option.rationale ? ` — ${option.rationale}` : ''}`;
      })
      .join('\n');

    return `
      ${renderField('Finished Artifact', 'Decision Memo')}
      ${renderField('Recommendation', clipText(recommendation, 800))}
      ${options ? renderField('Tradeoffs', clipText(options, 1400)) : ''}
    `;
  }

  const tripwires = artifact.tripwires?.slice(0, 3).map((tripwire) => `• ${tripwire}`).join('\n') ?? '';
  const context = typeof artifact.context === 'string' ? artifact.context : 'No details available.';
  const evidence = typeof artifact.evidence === 'string' ? artifact.evidence : '';
  return `
    ${renderField('Finished Artifact', 'Wait Rationale')}
    ${renderField('Why Waiting Wins', clipText(context, 1200))}
    ${evidence ? renderField('Evidence', clipText(evidence, 800)) : ''}
    ${tripwires ? renderField('Tripwires', tripwires) : ''}
  `;
}

export async function sendDailyDirective({
  to,
  directives,
  date,
  subject,
  userId,
}: {
  to: string;
  directives: DirectiveItem[];
  date: string;
  subject?: string;
  userId: string;
}) {
  const baseUrl = (process.env.NEXTAUTH_URL ?? 'https://foldera.ai').replace(/\/$/, '');
  const directive = directives[0];
  const tags = [
    { name: 'email_type', value: 'daily_brief' },
    { name: 'user_id', value: userId },
    ...(directive?.id ? [{ name: 'action_id', value: directive.id }] : []),
  ];

  if (!directive) {
    const nothingSubject = subject ?? 'Foldera: Nothing today';
    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#0a0a0f;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:48px 24px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="padding-bottom:32px;">
          <p style="margin:0;font-family:system-ui,-apple-system,sans-serif;font-size:11px;letter-spacing:0.15em;color:#52525b;text-transform:uppercase;">Foldera · ${date}</p>
        </td></tr>
        <tr><td style="padding-bottom:24px;">
          <p style="margin:0;font-family:system-ui,-apple-system,sans-serif;font-size:18px;font-weight:600;color:#e2e8f0;">Nothing cleared the bar today.</p>
        </td></tr>
        <tr><td>
          <p style="margin:0;font-family:system-ui,-apple-system,sans-serif;font-size:14px;color:#71717a;line-height:1.6;">Foldera did not find a directive with enough conviction to send.</p>
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
      from: process.env.RESEND_FROM_EMAIL ?? 'Foldera <brief@foldera.ai>',
      to,
      subject: nothingSubject,
      html,
      tags,
    });
  }

  const emailSubject = subject ?? `Foldera: ${directive.directive.split(/\s+/).slice(0, 6).join(' ')}`;
  const reasonText = directive.reason?.split('[score=')[0].trim() ?? '';
  const approveHref = directive.id ? `${baseUrl}/dashboard?action=approve&id=${directive.id}` : `${baseUrl}/dashboard`;
  const skipHref = directive.id ? `${baseUrl}/dashboard?action=skip&id=${directive.id}` : `${baseUrl}/dashboard`;
  const artifactHtml = renderArtifactHtml(directive.artifact);

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#0a0a0f;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:48px 24px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="padding-bottom:28px;">
          <p style="margin:0;font-family:system-ui,-apple-system,sans-serif;font-size:11px;letter-spacing:0.15em;color:#52525b;text-transform:uppercase;">Foldera · ${date}</p>
        </td></tr>
        <tr><td style="padding-bottom:8px;">
          <p style="margin:0;font-family:system-ui,-apple-system,sans-serif;font-size:16px;letter-spacing:0.12em;color:#38bdf8;text-transform:uppercase;">Today's Directive</p>
        </td></tr>
        <tr><td style="padding-bottom:12px;">
          <p style="margin:0;font-family:system-ui,-apple-system,sans-serif;font-size:22px;font-weight:700;color:#f4f4f5;line-height:1.4;">${escapeHtml(directive.directive)}</p>
        </td></tr>
        ${reasonText ? `<tr><td style="padding:0 0 24px 0;"><p style="margin:0;font-family:system-ui,-apple-system,sans-serif;font-size:14px;color:#a1a1aa;line-height:1.6;">${escapeHtml(reasonText)}</p></td></tr>` : ''}
        <tr><td style="padding:0 0 24px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #27272a;border-radius:12px;background:#111115;padding:20px 18px;">
            ${artifactHtml || renderField('Finished Artifact', 'No artifact was attached.')}
          </table>
        </td></tr>
        <tr><td style="padding-bottom:16px;">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="padding-right:12px;">
              <a href="${approveHref}" style="display:inline-block;padding:12px 28px;background:#059669;color:#ffffff;font-family:system-ui,-apple-system,sans-serif;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">Approve</a>
            </td>
            <td>
              <a href="${skipHref}" style="display:inline-block;padding:12px 28px;background:transparent;color:#a1a1aa;font-family:system-ui,-apple-system,sans-serif;font-size:14px;font-weight:500;text-decoration:none;border-radius:8px;border:1px solid #3f3f46;">Skip</a>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding-top:28px;border-top:1px solid #27272a;">
          <p style="margin:0;font-family:system-ui,-apple-system,sans-serif;font-size:11px;"><a href="${baseUrl}/dashboard" style="color:#52525b;text-decoration:none;">Open dashboard</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return getResend().emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? 'Foldera <brief@foldera.ai>',
    to,
    subject: emailSubject,
    html,
    tags,
  });
}
