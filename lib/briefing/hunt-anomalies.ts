/**
 * Deterministic "hunting" layer: absence and cross-signal patterns over decrypted mail/calendar signals.
 * Cannot run as raw SQL on tkg_signals.content (encrypted at rest).
 */

import { daysMs, MS_30D } from '@/lib/config/constants';

export type HuntFindingKind =
  | 'unreplied_inbound'
  | 'unresolved_financial'
  | 'commitment_calendar_gap'
  | 'reply_latency_degradation'
  | 'repeated_ignored_sender';

export interface HuntSignalInput {
  id: string;
  content: string;
  source: string;
  type: string;
  occurred_at: string;
  author: string | null;
}

export interface HuntCommitmentInput {
  id: string;
  description: string;
  due_at: string | null;
  implied_due_at: string | null;
}

export interface HuntFinding {
  kind: HuntFindingKind;
  /** Stable id for ScoredLoop */
  id: string;
  title: string;
  summary: string;
  suggestedActionType: 'send_message' | 'write_document' | 'schedule';
  entityName?: string;
  supportingSignalIds: string[];
  evidenceLines: string[];
  severity: number;
}

const MAIL_SOURCES = new Set(['gmail', 'outlook']);
const CALENDAR_SOURCES = new Set(['google_calendar', 'outlook_calendar']);

const FIN_INBOUND = [
  /\bstatement\b/i,
  /\binvoice\b/i,
  /\bpayment due\b/i,
  /\bbalance\b/i,
  /\bminimum payment\b/i,
  /\bamount due\b/i,
  /\bamerican express\b/i,
  /\bamex\b/i,
  /\bvisa\b/i,
  /\bmastercard\b/i,
  /\bautopay\b/i,
];

const DOLLAR_RE = /\$\s*[\d,]+(?:\.\d{2})?/;

const PAYMENT_SENT_CONFIRM = [
  /\bpaid\b/i,
  /\bpayment received\b/i,
  /\bthank you for (?:your )?payment\b/i,
  /\bpayment confirmation\b/i,
  /\bconfirmation number\b/i,
  /\bwe received your payment\b/i,
];

function parseEmailsFromHeaderLine(line: string | undefined): string[] {
  if (!line) return [];
  const out: string[] = [];
  const re = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    out.push(m[0].toLowerCase());
  }
  return out;
}

/** Product / test inboxes — never treat as a human peer for unreplied / ignored / latency hunt patterns. */
function isProductNoisePeerEmail(email: string): boolean {
  const domain = (email.split('@')[1] ?? '').toLowerCase();
  if (!domain) return false;
  if (domain === 'foldera.ai' || domain.endsWith('.foldera.ai')) return true;
  if (domain === 'resend.dev' || domain.endsWith('.resend.dev')) return true;
  if (domain === 'resend.com') return true;
  return false;
}

function peerIsSelfOrProductNoise(peer: string | undefined, selfEmails: Set<string> | undefined): boolean {
  if (!peer) return true;
  if (selfEmails && selfEmails.size > 0 && selfEmails.has(peer)) return true;
  if (isProductNoisePeerEmail(peer)) return true;
  return false;
}

/** Local-part patterns and known bulk domains — never treat as a hunt "ignored human peer". */
const BULK_MARKETING_EMAIL_PREFIXES = [
  'marketing@',
  'noreply@',
  'no-reply@',
  'donotreply@',
  'do-not-reply@',
  'notifications@',
  'newsletter@',
  'promotions@',
  'offers@',
  'deals@',
] as const;

const BULK_MARKETING_DOMAINS = new Set<string>([
  'mailchimp.com',
  'mailgun.org',
  'sendgrid.net',
  // Travel / booking transactional senders (not human financial obligations)
  'eg.expedia.com',
  'expedia.com',
  'eg.hotels.com',
  'hotels.com',
  'airbnb.com',
  'booking.com',
  'vrbo.com',
  'tripadvisor.com',
  // E-commerce / retail transactional
  'amazon.com',
  'amazon.co.uk',
  'ebay.com',
  'etsy.com',
  'shopify.com',
  // Food delivery
  'doordash.com',
  'ubereats.com',
  'grubhub.com',
  'email.tacobell.com',
  // Ride-sharing
  'uber.com',
  'lyft.com',
  'amazonses.com',
  'constantcontact.com',
  'ccsend.com',
  'rsgsv.net',
  'list-manage.com',
  'hubspot.com',
  'hubspotemail.net',
]);

