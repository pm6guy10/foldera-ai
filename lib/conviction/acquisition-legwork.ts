/**
 * Acquisition legwork — "card IS the act" for write_document, next surface (#546).
 *
 * #556 made reply cards lead with the ready-to-send draft. The same disease lives in
 * write_document: a purchase/prep/acquire commitment (the Nathaniel-birthday case) shipped
 * a "decide → buy → wrap → confirm" homework checklist instead of the finished act. For an
 * acquisition the act is NOT a plan — it is the chosen thing plus a real link the owner taps
 * once. That requires doing the legwork (a real lookup), so this module wires the existing
 * Scout web search (`searchWebForEnrichment`) into the write_document path.
 *
 * Grounding rails (do not relax):
 *   - The link is only ever taken from the real search result. We never fabricate a URL —
 *     if the lookup grounds no link, this returns null and the caller falls back to the
 *     existing decisive-brief path (no homework, no invented "buy here").
 *   - The lookup self-gates on SCOUT_WEB_ENABLED + isPaidLlmAllowed() inside
 *     searchWebForEnrichment, so prod behaviour is unchanged until the lane is enabled.
 */

import type { ConvictionDirective, DocumentArtifact } from '@/lib/briefing/types';

/**
 * A write_document move whose real act is obtaining a concrete external thing — a gift,
 * booking, reservation, or purchase. This is the class that otherwise emits a multi-step
 * "decide/buy/wrap/confirm" checklist. Detection is deliberately conservative: it requires
 * an acquisition verb AND must not collide with the dedicated finished-work paths
 * (admin-deadline, document-production, behavioral-pattern, schedule-conflict, decision memos).
 */
const ACQUISITION_PATTERN =
  /\b(buy|purchase|order|gift|present(?!ation)|shop(?:ping)? for|pick out|reserve|reservation|book(?:ing)?\s+(?:a|an|the|tickets?|flights?|a table|a venue|a hotel)|find\s+(?:a|an|the)\b[^.\n]{0,60}\b(?:gift|present|venue|vendor|caterer|hotel|flight|restaurant|tickets?))\b/i;

const ACQUISITION_EXCLUSION_PATTERN =
  /\b(?:decision memo|decision lock|execution brief|account activity|worksource|requirements?-needed|schedule conflict|double[- ]book|behavioral pattern)\b|\.docx/i;

/** Combined directive text used for classification (directive + reason + evidence). */
function directiveText(directive: ConvictionDirective): string {
  return [
    directive.directive ?? '',
    directive.reason ?? '',
    ...(directive.evidence ?? []).map((e) => e.description ?? ''),
  ]
    .filter(Boolean)
    .join('\n');
}

export function isAcquisitionDirective(directive: ConvictionDirective): boolean {
  if (directive.action_type !== 'write_document') return false;
  const text = directiveText(directive);
  if (ACQUISITION_EXCLUSION_PATTERN.test(text)) return false;
  return ACQUISITION_PATTERN.test(text);
}

/**
 * The lookup query. We ask for ONE concrete, currently-available option with its exact name,
 * a one-line reason, and a working purchase/booking URL — explicitly not a list of steps.
 */
export function buildAcquisitionSearchQuery(directive: ConvictionDirective): string {
  const need = directiveText(directive).replace(/\s+/g, ' ').trim();
  return [
    'Find one specific, currently-available product or option for the real-world need below.',
    'Give its exact name, a one-line reason it fits, and a working purchase or booking URL.',
    'Return the single best concrete pick and its link — not a list of steps or options to weigh.',
    `Need: ${need}`,
  ]
    .join(' ')
    .slice(0, 1500);
}

const URL_RE = /(https?:\/\/[^\s)\]>"'`]+)/i;
const DEADLINE_RE =
  /\b(\d{4}-\d{2}-\d{2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,?\s*\d{4})?|today|tonight|tomorrow|this week|next week|by\s+\w+day)\b/i;

/** First proper-name token in the need text, used as the external recipient/occasion anchor. */
function inferRecipient(directive: ConvictionDirective): string | null {
  const m = directive.directive?.match(/\b(?:for|to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  return m?.[1] ?? null;
}

/** Trim a search summary to a short, gate-safe citation: the lead fact plus its link. */
function leadFact(summary: string): string {
  const firstLine = summary
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  const lead = (firstLine ?? summary).trim();
  return lead.length > 320 ? `${lead.slice(0, 317)}…` : lead;
}

/**
 * Turn a grounded, source-cited search summary into a FINISHED acquisition artifact:
 * the pick, the real link, why it fits, and the single next physical act. Returns null
 * when the summary grounds no usable link — we never invent a "buy here".
 */
export function buildAcquisitionArtifactFromSearch(
  directive: ConvictionDirective,
  searchSummary: string | null | undefined,
): DocumentArtifact | null {
  const summary = (searchSummary ?? '').trim();
  if (!summary) return null;
  const urlMatch = summary.match(URL_RE);
  if (!urlMatch) return null;
  const link = urlMatch[1].replace(/[.,);]+$/, '');

  const recipient = inferRecipient(directive);
  const deadline = directiveText(directive).match(DEADLINE_RE)?.[0] ?? 'this week';
  const pick = leadFact(summary);
  const need = directive.directive?.replace(/\s+/g, ' ').trim() ?? 'the purchase';
  const forLine = recipient ? `For ${recipient}` : 'For the recipient named in the thread';

  const title = (recipient ? `Ready to order for ${recipient}` : 'Ready to order')
    .slice(0, 120);

  const content = [
    'THE PICK',
    pick,
    '',
    `Order it here: ${link}`,
    '',
    `${forLine} — ${need}.`,
    `NEXT PHYSICAL STEP: open the link above and place the order before ${deadline}. Please approve to lock it in.`,
    '',
    `CONSEQUENCE IF NO MOVEMENT: if this is not ordered before ${deadline}, it will not arrive in time and the occasion passes unmet.`,
    '',
    `SOURCE: ${link}`,
  ].join('\n');

  return { type: 'document', title, content };
}
