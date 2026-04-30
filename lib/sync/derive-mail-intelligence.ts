/**
 * Derives response-pattern and calendar RSVP-avoidance signals after mail/calendar sync.
 * Inserts processed signals (no Haiku extraction pass).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { encrypt } from '@/lib/encryption';
import { bumpAttentionSalienceForEmails } from '@/lib/signals/entity-attention-runtime';
import { truncateSignalContent } from '@/lib/utils/signal-egress';

export function normalizeMailSubject(subject: string): string {
  let s = subject.replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 8; i++) {
    const next = s.replace(/^(re:|fwd?:|fw:)\s*/i, '').trim();
    if (next === s) break;
    s = next;
  }
  return s.toLowerCase();
}

/** Extract bare email from "Name <a@b.com>" or raw address. */
export function parsePrimaryEmail(raw: string): string {
  const m = raw.match(/<([^>]+)>/);
  const addr = (m?.[1] ?? raw).trim().toLowerCase();
  return addr.replace(/^mailto:/i, '');
}

export interface MailIntelMessage {
  id: string;
  isSent: boolean;
  fromRaw: string;
  toRaw: string;
  ccRaw: string;
  subject: string;
  dateMs: number;
  /** RFC 5322 Message-ID without brackets optional */
  messageId?: string;
  inReplyTo?: string;
  references?: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const REPLY_WINDOW_MS = 7 * MS_PER_DAY;
const UNREPLIED_MIN_MS = 3 * MS_PER_DAY;

function hash(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

function messageIdKey(id: string | undefined): string | null {
  if (!id) return null;
  return id.replace(/[<>]/g, '').trim().toLowerCase();
}

/**
 * For each received message in the batch, detect reply within 7d or unreplied ≥3d.
 */
export async function persistResponsePatternSignals(
  supabase: SupabaseClient,
  userId: string,
  source: 'gmail' | 'outlook',
  messages: MailIntelMessage[],
): Promise<number> {
  const received = messages.filter((m) => !m.isSent);
  const sent = messages.filter((m) => m.isSent);
  if (received.length === 0) return 0;

  const now = Date.now();
  let inserted = 0;

  for (const r of received) {
    const fromEmail = parsePrimaryEmail(r.fromRaw);
    const displayFrom = r.fromRaw.trim() || fromEmail || 'unknown';
    const subjShort = (r.subject || '(no subject)').slice(0, 120);
    const receivedKey = messageIdKey(r.messageId);
    const normSubj = normalizeMailSubject(r.subject || '');

    let replyMs: number | null = null;
    for (const s of sent) {
      if (s.dateMs <= r.dateMs) continue;
      if (s.dateMs - r.dateMs > REPLY_WINDOW_MS) continue;

      const sReply = (s.inReplyTo || '').toLowerCase();
      const sRefs = (s.references || '').toLowerCase();
      const hitById =
        receivedKey &&
        (sReply.includes(receivedKey) ||
          sRefs.split(/\s+/).some((t) => t && receivedKey && t.includes(receivedKey)));

      const normSent = normalizeMailSubject(s.subject || '');
      const toEmails = s.toRaw
        .toLowerCase()
        .match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) ?? [];
      const hitBySubject =
        normSubj.length > 0 &&
        normSent.length > 0 &&
        (normSent === normSubj || normSent === `re: ${normSubj}`) &&
        toEmails.some((e) => e === fromEmail || fromEmail.includes(e.split('@')[0] ?? ''));

      if (hitById || hitBySubject) {
        if (replyMs === null || s.dateMs < replyMs) {
          replyMs = s.dateMs;
        }
      }
    }

    const ageMs = now - r.dateMs;
    let line: string;
    let replyHours: number | null = null;
    if (replyMs !== null) {
      replyHours = Math.max(0, Math.round(((replyMs - r.dateMs) / 3600000) * 10) / 10);
      line = `${displayFrom} emailed "${subjShort}" on ${new Date(r.dateMs).toISOString().slice(0, 10)}. Response time: ${replyHours}h.`;
    } else if (ageMs >= UNREPLIED_MIN_MS) {
      const days = Math.floor(ageMs / MS_PER_DAY);
      line = `${displayFrom} emailed "${subjShort}" on ${new Date(r.dateMs).toISOString().slice(0, 10)}. No reply after ${days}d (unreplied thread).`;
    } else {
      continue;
    }

    const contentHash = hash(`response_pattern|${source}|${userId}|${r.id}`);
    const content = `Response pattern: ${line}`;

    const { error } = await supabase.from('tkg_signals').upsert(
      {
        user_id: userId,
        source,
        source_id: `response_pattern:${r.id}`,
        type: 'response_pattern',
      content: encrypt(truncateSignalContent(content)),
        content_hash: contentHash,
        author: 'foldera-derived',
        occurred_at: new Date(r.dateMs).toISOString(),
        processed: true,
      },
      { onConflict: 'user_id,content_hash', ignoreDuplicates: true },
    );

    if (!error) {
      inserted++;
      if (replyHours !== null && replyHours <= 48) {
        void bumpAttentionSalienceForEmails(supabase, userId, [fromEmail], 0.04, 0.72);
      }
    }
  }

  return inserted;
}

export interface CalendarAttendeeLite {
  email: string;
  responseStatus?: string;
}

export interface CalendarIntelEvent {
  id: string;
  summary: string;
  startIso: string;
  organizerEmail: string;
  selfEmailLower: string;
  attendees: CalendarAttendeeLite[];
  isRecurring: boolean;
  createdBySelf: boolean;
}

/**
 * Invited events where the user is an attendee but has not accepted/declined/tentatively responded.
 */
export async function persistCalendarRsvpAvoidanceSignals(
  supabase: SupabaseClient,
  userId: string,
  source: 'google_calendar' | 'outlook_calendar',
  events: CalendarIntelEvent[],
): Promise<number> {
  if (events.length === 0) return 0;
  let inserted = 0;

  for (const ev of events) {
    const self = ev.selfEmailLower;
    if (!self) continue;
    if (ev.createdBySelf) continue;
    const org = ev.organizerEmail.toLowerCase();
    if (org === self) continue;

    const me = ev.attendees.find((a) => a.email.toLowerCase() === self);
    if (!me) continue;
    const st = (me.responseStatus ?? '').toLowerCase();
    const responded = new Set([
      'accepted',
      'declined',
      'tentative',
      'tentativelyaccepted',
      'organizer',
    ]);
    if (responded.has(st)) continue;

    const startDay = ev.startIso ? ev.startIso.slice(0, 10) : '';
    const content = `Calendar decision avoidance: invited to "${ev.summary.slice(0, 120)}" (${startDay}) by ${ev.organizerEmail} — RSVP still pending. Recurring: ${ev.isRecurring ? 'yes' : 'no'}.`;
    const contentHash = hash(`calendar_rsvp_pending|${source}|${userId}|${ev.id}`);

    const { error } = await supabase.from('tkg_signals').upsert(
      {
        user_id: userId,
        source,
        source_id: `rsvp_pending:${ev.id}`,
        type: 'response_pattern',
      content: encrypt(truncateSignalContent(content)),
        content_hash: contentHash,
        author: 'foldera-derived',
        occurred_at: ev.startIso ? new Date(ev.startIso).toISOString() : new Date().toISOString(),
        processed: true,
      },
      { onConflict: 'user_id,content_hash', ignoreDuplicates: true },
    );

    if (!error) inserted++;
  }

  return inserted;
}
