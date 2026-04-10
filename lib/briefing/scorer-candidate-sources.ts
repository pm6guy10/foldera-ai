/**
 * Pure helpers for which raw signals become scorer "signal" candidates
 * and when a commitment is anchored to a real mail thread (gmail/outlook).
 */

const CALENDAR_ONLY = new Set(['outlook_calendar', 'google_calendar']);

/** Signal rows from these sources never become standalone signal candidates (calendar noise, internal chat). */
export function isExcludedSignalSourceForScorerPool(source: string | null | undefined): boolean {
  const s = String(source ?? '').trim();
  if (!s) return false;
  if (CALENDAR_ONLY.has(s)) return true;
  return s === 'claude_conversation';
}

const MAIL_SIGNAL_SOURCES = new Set(['gmail', 'outlook']);

/** Commitment rows whose provenance is mail extraction and whose source_id resolves to a mail signal row. */
export function commitmentAnchoredToMailSignal(
  commitmentSource: string | null | undefined,
  commitmentSourceId: string | null | undefined,
  signalSourceBySignalRowId: Map<string, string>,
): boolean {
  const cs = String(commitmentSource ?? '').trim();
  if (cs !== 'signal_extraction' && cs !== 'email_analysis') return false;
  const sid = String(commitmentSourceId ?? '').trim();
  if (!sid) return false;
  const sigSrc = String(signalSourceBySignalRowId.get(sid) ?? '').trim();
  return MAIL_SIGNAL_SOURCES.has(sigSrc);
}
