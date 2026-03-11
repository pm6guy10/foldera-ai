/**
 * Learning Loop — self-improving outreach scoring model.
 *
 * After every 20 outreach decisions (approve + skip), Claude analyzes:
 *  - What pain signal patterns correlate with Brandon approving outreach
 *  - What patterns correlate with skipping
 *  - How to adjust the scoring weights to surface better posts
 *
 * The learned weights are stored in tkg_signals (type='config', source='scoring_model')
 * and loaded by scorer.ts on each cron run.
 *
 * This means the scoring model literally improves itself based on Brandon's taste.
 */

import Anthropic     from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { DEFAULT_WEIGHTS, type LearnedWeights } from './scorer';

// ─── Clients ─────────────────────────────────────────────────────────────────

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function getAnthropic() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  return new Anthropic({ apiKey: key });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface OutreachDecision {
  id:       string;
  status:   'approved' | 'draft_rejected';
  score_100?: number;
  matched_labels?:     string[];
  icp_signals?:        string[];
  intensity_signals?:  string[];
  post_title?:         string;
  post_preview?:       string;
  platform?:           string;
  subreddit?:          string;
  draft_opening?:      string;
  draft_angle?:        string;
}

interface AnalysisResult {
  summary:              string;
  approved_patterns:    string[];
  rejected_patterns:    string[];
  updated_weights:      LearnedWeights;
  confidence:           'low' | 'medium' | 'high';
  recommendations:      string[];
}

// ─── Weight persistence ───────────────────────────────────────────────────────

const CONFIG_SOURCE = 'scoring_model';
const CONFIG_TYPE   = 'config';

/**
 * Load the current learned weights from Supabase.
 * Falls back to DEFAULT_WEIGHTS if no model has been trained yet.
 */
export async function loadCurrentWeights(userId: string): Promise<LearnedWeights> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('tkg_signals')
    .select('content')
    .eq('user_id', userId)
    .eq('source', CONFIG_SOURCE)
    .eq('type', CONFIG_TYPE)
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.content) return { ...DEFAULT_WEIGHTS };

  try {
    const parsed = JSON.parse(String(data.content)) as LearnedWeights;
    return { ...DEFAULT_WEIGHTS, ...parsed };
  } catch {
    return { ...DEFAULT_WEIGHTS };
  }
}

/**
 * Persist updated weights to tkg_signals.
 * Stores as a new row so we have a full history of model versions.
 */
async function saveWeights(userId: string, weights: LearnedWeights): Promise<void> {
  const supabase = getSupabase();
  await supabase.from('tkg_signals').insert({
    user_id:      userId,
    source:       CONFIG_SOURCE,
    type:         CONFIG_TYPE,
    content:      JSON.stringify(weights),
    content_hash: `scoring_model_v${weights.version}`,
    occurred_at:  new Date().toISOString(),
    processed:    true,
    recipients:   [],
  });
}

// ─── Decision fetching ────────────────────────────────────────────────────────

/**
 * Count outreach decisions (approve + skip) since the last model analysis.
 */
export async function countDecisionsSinceLastAnalysis(userId: string): Promise<number> {
  const supabase  = getSupabase();
  const weights   = await loadCurrentWeights(userId);
  const sinceDate = weights.version === 0
    ? new Date(0).toISOString()
    : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(); // last 90 days

  const { count } = await supabase
    .from('tkg_actions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', ['approved', 'draft_rejected'])
    .eq('execution_result->>draft_type' as any, 'social_outreach')
    .gte('generated_at', sinceDate);

  return count ?? 0;
}

/**
 * Fetch all outreach decisions for analysis.
 * Returns both approved and skipped, with their full context.
 */
async function fetchOutreachDecisions(userId: string): Promise<OutreachDecision[]> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('tkg_actions')
    .select('id, status, execution_result, generated_at')
    .eq('user_id', userId)
    .in('status', ['approved', 'draft_rejected'])
    .eq('execution_result->>draft_type' as any, 'social_outreach')
    .order('generated_at', { ascending: false })
    .limit(50); // analyze up to last 50 decisions

  if (!data?.length) return [];

  return data.map(row => {
    const r = (row.execution_result as Record<string, unknown>) ?? {};
    return {
      id:               row.id,
      status:           row.status as 'approved' | 'draft_rejected',
      score_100:        Number(r.score_100 ?? 0),
      matched_labels:   Array.isArray(r.matched_labels) ? r.matched_labels as string[] : [],
      icp_signals:      Array.isArray(r.icp_signals) ? r.icp_signals as string[] : [],
      intensity_signals: Array.isArray(r.intensity_signals) ? r.intensity_signals as string[] : [],
      post_title:       String(r.post_title ?? ''),
      post_preview:     String(r.post_preview ?? ''),
      platform:         String(r.platform ?? ''),
      subreddit:        String(r.subreddit ?? ''),
      draft_opening:    String(r.draft_opening ?? ''),
      draft_angle:      String(r.draft_angle ?? ''),
    };
  });
}

// ─── Analysis ─────────────────────────────────────────────────────────────────

