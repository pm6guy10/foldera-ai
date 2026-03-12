/**
 * Cron route — Outreach Learning Loop
 * Schedule: weekly on Sunday at 11:00 PM (before Monday morning scans)
 * Vercel Cron: 0 23 * * 0
 *
 * Reliable fallback trigger for the learning loop.
 * The decide route fires analysis on the 20th decision, but this cron
 * guarantees the analysis runs even if the fire-and-forget fails.
 *
 * Also stores a weekly summary of outreach performance in DraftQueue
 * so Brandon can see what the model learned.
 */

import { NextResponse } from 'next/server';
import { runLearningLoop, countDecisionsSinceLastAnalysis } from '@/lib/acquisition/learning-loop';
import { createServerClient } from '@/lib/db/client';

export const maxDuration = 120;


export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = process.env.INGEST_USER_ID;
  if (!userId) {
    return NextResponse.json({ error: 'INGEST_USER_ID not set' }, { status: 500 });
  }

  const decisionCount = await countDecisionsSinceLastAnalysis(userId);

  if (decisionCount < 20) {
    console.log(
      `[outreach-learner] only ${decisionCount} decisions since last analysis — ` +
      `need 20 to retrain. Waiting.`,
    );
    return NextResponse.json({
      ok:               true,
      ran:              false,
      decisions_so_far: decisionCount,
      message:          `Need ${20 - decisionCount} more decisions before retraining`,
    });
  }

  // Run the learning loop
  const result = await runLearningLoop(userId);

  if (!result) {
    return NextResponse.json({ ok: true, ran: false, message: 'Analysis returned null' });
  }

  // Surface model update as a DraftQueue item so Brandon sees what changed
  const supabase = createServerClient();
  const title    = `[Learning Loop] Scoring model updated to v${result.updated_weights.version}`;

  await supabase.from('tkg_actions').insert({
    user_id:        userId,
    directive_text: `Outreach scoring model retrained on ${decisionCount} decisions. ${result.summary}`,
    action_type:    'write_document',
    confidence:     result.confidence === 'high' ? 90 : result.confidence === 'medium' ? 70 : 50,
    reason:         title,
    evidence:       [],
    status:         'draft',
    generated_at:   new Date().toISOString(),
    execution_result: {
      _title:             title,
      _source:            'outreach-learner',
      draft_type:         'model_update',
      model_version:      result.updated_weights.version,
      confidence:         result.confidence,
      summary:            result.summary,
      approved_patterns:  result.approved_patterns,
      rejected_patterns:  result.rejected_patterns,
      recommendations:    result.recommendations,
      decisions_analyzed: decisionCount,
      body: [
        `## Outreach Scoring Model — v${result.updated_weights.version}`,
        ``,
        `**Summary:** ${result.summary}`,
        ``,
        `### What Brandon approves`,
        result.approved_patterns.map(p => `- ${p}`).join('\n'),
        ``,
        `### What Brandon skips`,
        result.rejected_patterns.map(p => `- ${p}`).join('\n'),
        ``,
        `### Recommendations`,
        result.recommendations.map(r => `- ${r}`).join('\n'),
        ``,
        `*Analyzed ${decisionCount} decisions. Confidence: ${result.confidence}.*`,
      ].join('\n'),
    },
  });

  console.log(
    `[outreach-learner] model updated to v${result.updated_weights.version}. ` +
    `Confidence: ${result.confidence}`,
  );

  return NextResponse.json({
    ok:              true,
    ran:             true,
    model_version:   result.updated_weights.version,
    confidence:      result.confidence,
    summary:         result.summary,
    decisions_analyzed: decisionCount,
  });
}
