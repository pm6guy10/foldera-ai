/**
 * Scorer — 0-100 pain signal scoring system.
 *
 * Three components:
 *   Keyword density  (0-60): normalized weight sum from GROWTH.md keyword groups
 *   ICP fit          (0-25): signals that the author is in Foldera's ICP
 *   Emotional intensity (0-15): urgency language that signals acute pain
 *
 * Only posts scoring 70+ get Claude-personalized outreach drafts.
 * The weights are learned over time via learning-loop.ts.
 */

import { KEYWORD_GROUPS, MAX_RAW_SCORE, scorePost } from './keywords';

// ─── Threshold ──────────────────────────────────────────────────────────────
export const SCORE_THRESHOLD = 70;

// ─── ICP signal lists ────────────────────────────────────────────────────────

/** Leadership/founder ICP — highest value segment */
const ICP_LEADERSHIP = [
  'founder', 'ceo', 'co-founder', 'cofounder', 'startup', 'my startup',
  'my company', 'my team', 'entrepreneur', 'solo founder', 'bootstrapped',
  'running a', 'i run a', 'i own a', 'small business owner',
];

/** Executive/operator ICP — high value, may have budget */
const ICP_EXECUTIVE = [
  'executive', 'director', 'vp of', 'head of', 'c-suite', 'managing director',
  'operations', 'chief of', 'no ea', 'no assistant', 'without an assistant',
  "can't afford an ea", 'no executive assistant',
];

/** ADHD/executive-dysfunction ICP — deeply felt pain, fast converter */
const ICP_ADHD = [
  'adhd', 'add ', ' add,', 'executive function', 'executive dysfunction',
  'working memory', 'hyperfocus', 'time blindness', 'rejection sensitive',
  'rsd ', 'dopamine', 'brain fog', 'neurodivergent',
];

// ─── Intensity signal lists ───────────────────────────────────────────────────

const INTENSITY_SIGNALS = [
  'drowning', 'desperate', "can't keep up", 'burning out', 'burn out',
  'losing my mind', 'going crazy', 'completely overwhelmed', 'at my wit',
  'at my wits', 'end of my rope', 'can\'t do this', 'breaking point',
  'exhausted', 'help me', 'so frustrated', 'about to give up',
  'driving me crazy', 'something has to change', 'need to fix this',
  'nothing is working',
];

// ─── Learned weight multipliers (defaults; overridden by learning-loop.ts) ──

export interface LearnedWeights {
  keyword_multiplier:   number;  // multiplier on keyword component (default 1.0)
  icp_leadership_bonus: number;  // ICP leadership bonus (default 15)
  icp_executive_bonus:  number;  // ICP executive bonus (default 12)
  icp_adhd_bonus:       number;  // ICP ADHD bonus (default 18)
  intensity_per_signal: number;  // intensity bonus per match (default 5)
  version:              number;
}

export const DEFAULT_WEIGHTS: LearnedWeights = {
  keyword_multiplier:   1.0,
  icp_leadership_bonus: 15,
  icp_executive_bonus:  12,
  icp_adhd_bonus:       18,
  intensity_per_signal: 5,
  version:              0,
};

// ─── Scoring detail (returned for learning loop context) ─────────────────────

export interface ScoreDetail {
  score_100:         number;
  keyword_raw:       number;
  keyword_component: number;
  icp_signals:       string[];
  icp_component:     number;
  intensity_signals: string[];
  intensity_component: number;
  matched_labels:    string[];
}

// ─── Main scorer ─────────────────────────────────────────────────────────────

/**
 * Score a post on a 0-100 scale.
 *
 * @param title          Post title
 * @param body           Post body / selftext
 * @param weights        Learned weight overrides (optional — uses defaults)
 * @returns ScoreDetail including the final score_100
 */
export function score100(
  title:   string,
  body:    string,
  weights: LearnedWeights = DEFAULT_WEIGHTS,
): ScoreDetail {
  const text = `${title} ${body}`.toLowerCase();

  // ── 1. Keyword component (0-60) ────────────────────────────────────────────
  const { score: keywordRaw, matchedLabels } = scorePost(title, body);
  // Normalize: practical high-signal post scores 6-8 out of 13
  // Clamp at MAX_RAW_SCORE to get the full 60 range
  const keywordNorm      = Math.min(keywordRaw / MAX_RAW_SCORE, 1);
  const keywordComponent = Math.round(keywordNorm * 60 * weights.keyword_multiplier);

  // ── 2. ICP fit component (0-25) ────────────────────────────────────────────
  const icpSignals: string[] = [];
  let icpRaw = 0;

  if (ICP_LEADERSHIP.some(kw => text.includes(kw))) {
    icpSignals.push('leadership/founder');
    icpRaw += weights.icp_leadership_bonus;
  }
  if (ICP_EXECUTIVE.some(kw => text.includes(kw))) {
    icpSignals.push('executive/operator');
    icpRaw += weights.icp_executive_bonus;
  }
  if (ICP_ADHD.some(kw => text.includes(kw))) {
    icpSignals.push('adhd/executive-dysfunction');
    icpRaw += weights.icp_adhd_bonus;
  }

  const icpComponent = Math.min(icpRaw, 25);

  // ── 3. Intensity component (0-15) ──────────────────────────────────────────
  const intensityMatched: string[] = [];
  for (const sig of INTENSITY_SIGNALS) {
    if (text.includes(sig)) intensityMatched.push(sig);
  }
  // Long detailed post also signals intent
  const bodyLength = (body ?? '').length;
  if (bodyLength > 300 && intensityMatched.length === 0) {
    intensityMatched.push('detailed-post');
  }

  const intensityComponent = Math.min(
    intensityMatched.length * weights.intensity_per_signal,
    15,
  );

  // ── Total ──────────────────────────────────────────────────────────────────
  const score100 = Math.min(
    keywordComponent + icpComponent + intensityComponent,
    100,
  );

  return {
    score_100:           score100,
    keyword_raw:         keywordRaw,
    keyword_component:   keywordComponent,
    icp_signals:         icpSignals,
    icp_component:       icpComponent,
    intensity_signals:   intensityMatched,
    intensity_component: intensityComponent,
    matched_labels:      matchedLabels,
  };
}

/**
 * Returns true if a post qualifies for outreach draft generation.
 */
export function meetsThreshold(scoreDetail: ScoreDetail): boolean {
  return scoreDetail.score_100 >= SCORE_THRESHOLD;
}
