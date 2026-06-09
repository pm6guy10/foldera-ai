export type TrustClass = 'trusted' | 'junk' | 'transactional' | 'personal' | 'unclassified';

export interface EntityTrustContext {
  displayName?: string | null;
  company?: string | null;
  selfEmails?: Iterable<string> | null;
  /**
   * True when the user has written TO this person (email_sent recipient).
   * Outbound correspondence is the only free signal strong enough to mark a
   * relationship as a real working one — inbound volume alone is not.
   */
  hasOutboundEvidence?: boolean;
  /** Relationship label from LLM extraction: work | personal | automated. */
  relationship?: string | null;
}

const TRANSACTIONAL_EMAIL_PATTERNS = [
  /(?:^|@)(?:no-?reply|noreply|do-?not-?reply|donotreply)\b/i,
  /\bonboarding@resend\.(?:dev|com)\b/i,
  /@resend\.(?:dev|com)\b/i,
  /@(?:updates\.|jobs\.)?wellfound\.com\b/i,
  /@(?:notifications\.|team\.)?cursor\.(?:com|sh)\b/i,
  /(?:dmarc|security|alerts?|alert|receipts?|billing|notifications?|verify|verification|welcome|support|admin)@microsoft\.com\b/i,
];

const TRANSACTIONAL_TEXT_PATTERNS = [
  /\b(?:resend|wellfound|cursor)\b/i,
  /\b(?:team|security|alert|receipt|billing|notification|verification|verify|welcome|support|admin|dmarc)\b/i,
];

const SYSTEM_NAME_PATTERNS = [
  /\b(?:resend|wellfound|cursor)\b/i,
  /\bmicrosoft\b.*\b(?:security|alert|receipt|notification|dmarc|support|billing|admin)\b/i,
  /\b(?:no-?reply|noreply|notifications?|receipts?|alerts?|billing|security|support|verification|onboarding)\b/i,
];

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

function uniqueEmails(emails: Iterable<string | null | undefined>): string[] {
  return [...new Set([...emails].map(normalizeEmail).filter(Boolean))];
}

export function detectSystemSenderReason(input: {
  email?: string | null;
  displayName?: string | null;
  company?: string | null;
  selfEmails?: Iterable<string> | null;
}): string | null {
  const email = normalizeEmail(input.email);
  const displayName = (input.displayName ?? '').trim().toLowerCase();
  const company = (input.company ?? '').trim().toLowerCase();
  const selfEmails = new Set(uniqueEmails(input.selfEmails ?? []));

  if (email && selfEmails.has(email)) {
    return 'self_alias';
  }

  if (email && TRANSACTIONAL_EMAIL_PATTERNS.some((pattern) => pattern.test(email))) {
    return 'system_sender_email';
  }

  const textBlob = [displayName, company].filter(Boolean).join(' ');
  if (textBlob && SYSTEM_NAME_PATTERNS.some((pattern) => pattern.test(textBlob))) {
    return 'system_sender_name';
  }

  if (
    email &&
    TRANSACTIONAL_TEXT_PATTERNS.some((pattern) => pattern.test(email)) &&
    SYSTEM_NAME_PATTERNS.some((pattern) => pattern.test(textBlob || email))
  ) {
    return 'system_sender_mixed';
  }

  return null;
}

export function isEntitySystemSenderLike(input: {
  email?: string | null;
  displayName?: string | null;
  company?: string | null;
  selfEmails?: Iterable<string> | null;
}): boolean {
  return detectSystemSenderReason(input) != null;
}

export function classifyEntityTrustClass(
  email: string | null | undefined,
  totalInteractions: number,
  context: EntityTrustContext = {},
): TrustClass {
  const normalizedEmail = normalizeEmail(email);
  const systemReason = detectSystemSenderReason({
    email: normalizedEmail,
    displayName: context.displayName,
    company: context.company,
    selfEmails: context.selfEmails,
  });
  if (systemReason) {
    return 'transactional';
  }

  if (/noreply|no-reply|donotreply|newsletter|marketing/.test(normalizedEmail)) {
    return 'transactional';
  }

  if (context.relationship === 'automated') {
    return 'transactional';
  }

  if (context.relationship === 'personal') {
    return 'personal';
  }

  // Trust is earned by outbound correspondence, never by inbound volume.
  // Any inbox is full of senders the user never chose; only "the user wrote
  // to this person" separates a working relationship from noise.
  if (context.hasOutboundEvidence) {
    return 'trusted';
  }

  // No outbound evidence: we simply don't know yet. `junk` is reserved for
  // positive bulk-sender evidence at the signal level — a zero-interaction
  // passive mention (Notion, chat ingest) must not be branded junk forever.
  return 'unclassified';
}

// Lower number wins on merge. `personal` outranks `trusted` so a family
// member or friend the user replies to (outbound evidence) stays personal —
// replying to your wife's friend does not make her a work entity.
const TRUST_CLASS_PRIORITY: Record<TrustClass, number> = {
  transactional: 0,
  junk: 1,
  personal: 2,
  trusted: 3,
  unclassified: 4,
};

export function mergeTrustClass(
  existing: TrustClass | null | undefined,
  incoming: TrustClass,
): TrustClass {
  const current: TrustClass = existing ?? 'unclassified';
  return TRUST_CLASS_PRIORITY[incoming] < TRUST_CLASS_PRIORITY[current] ? incoming : current;
}
