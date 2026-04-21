/**
 * Heuristics to exclude transactional / automated inbound email from counts
 * where a human reply is implied (e.g. behavioral avoidance in discrepancy-detector).
 */

/** Known high-volume transactional domains — extend as needed; applies to all users. */
export const AUTOMATED_TRANSACTIONAL_EMAIL_DOMAINS: readonly string[] = [
  'venmo.com',
  'americanexpress.com',
  'chase.com',
  'spectrumemails.com',
  'teladochealth.com',
];

const FROM_LINE_RE = /^From:\s*(.+)$/im;
const SUBJECT_LINE_RE = /^Subject:\s*(.+)$/im;

/** Substrings in the From line or local part that indicate no human reply is expected. */
const AUTOMATED_FROM_SUBSTRINGS = [
  'noreply',
  'no-reply',
  'donotreply',
  'alerts',
  'notification',
  'notifications',
  'welcome',
  'newsletter',
  'mailer',
  'dmarc aggregate report',
] as const;

/** Subject-line cues for machine-generated compliance / routing reports. */
const AUTOMATED_SUBJECT_PATTERNS = [
  /\bdmarc\s+aggregate\s+report\b/i,
  /\breport domain:\b.*\bsubmitter:\b/i,
] as const;

/** Narrow booking / verification flows that look human but are machine-generated. */
const AUTOMATED_BOOKING_VERIFICATION_PATTERNS = [
  /\bverify\s+your\s+email\s+address\b/i,
  /\bverification\s+code\b/i,
  /\bmicrosoft\s+bookings\b/i,
  /\bbookings\s+page\b/i,
  /\bautomatically-generated\s+message\b/i,
] as const;

function extractEmailFromFromLine(fromLine: string): string | null {
  const angle = fromLine.match(/<([^>\s]+@[^>\s]+)>/);
  if (angle) return angle[1].toLowerCase().trim();
  const bare = fromLine.match(
    /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+)\b/,
  );
  return bare ? bare[1].toLowerCase().trim() : null;
}

function domainMatchesList(domain: string, list: readonly string[]): boolean {
  const d = domain.toLowerCase();
  return list.some((entry) => d === entry || d.endsWith('.' + entry));
}

/**
 * First `From:` line from signal content (Gmail/Outlook sync format).
 */
export function extractFromLineFromSignalContent(content: string): string | null {
  const m = content.match(FROM_LINE_RE);
  return m ? m[1].trim() : null;
}

function extractSubjectLineFromSignalContent(content: string): string | null {
  const m = content.match(SUBJECT_LINE_RE);
  return m ? m[1].trim() : null;
}

/**
 * True when this inbound signal is very likely automated/transactional — exclude from
 * "inbound expecting reply" style metrics. If From is missing, returns false.
 */
export function isLikelyAutomatedTransactionalInbound(content: string): boolean {
  const fromLine = extractFromLineFromSignalContent(content);
  if (!fromLine) return false;

  const lower = fromLine.toLowerCase();
  for (const sub of AUTOMATED_FROM_SUBSTRINGS) {
    if (lower.includes(sub)) return true;
  }

  const email = extractEmailFromFromLine(fromLine);
  const subjectLine = extractSubjectLineFromSignalContent(content) ?? '';
  if (AUTOMATED_SUBJECT_PATTERNS.some((pattern) => pattern.test(subjectLine))) {
    return true;
  }
  if (
    /\bverify\s+your\s+email\s+address\b/i.test(subjectLine) &&
    AUTOMATED_BOOKING_VERIFICATION_PATTERNS.filter((pattern) => pattern.test(content)).length >= 2
  ) {
    return true;
  }

  if (!email) return false;

  const at = email.lastIndexOf('@');
  if (at <= 0 || at >= email.length - 1) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (/(?:^|[-_.])dmarc(?:$|[-_.]|report)/i.test(local)) return true;
  return domainMatchesList(domain, AUTOMATED_TRANSACTIONAL_EMAIL_DOMAINS);
}
