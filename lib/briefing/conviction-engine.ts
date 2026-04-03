/**
 * CONVICTION ENGINE
 * =================
 * The insight from 2026-03-26: Foldera's job is not to surface options.
 * It is to hand the user the optimal decision with the math visible,
 * so they stop second-guessing and relitigating.
 *
 * "I want the answer handed to me that the math supports so I stop
 *  relitigating. I want the optimal decision so I stop second guessing."
 *
 * The three inputs that determine any major life decision:
 *   1. Monthly burn rate       — inferred from financial signals (bank, bills)
 *   2. Primary outcome prob    — inferred from job/opportunity thread stage
 *   3. Hard deadline           — inferred from calendar/email (due dates, start dates)
 *
 * THE USER IS NOT SUPPOSED TO TELL US. We infer it.
 *
 * When we have these three, we run expected value across decision paths
 * and return ONE answer with the math shown. Not options. Not suggestions.
 * The conviction decision.
 */

import { createServerClient } from '@/lib/db/client';
import { decryptWithStatus } from '@/lib/encryption';
import { daysMs } from '@/lib/config/constants';
import { estimateMonthlyBurnFromSignalAmounts } from '@/lib/briefing/monthly-burn-inference';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SituationModel {
  /** Monthly cash outflow, inferred from financial signals */
  monthlyBurnUSD: number | null;
  /** Computed from burn + remaining balance signals */
  runwayMonths: number | null;
  /** 0-1: probability the primary outcome (top career goal) closes on time */
  primaryOutcomeProbability: number | null;
  /** Date the primary outcome is expected to resolve (from email signals) */
  primaryOutcomeDeadline: Date | null;
  /** Hard external deadline that cannot move (baby, lease, etc.) */
  hardDeadline: Date | null;
  hardDeadlineSource: string | null;
  /** How confident we are in the model (0-1) */
  modelConfidence: number;
  /** What data is missing that would improve confidence */
  missingInputs: string[];
  /** CE-6: Non-action blindspots (e.g. WA reference policy) — surfaced in conviction math, not as tasks */
  referenceRiskNotes: string[];
}

export interface DecisionPath {
  label: string;
  expectedValueMonths: number; // months of financial safety
  probability: number;
  outcomeIfWorks: string;
  outcomeIfFails: string;
  timeToFirstIncome: number; // days
}

export interface ConvictionDecision {
  /** The one thing to do. Not options. One answer. */
  optimalAction: string;
  /** Human-readable EV breakdown */
  math: string;
  /** True when the math is definitive enough to stop second-guessing */
  stopSecondGuessing: boolean;
  /** The scenario that breaks everything — name it explicitly */
  catastrophicScenario: string;
  /** Probability of catastrophic scenario (makes it concrete, not ambient dread) */
  catastrophicProbability: number;
  /** The one hedge that reduces catastrophic risk */
  keyHedge: string;
  /** All paths considered with their EVs */
  paths: DecisionPath[];
  situationModel: SituationModel;
}

// ---------------------------------------------------------------------------
// Inference Layer — these replace the questions the user shouldn't have to answer
// ---------------------------------------------------------------------------

const BURN_DOLLAR_PATTERN = /\$\s?([\d,]+(?:\.\d{2})?)/g;
const BURN_KEYWORDS = /rent|mortgage|utilities|insurance|groceries|monthly|bill|payment|subscription/i;

/** Re-export for tests and callers that imported from conviction-engine. */
export { estimateMonthlyBurnFromSignalAmounts } from '@/lib/briefing/monthly-burn-inference';

/**
 * Infer monthly burn from financial signals.
 * Looks for: bill amounts, rent/mortgage mentions, recurring payment signals.
 * Falls back to null if not enough data — caller should note as missing input.
 */
