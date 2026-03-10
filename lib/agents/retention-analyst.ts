/**
 * Agent 4 — Retention Analyst
 *
 * Thinks like a churn analyst from Amplitude with deep product intuition.
 * Reviews activation sequences, habit loops, and value delivery timing.
 * Flags retention risks before users churn. Proposes fixes to DraftQueue.
 */

import { agentThink, createDraft, getAppSnapshot, type AgentDraft } from './base-agent';
import type { ActionType } from '@/lib/briefing/types';

const AGENT_NAME = 'retention-analyst';

const SYSTEM = `You are a retention and churn analyst who has worked at Amplitude and studied 50+ SaaS products.
You think in activation sequences, habit loops, value delivery timing, and dead-end patterns.
You are analyzing Foldera — an AI personal chief of staff app.

The product promise: zero-lift operating leverage. If users have to think hard, the feature is broken.

Core retention mechanic: users must (1) ingest text → (2) see a useful directive → (3) approve it → (4) report it worked.
Each successful cycle should deepen the habit. Each friction point is a churn risk.

You will be given the current product state and user behavior data. Identify up to 5 retention risks
or activation improvements. Focus on: onboarding to first value, habit reinforcement, re-engagement
triggers, empty state experiences, and value visibility.

Return ONLY valid JSON (no markdown wrapping) in this exact format:
{
  "findings": [
    {
      "stage": "string — funnel stage (e.g., activation, habit formation, re-engagement, value visibility)",
      "risk": "string — what might cause a user to churn or not return",
      "fix": "string — specific product or copy change in ≤ 2 sentences",
      "metric_to_move": "string — which metric this fix would improve",
      "severity": "critical|high|medium",
      "action_type": "write_document"
    }
  ]
}`;

interface RetentionFinding {
  stage:          string;
  risk:           string;
  fix:            string;
  metric_to_move: string;
  severity:       string;
  action_type:    ActionType;
}

interface RetentionOutput {
  findings: RetentionFinding[];
}

export async function runRetentionAnalyst(userId: string): Promise<number> {
  const snapshot = await getAppSnapshot(userId);

  // Build behavioral summary from the snapshot
  const totalSignals   = snapshot.signals.length;
  const totalActions   = snapshot.actions.length;
  const totalPatterns  = snapshot.patterns.length;

  const approvedCount  = snapshot.actions.filter(a => a.status === 'approved' || a.status === 'executed').length;
  const skippedCount   = snapshot.actions.filter(a => a.status === 'skipped').length;
  const pendingCount   = snapshot.actions.filter(a => a.status === 'pending' || a.status === 'draft').length;

  const workedCount    = snapshot.actions.filter(
    a => typeof a.feedback_weight === 'number' && a.feedback_weight > 0,
  ).length;

  const context = `
Foldera — Retention Context (as of ${new Date().toISOString().slice(0, 10)}):

PRODUCT FUNNEL:
1. Land on foldera.ai
2. See live demo directive on landing page
3. Click "See your patterns" → onboard page
4. Onboard: "Finding your patterns..." → single demo directive → CTA to sign up
5. Dashboard: Teach Foldera panel → ingest text → get directives → approve/skip → outcome

CURRENT BEHAVIORAL DATA:
- Signals ingested: ${totalSignals}
- Total directives generated: ${totalActions}
- Directives approved/executed: ${approvedCount}
- Directives skipped: ${skippedCount}
- Pending/draft directives: ${pendingCount}
- Directives that "worked" (positive feedback): ${workedCount}
- Patterns identified: ${totalPatterns}

ACTIVATION CHECKPOINTS (where users should experience "holy crap"):
1. First ingest → seeing Foldera extract something real from their text
2. First directive → relevant to their actual life
3. First "it worked" → Foldera predicted correctly and was right
4. Pattern recognition → seeing their own behavior reflected back

CURRENT PRODUCT STATE:
- Empty state on first load shows zero metrics with subtle hints ("Feed text to start")
- "Teach Foldera" panel is the primary activation action
- No onboarding checklist, no progress indicator, no activation milestone celebration
- No re-engagement email for users who haven't ingested in 3+ days
- Daily directive email at 7AM if OAuth email connected
- Mobile bottom navigation: Home / Briefings / Signals / Settings

RETENTION RISKS TO ANALYZE:
- Time to first value (is the path obvious enough?)
- Empty state experience (does zero data feel motivating or deflating?)
- Habit formation (is there a daily trigger to return?)
- Value visibility (can users see their own progress?)
- Dead ends (where would a user get stuck and leave?)
`;

  const result = await agentThink(SYSTEM, context, AGENT_NAME) as RetentionOutput | null;
  if (!result?.findings) return 0;

  let drafted = 0;
  for (const finding of result.findings.slice(0, 5)) {
    const draft: AgentDraft = {
      title:       `[Retention] ${finding.stage}: ${finding.risk.slice(0, 80)}`,
      description: `Retention Analyst flagged a ${finding.severity} churn risk at ${finding.stage}`,
      action_type: 'write_document',
      payload: {
        draft_type:     'retention_fix',
        stage:          finding.stage,
        risk:           finding.risk,
        fix:            finding.fix,
        metric_to_move: finding.metric_to_move,
        severity:       finding.severity,
        body: `**Funnel Stage:** ${finding.stage}\n\n**Churn Risk:** ${finding.risk}\n\n**Fix:** ${finding.fix}\n\n**Metric to Move:** ${finding.metric_to_move}\n\n**Severity:** ${finding.severity}`,
      },
    };
    const id = await createDraft(userId, AGENT_NAME, draft);
    if (id) drafted++;
  }
  return drafted;
}