const ANALYSIS_SYSTEM = `You are a data scientist specializing in B2B SaaS user acquisition.
You are analyzing Brandon's outreach approval patterns to improve Foldera's pain signal scoring model.

Brandon (founder) reviews Reddit/Twitter pain signal posts and decides whether to reach out.
He approves posts where the person is CLEARLY in Foldera's ICP and experiencing ACUTE pain.
He skips posts where the signal is weak, vague, or off-target.

Foldera's ICP: founders/executives without a chief of staff, ADHD professionals who drop commitments.
Core pain: overwhelmed by email, dropping commitments, decision fatigue, need an EA but can't afford one.

You will receive:
- A list of approved outreach posts with their signal data
- A list of skipped outreach posts with their signal data

Your job: identify the patterns that distinguish approved from skipped, then return updated weight multipliers.

Current weight ranges:
- keyword_multiplier: 0.5-2.0 (scales the keyword score component)
- icp_leadership_bonus: 5-25 (bonus when post mentions founder/CEO/startup)
- icp_executive_bonus: 5-20 (bonus when post mentions executive/operator)
- icp_adhd_bonus: 5-25 (bonus when post mentions ADHD/executive function)
- intensity_per_signal: 3-10 (bonus per intensity signal match)

Return ONLY valid JSON:
{
  "summary": "2-3 sentence description of the key pattern you found",
  "approved_patterns": ["pattern 1", "pattern 2", "pattern 3"],
  "rejected_patterns": ["pattern 1", "pattern 2"],
  "updated_weights": {
    "keyword_multiplier": 1.0,
    "icp_leadership_bonus": 15,
    "icp_executive_bonus": 12,
    "icp_adhd_bonus": 18,
    "intensity_per_signal": 5,
    "version": <increment_current_version_by_1>
  },
  "confidence": "low|medium|high",
  "recommendations": ["actionable suggestion 1", "actionable suggestion 2"]
}`;

/**
 * Run the full learning loop:
 * 1. Fetch all outreach decisions
 * 2. Ask Claude to analyze patterns
 * 3. Save updated weights
 *
 * Returns the analysis result, or null if insufficient data.
 */
export async function runLearningLoop(userId: string): Promise<AnalysisResult | null> {
  const decisions = await fetchOutreachDecisions(userId);

  const approved = decisions.filter(d => d.status === 'approved');
  const skipped  = decisions.filter(d => d.status === 'draft_rejected');

  // Need at least 20 total decisions and at least some of each type
  if (decisions.length < 20) {
    console.log(`[learning-loop] only ${decisions.length} decisions — need 20 to analyze`);
    return null;
  }

  const currentWeights = await loadCurrentWeights(userId);

  const prompt = `
CURRENT MODEL VERSION: ${currentWeights.version}
TOTAL DECISIONS: ${decisions.length} (${approved.length} approved, ${skipped.length} skipped)

APPROVED OUTREACH POSTS (${approved.length}):
${approved.slice(0, 20).map((d, i) => `
[${i + 1}] APPROVED
  Score: ${d.score_100}/100
  Platform: ${d.platform}${d.subreddit ? ` r/${d.subreddit}` : ''}
  Post title: "${d.post_title}"
  Post preview: "${d.post_preview}"
  Matched labels: ${d.matched_labels.join(', ') || 'none'}
  ICP signals: ${d.icp_signals.join(', ') || 'none'}
  Intensity signals: ${d.intensity_signals.join(', ') || 'none'}
  Draft angle: "${d.draft_angle}"
`).join('\n')}

SKIPPED OUTREACH POSTS (${skipped.length}):
${skipped.slice(0, 20).map((d, i) => `
[${i + 1}] SKIPPED
  Score: ${d.score_100}/100
  Platform: ${d.platform}${d.subreddit ? ` r/${d.subreddit}` : ''}
  Post title: "${d.post_title}"
  Post preview: "${d.post_preview}"
  Matched labels: ${d.matched_labels.join(', ') || 'none'}
  ICP signals: ${d.icp_signals.join(', ') || 'none'}
  Intensity signals: ${d.intensity_signals.join(', ') || 'none'}
  Draft angle: "${d.draft_angle}"
`).join('\n')}

CURRENT WEIGHTS:
${JSON.stringify(currentWeights, null, 2)}

Analyze what distinguishes the approved posts from the skipped ones.
Update the weights to better surface posts Brandon approves.
`;

  try {
    const client   = getAnthropic();
    const response = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 1024,
      system:     ANALYSIS_SYSTEM,
      messages:   [{ role: 'user', content: prompt }],
    });

    const text  = response.content[0].type === 'text' ? response.content[0].text : '';
    const clean = text.replace(/```json\s*/g, '').replace(/```/g, '').trim();
    const match = clean.match(/(\{[\s\S]*\})/);
    if (!match) {
      console.warn('[learning-loop] no JSON in analysis response');
      return null;
    }

    const result = JSON.parse(match[1]) as AnalysisResult;

    // Validate and clamp weights to safe ranges
    const w = result.updated_weights;
    w.keyword_multiplier   = Math.min(Math.max(w.keyword_multiplier ?? 1.0, 0.3), 2.5);
    w.icp_leadership_bonus = Math.min(Math.max(w.icp_leadership_bonus ?? 15, 5), 30);
    w.icp_executive_bonus  = Math.min(Math.max(w.icp_executive_bonus ?? 12, 5), 25);
    w.icp_adhd_bonus       = Math.min(Math.max(w.icp_adhd_bonus ?? 18, 5), 30);
    w.intensity_per_signal = Math.min(Math.max(w.intensity_per_signal ?? 5, 2), 12);
    w.version              = (currentWeights.version ?? 0) + 1;

    // Persist
    await saveWeights(userId, w);

    console.log(
      `[learning-loop] model updated to v${w.version}. ` +
      `Analyzed ${decisions.length} decisions (${approved.length} approved, ${skipped.length} skipped). ` +
      `Confidence: ${result.confidence}`,
    );

    return result;
  } catch (err: any) {
    console.error('[learning-loop] analysis failed:', err.message);
    return null;
  }
}

/**
 * Check if a learning analysis should run (>= 20 new decisions since last run).
 */
export async function shouldRunAnalysis(userId: string): Promise<boolean> {
  const count = await countDecisionsSinceLastAnalysis(userId);
  return count >= 20;
}
