/**
 * Tokens that extractPersonNames() often mis-label as "people" from commitment /
 * relationship titles (verbs, UI labels, calendar/email headers). These must
 * not drive rejection_signal_detected / resolution / skip-streak matching in
 * filterInvalidContext — they produce massive false positives when matched
 * against rejection and feedback text.
 *
 * All entries are lowercase; matching is on the first word of a multi-word
 * "name" or the whole token for single-word extractions.
 */
export const VALIDITY_CONTEXT_ENTITY_STOPWORDS = new Set([
  // Verbs / task language from production false positives
  'reference',
  'complete',
  'available',
  'skipped',
  'from',
  'start',
  'last',
  'health',
  'clinical',
  'respond',
  'share',
  'send',
  'thank',
  'awaiting',
  'submitted',
  'applied',
  'maintain',
  'seek',
  'review',
  'working',
  'pursue',
  'fix',
  'submit',
  'apply',
  'confirm',
  'prepare',
  'register',
  'file',
  'discuss',
  'user',
  'follow',
  'draft',
  'reply',
  'schedule',
  'research',
  'write',
  'check',
  'option',
  'meeting',
  'project',
  'none',
  'decision',
  'document',
  // Calendar / email scaffolding
  'calendar',
  'email',
  'task',
  'invitation',
  'organizer',
  'subject',
  'body',
  'end',
  // Common promo / system nouns mis-extracted
  'payment',
  'financial',
  'personal',
  'automatic',
  'reactivate',
  'paid',
  'nothing',
  'reason',
  // Generic action / queue words from live invalid-context false positives
  'call',
  'open',
  'waiting',
  'phone',
  'interview',
  'hunt',
  'sent',
  'step',
]);

/**
 * Multi-word phrases can still look capitalized and person-like while actually
 * being role titles or job nouns. Any phrase containing one of these role-ish
 * tokens should not drive invalid-context rejection.
 */
export const VALIDITY_CONTEXT_NON_PERSON_PARTS = new Set([
  'analyst',
  'benefits',
  'care',
  'case',
  'coordinator',
  'developmental',
  'disabilities',
  'hiring',
  'manager',
  'resource',
  'role',
  'screen',
  'specialist',
  'supervisor',
  'technician',
]);

export function isValidPersonNameForValidityContext(name: string): boolean {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return false;
  const first = parts[0].toLowerCase();
  if (VALIDITY_CONTEXT_ENTITY_STOPWORDS.has(first)) return false;
  if (parts.length === 1) {
    const whole = name.toLowerCase();
    return !VALIDITY_CONTEXT_ENTITY_STOPWORDS.has(whole)
      && !VALIDITY_CONTEXT_NON_PERSON_PARTS.has(whole);
  }

  // Reject title-shaped phrases like "Care Coordinator" or
  // "Developmental Disabilities" before they can trip rejection history.
  if (parts.some((part) => VALIDITY_CONTEXT_NON_PERSON_PARTS.has(part.toLowerCase()))) return false;

  return true;
}

/**
 * Drop stopword "names" before rejection / resolution / historical-skip checks.
 */
export function filterPersonNamesForValidityContext(names: string[]): string[] {
  return names.filter((name) => isValidPersonNameForValidityContext(name));
}
