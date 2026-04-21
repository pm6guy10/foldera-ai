/**
 * Pure helpers for which raw signals become scorer "signal" candidates
 * and when a commitment is anchored to a real mail thread (gmail/outlook).
 */

const CALENDAR_ONLY = new Set(['outlook_calendar', 'google_calendar']);
const INTERNAL_FEEDBACK_ONLY = new Set(['user_feedback']);
const CHAT_ONLY = new Set(['claude_conversation', 'chatgpt_conversation', 'conversation_ingest']);

/** Signal rows from these sources never become standalone signal candidates (calendar noise, internal chat). */
export function isExcludedSignalSourceForScorerPool(source: string | null | undefined): boolean {
  const s = String(source ?? '').trim();
  if (!s) return false;
  if (CALENDAR_ONLY.has(s)) return true;
  if (INTERNAL_FEEDBACK_ONLY.has(s)) return true;
  return CHAT_ONLY.has(s);
}

export function isChatConversationSignalSource(
  source: string | null | undefined,
  type?: string | null | undefined,
): boolean {
  const s = String(source ?? '').trim().toLowerCase();
  const t = String(type ?? '').trim().toLowerCase();
  return CHAT_ONLY.has(s) || t.includes('conversation');
}

export function getSignalSourceAuthorityTier(
  source: string | null | undefined,
  type?: string | null | undefined,
): 'high' | 'low' | 'lowest' {
  const s = String(source ?? '').trim().toLowerCase();
  const t = String(type ?? '').trim().toLowerCase();

  if (isChatConversationSignalSource(s, t)) return 'lowest';
  if (
    s.includes('gmail') ||
    s.includes('outlook') ||
    s.includes('calendar') ||
    s.includes('drive') ||
    s.includes('onedrive') ||
    s.includes('uploaded') ||
    t.includes('calendar') ||
    t.includes('file')
  ) {
    return 'high';
  }
  return 'low';
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
