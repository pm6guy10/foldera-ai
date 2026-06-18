/**
 * Provider-agnostic email attachment model + RFC 2822 message building.
 *
 * Attachments are how a Foldera send becomes the work itself, not a homework
 * note: the email carries the budget doc / forecast / memo the brain drafted,
 * with the evidence trail behind it. The content IS the artifact the generator
 * produced — never a fabricated external file. This module stays dependency-free
 * so the MIME construction is unit-testable without the google/graph/resend SDKs.
 */

import { randomBytes } from 'crypto';

export interface EmailAttachment {
  /** Display filename the recipient sees, e.g. "Q3-Budget.md". */
  filename: string;
  /** MIME type, e.g. "text/markdown", "text/csv", "application/pdf". */
  mime_type: string;
  /** UTF-8 text the brain drafted (text/* work products). */
  content?: string;
  /** Pre-encoded bytes (binary or already-base64). Takes precedence when set. */
  content_base64?: string;
}

/** Caps keep a single send sane: providers reject oversized bodies, and a review
 * surface that lists 40 files is noise, not a sign-off. */
export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5 MB each
export const MAX_TOTAL_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB combined

function cleanStr(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Strip header-breaking characters so a filename can never inject MIME headers. */
export function sanitizeAttachmentFilename(filename: string): string {
  const stripped = filename.replace(/[\r\n"]+/g, ' ').replace(/\s+/g, ' ').trim();
  return stripped.slice(0, 200) || 'attachment';
}

/** Base64 of the attachment bytes — from content_base64 when present, else UTF-8 text. */
export function attachmentToBase64(att: EmailAttachment): string {
  if (att.content_base64 && att.content_base64.trim()) {
    return att.content_base64.replace(/\s+/g, '');
  }
  return Buffer.from(att.content ?? '', 'utf8').toString('base64');
}

/** Decoded byte length of the attachment, used for the size caps. */
export function attachmentByteLength(att: EmailAttachment): number {
  if (att.content_base64 && att.content_base64.trim()) {
    return Buffer.from(att.content_base64.replace(/\s+/g, ''), 'base64').length;
  }
  return Buffer.byteLength(att.content ?? '', 'utf8');
}

/**
 * Validate + cap an untrusted attachment list (artifact JSON, edited drafts).
 * Drops entries without a filename, mime type, or any content; enforces the
 * per-file and total byte caps and the attachment count. Order is preserved.
 */
export function normalizeEmailAttachments(input: unknown): EmailAttachment[] {
  if (!Array.isArray(input)) return [];
  const out: EmailAttachment[] = [];
  let totalBytes = 0;

  for (const raw of input) {
    if (out.length >= MAX_ATTACHMENTS) break;
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    // A missing filename is dropped, never fabricated — only sanitized once we
    // know there is a real name to keep.
    const rawFilename = cleanStr(row.filename);
    const filename = rawFilename ? sanitizeAttachmentFilename(rawFilename) : '';
    const mimeType = cleanStr(row.mime_type) || cleanStr(row.mimeType);
    const content = typeof row.content === 'string' ? row.content : undefined;
    const contentBase64 =
      typeof row.content_base64 === 'string'
        ? row.content_base64
        : typeof row.contentBase64 === 'string'
          ? row.contentBase64
          : undefined;
    if (!filename || !mimeType) continue;
    if (!cleanStr(content) && !cleanStr(contentBase64)) continue;

    const att: EmailAttachment = {
      filename,
      mime_type: mimeType,
      ...(content ? { content } : {}),
      ...(contentBase64 ? { content_base64: contentBase64 } : {}),
    };

    const bytes = attachmentByteLength(att);
    if (bytes <= 0 || bytes > MAX_ATTACHMENT_BYTES) continue;
    if (totalBytes + bytes > MAX_TOTAL_ATTACHMENT_BYTES) continue;
    totalBytes += bytes;
    out.push(att);
  }

  return out;
}

/** Human-readable list of filenames for the review surface ("Q3-Budget.md, Forecast.csv"). */
export function describeAttachments(attachments: EmailAttachment[]): string {
  return attachments.map((att) => sanitizeAttachmentFilename(att.filename)).join(', ');
}

/** Slugify a document title into a safe download filename, e.g. "Q3 Budget" → "q3-budget.md". */
export function attachmentFilenameFromTitle(title: string, ext = 'md'): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${slug || 'document'}.${ext}`;
}

/**
 * Repackage a finished document the brain already drafted into a single file
 * attachment — no new model call, just the artifact's own content as a file the
 * recipient can forward/save. Returns [] when there is no real content to attach.
 */
export function deriveDocumentAttachment(
  title: string,
  content: string,
): EmailAttachment[] {
  if (!content || !content.trim()) return [];
  return normalizeEmailAttachments([
    {
      filename: attachmentFilenameFromTitle(title),
      mime_type: 'text/markdown',
      content,
    },
  ]);
}


/** Wrap a base64 payload at 76 chars per line (RFC 2045). */
function wrapBase64(value: string): string {
  return value.replace(/.{1,76}/g, '$&\r\n').trimEnd();
}

/**
 * Build a full RFC 2822 message string. With no attachments it is a single
 * text/plain part (byte-identical to the legacy path); with attachments it is a
 * multipart/mixed message with the body as the first part. The caller (Gmail)
 * base64url-encodes the result; Outlook/Resend use the structured helpers below.
 */
export function buildRfc2822Message(input: {
  to: string;
  subject: string;
  headers?: Array<{ name: string; value: string }>;
  body: string;
  attachments?: EmailAttachment[];
  /** Override the multipart boundary (tests only). */
  boundary?: string;
}): string {
  const headerLines: string[] = [`To: ${input.to}`, `Subject: ${input.subject}`];
  for (const header of input.headers ?? []) {
    if (header.value.trim()) headerLines.push(`${header.name}: ${header.value}`);
  }

  const attachments = input.attachments ?? [];
  if (attachments.length === 0) {
    return [...headerLines, 'Content-Type: text/plain; charset=UTF-8', '', input.body].join('\r\n');
  }

  const boundary = input.boundary ?? `=_foldera_${randomBytes(16).toString('hex')}`;
  const parts: string[] = [
    ...headerLines,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    input.body,
  ];

  for (const att of attachments) {
    const name = sanitizeAttachmentFilename(att.filename);
    parts.push(
      `--${boundary}`,
      `Content-Type: ${att.mime_type}; name="${name}"`,
      `Content-Disposition: attachment; filename="${name}"`,
      'Content-Transfer-Encoding: base64',
      '',
      wrapBase64(attachmentToBase64(att)),
    );
  }

  parts.push(`--${boundary}--`, '');
  return parts.join('\r\n');
}

/** Microsoft Graph fileAttachment objects for `sendMail`. */
export function toGraphAttachments(
  attachments: EmailAttachment[],
): Array<Record<string, unknown>> {
  return attachments.map((att) => ({
    '@odata.type': '#microsoft.graph.fileAttachment',
    name: sanitizeAttachmentFilename(att.filename),
    contentType: att.mime_type,
    contentBytes: attachmentToBase64(att),
  }));
}

/** Resend attachment objects ({ filename, content }) — content is base64. */
export function toResendAttachments(
  attachments: EmailAttachment[],
): Array<{ filename: string; content: string }> {
  return attachments.map((att) => ({
    filename: sanitizeAttachmentFilename(att.filename),
    content: attachmentToBase64(att),
  }));
}