export async function inferMonthlyBurn(userId: string): Promise<number | null> {
  const supabase = createServerClient();
  const sixtyDaysAgo = new Date(Date.now() - daysMs(60)).toISOString();

  try {
    const { data: signals } = await supabase
      .from('tkg_signals')
      .select('content, occurred_at')
      .eq('user_id', userId)
      .eq('processed', true)
      .gte('occurred_at', sixtyDaysAgo)
      .limit(100);

    if (!signals) return null;

    const entries: Array<{ amounts: number[]; dateKey: string }> = [];

    for (const row of signals) {
      const dec = decryptWithStatus(row.content as string ?? '');
      if (dec.usedFallback) continue;
      if (!BURN_KEYWORDS.test(dec.plaintext)) continue;

      const amounts: number[] = [];
      let match;
      BURN_DOLLAR_PATTERN.lastIndex = 0;
      while ((match = BURN_DOLLAR_PATTERN.exec(dec.plaintext)) !== null) {
        const amount = parseFloat(match[1].replace(',', ''));
        if (amount >= 50 && amount <= 5000) amounts.push(amount);
      }
      if (amounts.length === 0) continue;

      const dateKey =
        typeof row.occurred_at === 'string' && row.occurred_at.length >= 10
          ? row.occurred_at.slice(0, 10)
          : '';
      entries.push({ amounts, dateKey });
    }

    return estimateMonthlyBurnFromSignalAmounts(entries);
  } catch {
    return null;
  }
}

/**
 * CE-4: Hiring funnel tiers (target ~90% ceiling when reference complete + start discussed).
 * Ordered most-advanced first; first pattern match wins per signal.
 */
export function hiringFunnelTierFromPlaintext(plain: string): { probability: number; label: string } | null {
  const HIRING_FUNNEL_TIERS: { pattern: RegExp; probability: number; label: string }[] = [
    { pattern: /offer\s*(letter|extended|received|accepted)/i, probability: 0.9, label: 'Offer received/accepted' },
    { pattern: /start\s*date\s*(discussed|confirmed|set)|\bonboard(?:ing)?\b/i, probability: 0.9, label: 'Start date discussed' },
    { pattern: /reference\s*check\s*(complete|done|finished|cleared)/i, probability: 0.75, label: 'Reference check complete' },
    {
      pattern: /reference\s*(?:check|verification).{0,55}(?:initiated|started|sent|requested|in\s+progress)/i,
      probability: 0.55,
      label: 'Reference check initiated',
    },
    { pattern: /final\s*(round|interview|stage)/i, probability: 0.55, label: 'Final interview' },
    { pattern: /second\s*(round|interview)|phone\s*(screen|interview)|first\s*(round|interview)/i, probability: 0.35, label: 'Interviewed' },
    {
      pattern: /\b(?:applied|application\s*(?:sent|submitted|received)|application.{0,45}(?:received|under\s+review))\b/i,
      probability: 0.2,
      label: 'Applied',
    },
  ];
  for (const tier of HIRING_FUNNEL_TIERS) {
    tier.pattern.lastIndex = 0;
    if (tier.pattern.test(plain)) return { probability: tier.probability, label: tier.label };
  }
  return null;
}

/**
 * Infer the probability that the user's top career goal closes within its window.
 * Uses: email thread recency, CE-4 hiring funnel stages (reference check, start date mentioned),
 * time since last contact from the other side.
 */
export async function inferPrimaryOutcomeProbability(
  userId: string,
  goalText: string,
): Promise<{ probability: number; confidence: number; signals: string[] }> {
  const supabase = createServerClient();
  const thirtyDaysAgo = new Date(Date.now() - daysMs(30)).toISOString();

  const positiveSignals: string[] = [];

  let rawProbability = 0.1; // base rate — no signal yet
  let confidence = 0.15;

  try {
    const { data: signals } = await supabase
      .from('tkg_signals')
      .select('content, occurred_at, type')
      .eq('user_id', userId)
      .eq('processed', true)
      .gte('occurred_at', thirtyDaysAgo)
      .limit(50);

    if (!signals) return { probability: rawProbability, confidence, signals: positiveSignals };

    const goalKeywords = goalText.toLowerCase().split(/\s+/).filter((w) => w.length > 4).slice(0, 5);

    for (const row of signals) {
      const dec = decryptWithStatus(row.content as string ?? '');
      if (dec.usedFallback) continue;
      const text = dec.plaintext.toLowerCase();
      const isRelevant = goalKeywords.some((kw) => text.includes(kw));
      if (!isRelevant) continue;

      const tier = hiringFunnelTierFromPlaintext(dec.plaintext);
      if (tier && tier.probability > rawProbability) {
        rawProbability = tier.probability;
        confidence = 0.62;
        if (!positiveSignals.includes(tier.label)) {
          positiveSignals.push(tier.label);
        }
      }
    }
  } catch {
    // non-blocking
  }

  return {
    probability: Math.min(0.95, rawProbability),
    confidence: Math.min(1.0, confidence),
    signals: positiveSignals,
  };
}

