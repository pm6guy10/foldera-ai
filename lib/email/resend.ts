/**
 * Resend email client + delivery helpers.
 *
 * Required env vars:
 *   RESEND_API_KEY        — from resend.com dashboard
 *   RESEND_FROM_EMAIL     — verified sender, e.g. "Foldera <noreply@foldera.ai>"
 *   NEXTAUTH_URL          — base URL for approve/skip deep-links
 */

import { Resend } from 'resend';
import type { ConvictionArtifact } from '@/lib/briefing/types';
import { markdownToEmailHtml } from '@/lib/email/markdown-to-html';

/** Default From when `RESEND_FROM_EMAIL` is unset — must match a verified domain address in Resend. */
export const DEFAULT_RESEND_FROM = 'Foldera <noreply@foldera.ai>';

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

export const NO_SEND_SUBJECT = 'Foldera: Nothing cleared the bar today';
export const NO_SEND_DIRECTIVE_TEXT = 'Nothing cleared the bar today.';
export const NO_SEND_BODY_TEXT =
  'Foldera checked your recent signals and did not find anything worth interrupting you for.';

const INTERNAL_FAILURE_TEXT_PATTERNS = [
  /\bllm_failed\b/i,
  /\bstale_date_in_directive\b/i,
  /\bartifact_viability\b/i,
  /\btrigger_lock\b/i,
  /generation validation failed/i,
  /all\s+\d+\s+candidates blocked/i,
  /all candidates blocked/i,
  /\ball_candidates_blocked\b/i,
  /\bcandidate_blocked\b/i,
  /\bsystem commitment\b/i,
  /\bcandidateFailureReasons\b/i,
  /\bcandidate failure reasons\b/i,
  /\bINFINITE_LOOP\b/i,
  /\bbatch:\s*400\b/i,
  /\binvalid_request_error\b/i,
  /\brequest_id\b/i,
  /\breq_[A-Za-z0-9]+\b/i,
  /\bapi usage limits\b/i,
  /\byou have reached your specified api usage limits\b/i,
  /\bquota\b/i,
  /\bprovider failure\b/i,
  /\b20\d{2}-\d{2}-\d{2}\s+at\s+\d{2}:\d{2}\s+utc\b/i,
];

const INTERNAL_FAILURE_TEXT_STRIP_PATTERNS = [
  /\bbatch:\s*400\b/gi,
  /\binvalid_request_error\b/gi,
  /\brequest_id\b/gi,
  /\breq_[A-Za-z0-9]+\b/gi,
  /\bapi usage limits\b/gi,
  /\byou have reached your specified api usage limits\b/gi,
  /\bllm_failed\b/gi,
  /\bstale_date_in_directive\b/gi,
  /\ball candidates blocked\b/gi,
  /\ball\s+\d+\s+candidates blocked\b/gi,
  /\bcandidate_blocked\b/gi,
  /\bquota\b/gi,
  /\bprovider failure\b/gi,
  /\b20\d{2}-\d{2}-\d{2}\s+at\s+\d{2}:\d{2}\s+utc\b/gi,
  /\{(?:\s|"|:|,|[A-Za-z0-9_.-])+invalid_request_error(?:\s|"|:|,|[A-Za-z0-9_.-])+\}/gi,
];

function isNoSendDirective(directive: DirectiveItem): boolean {
  const action = directive.action_type.trim().toLowerCase();
  if (action === 'do_nothing' || action === 'wait_rationale') return true;
  return directive.artifact?.type === 'wait_rationale';
}

