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

/**
 * Infer monthly burn from financial signals.
 * Looks for: bill amounts, rent/mortgage mentions, recurring payment signals.
 * Falls back to null if not enough data — caller should note as missing input.
 */
export async function inferMonthlyBurn(userId: string): Promise<number | null> {
  const supabase = createServerClient();
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data: signals } = await supabase
      .from('tkg_signals')
      .select('content')
      .eq('user_id', userId)
      .eq('processed', true)
      .gte('occurred_at', sixtyDaysAgo)
      .limit(100);

    if (!signals) return null;

    const amounts: number[] = [];
    const dollarPattern = /\$\s?([\d,]+(?:\.\d{2})?)/g;
    const burnKeywords = /rent|mortgage|utilities|insurance|groceries|monthly|bill|payment|subscription/i;

    for (const row of signals) {
      const dec = decryptWithStatus(row.content as string ?? '');
      if (dec.usedFallback) continue;
      if (!burnKeywords.test(dec.plaintext)) continue;

      let match;
      while ((match = dollarPattern.exec(dec.plaintext)) !== null) {
        const amount = parseFloat(match[1].replace(',', ''));
        if (amount >= 50 && amount <= 5000) amounts.push(amount);
      }
    }

    if (amounts.length < 2) return null;

    // Rough burn estimate: sum of distinct recurring amounts
    const sorted = amounts.sort((a, b) => b - a);
    return Math.round(sorted.slice(0, 5).reduce((s, n) => s + n, 0));
  } catch {
    return null;
  }
}

/**
 * Infer the probability that the user's top career goal closes within its window.
 * Uses: email thread recency, stage signals (reference check, start date mentioned),
 * time since last contact from the other side.
 */
export async function inferPrimaryOutcomeProbability(
  userId: string,
  goalText: string,
): Promise<{ probability: number; confidence: number; signals: string[] }> {
  const supabase = createServerClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const positiveSignals: string[] = [];
  let rawProbability = 0.3; // base rate for job offer closing
  let confidence = 0.2;

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

      // Strong positive signals — each bumps probability
      if (/reference.*(complete|done|clear|finish)/i.test(dec.plaintext)) {
        rawProbability += 0.20;
        positiveSignals.push('Reference check complete');
        confidence += 0.1;
      }
      if (/start date|april|may.*start|onboard/i.test(dec.plaintext)) {
        rawProbability += 0.15;
        positiveSignals.push('Start date discussed');
        confidence += 0.1;
      }
      if (/offer|congratulations|selected|position.*fill/i.test(dec.plaintext)) {
        rawProbability += 0.30;
        positiveSignals.push('Offer language detected');
        confidence += 0.2;
      }
      if (row.type === 'email_received') {
        rawProbability += 0.05;
        confidence += 0.05;
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

/**
 * Infer the hard deadline that cannot move — the one that makes runway
 * calculations concrete. Looks for: due dates, baby/birth mentions,
 * lease end dates, contractual deadlines in calendar and email signals.
 */
export async function inferHardDeadline(
  userId: string,
): Promise<{ date: Date | null; source: string | null; confidence: number }> {
  const supabase = createServerClient();
  const ninetyDaysAhead = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data: signals } = await supabase
      .from('tkg_signals')
      .select('content, occurred_at')
      .eq('user_id', userId)
      .eq('processed', true)
      .gte('occurred_at', thirtyDaysAgo)
      .limit(100);

    if (!signals) return { date: null, source: null, confidence: 0 };

    // Personal deadline keywords — the things that create hard deadlines
    const hardDeadlinePatterns = [
      { pattern: /due\s*(date|end\s*of\s*(month|may|june|july)).*(?:baby|birth|pregnant|deliver)/i, label: 'Baby due date' },
      { pattern: /baby.*due|due.*baby|pregnant.*due|deliver.*(?:april|may|june)/i, label: 'Baby due date' },
      { pattern: /lease.*end|move.*out.*(?:april|may|june|july)/i, label: 'Lease end' },
    ];

    const datePattern = /\b((?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/gi;

    for (const row of signals) {
      const dec = decryptWithStatus(row.content as string ?? '');
      if (dec.usedFallback) continue;

      for (const { pattern, label } of hardDeadlinePatterns) {
        if (pattern.test(dec.plaintext)) {
          // Try to extract a date from the surrounding context
          const dates = dec.plaintext.match(datePattern);
          if (dates && dates.length > 0) {
            const parsed = new Date(dates[0]);
            if (!isNaN(parsed.getTime()) && parsed.toISOString() < ninetyDaysAhead) {
              return { date: parsed, source: label, confidence: 0.7 };
            }
          }
          // Found the pattern but no parseable date — return label with low confidence
          return { date: null, source: label, confidence: 0.3 };
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
  const [burnResult, probResult, deadlineResult] = await Promise.all([
    inferMonthlyBurn(userId),
    inferPrimaryOutcomeProbability(userId, topGoalText),
    inferHardDeadline(userId),
  ]);

  const burn = manualOverrides?.monthlyBurnUSD ?? burnResult;
  const prob = manualOverrides?.primaryOutcomeProbability ?? probResult.probability;
  const deadline = manualOverrides?.hardDeadlineDate ?? deadlineResult.date;

  const missingInputs: string[] = [];
  if (!burn) missingInputs.push('Monthly burn rate (not enough financial signal data)');
  if (probResult.confidence < 0.4) missingInputs.push('Primary outcome probability (need more thread signals)');
  if (!deadline) missingInputs.push('Hard deadline (baby due date or similar not found in signals)');

  if (!burn) return null; // Cannot run math without burn

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

  const math = [
    `Monthly burn: $${burn.toLocaleString()}`,
    `Runway: ~${runway} months`,
    `Primary outcome probability: ${Math.round(prob * 100)}%`,
    `Goal: ${goalLabel}`,
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
