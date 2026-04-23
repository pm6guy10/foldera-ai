// ---------------------------------------------------------------------------
// Stakes Gate — Hard filter for board-changing candidates only
//
// Runs post-noise/validity filter, pre-scoring. Drops every candidate that
// cannot produce a board-changing outcome (money, job, approval, deal,
// deadline). Fail closed: if ANY of the 5 conditions fails, the candidate
// is dropped. No scoring rescue, no ranking boost, no soft inclusion.
//
// Does NOT modify generator, mapping, validation, or action types.
// ---------------------------------------------------------------------------

import { MS_14D, MS_30D } from '@/lib/config/constants';
import type { ActionType, GenerationCandidateSource } from './types';
import type { MatchedGoal } from './scorer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StakesCandidate {
  id: string;
  type: 'commitment' | 'signal' | 'relationship';
  title: string;
  content: string;
  actionType: ActionType;
  urgency: number;
  matchedGoal: MatchedGoal | null;
  domain: string;
  sourceSignals: GenerationCandidateSource[];
  entityName?: string;
}

export interface StakesGateResult {
  passed: StakesCandidate[];
  dropped: Array<{ candidate: StakesCandidate; failedCondition: number; reason: string }>;
}

export function adaptInterviewSourceSignalsForGate(
  sourceSignals: ReadonlyArray<Pick<GenerationCandidateSource, 'source' | 'summary'>> | undefined,
): Array<{ source: string; snippet?: string }> | undefined {
  if (sourceSignals === undefined) return undefined;

  return sourceSignals.flatMap((signal) => {
    const source = typeof signal.source === 'string' ? signal.source.trim() : '';
    if (!source) return [];

    return [{
      source,
      snippet: typeof signal.summary === 'string' ? signal.summary : undefined,
    }];
  });
}

// ---------------------------------------------------------------------------
// Condition 1: Real External Entity
// Must involve a real person, company, or decision owner.
// Not system-generated, not self, not generic contact.
// ---------------------------------------------------------------------------

const SYSTEM_ENTITY_PATTERNS = [
  /\b(?:system|automated?|notification|noreply|no-reply|donotreply|mailer[- ]?daemon)\b/i,
  /\b(?:newsletter|unsubscribe|marketing|promo(?:tion)?s?)\b/i,
  /\b(?:security\s+alert|account\s+(?:update|notification|verification))\b/i,
  /\b(?:your?\s+(?:order|subscription|receipt|invoice|statement)\s+(?:is|has|was))\b/i,
];

const GENERIC_CONTACT_PATTERNS = [
  /^(?:team|support|info|hello|contact|admin|billing|sales|help)@/i,
  /\b(?:customer\s+(?:service|support)|help\s+desk)\b/i,
];

// Entity-like references: proper names, company names, titles
const REAL_ENTITY_PATTERNS = [
  // Proper names (First Last, or single capitalized name with context)
  /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/,
  // Company/org patterns
  /\b(?:Inc|LLC|Corp|Ltd|Co|Group|Partners|Capital|Ventures|Labs|Technologies|Solutions)\b/i,
  // Decision-owner titles
  /\b(?:CEO|CTO|CFO|COO|VP|Director|Manager|Recruiter|Founder|Partner|Principal|Head\s+of)\b/i,
  // Email address (indicates real external contact)
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
];

function hasRealExternalEntity(c: StakesCandidate): boolean {
  const text = `${c.title} ${c.content}`;

  // If relationship type with an entity name, it's real unless system/generic
  if (c.type === 'relationship' && c.entityName) {
    const isSystem = SYSTEM_ENTITY_PATTERNS.some(p => p.test(c.entityName!));
    const isGeneric = GENERIC_CONTACT_PATTERNS.some(p => p.test(c.entityName!));
    return !isSystem && !isGeneric;
  }

  // System-generated content fails
  if (SYSTEM_ENTITY_PATTERNS.some(p => p.test(text))) return false;

  // Must have at least one real entity reference
  return REAL_ENTITY_PATTERNS.some(p => p.test(text));
}