/** CE-3: Calendar / task-style deadline language (complements baby/lease patterns). */
const CALENDAR_DEADLINE_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\b(?:due|deadline)\s*(?:date|on)?\s*[:\s].{0,80}(?:deliverable|delivery|filing|review|close|project)\b/i, label: 'Task due date' },
  { pattern: /\blast\s*day\s+(?:to|for)\b/i, label: 'Last day' },
  { pattern: /\bdelivery\s*(?:due|date|by|no\s*later\s*than)\b/i, label: 'Delivery deadline' },
  { pattern: /\b(?:must\s+)?(?:submit|file|complete)\s+by\b/i, label: 'Submit-by deadline' },
];

/**
 * CE-6: WA public-sector applications often need a current supervisor reference;
 * prior DVA employment is a recurring reference-risk blindspot (non-task note).
 */
export function detectReferenceRiskBlindspot(goalText: string, signalTexts: string[]): string | null {
  const combined = [goalText, ...signalTexts].join('\n');
  const waJob =
    /\b(?:washington|wa)\s+state\b/i.test(combined) &&
    /\b(?:job|jobs|application|position|role|opening|career|state\s+employment|public\s+sector)\b/i.test(combined);
  const dva =
    /\bDVA\b/i.test(combined) ||
    /\bdepartment\s+of\s+veterans\s+affairs\b/i.test(combined) ||
    /\bd\.v\.a\.\b/i.test(combined);
  if (!waJob || !dva) return null;
  return 'REFERENCE_RISK: WA state roles often require a current-supervisor reference. Prior DVA employment may complicate HR reference checks — resolve before late stages.';
}

async function fetchRecentSignalPlaintexts(userId: string, days: number, limit: number): Promise<string[]> {
  const supabase = createServerClient();
  const since = new Date(Date.now() - daysMs(days)).toISOString();
  const { data: rows } = await supabase
    .from('tkg_signals')
    .select('content')
    .eq('user_id', userId)
    .eq('processed', true)
    .gte('occurred_at', since)
    .limit(limit);

  const out: string[] = [];
  for (const row of rows ?? []) {
    const dec = decryptWithStatus((row.content as string) ?? '');
    if (!dec.usedFallback && dec.plaintext.length > 15) out.push(dec.plaintext);
  }
  return out;
}

function goalPhraseTokens(goalTexts: string[]): string[] {
  const STOP = new Set([
    'that',
    'this',
    'with',
    'from',
    'have',
    'will',
    'been',
    'your',
    'their',
    'they',
    'into',
    'path',
    'primary',
    'focus',
    'until',
    'window',
    'resolves',
    'goal',
    'career',
    'secure',
    'land',
  ]);
  const tokens = new Set<string>();
  for (const g of goalTexts) {
    for (const w of g.toLowerCase().split(/\s+/)) {
      if (w.length >= 4 && !STOP.has(w)) tokens.add(w);
    }
  }
  return [...tokens].slice(0, 24);
}

/**
 * Infer the hard deadline that cannot move — the one that makes runway
 * calculations concrete. CE-3: baby/lease + calendar/delivery language + goal-named dates in signals.
 */
