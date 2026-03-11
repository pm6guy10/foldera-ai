/**
 * POST /api/acquisition/analyze
 *
 * Runs the outreach learning loop:
 *   1. Fetches all approved + skipped social_outreach decisions
 *   2. Asks Claude to find patterns distinguishing approved from skipped
 *   3. Updates the scoring model weights in Supabase
 *
 * Called automatically from /api/drafts/decide after 20 outreach decisions.
 * Also called weekly by the outreach-learner cron as a reliable fallback.
 * Can be called manually for on-demand analysis.
 *
 * Auth: x-ingest-secret header OR CRON_SECRET Bearer.
 */

import { NextResponse } from 'next/server';
import { runLearningLoop, shouldRunAnalysis } from '@/lib/acquisition/learning-loop';

export const dynamic     = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: Request) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const ingestSecret = request.headers.get('x-ingest-secret');
  const authHeader   = request.headers.get('authorization') ?? '';
  const cronSecret   = process.env.CRON_SECRET;

  const validIngest = ingestSecret && ingestSecret === process.env.INGEST_API_KEY;
  const validCron   = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!validIngest && !validCron) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = process.env.INGEST_USER_ID;
  if (!userId) {
    return NextResponse.json({ error: 'INGEST_USER_ID not set' }, { status: 500 });
  }

  // ── Check if analysis is warranted ────────────────────────────────────────
  const body   = await request.json().catch(() => ({})) as Record<string, unknown>;
  const force  = body.force === true; // allow forced analysis regardless of count

  if (!force) {
    const ready = await shouldRunAnalysis(userId);
    if (!ready) {
      return NextResponse.json({
        ok:      true,
        ran:     false,
        message: 'Fewer than 20 decisions since last analysis — skipping',
      });
    }
  }

  // ── Run the learning loop ─────────────────────────────────────────────────
  try {
    const result = await runLearningLoop(userId);

    if (!result) {
      return NextResponse.json({
        ok:      true,
        ran:     false,
        message: 'Insufficient data for analysis (need at least 20 decisions)',
      });
    }

    console.log(
      `[acquisition/analyze] model updated — confidence: ${result.confidence}. ` +
      result.summary,
    );

    return NextResponse.json({
      ok:               true,
      ran:              true,
      confidence:       result.confidence,
      summary:          result.summary,
      approved_patterns: result.approved_patterns,
      rejected_patterns: result.rejected_patterns,
      recommendations:  result.recommendations,
      new_version:      result.updated_weights.version,
    });
  } catch (err: any) {
    console.error('[acquisition/analyze] failed:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── GET: returns current model status ────────────────────────────────────────
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization') ?? '';
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // Also allow ingest secret
    const ingestSecret = request.headers.get('x-ingest-secret');
    if (!ingestSecret || ingestSecret !== process.env.INGEST_API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const userId = process.env.INGEST_USER_ID;
  if (!userId) return NextResponse.json({ error: 'INGEST_USER_ID not set' }, { status: 500 });

  const { loadCurrentWeights, countDecisionsSinceLastAnalysis } =
    await import('@/lib/acquisition/learning-loop');

  const [weights, decisionCount] = await Promise.all([
    loadCurrentWeights(userId),
    countDecisionsSinceLastAnalysis(userId),
  ]);

  return NextResponse.json({
    ok:                      true,
    model_version:           weights.version,
    decisions_since_analysis: decisionCount,
    needs_analysis:          decisionCount >= 20,
    weights,
  });
}