export function isInternalFailureText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return INTERNAL_FAILURE_TEXT_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function stripInternalFailureContent(text: string): string {
  let cleaned = text;
  for (const pattern of INTERNAL_FAILURE_TEXT_STRIP_PATTERNS) {
    cleaned = cleaned.replace(pattern, ' ');
  }
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

function sanitizePlainTextForDelivery(value: string | null | undefined): string {
  if (typeof value !== 'string') return '';
  return stripInternalFailureContent(value);
}

export function sanitizeNoSendDirective(directive: DirectiveItem): DirectiveItem {
  const cleanedReason = sanitizePlainTextForDelivery(directive.reason);
  const safeReason =
    cleanedReason.length > 0 && !isInternalFailureText(cleanedReason)
      ? cleanedReason
      : '';

  return {
    id: directive.id,
    directive: NO_SEND_DIRECTIVE_TEXT,
    action_type: 'do_nothing',
    confidence: typeof directive.confidence === 'number' ? directive.confidence : 0,
    reason: safeReason,
    artifact: {
      type: 'wait_rationale',
      context: NO_SEND_BODY_TEXT,
      evidence: NO_SEND_BODY_TEXT,
    },
  };
}

export function sanitizeDirectiveForDelivery(directive: DirectiveItem): DirectiveItem {
  if (isNoSendDirective(directive)) {
    return sanitizeNoSendDirective(directive);
  }

  const artifact = directive.artifact;
  let sanitizedArtifact = artifact;

  if (artifact?.type === 'email') {
    const subject = sanitizePlainTextForDelivery(artifact.subject) || 'Foldera update';
    const body =
      sanitizePlainTextForDelivery(artifact.body) ||
      'Foldera prepared this message without internal system diagnostics.';
    sanitizedArtifact = {
      ...artifact,
      subject,
      body,
    };
  } else if (artifact?.type === 'document') {
    const title = sanitizePlainTextForDelivery(artifact.title) || 'Foldera document';
    const content =
      sanitizePlainTextForDelivery(artifact.content) ||
      'Foldera prepared this document without internal system diagnostics.';
    sanitizedArtifact = {
      ...artifact,
      title,
      content,
    };
  } else if (artifact?.type === 'wait_rationale') {
    sanitizedArtifact = {
      ...artifact,
      context: NO_SEND_BODY_TEXT,
      evidence: NO_SEND_BODY_TEXT,
    };
  }

  const cleanedDirective = sanitizePlainTextForDelivery(directive.directive);
  const cleanedReason = sanitizePlainTextForDelivery(directive.reason);

  return {
    ...directive,
    directive: cleanedDirective || 'Foldera prepared your daily brief update.',
    reason: cleanedReason,
    artifact: sanitizedArtifact,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** YYYY-MM-DD (pipeline) or ISO → "April 2, 2026" — UTC noon avoids TZ day shift. */
function formatEmailDateForDisplay(dateInput: string): string {
  const trimmed = dateInput.trim();
  if (!trimmed) return dateInput;
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const d = ymd
    ? new Date(Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]), 12, 0, 0))
    : new Date(trimmed);
  if (Number.isNaN(d.getTime())) return trimmed;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function clipText(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

export function buildDocumentReadySubject(value: string | null | undefined): string {
  const headline = (value ?? '').replace(/\s+/g, ' ').trim() || 'your approved document';
  const prefix = 'Your document is ready: ';
  const maxLength = 60;
  const sentence = /[.!?]$/.test(headline) ? `${prefix}${headline}` : `${prefix}${headline}.`;
  if (sentence.length <= maxLength) return sentence;

  const availableHeadlineLength = Math.max(0, maxLength - prefix.length - 3);
  let clipped = headline.slice(0, availableHeadlineLength).trimEnd();
  const lastSpace = clipped.lastIndexOf(' ');
  if (lastSpace >= Math.floor(availableHeadlineLength * 0.6)) {
    clipped = clipped.slice(0, lastSpace).trimEnd();
  }
  return `${prefix}${clipped}...`;
}

function renderField(label: string, value: string, opts?: { monospace?: boolean }): string {
  const font = opts?.monospace
    ? 'ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace'
    : EMAIL_FONT_STACK;
  return `<tr>
    <td style="padding:0 0 10px 0;">
      <div style="font-family:${EMAIL_FONT_STACK};font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#71717a;margin-bottom:4px;">${escapeHtml(label)}</div>
      <div style="font-family:${font};font-size:14px;color:#e4e4e7;line-height:1.6;white-space:pre-wrap;">${escapeHtml(value)}</div>
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
      ${artifact.body ? renderField('Body', clipText(artifact.body, 2400), { monospace: true }) : ''}
    `;
  }

  if (artifact.type === 'document') {
    const content = artifact.content ? clipText(artifact.content, 4000) : '';
    const title = artifact.title?.trim() ?? '';
    return `
      <tr><td style="padding:0 0 10px 0;">
        ${
          title
            ? `<p style="margin:0 0 14px 0;font-family:${EMAIL_FONT_STACK};font-size:20px;font-weight:800;color:#ffffff;line-height:1.35;">${escapeHtml(title)}</p>`
            : ''
        }
        ${
          content
            ? `<div style="font-family:${EMAIL_FONT_STACK};font-size:14px;color:#e4e4e7;line-height:1.65;word-break:break-word;">${markdownToEmailHtml(content)}</div>`
            : ''
        }
      </td></tr>
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
      <div style="font-family:${EMAIL_FONT_STACK};font-size:14px;color:#a1a1aa;line-height:1.6;">
        Foldera checked ${escapeHtml(candidateCount)} candidates today. Nothing worth your time. Watching for: ${escapeHtml(firstTripwire)}.
      </div>
    </td></tr>
  `;
}

/** Mirror tailwind.config.js + app/page.tsx directive demo — keep in sync. */
const EMAIL_FONT_STACK = 'Inter,system-ui,-apple-system,BlinkMacSystemFont,sans-serif';
const EMAIL_HEAD = `<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet" />`;

const EMAIL_BG = '#07070c';
const EMAIL_CARD = '#0a0a0f';
const EMAIL_CYAN = '#22d3ee';
const EMAIL_CYAN_BTN = '#06b6d4';
/** border-cyan-500/40 */
const EMAIL_BORDER_CYAN_STRONG = 'rgba(6,182,212,0.4)';
/** border-cyan-500/30 */
const EMAIL_BORDER_CYAN_SOFT = 'rgba(6,182,212,0.3)';
/** bg-cyan-500/10 */
const EMAIL_BG_CYAN_TINT = 'rgba(6,182,212,0.1)';
const EMAIL_RADIUS_CARD_OUTER = '32px';
const EMAIL_RADIUS_INNER = '12px';
const EMAIL_SKIP_BG = '#18181b';
const EMAIL_SKIP_TEXT = '#71717a';
const EMAIL_SKIP_BORDER = 'rgba(255,255,255,0.2)';

/** Wordmark for email clients; absolute URL required. */
const EMAIL_LOGO_MARKUP =
  '<img src="https://foldera.ai/foldera-logo.png" alt="Foldera" width="140" style="margin-bottom:24px" />';

/** Dark transactional template (Pro welcome, billing alerts) — matches daily directive styling. */
export function renderDarkTransactionalEmailHtml(opts: {
  eyebrow: string;
  title: string;
  bodyLines: string[];
  ctaLabel?: string;
  ctaHref?: string;
}): string {
  const baseUrl = (process.env.NEXTAUTH_URL ?? 'https://foldera.ai').replace(/\/$/, '');
  const settings = `${baseUrl}/dashboard/settings`;
  const { eyebrow, title, bodyLines, ctaLabel, ctaHref } = opts;
  const bodyHtml = bodyLines
    .map(
      (line) =>
        `<p style="margin:0 0 12px 0;font-family:${EMAIL_FONT_STACK};font-size:14px;color:#a1a1aa;line-height:1.65;">${escapeHtml(line)}</p>`,
    )
    .join('');
  const ctaBlock =
    ctaLabel && ctaHref
      ? `<a href="${escapeHtml(ctaHref)}" style="display:inline-block;margin-top:8px;padding:14px 28px;background:#ffffff;color:#000000;font-family:${EMAIL_FONT_STACK};font-size:11px;font-weight:900;letter-spacing:0.15em;text-transform:uppercase;text-decoration:none;border-radius:${EMAIL_RADIUS_INNER};box-shadow:0 0 40px rgba(255,255,255,0.2);">${escapeHtml(ctaLabel)}</a>`
      : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>${EMAIL_HEAD}</head>
<body style="margin:0;padding:0;background:${EMAIL_BG};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${EMAIL_BG};padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr><td style="padding-bottom:28px;text-align:center;">
          ${EMAIL_LOGO_MARKUP}
        </td></tr>
        <tr><td style="padding:28px 24px;border-radius:${EMAIL_RADIUS_CARD_OUTER};background:${EMAIL_CARD};border:1px solid ${EMAIL_BORDER_CYAN_STRONG};">
          <p style="margin:0 0 8px 0;font-family:${EMAIL_FONT_STACK};font-size:10px;font-weight:900;letter-spacing:0.2em;text-transform:uppercase;color:${EMAIL_CYAN};">${escapeHtml(eyebrow)}</p>
          <p style="margin:0 0 16px 0;font-family:${EMAIL_FONT_STACK};font-size:18px;font-weight:700;color:#ffffff;line-height:1.35;">${escapeHtml(title)}</p>
          ${bodyHtml}
          ${ctaBlock}
        </td></tr>
        <tr><td style="padding-top:28px;text-align:center;">
          <p style="margin:0;font-family:${EMAIL_FONT_STACK};font-size:11px;color:#52525b;line-height:1.6;">Foldera — Finished work, every morning.</p>
          <p style="margin:12px 0 0 0;font-family:${EMAIL_FONT_STACK};font-size:10px;">
            <a href="${settings}" style="color:#71717a;text-decoration:underline;">Settings</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function renderWelcomeEmailHtml(baseUrl: string): string {
  const dash = `${baseUrl.replace(/\/$/, '')}/dashboard`;
  return `<!DOCTYPE html>
<html lang="en">
<head>${EMAIL_HEAD}</head>
<body style="margin:0;padding:0;background:${EMAIL_BG};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${EMAIL_BG};padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr><td style="padding-bottom:28px;text-align:center;">
          ${EMAIL_LOGO_MARKUP}
        </td></tr>
        <tr><td style="padding:28px 24px;border-radius:${EMAIL_RADIUS_CARD_OUTER};background:${EMAIL_CARD};border:1px solid ${EMAIL_BORDER_CYAN_STRONG};">
          <p style="margin:0 0 8px 0;font-family:${EMAIL_FONT_STACK};font-size:10px;font-weight:900;letter-spacing:0.2em;text-transform:uppercase;color:${EMAIL_CYAN};">You&apos;re connected</p>
          <p style="margin:0 0 16px 0;font-family:${EMAIL_FONT_STACK};font-size:18px;font-weight:700;color:#ffffff;line-height:1.35;">Your first read arrives tomorrow morning.</p>
          <p style="margin:0 0 12px 0;font-family:${EMAIL_FONT_STACK};font-size:14px;color:#a1a1aa;line-height:1.65;">Foldera reviews your recent activity, finds what&apos;s slipping, and delivers one directive with finished work attached.</p>
          <p style="margin:0 0 24px 0;font-family:${EMAIL_FONT_STACK};font-size:14px;color:#a1a1aa;line-height:1.65;">No prompts. No setup. Just approve or skip.</p>
          <a href="${dash}" style="display:inline-block;padding:14px 28px;background:#ffffff;color:#000000;font-family:${EMAIL_FONT_STACK};font-size:11px;font-weight:900;letter-spacing:0.15em;text-transform:uppercase;text-decoration:none;border-radius:${EMAIL_RADIUS_INNER};box-shadow:0 0 40px rgba(255,255,255,0.2);">View your dashboard</a>
        </td></tr>
        <tr><td style="padding-top:28px;text-align:center;">
          <p style="margin:0;font-family:${EMAIL_FONT_STACK};font-size:11px;color:#52525b;line-height:1.6;">Foldera — Finished work, every morning.</p>
          <p style="margin:12px 0 0 0;font-family:${EMAIL_FONT_STACK};font-size:10px;">
            <a href="${dash}" style="color:#71717a;text-decoration:underline;">Email preferences</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Ops alert when the daily send batch leaves users without an email.
 * Requires RESEND_API_KEY; no-ops when unset (e.g. local tests).
 */
export async function sendDailyDeliverySkipAlert(payload: {
  date: string;
  totalConnectedUsers: number;
  batchUserCount: number;
  emailsSent: number;
  skips: Array<{ userId: string; code: string; detail?: string }>;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;

  const lines = payload.skips.map(
    (s) =>
      `- ${s.userId} — ${s.code}${s.detail ? `: ${s.detail}` : ''}`,
  );
  const body = [
    `Daily brief send finished ${payload.date}`,
    `Connected users (OAuth): ${payload.totalConnectedUsers}`,
    `Users in this send batch: ${payload.batchUserCount}`,
    `Successful sends (this run): ${payload.emailsSent}`,
    `Skipped / no email: ${payload.skips.length}`,
    '',
    ...lines,
  ].join('\n');

  await sendResendEmail({
    from: process.env.RESEND_FROM_EMAIL ?? DEFAULT_RESEND_FROM,
    to: 'brief@foldera.ai',
    subject: `[Foldera] Daily send: ${payload.skips.length} user(s) got no email`,
    text: body,
    tags: [{ name: 'email_type', value: 'delivery_audit' }],
  });
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
    from: from ?? process.env.RESEND_FROM_EMAIL ?? DEFAULT_RESEND_FROM,
    to,
    subject,
    ...(text ? { text } : {}),
    ...(html ? { html } : {}),
    ...(tags ? { tags } : {}),
  } as any);
}

export function renderPlaintextEmailHtml(body: string): string {
  return `<div style="font-family:${EMAIL_FONT_STACK};font-size:14px;line-height:1.6;white-space:pre-wrap;color:#18181b;">${escapeHtml(body)}</div>`;
}

/**
 * Transactional email when the user approves a write_document — full artifact inline so they get something in their inbox immediately.
 */
export function renderWriteDocumentReadyEmailHtml(opts: {
  documentTitle: string;
  documentContent: string;
}): string {
  const baseUrl = (process.env.NEXTAUTH_URL ?? 'https://foldera.ai').replace(/\/$/, '');
  const dashboard = `${baseUrl}/dashboard`;
  const title = opts.documentTitle.trim() || 'Your document';
  const body = opts.documentContent.slice(0, 50000);
  return `<!DOCTYPE html>
<html lang="en">
<head>${EMAIL_HEAD}</head>
<body style="margin:0;padding:0;background:${EMAIL_BG};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${EMAIL_BG};padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="padding-bottom:28px;text-align:center;">
          ${EMAIL_LOGO_MARKUP}
        </td></tr>
        <tr><td style="padding:28px 24px;border-radius:${EMAIL_RADIUS_CARD_OUTER};background:${EMAIL_CARD};border:1px solid ${EMAIL_BORDER_CYAN_STRONG};">
          <p style="margin:0 0 8px 0;font-family:${EMAIL_FONT_STACK};font-size:10px;font-weight:900;letter-spacing:0.2em;text-transform:uppercase;color:${EMAIL_CYAN};">Your document is ready</p>
          <p style="margin:0 0 16px 0;font-family:${EMAIL_FONT_STACK};font-size:18px;font-weight:700;color:#ffffff;line-height:1.35;">You approved this in Foldera</p>
          <p style="margin:0 0 20px 0;font-family:${EMAIL_FONT_STACK};font-size:14px;color:#a1a1aa;line-height:1.65;">Here is the full text. Forward it, copy it, or save it — whatever gets the work done.</p>
          <div style="margin:0;padding:20px 22px;border-radius:${EMAIL_RADIUS_INNER};background:${EMAIL_BG_CYAN_TINT};border:1px solid ${EMAIL_BORDER_CYAN_SOFT};border-left:4px solid ${EMAIL_CYAN_BTN};">
            <p style="margin:0 0 16px 0;font-family:${EMAIL_FONT_STACK};font-size:20px;font-weight:800;color:#ffffff;line-height:1.35;">${escapeHtml(title)}</p>
            <div style="font-family:${EMAIL_FONT_STACK};font-size:14px;color:#e4e4e7;line-height:1.65;word-break:break-word;">${markdownToEmailHtml(body)}</div>
          </div>
        </td></tr>
        <tr><td style="padding-top:28px;text-align:center;">
          <a href="${escapeHtml(dashboard)}" style="display:inline-block;padding:12px 24px;background:${EMAIL_CYAN_BTN};color:#000000;font-family:${EMAIL_FONT_STACK};font-size:10px;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;text-decoration:none;border-radius:${EMAIL_RADIUS_INNER};box-shadow:0 0 20px rgba(6,182,212,0.22);">Open dashboard</a>
          <p style="margin:20px 0 0 0;font-family:${EMAIL_FONT_STACK};font-size:11px;color:#52525b;line-height:1.6;">Foldera — Finished work, every morning.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Full HTML for the daily brief email (send path + local preview).
 * `directive === null` (or `do_nothing` / `wait_rationale`) renders the "nothing today" variant.
 */
export function buildDailyDirectiveEmailHtml(opts: {
  baseUrl: string;
  date: string;
  directive: DirectiveItem | null;
}): string {
  const baseUrl = opts.baseUrl.replace(/\/$/, '');
  const { date } = opts;
  const noSendDirective =
    opts.directive && isNoSendDirective(opts.directive)
      ? sanitizeNoSendDirective(opts.directive)
      : null;
  const directive = noSendDirective ?? opts.directive;
  const prefs = `${baseUrl}/dashboard/settings`;
  const dateDisplay = escapeHtml(formatEmailDateForDisplay(date));
  const noSendTitle = escapeHtml(noSendDirective?.directive ?? NO_SEND_DIRECTIVE_TEXT);
  const noSendBody = escapeHtml(
    noSendDirective?.artifact?.type === 'wait_rationale'
      ? noSendDirective.artifact.context
      : NO_SEND_BODY_TEXT,
  );

  if (!directive || noSendDirective) {
    return `<!DOCTYPE html>
<html lang="en">
<head>${EMAIL_HEAD}</head>
<body style="margin:0;padding:0;background:${EMAIL_BG};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${EMAIL_BG};padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr><td style="padding-bottom:24px;text-align:center;">
          ${EMAIL_LOGO_MARKUP}
        </td></tr>
        <tr><td style="padding:0 0 20px 0;">
          <div style="height:3px;width:100%;border-radius:2px;background:linear-gradient(90deg,transparent,${EMAIL_CYAN},transparent);"></div>
        </td></tr>
        <tr><td style="padding-bottom:8px;">
          <p style="margin:0;font-family:${EMAIL_FONT_STACK};font-size:10px;font-weight:700;letter-spacing:0.12em;color:#52525b;">${dateDisplay}</p>
        </td></tr>
        <tr><td style="padding-bottom:20px;">
          <p style="margin:0;font-family:${EMAIL_FONT_STACK};font-size:20px;font-weight:800;color:#ffffff;line-height:1.3;">${noSendTitle}</p>
        </td></tr>
        <tr><td>
          <p style="margin:0;font-family:${EMAIL_FONT_STACK};font-size:14px;color:#a1a1aa;line-height:1.65;">${noSendBody}</p>
        </td></tr>
        <tr><td style="padding:28px 0 36px 0;text-align:center;">
          <a href="${baseUrl}/dashboard" style="display:inline-block;padding:12px 24px;background:${EMAIL_CYAN_BTN};color:#000000;font-family:${EMAIL_FONT_STACK};font-size:10px;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;text-decoration:none;border-radius:${EMAIL_RADIUS_INNER};box-shadow:0 0 20px rgba(6,182,212,0.22);">Open dashboard</a>
        </td></tr>
        <tr><td style="padding-top:28px;text-align:center;border-top:1px solid rgba(255,255,255,0.08);">
          <p style="margin:0;font-family:${EMAIL_FONT_STACK};font-size:11px;color:#52525b;">Foldera — Finished work, every morning.</p>
          <p style="margin:10px 0 0 0;font-family:${EMAIL_FONT_STACK};font-size:10px;"><a href="${prefs}" style="color:#71717a;">Email preferences</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  const reasonText = directive.reason?.split('[score=')[0].trim() ?? '';
  const approveHref = directive.id ? `${baseUrl}/dashboard?action=approve&id=${directive.id}` : `${baseUrl}/dashboard`;
  const skipHref = directive.id ? `${baseUrl}/dashboard?action=skip&id=${directive.id}` : `${baseUrl}/dashboard`;
  const artifactHtml = renderArtifactHtml(directive.artifact);
  const showArtifactHeading = directive.artifact?.type !== 'document';

  return `<!DOCTYPE html>
<html lang="en">
<head>${EMAIL_HEAD}</head>
<body style="margin:0;padding:0;background:${EMAIL_BG};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${EMAIL_BG};padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr><td style="padding-bottom:24px;text-align:center;">
          ${EMAIL_LOGO_MARKUP}
        </td></tr>
        <tr><td style="padding:0 0 20px 0;">
          <div style="height:3px;width:100%;border-radius:2px;background:linear-gradient(90deg,transparent,${EMAIL_CYAN},transparent);"></div>
        </td></tr>
        <tr><td style="padding:0 0 14px 0;">
          <p style="margin:0;font-family:${EMAIL_FONT_STACK};font-size:10px;font-weight:700;letter-spacing:0.12em;color:#52525b;">${dateDisplay}</p>
        </td></tr>
        ${showArtifactHeading ? `<tr><td style="padding:10px 0 18px 0;">
          <p style="margin:0;font-family:${EMAIL_FONT_STACK};font-size:12px;font-weight:900;letter-spacing:0.16em;line-height:1.45;color:${EMAIL_CYAN};text-transform:uppercase;">Finished artifact</p>
        </td></tr>` : ''}
        <tr><td style="padding:0 0 24px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${EMAIL_BORDER_CYAN_STRONG};border-radius:${EMAIL_RADIUS_CARD_OUTER};background:${EMAIL_CARD};">
            <tr><td style="padding:20px 18px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:${EMAIL_BG_CYAN_TINT};border:1px solid ${EMAIL_BORDER_CYAN_SOFT};border-left:4px solid ${EMAIL_CYAN_BTN};border-radius:${EMAIL_RADIUS_INNER};padding:16px 18px;">
                ${artifactHtml || renderField('Finished Artifact', 'No artifact was attached.')}
              </table>
            </td></tr>
          </table>
        </td></tr>
        ${
          directive.action_type === 'send_message'
            ? `<tr><td style="padding:0 0 20px 0;">
          <p style="margin:0;font-family:${EMAIL_FONT_STACK};font-size:13px;color:#a1a1aa;line-height:1.65;">
            <strong style="color:#e4e4e7;">Approve</strong> sends from your connected Gmail or Outlook.
            The finished draft is below — open the <a href="${baseUrl}/dashboard" style="color:${EMAIL_CYAN};text-decoration:underline;">dashboard</a> if you want to edit before sending.
          </p>
        </td></tr>`
            : ''
        }
        <tr><td style="padding:0 0 6px 0;">
          <p style="margin:0;font-family:${EMAIL_FONT_STACK};font-size:10px;font-weight:900;letter-spacing:0.2em;color:${EMAIL_CYAN};text-transform:uppercase;">Today&apos;s directive</p>
        </td></tr>
        <tr><td style="padding:0 0 ${reasonText ? '0' : '24px'} 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              <td style="width:4px;min-width:4px;background-color:${EMAIL_CYAN_BTN};border-radius:2px 0 0 2px;padding:0;font-size:0;line-height:0;">&nbsp;</td>
              <td style="padding:10px 0 10px 16px;vertical-align:top;">
                <p style="margin:0;font-family:${EMAIL_FONT_STACK};font-size:20px;font-weight:800;color:#ffffff;line-height:1.35;">${escapeHtml(directive.directive)}</p>
              </td>
            </tr>
          </table>
        </td></tr>
        ${reasonText ? `<tr><td style="padding:18px 0 24px 0;"><p style="margin:0;font-family:${EMAIL_FONT_STACK};font-size:13px;color:#a1a1aa;line-height:1.6;">${escapeHtml(reasonText)}</p></td></tr>` : ''}
        <tr><td style="padding-bottom:8px;">
          <table cellpadding="0" cellspacing="0" width="100%"><tr>
            <td style="padding-right:10px;width:50%;vertical-align:top;">
              <a href="${approveHref}" style="display:block;text-align:center;min-height:44px;line-height:44px;padding:0 16px;background:${EMAIL_CYAN_BTN};color:#000000;font-family:${EMAIL_FONT_STACK};font-size:10px;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;text-decoration:none;border-radius:${EMAIL_RADIUS_INNER};box-shadow:0 0 20px rgba(6,182,212,0.22);">Approve</a>
            </td>
            <td style="width:50%;vertical-align:top;">
              <a href="${skipHref}" style="display:block;text-align:center;min-height:44px;line-height:44px;padding:0 16px;background:${EMAIL_SKIP_BG};color:${EMAIL_SKIP_TEXT};font-family:${EMAIL_FONT_STACK};font-size:10px;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;text-decoration:none;border-radius:${EMAIL_RADIUS_INNER};border:1px solid ${EMAIL_SKIP_BORDER};">Skip</a>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding-bottom:24px;">
          <p style="margin:0;font-family:${EMAIL_FONT_STACK};font-size:11px;color:#52525b;text-align:center;">Foldera learns from every skip.</p>
        </td></tr>
        <tr><td style="padding-top:20px;text-align:center;border-top:1px solid rgba(255,255,255,0.08);">
          <p style="margin:0;font-family:${EMAIL_FONT_STACK};font-size:11px;color:#52525b;">Foldera — Finished work, every morning.</p>
          <p style="margin:10px 0 0 0;font-family:${EMAIL_FONT_STACK};font-size:10px;"><a href="${prefs}" style="color:#71717a;">Email preferences</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Sample directive for `/api/dev/email-preview` — mirrors a typical send_message brief. */
export const DEV_EMAIL_PREVIEW_SAMPLE_DIRECTIVE: DirectiveItem = {
  id: '00000000-0000-4000-8000-000000000001',
  directive:
    '79 days of silence with Cheryl Anderson requires reconnection before relationship becomes unrecoverable',
  action_type: 'send_message',
  confidence: 78,
  reason:
    'High-value contact drifted; a short check-in restores trust without pressure. [score=4.2]',
  artifact: {
    type: 'email',
    draft_type: 'email_compose',
    to: 'cheryl.anderson1@example.gov',
    subject: 'Quick question about administrative processes',
    body:
      "Hi Cheryl,\n\nI realize it's been a while since we last connected. I'm reaching out because I could use some guidance on navigating a few procedures, and I remember you being incredibly helpful with questions like this.\n\nWould you have a few minutes for a brief call this week?\n\nThanks,\nAlex",
  },
};

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
  const directive = directives[0] ? sanitizeDirectiveForDelivery(directives[0]) : null;
  const sanitizedNoSendDirective = directive && isNoSendDirective(directive)
    ? sanitizeNoSendDirective(directive)
    : null;
  const tags = [
    { name: 'email_type', value: 'daily_brief' },
    { name: 'user_id', value: userId },
    ...(directive?.id ? [{ name: 'action_id', value: directive.id }] : []),
  ];

  if (!directive || sanitizedNoSendDirective) {
    const html = buildDailyDirectiveEmailHtml({
      baseUrl,
      date,
      directive: sanitizedNoSendDirective,
    });
    return sendResendEmail({
      to,
      subject: NO_SEND_SUBJECT,
      html,
      tags,
    });
  }

  const rawSubject = subject ?? `Foldera: ${directive.directive.split(/\s+/).slice(0, 6).join(' ')}`;
  const emailSubject = sanitizePlainTextForDelivery(rawSubject) || 'Foldera: Daily brief update';
  const html = buildDailyDirectiveEmailHtml({ baseUrl, date, directive });
  return sendResendEmail({
    to,
    subject: emailSubject,
    html,
    tags,
  });
}

export async function sendProWelcomeEmail(to: string) {
  const baseUrl = (process.env.NEXTAUTH_URL ?? 'https://foldera.ai').replace(/\/$/, '');
  const html = renderDarkTransactionalEmailHtml({
    eyebrow: 'Foldera Pro',
    title: "You're on Foldera Pro.",
    bodyLines: [
      'Every morning directive now includes finished work.',
      "Approve and it's done.",
    ],
    ctaLabel: 'Open dashboard',
    ctaHref: `${baseUrl}/dashboard`,
  });
  return sendResendEmail({
    to,
    subject: "You're on Foldera Pro.",
    html,
    tags: [{ name: 'email_type', value: 'pro_welcome' }],
  });
}

export async function sendPaymentFailedEmail(to: string, billingPortalUrl: string) {
  const html = renderDarkTransactionalEmailHtml({
    eyebrow: 'Billing',
    title: "Your Foldera payment didn't go through.",
    bodyLines: [
      'Update your payment method to keep receiving finished work with your directives.',
    ],
    ctaLabel: 'Open billing portal',
    ctaHref: billingPortalUrl,
  });
  return sendResendEmail({
    to,
    subject: "Your Foldera payment didn't go through.",
    html,
    tags: [{ name: 'email_type', value: 'payment_failed' }],
  });
}