// ---------------------------------------------------------------------------
// Condition 2: Active or Live Thread
// Interaction within last 14 days OR clear pending expectation.
// ---------------------------------------------------------------------------

const PENDING_EXPECTATION_PATTERNS = [
  /\b(?:await(?:ing)?|waiting\s+(?:for|on)|pending|outstanding|overdue)\b/i,
  /\b(?:needs?\s+(?:response|reply|answer|decision|approval))\b/i,
  /\b(?:follow[- ]?up|deliverable|action\s+item|next\s+step)\b/i,
  /\b(?:promised|committed|owe[sd]?|due\s+(?:by|on|date))\b/i,
  /\b(?:haven'?t\s+(?:heard|responded|replied))\b/i,
  /\b(?:no\s+(?:response|reply)\s+(?:yet|since))\b/i,
];

function isActiveThread(c: StakesCandidate): boolean {
  const text = `${c.title} ${c.content}`;

  // Check recency from source signals.
  // Mail `signal` candidates are loaded up to 180d; a 14d cutoff drops real human
  // threads in the common 2–4 week follow-up band. Use 30d for signal rows only;
  // commitments/relationships keep 14d on source timestamps (deadline + text paths still apply).
  const now = Date.now();
  for (const s of c.sourceSignals) {
    if (s.occurredAt) {
      const ts = new Date(s.occurredAt).getTime();
      if (!Number.isFinite(ts)) continue;
      const age = now - ts;
      if (!Number.isFinite(age)) continue;
      const maxAge = c.type === 'signal' ? MS_30D : MS_14D;
      if (age <= maxAge) return true;
    }
  }

  // Commitment type with urgency > 0 means it has a deadline — active by definition
  if (c.type === 'commitment' && c.urgency > 0) return true;

  // Check for pending expectation language
  return PENDING_EXPECTATION_PATTERNS.some(p => p.test(text));
}

// ---------------------------------------------------------------------------
// Condition 3: Time Pressure or Decay
// Explicit deadline, measurable stall (>=48h no response, missed window,
// velocity collapse), or shrinking decision window.
// ---------------------------------------------------------------------------

const TIME_PRESSURE_PATTERNS = [
  /\b(?:deadline|due\s+(?:by|on|date)|expires?|expir(?:ing|ation))\b/i,
  /\b(?:urgent|asap|immediately|time[- ]?sensitive|critical)\b/i,
  /\b(?:end\s+of\s+(?:day|week|month|quarter)|EOD|EOW|EOM)\b/i,
  /\b(?:last\s+(?:chance|day|opportunity)|final\s+(?:round|notice|deadline))\b/i,
  /\b(?:closing|closes?\s+(?:on|in|soon)|window\s+(?:closing|shrinking))\b/i,
  /\b(?:offer\s+(?:expires?|deadline)|accept\s+by)\b/i,
];

const STALL_PATTERNS = [
  /\b(?:no\s+(?:response|reply|update|movement)\s+(?:in|for|since))\b/i,
  /\b(?:stalled|stuck|blocked|ghosted|radio\s+silent)\b/i,
  /\b(?:days?\s+(?:ago|since|without)\s+(?:response|reply|contact))\b/i,
  /\b(?:haven'?t\s+(?:heard|responded|replied)\s+(?:in|for|since))\b/i,
];

const INTERVIEW_PRESSURE_PATTERNS = {
  interviewAnchor: /\b(?:interview|phone screen|screening interview|panel interview|final round|hiring panel|candidate interview)\b/i,
  confirmedWindow:
    /\b(?:accepted?\s+interview|interview\s+accepted|confirm(?:ed|ation)?|scheduled|schedule(?:d)?|invite(?:d|s|ation)?|appointment scheduled|selected\s+to\s+interview|phone screen)\b/i,
  hiringContext:
    /\b(?:role|position|job|recruit(?:er|ment)|candidate|hiring|employer|interviewer|manager)\b/i,
  datedWindow:
    /\b(?:20\d{2}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/(?:20)?\d{2}|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i,
};

// Urgency >= 0.4 means scorer already computed meaningful time pressure
const URGENCY_THRESHOLD = 0.4;

export function isTimeBoundInterviewExecutionCandidate(
  c: StakesCandidate,
  sourceSignals?: Array<{ source: string; snippet?: string }>,
): boolean {
  if (c.actionType !== 'write_document') return false;
  const text = `${c.title} ${c.content}`;
  if (!INTERVIEW_PRESSURE_PATTERNS.interviewAnchor.test(text)) return false;
  if (!hasRealExternalEntity(c)) return false;

  const hasConfirmedWindow = INTERVIEW_PRESSURE_PATTERNS.confirmedWindow.test(text);
  const hasHiringContext = INTERVIEW_PRESSURE_PATTERNS.hiringContext.test(text);
  const hasDatedWindow = INTERVIEW_PRESSURE_PATTERNS.datedWindow.test(text);

  if (sourceSignals !== undefined) {
    const hasSubstantiveSource = sourceSignals.some(
      (s) => s.source !== 'calendar' && (s.snippet?.length ?? 0) >= 100,
    );
    if (!hasSubstantiveSource) return false;
  }

  return (hasConfirmedWindow && hasHiringContext) || (hasDatedWindow && hasHiringContext);
}

function hasTimePressureOrDecay(c: StakesCandidate): boolean {
  const text = `${c.title} ${c.content}`;

  // Scorer-computed urgency already encodes deadline proximity
  if (c.urgency >= URGENCY_THRESHOLD) return true;

  // Accepted interviews, scheduled phone screens, and dated hiring commitments
  // are time-bound even when the phrasing is mild and does not literally say "deadline".
  if (isTimeBoundInterviewExecutionCandidate(c)) return true;

  // `signalUrgency()` often lands below 0.4 for 4–30d mail even when the thread is
  // still a live human loop. If the same signal passed the live-thread window, treat
  // reply pressure as real so external send_message rows can reach scoring.
  if (c.type === 'signal') {
    const now = Date.now();
    for (const s of c.sourceSignals) {
      if (!s.occurredAt) continue;
      const ts = new Date(s.occurredAt).getTime();
      if (!Number.isFinite(ts)) continue;
      const age = now - ts;
      if (Number.isFinite(age) && age <= MS_30D) return true;
    }
  }

  // Relationship `send_message` is only built when the scorer found a concrete open
  // commitment for that entity (`hasOpenThread`). Silence regex + urgency often miss
  // same-week threads (last contact <2d, ISO "(due YYYY-MM-DD)" not matching deadline patterns).
  if (c.type === 'relationship' && c.actionType === 'send_message') {
    return true;
  }

  // Relationship candidates: silence IS the decay signal
  if (c.type === 'relationship') {
    // Parse "last contact N days ago" from relationship content
    const silenceMatch = text.match(/last\s+contact\s+(\d+)\s+days?\s+ago/i);
    if (silenceMatch) {
      const daysSilent = parseInt(silenceMatch[1], 10);
      if (daysSilent >= 2) return true; // 48h+ stall
    }
  }

  // Explicit time pressure language
  if (TIME_PRESSURE_PATTERNS.some(p => p.test(text))) return true;

  // Stall/decay language
  if (STALL_PATTERNS.some(p => p.test(text))) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Condition 4: Decision Leverage
// Recipient or target has authority or influence over outcome.
// Not informational, not passive.
// ---------------------------------------------------------------------------

const DECISION_LEVERAGE_PATTERNS = [
  // Authority / influence
  /\b(?:decision[- ]?maker|authority|approve[sr]?|sign[- ]?off|green[- ]?light)\b/i,
  /\b(?:CEO|CTO|CFO|COO|VP|Director|Manager|Recruiter|Founder|Partner|Principal|Head\s+of)\b/i,
  /\b(?:hiring\s+manager|team\s+lead|budget\s+owner|stakeholder)\b/i,
  // Outcome-influencing actions
  /\b(?:offer|contract|proposal|negotiat|bid|pitch|close|deal)\b/i,
  /\b(?:interview|screening|assessment|evaluation|review)\b/i,
  /\b(?:approve|reject|accept|decline|decide|commit|sign)\b/i,
  // Financial authority
  /\b(?:budget|funding|investment|revenue|payment|invoice|billing)\b/i,
  /\b(?:\$\d|k\b|salary|compensation|raise|bonus)\b/i,
];

const INFORMATIONAL_ONLY_PATTERNS = [
  /\b(?:fyi|for\s+your\s+information|just\s+(?:an?\s+)?(?:heads?\s+up|fyi|update|note))\b/i,
  /\b(?:newsletter|digest|weekly\s+(?:update|summary)|daily\s+(?:brief|update))\b/i,
  /\b(?:no\s+(?:action|response)\s+(?:needed|required))\b/i,
];

function hasDecisionLeverage(c: StakesCandidate): boolean {
  const text = `${c.title} ${c.content}`;

  // Informational-only signals have zero leverage
  if (INFORMATIONAL_ONLY_PATTERNS.some(p => p.test(text))) return false;

  // Action types that imply leverage — send_message forces a response from
  // someone with authority to answer, which IS decision leverage.
  if (c.actionType === 'make_decision' || c.actionType === 'schedule' || c.actionType === 'send_message') return true;

  // Check for decision leverage language
  return DECISION_LEVERAGE_PATTERNS.some(p => p.test(text));
}

// ---------------------------------------------------------------------------
// Condition 5: Forcing Function Exists
// Action can force: yes/no, approve/reject, schedule/decline, proceed/stop.
// ---------------------------------------------------------------------------

const FORCING_FUNCTION_PATTERNS = [
  // Binary decision points
  /\b(?:yes\s+or\s+no|approve\s+or\s+reject|accept\s+or\s+decline)\b/i,
  /\b(?:go\s+or\s+no[- ]?go|proceed\s+or\s+stop|in\s+or\s+out)\b/i,
  // Action that forces a response
  /\b(?:send\s+(?:the|an?|follow[- ]?up|proposal|offer|contract|invoice))\b/i,
  /\b(?:submit\s+(?:the|an?|application|proposal|bid|offer))\b/i,
  /\b(?:schedule\s+(?:the|an?|call|meeting|interview|review))\b/i,
  /\b(?:ask\s+(?:for|about)\s+(?:the|an?|decision|approval|timeline|status))\b/i,
  // Commitment language that implies forcing
  /\b(?:commit|confirm|finalize|lock\s+in|secure|close)\b/i,
  // Negotiation forcing
  /\b(?:counter[- ]?offer|negotiate|renegotiate|terms|conditions)\b/i,
  // Deadline-driven forcing
  /\b(?:must\s+(?:decide|respond|reply|answer)|need\s+(?:an?\s+)?(?:answer|decision|response)\s+by)\b/i,
];

// Action types that are inherently forcing functions
const FORCING_ACTION_TYPES = new Set<ActionType>(['send_message', 'schedule', 'make_decision']);

function hasForcingFunction(c: StakesCandidate): boolean {
  const text = `${c.title} ${c.content}`;

  // These action types inherently force a binary outcome
  if (FORCING_ACTION_TYPES.has(c.actionType)) return true;

  // A confirmed interview-prep document is the execution artifact for a fixed hiring window.
  if (isTimeBoundInterviewExecutionCandidate(c)) return true;

  // Check for forcing function language
  return FORCING_FUNCTION_PATTERNS.some(p => p.test(text));
}

// ---------------------------------------------------------------------------
// Zero-penalty patterns: candidates that should NEVER pass regardless of
// how well they match the 5 conditions. Newsletters, marketing, low-authority.
// ---------------------------------------------------------------------------

const ZERO_PENALTY_PATTERNS = [
  /\b(?:newsletter|unsubscribe|email\s+preferences|manage\s+subscriptions)\b/i,
  /\b(?:marketing|promo(?:tion)?al?|special\s+offer|limited\s+time|sale|discount|coupon)\b/i,
  /\b(?:social\s+media\s+(?:update|post|notification)|liked\s+your|commented\s+on\s+your)\b/i,
  /\b(?:Amazon|eBay|Walmart|Target|Costco|Best\s+Buy)\s+(?:order|delivery|shipping|return)/i,
  /\b(?:password\s+reset|verify\s+your\s+(?:email|account)|two[- ]?factor|2fa|otp)\b/i,
];

// ---------------------------------------------------------------------------
// Priority ranking for multi-winner tiebreak
// ---------------------------------------------------------------------------

const OUTCOME_PRIORITY: Array<{ pattern: RegExp; rank: number }> = [
  { pattern: /\b(?:hiring|interview|job|offer|position|role|candidate|recruiter|resume|cv)\b/i, rank: 1 },
  { pattern: /\b(?:money|revenue|deal|contract|payment|invoice|salary|budget|funding|investment|\$\d)\b/i, rank: 2 },
  { pattern: /\b(?:approval|decision|sign[- ]?off|green[- ]?light|board|review|evaluate)\b/i, rank: 3 },
  { pattern: /\b(?:deadline|due|expir|closes?|window|eod|eow|eom)\b/i, rank: 4 },
];

function outcomePriorityRank(c: StakesCandidate): number {
  const text = `${c.title} ${c.content}`;
  for (const { pattern, rank } of OUTCOME_PRIORITY) {
    if (pattern.test(text)) return rank;
  }
  return 5; // unranked — lowest priority
}

// ---------------------------------------------------------------------------
// Main gate
// ---------------------------------------------------------------------------

export function applyStakesGate(candidates: StakesCandidate[]): StakesGateResult {
  const passed: StakesCandidate[] = [];
  const dropped: StakesGateResult['dropped'] = [];

  for (const c of candidates) {
    // Zero-penalty check first — instant drop
    const text = `${c.title} ${c.content}`;
    if (ZERO_PENALTY_PATTERNS.some(p => p.test(text))) {
      dropped.push({ candidate: c, failedCondition: 0, reason: 'zero_penalty_pattern' });
      continue;
    }

    // do_nothing and research cannot produce board-changing outcomes
    if (c.actionType === 'do_nothing' || c.actionType === 'research') {
      dropped.push({ candidate: c, failedCondition: 5, reason: 'non_forcing_action_type' });
      continue;
    }

    // Condition 1: Real External Entity
    if (!hasRealExternalEntity(c)) {
      dropped.push({ candidate: c, failedCondition: 1, reason: 'no_real_external_entity' });
      continue;
    }

    // Condition 2: Active or Live Thread
    if (!isActiveThread(c)) {
      dropped.push({ candidate: c, failedCondition: 2, reason: 'no_active_thread' });
      continue;
    }

    // Condition 3: Time Pressure or Decay
    if (!hasTimePressureOrDecay(c)) {
      dropped.push({ candidate: c, failedCondition: 3, reason: 'no_time_pressure' });
      continue;
    }

    // Condition 4: Decision Leverage
    if (!hasDecisionLeverage(c)) {
      dropped.push({ candidate: c, failedCondition: 4, reason: 'no_decision_leverage' });
      continue;
    }

    // Condition 5: Forcing Function Exists
    if (!hasForcingFunction(c)) {
      dropped.push({ candidate: c, failedCondition: 5, reason: 'no_forcing_function' });
      continue;
    }

    passed.push(c);
  }

  // Sort passed by outcome priority (hiring > money > approvals > deadlines)
  passed.sort((a, b) => outcomePriorityRank(a) - outcomePriorityRank(b));

  return { passed, dropped };
}