export async function inferHardDeadline(
  userId: string,
): Promise<{ date: Date | null; source: string | null; confidence: number }> {
  const supabase = createServerClient();
  const ninetyDaysAheadMs = Date.now() + daysMs(90);
  const thirtyDaysAgo = new Date(Date.now() - daysMs(30)).toISOString();

  try {
    const [{ data: signals }, { data: goalRows }] = await Promise.all([
      supabase
        .from('tkg_signals')
        .select('content, occurred_at')
        .eq('user_id', userId)
        .eq('processed', true)
        .gte('occurred_at', thirtyDaysAgo)
        .limit(100),
      supabase.from('tkg_goals').select('goal_text').eq('user_id', userId).eq('status', 'active').limit(12),
    ]);

    const goalTokens = goalPhraseTokens((goalRows ?? []).map((r: { goal_text: string }) => r.goal_text));

    if (!signals || signals.length === 0) {
      const { data: lastWait } = await supabase
        .from('tkg_actions')
        .select('execution_result')
        .eq('user_id', userId)
        .eq('action_type', 'do_nothing')
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const tripwire = (lastWait?.execution_result as Record<string, unknown> | null)?.tripwire_date;
      if (typeof tripwire === 'string') {
        const d = new Date(tripwire);
        if (!isNaN(d.getTime())) return { date: d, source: 'tripwire_date', confidence: 0.5 };
      }
      return { date: null, source: null, confidence: 0 };
    }

    const hardDeadlinePatterns = [
      { pattern: /due\s*(date|end\s*of\s*(month|may|june|july)).*(?:baby|birth|pregnant|deliver)/i, label: 'Baby due date' },
      { pattern: /baby.*due|due.*baby|pregnant.*due|deliver.*(?:april|may|june)/i, label: 'Baby due date' },
      { pattern: /lease.*end|move.*out.*(?:april|may|june|july)/i, label: 'Lease end' },
    ];

    const datePattern =
      /\b((?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{4}-\d{2}-\d{2})\b/gi;

    for (const row of signals) {
      const dec = decryptWithStatus(row.content as string ?? '');
      if (dec.usedFallback) continue;
      const plain = dec.plaintext;
      const lower = plain.toLowerCase();

      for (const { pattern, label } of hardDeadlinePatterns) {
        pattern.lastIndex = 0;
        if (pattern.test(plain)) {
          const dates = plain.match(datePattern);
          if (dates && dates.length > 0) {
            const parsed = new Date(dates[0]);
            if (!isNaN(parsed.getTime()) && parsed.getTime() < ninetyDaysAheadMs) {
              return { date: parsed, source: label, confidence: 0.7 };
            }
          }
          return { date: null, source: label, confidence: 0.3 };
        }
      }

      for (const { pattern, label } of CALENDAR_DEADLINE_PATTERNS) {
        pattern.lastIndex = 0;
        if (!pattern.test(plain)) continue;
        const dates = plain.match(datePattern);
        if (dates && dates.length > 0) {
          const parsed = new Date(dates[0]);
          if (!isNaN(parsed.getTime()) && parsed.getTime() < ninetyDaysAheadMs) {
            return { date: parsed, source: label, confidence: 0.65 };
          }
        }
      }

      if (goalTokens.length >= 2) {
        const tokenHits = goalTokens.filter((t) => lower.includes(t)).length;
        if (tokenHits >= 2) {
          const dates = plain.match(datePattern);
          if (dates && dates.length > 0) {
            const parsed = new Date(dates[0]);
            if (!isNaN(parsed.getTime()) && parsed.getTime() < ninetyDaysAheadMs) {
              return { date: parsed, source: 'Goal-aligned date in signal', confidence: 0.6 };
            }
          }
        }
      }
    }
  } catch {
    // non-blocking
  }

  return { date: null, source: null, confidence: 0 };
}

// ---------------------------------------------------------------------------
// Conviction Engine — runs the math, returns the decision
// ---------------------------------------------------------------------------

export async function runConvictionEngine(
  userId: string,
  topGoalText: string,
  manualOverrides?: Partial<{
    monthlyBurnUSD: number;
    primaryOutcomeProbability: number;
    hardDeadlineDate: Date;
    runwayMonths: number;
  }>,
): Promise<ConvictionDecision | null> {
  const [burnResult, probResult, deadlineResult, signalTexts] = await Promise.all([
    inferMonthlyBurn(userId),
    inferPrimaryOutcomeProbability(userId, topGoalText),
    inferHardDeadline(userId),
    fetchRecentSignalPlaintexts(userId, 90, 100),
  ]);

  const burn = manualOverrides?.monthlyBurnUSD ?? burnResult;
  const prob = manualOverrides?.primaryOutcomeProbability ?? probResult.probability;
  const deadline = manualOverrides?.hardDeadlineDate ?? deadlineResult.date;

  const missingInputs: string[] = [];
  if (!burn) missingInputs.push('Monthly burn rate (not enough financial signal data)');
  if (probResult.confidence < 0.4) missingInputs.push('Primary outcome probability (need more thread signals)');
  if (!deadline) missingInputs.push('Hard deadline (baby due date or similar not found in signals)');

  if (!burn) return null; // Cannot run math without burn

  const refBlind = detectReferenceRiskBlindspot(topGoalText, signalTexts);
  const referenceRiskNotes = refBlind ? [refBlind] : [];

  // Build situation model
  const runwayMonths = manualOverrides?.runwayMonths ?? null;
  const situation: SituationModel = {
    monthlyBurnUSD: burn,
    runwayMonths,
    primaryOutcomeProbability: prob,
    primaryOutcomeDeadline: null, // TODO: infer from "April start" / "May start" signals
    hardDeadline: deadline,
    hardDeadlineSource: deadlineResult.source,
    modelConfidence: missingInputs.length === 0 ? 0.8 : 0.4,
    missingInputs,
    referenceRiskNotes,
  };

  // Decision paths — labels derived from top goal text, not hardcoded
  const runway = runwayMonths ?? 3;
  const timeToConsultingIncomeDays = 45; // realistic minimum
  const timeToJobIncomeDays = 30; // typical first paycheck after start

  // Shorten goal text for labels (first 60 chars)
  const goalLabel = topGoalText.length > 60 ? topGoalText.slice(0, 57) + '...' : topGoalText;

  const waitPath: DecisionPath = {
    label: `Wait for primary outcome: ${goalLabel}`,
    expectedValueMonths: runway * prob + (runway - 1) * (1 - prob),
    probability: prob,
    outcomeIfWorks: `Primary outcome resolves. Income or milestone ~${timeToJobIncomeDays} days out. Runway covers the gap.`,
    outcomeIfFails: `Primary outcome fails. Runway hits zero in ~${runway} months. Must pivot from scratch.`,
    timeToFirstIncome: timeToJobIncomeDays,
  };

  const bridgePath: DecisionPath = {
    label: 'Pursue bridge income (consulting/contract)',
    expectedValueMonths: runway + 1.5, // rough: extends runway if closes
    probability: 0.4, // consulting close probability in <60 days
    outcomeIfWorks: `Extends runway ~6 weeks. Reduces pressure on primary outcome timeline.`,
    outcomeIfFails: `Splits attention, delays primary outcome follow-through, no material income gain.`,
    timeToFirstIncome: timeToConsultingIncomeDays,
  };

  // The math
  const waitEV = waitPath.expectedValueMonths;
  const bridgeEV = bridgePath.expectedValueMonths * bridgePath.probability +
                   waitPath.expectedValueMonths * (1 - bridgePath.probability);
  const optimalIsWait = waitEV >= bridgeEV || prob >= 0.6;

  const catastrophicProb = Math.round((1 - prob) * 0.5 * 100); // prob outcome fails AND no bridge

  const refBlock =
    referenceRiskNotes.length > 0
      ? [`Blindspots (not tasks):`, ...referenceRiskNotes.map((n) => `• ${n}`), ``]
      : [];

  const math = [
    `Monthly burn: $${burn.toLocaleString()}`,
    `Runway: ~${runway} months`,
    `Primary outcome probability: ${Math.round(prob * 100)}%`,
    `Goal: ${goalLabel}`,
    ...refBlock,
    ``,
    `Wait path EV: ${waitEV.toFixed(1)} months of safety`,
    `Bridge path EV: ${bridgeEV.toFixed(1)} months of safety`,
    ``,
    `At ${Math.round(prob * 100)}% probability and ${runway}mo runway:`,
    optimalIsWait
      ? `Waiting dominates. Consulting won't close before primary outcome resolves anyway (${timeToConsultingIncomeDays}d minimum).`
      : `Bridge income recommended — primary outcome probability too low to rely on alone.`,
  ].join('\n');

  return {
    optimalAction: optimalIsWait
      ? `Stay focused on the primary outcome. Do not split attention on consulting. The math supports it.`
      : `Pursue one specific bridge income source in parallel. Primary outcome probability is not high enough to wait alone.`,
    math,
    stopSecondGuessing: prob >= 0.6 && runway >= 2,
    catastrophicScenario: `Primary outcome fails AND no bridge income in place before runway hits zero`,
    catastrophicProbability: catastrophicProb,
    keyHedge: `Identify one concrete action that extends runway independent of primary outcome`,
    paths: [waitPath, bridgePath],
    situationModel: situation,
  };
}
