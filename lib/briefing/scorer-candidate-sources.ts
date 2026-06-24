/**
 * Pure helpers for which raw signals become scorer "signal" candidates
 * and when a commitment is anchored to a real mail thread (gmail/outlook).
 */

import type { GenerationCandidateSource } from './types';

/** Window (ms) within which the user's own activity is still "in flight" and advanceable. */
export const OWN_ACTIVITY_RECENCY_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Own-activity signal classes (Rung 1 — advance what the user has started):
 *   - sent mail        (`type = 'email_sent'`)
 *   - drive file edits (`type = 'file_modified'`, source `drive`)
 * These are authored by the user, so they have no external counterparty entity.
 */
export function isOwnActivitySignalType(
  type: string | null | undefined,
  source?: string | null | undefined,
): boolean {
  const t = String(type ?? '').trim().toLowerCase();
  if (t === 'email_sent') return true;
  if (t === 'file_modified') {
    const s = String(source ?? '').trim().toLowerCase();
    // file_modified spans uploads/imports; restrict the own-activity carve-out to drive edits.
    return s.includes('drive');
  }
  return false;
}

/**
 * True when `sourceSignals` carry a recent (≤7d) own-activity signal class.
 * Pure — used by both the scorer gate carve-outs and the generator winner detector.
 */
export function sourceSignalsHaveRecentOwnActivity(
  sourceSignals: ReadonlyArray<Pick<GenerationCandidateSource, 'signalType' | 'source' | 'occurredAt'>> | undefined,
  now: number = Date.now(),
): boolean {
  if (!sourceSignals || sourceSignals.length === 0) return false;
  return sourceSignals.some((s) => {
    if (!isOwnActivitySignalType(s.signalType, s.source)) return false;
    const occurredAt = s.occurredAt ? new Date(s.occurredAt).getTime() : NaN;
    if (!Number.isFinite(occurredAt)) return false;
    return now - occurredAt <= OWN_ACTIVITY_RECENCY_MS;
  });
}

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