/** Exported for unit tests. */
export function isBulkOrMarketingSender(email: string): boolean {
  const lower = email.trim().toLowerCase();
  if (!lower.includes('@')) return false;
  if (BULK_MARKETING_EMAIL_PREFIXES.some((p) => lower.startsWith(p))) return true;
  const domain = lower.split('@').pop() ?? '';
  if (BULK_MARKETING_DOMAINS.has(domain)) return true;
  return false;
}

/** Inbound row whose From resolves to the user's mailbox — not "someone waiting on your reply". */
function inboundFromSelf(fromEmails: string[], selfEmails: Set<string> | undefined): boolean {
  if (!fromEmails.length) return false;
  if (selfEmails && selfEmails.size > 0 && fromEmails.some((e) => selfEmails.has(e))) return true;
  return false;
}

function displayNameFromFromLine(fromLine: string | undefined): string | undefined {
  if (!fromLine) return undefined;
  const trimmed = fromLine.replace(/^from:\s*/i, '').trim();
  const lt = trimmed.indexOf('<');
  if (lt > 0) return trimmed.slice(0, lt).replace(/["']/g, '').trim();
  if (trimmed.includes('@')) {
    const local = trimmed.split('@')[0]?.replace(/[._]/g, ' ') ?? '';
    if (local.length >= 2) return local.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  return trimmed.slice(0, 80);
}

function parseSubject(content: string): string {
  const m = content.match(/(?:^|\n)Subject:\s*(.+?)(?:\n|$)/i);
  return (m?.[1] ?? '').trim();
}

function subjectStem(subj: string): string {
  return subj
    .replace(/^(re|fwd):\s*/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 6)
    .join(' ');
}

interface ParsedMail {
  id: string;
  occurredMs: number;
  direction: 'sent' | 'received';
  fromEmails: string[];
  toEmails: string[];
  subject: string;
  subjectStem: string;
  preview: string;
  source: string;
}

function parseMailRow(row: HuntSignalInput): ParsedMail | null {
  if (!MAIL_SOURCES.has(row.source)) return null;
  if (row.type !== 'email_sent' && row.type !== 'email_received') return null;
  const c = row.content;
  const isSent = /^\[Sent email:/im.test(c) || row.type === 'email_sent';
  const fromLine = c.match(/(?:^|\n)From:\s*(.+)/i)?.[1];
  const toLine = c.match(/(?:^|\n)To:\s*(.+)/i)?.[1];
  const subject = parseSubject(c);
  const t = new Date(row.occurred_at).getTime();
  if (Number.isNaN(t)) return null;

  const fromEmails = parseEmailsFromHeaderLine(fromLine) ?? [];
  const toEmails = parseEmailsFromHeaderLine(toLine) ?? [];
  if (isSent) {
    return {
      id: row.id,
      occurredMs: t,
      direction: 'sent',
      fromEmails: fromEmails.length ? fromEmails : ['self'],
      toEmails,
      subject,
      subjectStem: subjectStem(subject),
      preview: c.slice(0, 400),
      source: row.source,
    };
  }
  const authorEmail = row.author ? parseEmailsFromHeaderLine(row.author)[0] : undefined;
  const fe = fromEmails.length ? fromEmails : authorEmail ? [authorEmail] : [];
  return {
    id: row.id,
    occurredMs: t,
    direction: 'received',
    fromEmails: fe,
    toEmails,
    subject,
    subjectStem: subjectStem(subject),
    preview: c.slice(0, 400),
    source: row.source,
  };
}

interface CalendarParsed {
  id: string;
  occurredMs: number;
  title: string;
  text: string;
}

function parseCalendarRow(row: HuntSignalInput): CalendarParsed | null {
  if (!CALENDAR_SOURCES.has(row.source)) return null;
  if (row.type !== 'calendar_event') return null;
  const titleMatch = row.content.match(/\[Calendar event:\s*([^\]]+)\]/i);
  const title = (titleMatch?.[1] ?? '').trim();
  const t = new Date(row.occurred_at).getTime();
  if (Number.isNaN(t)) return null;
  return {
    id: row.id,
    occurredMs: t,
    title,
    text: `${title}\n${row.content}`.toLowerCase(),
  };
}

function keywordOverlap(a: string, b: string): number {
  const wa = new Set(
    a
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
  let n = 0;
  for (const w of b.toLowerCase().split(/\s+/)) {
    if (w.length > 3 && wa.has(w)) n++;
  }
  return n;
}

function median(nums: number[]): number {
  if (nums.length === 0) return NaN;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function emptyCounts(): Record<HuntFindingKind, number> {
  return {
    unreplied_inbound: 0,
    unresolved_financial: 0,
    commitment_calendar_gap: 0,
    reply_latency_degradation: 0,
    repeated_ignored_sender: 0,
  };
}

export function runHuntAnomalies(args: {
  signals: HuntSignalInput[];
  commitments: HuntCommitmentInput[];
  /** Auth + connected Google/Microsoft mailbox addresses — inbound From these must not count as unreplied/ignored/latency. */
  selfEmails?: Set<string>;
  /**
   * Sender emails already classified as newsletter/promo/junk by the entity_reality_gate.
   * Hunt findings from these senders are skipped — they are not real human threads.
   */
  blockedSenderEmails?: Set<string>;
  /**
   * Email addresses of known human entities (from tkg_entities with ≥1 verified interaction).
   * When provided, unreplied_inbound findings are restricted to senders in this set.
   * Prevents cold-outreach and bulk emails from winning as "unreplied human threads".
   */
  trustedSenderEmails?: Set<string>;
}): { findings: HuntFinding[]; countsByKind: Record<HuntFindingKind, number> } {
  const selfEmails = args.selfEmails;
  const blockedSenderEmails = args.blockedSenderEmails;
  const trustedSenderEmails = args.trustedSenderEmails;
  const counts = emptyCounts();
  const rawFindings: HuntFinding[] = [];

  const mails: ParsedMail[] = [];
  const calendars: CalendarParsed[] = [];

  for (const s of args.signals) {
    const m = parseMailRow(s);
    if (m) mails.push(m);
    const cal = parseCalendarRow(s);
    if (cal) calendars.push(cal);
  }

  const now = Date.now();
  const ms72h = daysMs(3); // 72 hours
  const window30 = MS_30D;
  const window120 = daysMs(120);

  // --- 1. Unreplied inbound (72h+) ---
  const received = mails.filter((m) => m.direction === 'received');
  const sent = mails.filter((m) => m.direction === 'sent');

  const unrepliedByThread = new Map<string, HuntFinding>();
  for (const r of received) {
    if (now - r.occurredMs < ms72h) continue;
    const peer = r.fromEmails[0];
    if (peerIsSelfOrProductNoise(peer, selfEmails) || inboundFromSelf(r.fromEmails, selfEmails)) continue;
    if (peer && isBulkOrMarketingSender(peer)) continue;
    if (peer && blockedSenderEmails?.has(peer)) continue;
    // Require sender to be a known human entity — prevents cold-outreach and bulk emails
    // from winning as unreplied threads. If trustedSenderEmails is provided, skip any
    // sender not in the set (they are not established correspondents).
    if (trustedSenderEmails && trustedSenderEmails.size > 0 && peer && !trustedSenderEmails.has(peer)) continue;

    let replied = false;
    for (const se of sent) {
      if (se.occurredMs <= r.occurredMs) continue;
      const toHit = se.toEmails.some((e) => e === peer);
      const stemHit =
        r.subjectStem.length >= 6 &&
        se.subjectStem.length >= 6 &&
        (se.subjectStem.includes(r.subjectStem.slice(0, 12)) ||
          r.subjectStem.includes(se.subjectStem.slice(0, 12)));
      if (toHit || stemHit) {
        replied = true;
        break;
      }
    }
    if (replied) continue;

    counts.unreplied_inbound++;
    const who = displayNameFromFromLine(
      args.signals.find((x) => x.id === r.id)?.content.match(/(?:^|\n)From:\s*(.+)/i)?.[1],
    );
    const daysAgo = Math.round((now - r.occurredMs) / daysMs(1));
    const f: HuntFinding = {
      kind: 'unreplied_inbound',
      id: `hunt_unreplied_${r.id}`,
      title: `Inbound email unanswered ${daysAgo}+ days — ${r.subject.slice(0, 60) || 'no subject'}`,
      summary: `${who ?? peer} sent "${r.subject || '(no subject)'}" on ${new Date(r.occurredMs).toISOString().slice(0, 10)}; no matching outbound reply found in synced sent mail after that message (${daysAgo} days ago).`,
      suggestedActionType: 'send_message',
      entityName: who,
      supportingSignalIds: [r.id],
      evidenceLines: [
        `Signal ${r.id}: received from ${peer}, subject: ${r.subject}`,
        r.preview.replace(/\s+/g, ' ').slice(0, 280),
      ],
      severity: 80 + Math.min(15, Math.floor(daysAgo / 7)),
    };
    const dedupeKey = `${peer}|${r.subjectStem || r.subject.slice(0, 40)}`;
    const prev = unrepliedByThread.get(dedupeKey);
    if (!prev || f.severity > prev.severity) unrepliedByThread.set(dedupeKey, f);
  }
  rawFindings.push(...[...unrepliedByThread.values()].sort((a, b) => b.severity - a.severity).slice(0, 18));

  // --- 2. Unresolved financial (30d) ---
  const finDomainBuckets = new Map<string, { ids: string[]; lines: string[]; subjects: string[] }>();
  for (const r of received) {
    if (inboundFromSelf(r.fromEmails, selfEmails)) continue;
    if (now - r.occurredMs > window30) continue;
    const finPeer = r.fromEmails[0];
    // Skip bulk/blocked senders — their financial emails are transactional, not open loops
    if (finPeer && isBulkOrMarketingSender(finPeer)) continue;
    if (finPeer && blockedSenderEmails?.has(finPeer)) continue;
    // Require sender to be a known human/entity correspondent — prevents transactional emails
    // (travel bookings, meal kits, retailer receipts) from winning as unresolved financial obligations.
    // Real financial obligations (invoices, rent, client billing) come from known correspondents.
    if (trustedSenderEmails && trustedSenderEmails.size > 0 && finPeer && !trustedSenderEmails.has(finPeer)) continue;
    const text = r.preview.toLowerCase();
    const finHit = FIN_INBOUND.some((re) => re.test(text)) || DOLLAR_RE.test(r.preview);
    if (!finHit) continue;
    const domain = r.fromEmails[0]?.split('@')[1] ?? 'unknown';
    const b = finDomainBuckets.get(domain) ?? { ids: [], lines: [], subjects: [] };
    if (!b.ids.includes(r.id)) {
      b.ids.push(r.id);
      b.lines.push(r.preview.replace(/\s+/g, ' ').slice(0, 220));
      b.subjects.push(r.subject);
    }
    finDomainBuckets.set(domain, b);
  }

  for (const [domain, bucket] of finDomainBuckets) {
    if (bucket.ids.length < 1) continue;
    let confirmingSent = false;
    for (const se of sent) {
      if (now - se.occurredMs > window30) continue;
      const body = args.signals.find((x) => x.id === se.id)?.content ?? '';
      const confirm = PAYMENT_SENT_CONFIRM.some((re) => re.test(body));
      if (!confirm) continue;
      const toDomain = se.toEmails.map((e) => e.split('@')[1]).filter(Boolean);
      if (toDomain.includes(domain) || bucket.subjects.some((subj) => subj && body.toLowerCase().includes(subj.toLowerCase().slice(0, 12)))) {
        confirmingSent = true;
        break;
      }
    }
    if (confirmingSent) continue;
    if (bucket.ids.length < 2 && !DOLLAR_RE.test(bucket.lines.join(' '))) continue;

    counts.unresolved_financial++;
    rawFindings.push({
      kind: 'unresolved_financial',
      id: `hunt_financial_${domain.replace(/\W/g, '_').slice(0, 40)}_${bucket.ids[0]}`,
      title: `Financial mail from @${domain} with no payment-confirmation sent in 30 days`,
      summary: `${bucket.ids.length} financial-pattern inbound message(s) from @${domain} in the last 30 days; no synced sent mail shows a payment confirmation to that counterparty in the same window.`,
      suggestedActionType: 'write_document',
      supportingSignalIds: bucket.ids.slice(0, 8),
      evidenceLines: bucket.lines.slice(0, 5),
      severity: 75 + bucket.ids.length * 5,
    });
  }

  // --- 3. Commitment due in 14d without calendar mention ---
  const horizon14 = now + daysMs(14);
  for (const c of args.commitments) {
    const dueRaw = c.due_at || c.implied_due_at;
    if (!dueRaw) continue;
    const dueMs = new Date(dueRaw).getTime();
    if (Number.isNaN(dueMs) || dueMs < now || dueMs > horizon14) continue;

    const desc = c.description ?? '';
    const descKeywords = desc
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 4)
      .slice(0, 8);

    let bestOverlap = 0;
    let bestCal: CalendarParsed | null = null;
    let nearestCal: CalendarParsed | null = null;
    let nearestDt = Infinity;
    for (const cal of calendars) {
      if (cal.occurredMs < now - daysMs(1) || cal.occurredMs > dueMs + daysMs(2)) continue;
      const overlap = keywordOverlap(desc, cal.title + ' ' + cal.text);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestCal = cal;
      }
      const dt = Math.abs(cal.occurredMs - dueMs);
      if (dt < nearestDt) {
        nearestDt = dt;
        nearestCal = cal;
      }
    }
    if (bestOverlap >= 2) continue;

    counts.commitment_calendar_gap++;
    const calContextIds: string[] = [];
    if (nearestCal) calContextIds.push(nearestCal.id);
    rawFindings.push({
      kind: 'commitment_calendar_gap',
      id: `hunt_calgap_${c.id}`,
      title: `Commitment due ${new Date(dueMs).toISOString().slice(0, 10)} with no matching calendar block`,
      summary: `Open commitment "${desc.slice(0, 100)}" has due ${new Date(dueMs).toISOString().slice(0, 10)} within 14 days; no calendar event in the synced window shows ≥2 keyword overlaps with the commitment text.`,
      suggestedActionType: 'schedule',
      supportingSignalIds: calContextIds,
      evidenceLines: [
        `Commitment id ${c.id}: ${desc.slice(0, 200)}`,
        nearestCal
          ? `Nearest calendar event (by time): "${nearestCal.title}" — keyword overlap with commitment was only ${bestOverlap}`
          : 'No calendar events in the due window in synced data',
      ],
      severity: 78,
    });
  }

  // --- 4. Reply latency degradation ---
  const byPeer = new Map<string, ParsedMail[]>();
  for (const m of mails) {
    const key =
      m.direction === 'received'
        ? m.fromEmails[0]
        : m.toEmails[0];
    if (!key || peerIsSelfOrProductNoise(key, selfEmails)) continue;
    if (isBulkOrMarketingSender(key)) continue;
    if (blockedSenderEmails?.has(key)) continue;
    if (!byPeer.has(key)) byPeer.set(key, []);
    byPeer.get(key)!.push(m);
  }

  for (const [peer, list] of byPeer) {
    if (list.length < 8) continue;
    const sorted = [...list].sort((a, b) => a.occurredMs - b.occurredMs);
    const latenciesRecent: number[] = [];
    const latenciesBase: number[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const cur = sorted[i]!;
      if (cur.direction !== 'received') continue;
      const age = now - cur.occurredMs;
      const window = age <= window30 ? 'recent' : age <= window120 ? 'base' : 'skip';
      if (window === 'skip') continue;

      let nextSent: ParsedMail | undefined;
      for (let j = i + 1; j < sorted.length; j++) {
        const cand = sorted[j]!;
        if (cand.direction === 'sent' && cand.toEmails.includes(peer)) {
          nextSent = cand;
          break;
        }
      }
      if (!nextSent) continue;
      const hrs = (nextSent.occurredMs - cur.occurredMs) / 3600000;
      if (hrs < 0 || hrs > 24 * 60) continue;
      if (window === 'recent') latenciesRecent.push(hrs);
      else latenciesBase.push(hrs);
    }

    if (latenciesRecent.length < 2 || latenciesBase.length < 2) continue;
    const medR = median(latenciesRecent);
    const medB = median(latenciesBase);
    if (!Number.isFinite(medR) || !Number.isFinite(medB) || medB < 4) continue;
    if (medR < medB * 2) continue;

    counts.reply_latency_degradation++;
    const display = peer.split('@')[0]?.replace(/[._]/g, ' ') ?? peer;
    rawFindings.push({
      kind: 'reply_latency_degradation',
      id: `hunt_latency_${peer.replace(/\W/g, '_').slice(0, 48)}`,
      title: `Slower replies to ${display} recently vs prior baseline`,
      summary: `Median hours from their inbound mail to your sent reply: ${medR.toFixed(1)}h in the last 30 days vs ${medB.toFixed(1)}h in the 31–120 day baseline (${latenciesRecent.length} vs ${latenciesBase.length} samples).`,
      suggestedActionType: 'write_document',
      entityName: display.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      supportingSignalIds: sorted.slice(-6).map((x) => x.id),
      evidenceLines: [`Peer: ${peer}`, `median_recent_h=${medR.toFixed(1)}`, `median_baseline_h=${medB.toFixed(1)}`],
      severity: 70 + Math.min(20, medR - medB),
    });
  }

  // --- 5. Repeated ignored sender (3+ in 30d, 0 outbound) ---
  const inboundBySender = new Map<string, ParsedMail[]>();
  for (const r of received) {
    const k = r.fromEmails[0];
    if (!k || peerIsSelfOrProductNoise(k, selfEmails) || inboundFromSelf(r.fromEmails, selfEmails)) continue;
    if (isBulkOrMarketingSender(k)) continue;
    if (blockedSenderEmails?.has(k)) continue;
    if (!inboundBySender.has(k)) inboundBySender.set(k, []);
    inboundBySender.get(k)!.push(r);
  }

  for (const [sender, arr] of inboundBySender) {
    if (isBulkOrMarketingSender(sender)) continue;
    const recent = arr.filter((m) => now - m.occurredMs <= window30);
    if (recent.length < 3) continue;
    const outboundToSender = sent.filter(
      (se) => se.occurredMs >= now - window30 && se.toEmails.includes(sender),
    );
    if (outboundToSender.length > 0) continue;

    counts.repeated_ignored_sender++;
    const who = displayNameFromFromLine(
      args.signals.find((x) => x.id === recent[0]!.id)?.content.match(/(?:^|\n)From:\s*(.+)/i)?.[1],
    );
    rawFindings.push({
      kind: 'repeated_ignored_sender',
      id: `hunt_ignored_${sender.replace(/\W/g, '_').slice(0, 40)}`,
      title: `${recent.length} inbound emails from same sender in 30 days — zero replies synced`,
      summary: `${who ?? sender} sent ${recent.length} inbound messages in the last 30 days; synced sent mail shows no outbound to that address in the same window.`,
      suggestedActionType: 'send_message',
      entityName: who,
      supportingSignalIds: recent.map((x) => x.id).slice(0, 8),
      evidenceLines: recent.map((x) => `${x.subject} (${new Date(x.occurredMs).toISOString().slice(0, 10)})`).slice(0, 5),
      severity: 85 + recent.length,
    });
  }

  rawFindings.sort((a, b) => b.severity - a.severity);
  const findings = rawFindings.slice(0, 12);

  return { findings, countsByKind: counts };
}

export function huntFindingToScoredLoopContent(f: HuntFinding): string {
  return [
    'HUNT_ANOMALY_FINDING',
    `Kind: ${f.kind}`,
    `Title: ${f.title}`,
    `Summary: ${f.summary}`,
    'Evidence:',
    ...f.evidenceLines.map((l) => `- ${l}`),
  ].join('\n');
}
