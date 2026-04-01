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
      ${artifact.to ? renderField('To', artifact.to) : ''}
      ${artifact.subject ? renderField('Subject', artifact.subject) : ''}
      ${artifact.body ? renderField('Body', clipText(artifact.body, 2400)) : ''}
    `;
  }

  if (artifact.type === 'document') {
    return `
      ${renderField('Finished Artifact', 'Document')}
      ${artifact.title ? renderField('Title', artifact.title) : ''}
      ${artifact.content ? renderField('Content', clipText(artifact.content, 2400)) : ''}
    `;
  }

  if (artifact.type === 'calendar_event') {
    return `
      ${renderField('Finished Artifact', 'Calendar Hold')}
      ${artifact.title ? renderField('Title', artifact.title) : ''}
      ${artifact.start && artifact.end ? renderField('Time', `${artifact.start} to ${artifact.end}`) : ''}
      ${artifact.description ? renderField('Details', clipText(artifact.description, 1000)) : ''}
    `;
  }

  if (artifact.type === 'research_brief') {
    const sources = (artifact.sources ?? []).slice(0, 5).map((source) => `• ${source}`).join('\n');
    return `
      ${renderField('Finished Artifact', 'Research Brief')}
      ${artifact.findings ? renderField('Findings', clipText(artifact.findings, 2200)) : ''}
      ${artifact.recommended_action ? renderField('Recommended Action', clipText(artifact.recommended_action, 600)) : ''}
      ${sources ? renderField('Sources', sources) : ''}
    `;
  }

  if (artifact.type === 'decision_frame') {
    const opts = artifact.options ?? [];
    const recommendation = artifact.recommendation || opts[0]?.option || 'No recommendation captured.';
    const options = opts
      .slice(0, 2)
      .map((option) => {
        const weight = typeof option.weight === 'number' ? `${Math.round(option.weight * 100)}%` : '';
        return `${option.option ?? ''}${weight ? ` (${weight})` : ''}${option.rationale ? ` — ${option.rationale}` : ''}`;
      })
      .join('\n');

    return `
      ${renderField('Finished Artifact', 'Decision Memo')}
      ${renderField('Recommendation', clipText(recommendation, 800))}
      ${options ? renderField('Tradeoffs', clipText(options, 1400)) : ''}
    `;
  }

  // Slim wait_rationale: one line, not a report.
  const context = typeof artifact.context === 'string' ? artifact.context : '';
  const candidateMatch = context.match(/evaluated (\d+) candidates/);
  const candidateCount = candidateMatch ? candidateMatch[1] : '0';
  const firstTripwire = artifact.tripwires?.[0] ?? 'new signals arrive';
  return `
    <tr><td style="padding:0 0 10px 0;">
      <div style="font-family:system-ui,-apple-system,sans-serif;font-size:14px;color:#a1a1aa;line-height:1.6;">
        Foldera checked ${escapeHtml(candidateCount)} candidates today. Nothing worth your time. Watching for: ${escapeHtml(firstTripwire)}.
      </div>
    </td></tr>
  `;
}

const EMAIL_BG = '#07070c';
const EMAIL_CARD = '#0a0a0f';
const EMAIL_CYAN = '#22d3ee';
const EMAIL_CYAN_BTN = '#06b6d4';

/** Wordmark for email clients; absolute URL required. */
const EMAIL_LOGO_MARKUP =
  '<img src="https://www.foldera.ai/foldera-logo.png" alt="Foldera" width="140" style="margin-bottom:24px" />';

export function renderWelcomeEmailHtml(baseUrl: string): string {
  const dash = `${baseUrl.replace(/\/$/, '')}/dashboard`;
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:${EMAIL_BG};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${EMAIL_BG};padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr><td style="padding-bottom:28px;text-align:center;">
          ${EMAIL_LOGO_MARKUP}
        </td></tr>
        <tr><td style="padding:28px 24px;border-radius:16px;background:${EMAIL_CARD};border:1px solid rgba(255,255,255,0.1);">
          <p style="margin:0 0 8px 0;font-family:system-ui,-apple-system,sans-serif;font-size:10px;font-weight:900;letter-spacing:0.2em;text-transform:uppercase;color:${EMAIL_CYAN};">You&apos;re connected</p>
          <p style="margin:0 0 16px 0;font-family:system-ui,-apple-system,sans-serif;font-size:18px;font-weight:700;color:#ffffff;line-height:1.35;">Your first read arrives tomorrow morning.</p>
          <p style="margin:0 0 12px 0;font-family:system-ui,-apple-system,sans-serif;font-size:14px;color:#a1a1aa;line-height:1.65;">Foldera will scan your last 90 days of email, find what&apos;s slipping, and deliver one directive with finished work attached.</p>
          <p style="margin:0 0 24px 0;font-family:system-ui,-apple-system,sans-serif;font-size:14px;color:#a1a1aa;line-height:1.65;">No prompts. No setup. Just approve or skip.</p>
          <a href="${dash}" style="display:inline-block;padding:14px 28px;background:#ffffff;color:#000000;font-family:system-ui,-apple-system,sans-serif;font-size:11px;font-weight:900;letter-spacing:0.15em;text-transform:uppercase;text-decoration:none;border-radius:12px;box-shadow:0 0 40px rgba(255,255,255,0.2);">View your dashboard</a>
        </td></tr>
        <tr><td style="padding-top:28px;text-align:center;">
          <p style="margin:0;font-family:system-ui,-apple-system,sans-serif;font-size:11px;color:#52525b;line-height:1.6;">Foldera — Finished work, every morning.</p>
          <p style="margin:12px 0 0 0;font-family:system-ui,-apple-system,sans-serif;font-size:10px;">
            <a href="${dash}" style="color:#71717a;text-decoration:underline;">Email preferences</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendResendEmail({
  to,
  subject,
  text,
  html,
  from,
  tags,
}: {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  tags?: Array<{ name: string; value: string }>;
}) {
  return getResend().emails.send({
    from: from ?? process.env.RESEND_FROM_EMAIL ?? 'Foldera <brief@foldera.ai>',
    to,
    subject,
    ...(text ? { text } : {}),
    ...(html ? { html } : {}),
    ...(tags ? { tags } : {}),
  } as any);
}

export function renderPlaintextEmailHtml(body: string): string {
  return `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.6;white-space:pre-wrap;color:#18181b;">${escapeHtml(body)}</div>`;
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
    const prefs = `${baseUrl}/dashboard/settings`;
    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:${EMAIL_BG};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${EMAIL_BG};padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr><td style="padding-bottom:24px;text-align:center;">
          ${EMAIL_LOGO_MARKUP}
        </td></tr>
        <tr><td style="padding-bottom:8px;">
          <p style="margin:0;font-family:system-ui,-apple-system,sans-serif;font-size:10px;font-weight:900;letter-spacing:0.2em;color:#71717a;text-transform:uppercase;">${escapeHtml(date)}</p>
        </td></tr>
        <tr><td style="padding-bottom:20px;">
          <p style="margin:0;font-family:system-ui,-apple-system,sans-serif;font-size:20px;font-weight:800;color:#ffffff;line-height:1.3;">Nothing cleared the bar today.</p>
        </td></tr>
        <tr><td>
          <p style="margin:0;font-family:system-ui,-apple-system,sans-serif;font-size:14px;color:#a1a1aa;line-height:1.65;">Foldera did not find a directive with enough conviction to send.</p>
        </td></tr>
        <tr><td style="padding-top:28px;text-align:center;">
          <a href="${baseUrl}/dashboard" style="display:inline-block;padding:12px 24px;background:${EMAIL_CYAN_BTN};color:#000000;font-family:system-ui,-apple-system,sans-serif;font-size:10px;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;text-decoration:none;border-radius:12px;box-shadow:0 0 20px rgba(6,182,212,0.22);">Open dashboard</a>
        </td></tr>
        <tr><td style="padding-top:28px;text-align:center;border-top:1px solid rgba(255,255,255,0.08);">
          <p style="margin:0;font-family:system-ui,-apple-system,sans-serif;font-size:11px;color:#52525b;">Foldera — Finished work, every morning.</p>
          <p style="margin:10px 0 0 0;font-family:system-ui,-apple-system,sans-serif;font-size:10px;"><a href="${prefs}" style="color:#71717a;">Email preferences</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    return sendResendEmail({
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

  const prefs = `${baseUrl}/dashboard/settings`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:${EMAIL_BG};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${EMAIL_BG};padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr><td style="padding-bottom:24px;text-align:center;">
          ${EMAIL_LOGO_MARKUP}
        </td></tr>
        <tr><td style="padding-bottom:6px;">
          <p style="margin:0;font-family:system-ui,-apple-system,sans-serif;font-size:10px;font-weight:900;letter-spacing:0.2em;color:${EMAIL_CYAN};text-transform:uppercase;">Today&apos;s directive</p>
        </td></tr>
        <tr><td style="padding-bottom:6px;">
          <p style="margin:0;font-family:system-ui,-apple-system,sans-serif;font-size:10px;font-weight:700;letter-spacing:0.12em;color:#52525b;text-transform:uppercase;">${escapeHtml(date)}</p>
        </td></tr>
        <tr><td style="padding-bottom:16px;border-left:4px solid ${EMAIL_CYAN_BTN};padding-left:16px;">
          <p style="margin:0;font-family:system-ui,-apple-system,sans-serif;font-size:20px;font-weight:800;color:#ffffff;line-height:1.35;">${escapeHtml(directive.directive)}</p>
        </td></tr>
        ${reasonText ? `<tr><td style="padding:0 0 20px 0;"><p style="margin:0;font-family:system-ui,-apple-system,sans-serif;font-size:13px;color:#a1a1aa;line-height:1.6;">${escapeHtml(reasonText)}</p></td></tr>` : ''}
        <tr><td style="padding:0 0 24px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid rgba(255,255,255,0.1);border-radius:16px;background:${EMAIL_CARD};border-left:4px solid ${EMAIL_CYAN_BTN};padding:20px 18px;">
            ${artifactHtml || renderField('Finished Artifact', 'No artifact was attached.')}
          </table>
        </td></tr>
        <tr><td style="padding-bottom:8px;">
          <table cellpadding="0" cellspacing="0" width="100%"><tr>
            <td style="padding-right:10px;width:50%;">
              <a href="${approveHref}" style="display:block;text-align:center;padding:14px 16px;background:${EMAIL_CYAN_BTN};color:#000000;font-family:system-ui,-apple-system,sans-serif;font-size:10px;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;text-decoration:none;border-radius:12px;box-shadow:0 0 20px rgba(6,182,212,0.22);">Approve</a>
            </td>
            <td style="width:50%;">
              <a href="${skipHref}" style="display:block;text-align:center;padding:14px 16px;background:#18181b;color:#71717a;font-family:system-ui,-apple-system,sans-serif;font-size:10px;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;text-decoration:none;border-radius:12px;border:1px solid rgba(255,255,255,0.2);">Skip</a>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding-bottom:24px;">
          <p style="margin:0;font-family:system-ui,-apple-system,sans-serif;font-size:11px;color:#52525b;text-align:center;">Foldera learns from every skip.</p>
        </td></tr>
        <tr><td style="padding-top:20px;text-align:center;border-top:1px solid rgba(255,255,255,0.08);">
          <p style="margin:0;font-family:system-ui,-apple-system,sans-serif;font-size:11px;color:#52525b;">Foldera — Finished work, every morning.</p>
          <p style="margin:10px 0 0 0;font-family:system-ui,-apple-system,sans-serif;font-size:10px;"><a href="${prefs}" style="color:#71717a;">Email preferences</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return sendResendEmail({
    to,
    subject: emailSubject,
    html,
    tags,
  });
}
