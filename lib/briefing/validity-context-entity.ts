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
]);

/**
 * Drop stopword "names" before rejection / resolution / historical-skip checks.
 */
export function filterPersonNamesForValidityContext(names: string[]): string[] {
  return names.filter((name) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return false;
    const first = parts[0].toLowerCase();
    if (VALIDITY_CONTEXT_ENTITY_STOPWORDS.has(first)) return false;
    if (parts.length === 1 && VALIDITY_CONTEXT_ENTITY_STOPWORDS.has(name.toLowerCase())) return false;
    return true;
  });
}
