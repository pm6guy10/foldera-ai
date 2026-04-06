/**
 * Sender reputation blocklist for the generation pipeline.
 *
 * Identifies automated/marketing senders whose signals should be excluded from
 * LLM context during directive generation. Signals are NOT deleted from the DB —
 * they remain for audit and extraction history. This filter applies only at
 * context-assembly time inside fetchWinnerSignalEvidence.
 *
 * Design rules:
 * - Block by prefix pattern OR exact address, never by blanket domain ownership.
 *   An Amazon customer service rep replying to a charge dispute is NOT blocked.
 *   Only known automated/noreply address patterns are blocked.
 * - governmentjobs.com: only noreply@governmentjobs.com is blocked.
 *   yadira.clapper@hca.wa.gov (a real person at a gov agency) passes through.
 * - LinkedIn: job-alert wrappers, group notifications, InMail notification
 *   wrappers are blocked. A personal linkedin.com address is not blocked.
 */

/** Exact email address blocks (case-insensitive, matched after extraction). */
const BLOCKED_EXACT: Set<string> = new Set([
  'brief@foldera.ai',
  'noreply@foldera.ai',
  'onboarding@resend.dev',
  'noreply@governmentjobs.com',
  'jobs-noreply@linkedin.com',
  'groups-noreply@linkedin.com',
  'messages-noreply@linkedin.com',
]);

/**
 * Pattern-based blocks applied against the full author string (which may
 * include a display name and angle-bracket email, e.g. "Bass Pro <noreply@basspro.com>").
 *
 * Patterns are specific — prefer matching known address structures over entire
 * domains so that real human emails at the same domain pass through.
 */
const BLOCKED_PATTERNS: RegExp[] = [
  // Generic noreply/automated prefixes (any domain)
  /(?:^|[<\s])(?:noreply|no-reply|donotreply|do-not-reply|auto-confirm|auto-reply|mailer-daemon)@/i,
  // Generic role/batch addresses that appear in marketing stacks
  /(?:^|[<\s])(?:newsletter|marketing|promotions?|deals?|offers?|alerts?|campaigns?|updates?)@/i,
  // Amazon automated — specific order/shipment/confirmation senders only
  /(?:^|[<\s])(?:order-update|shipment-tracking|auto-confirm|ship-confirm|no-reply|returns?)@amazon\.com/i,
  /(?:^|[<\s])[^@\s<]*@marketplace\.amazon\.com/i,
  // AmazonSES infrastructure relay addresses
  /@[a-z0-9.-]*amazonses\.com/i,
  // Nespresso marketing domain
  /@email\.nespresso\.com/i,
  // Facebook/Meta automated notifications
  /@facebookmail\.com/i,
  // Glassdoor automated (noreply only — recruiters at glassdoor.com are real people)
  /(?:^|[<\s])noreply@glassdoor\.com/i,
  // Indeed automated
  /(?:^|[<\s])(?:donotreply|noreply|jobs-listings|automated)@indeed\.com/i,
  // Gemini/Google newsletter domain
  /@news\.gemini\.com/i,
  // Webull marketing
  /@(?:email\.|marketing\.)?webull\.com/i,
  // Hotels.com automated
  /@(?:email\.|notifications?\.)?hotels\.com/i,
  // EveryPlate marketing
  /@(?:email\.|marketing\.)?everyplate\.com/i,
  // Thinkific marketing
  /@(?:email\.|marketing\.)?thinkific\.com/i,
  // Bass Pro automated
  /@(?:email\.|marketing\.)?basspro\.com/i,
  // Gateway Pundit newsletters
  /@thegatewaypundit\.com/i,
  // Known bulk-send ESP sender domains (when they appear as the From address,
  // not as relay infrastructure — e.g. "newsletter@mailchimp.com")
  /(?:^|[<\s])[^@\s<]+@(?:mailchimp\.com|sendgrid\.net|constantcontact\.com|klaviyo\.com|marketo\.com|brevo\.com)/i,
];

/**
 * Returns true if the given author string identifies a known marketing,
 * automated, or noreply sender that should be excluded from generation context.
 *
 * Accepts the raw `author` field from tkg_signals — may be a plain email
 * address, a display name, or "Display Name <email@domain.com>" format.
 */
export function isBlockedSender(author: string | null | undefined): boolean {
  if (!author) return false;
  const lower = author.toLowerCase().trim();

  // Extract the email from "Display Name <email>" format for exact lookups.
  const angleMatch = lower.match(/<([^>]+)>/);
  const email = angleMatch ? angleMatch[1].trim() : lower;

  if (BLOCKED_EXACT.has(email)) return true;

  return BLOCKED_PATTERNS.some((p) => p.test(lower));
}
