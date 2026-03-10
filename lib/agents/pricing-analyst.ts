/**
 * Agent 2 — Pricing Analyst
 *
 * Thinks like a SaaS pricing expert who has studied Stripe, Linear, and Notion.
 * Reviews positioning, tier structure, conversion friction, and expansion revenue.
 * Stages pricing improvement proposals in DraftQueue.
 */

import { agentThink, createDraft, type AgentDraft } from './base-agent';
import type { ActionType } from '@/lib/briefing/types';

const AGENT_NAME = 'pricing-analyst';

const SYSTEM = `You are a SaaS pricing expert who has shaped pricing at Stripe, Linear, and Notion.
You understand willingness-to-pay, tier psychology, expansion revenue, and conversion rate impact.
You are reviewing Foldera — an AI personal chief of staff app targeting founders, executives, and busy professionals.

Current pricing:
- Free tier: basic access (no card required)
- Pro Plan: shown in sidebar for current user (price TBD / not publicly displayed)

You will be given a description of the product and market context. Identify up to 5 concrete
pricing and positioning improvements. Focus on: tier structure, value metric alignment,
expansion triggers, conversion flow, and trust signals at the paywall.

Return ONLY valid JSON (no markdown wrapping) in this exact format:
{
  "findings": [
    {
      "area": "string — pricing area (e.g., tier structure, paywall UX, value metric)",
      "issue": "string — what's suboptimal or missing",
      "recommendation": "string — specific fix in ≤ 2 sentences",
      "expected_impact": "string — conversion / retention / expansion impact",
      "priority": "critical|high|medium",
      "action_type": "write_document"
    }
  ]
}`;

interface PricingFinding {
  area:            string;
  issue:           string;
  recommendation:  string;
  expected_impact: string;
  priority:        string;
  action_type:     ActionType;
}

interface PricingOutput {
  findings: PricingFinding[];
}

/** Product + market context fed to the analyst each run */
const PRODUCT_CONTEXT = `
Foldera — Pricing Context (as of 2026-03-10):

PRODUCT:
- AI personal chief of staff that reads emails, tracks commitments, surfaces decisions
- Dark-themed web app (mobile-responsive), no mobile app yet
- Single-user product (one person's account per subscription)
- Current workflow: ingest text → extract patterns → daily directive → approve/skip
- Zero-setup promise: "Free · Takes 30 seconds · No card required"

TARGET USERS:
- Founders and solo operators drowning in communication
- Executives without a human chief of staff
- ADHD professionals who struggle with follow-through
- Busy professionals who drop commitments

COMPETITIVE LANDSCAPE:
- Human executive assistants: $60-150k/year salary
- Notion AI, Superhuman: productivity tools, not agents
- Reclaim.ai, Motion: calendar AI, not commitment/relationship management
- No direct AI chief of staff competitor at this price point

CURRENT STATE:
- No public pricing page exists yet
- "Pro Plan" badge in sidebar — price undisclosed
- Free tier has no stated limitations
- No trial countdown, no feature gates, no upsell flows
- Early access positioning — capturing emails on landing

SIGNALS:
- Value delivered: pattern recognition, daily directive, commitment tracking
- Usage triggers: first ingest, first directive approved, first "it worked" outcome
`;

export async function runPricingAnalyst(userId: string): Promise<number> {
  const result = await agentThink(SYSTEM, PRODUCT_CONTEXT, AGENT_NAME) as PricingOutput | null;
  if (!result?.findings) return 0;

  let drafted = 0;
  for (const finding of result.findings.slice(0, 5)) {
    const draft: AgentDraft = {
      title:       `[Pricing] ${finding.area}: ${finding.issue.slice(0, 80)}`,
      description: `Pricing Analyst flagged a ${finding.priority} pricing issue: ${finding.area}`,
      action_type: 'write_document',
      payload: {
        draft_type:      'pricing_recommendation',
        area:            finding.area,
        issue:           finding.issue,
        recommendation:  finding.recommendation,
        expected_impact: finding.expected_impact,
        priority:        finding.priority,
        body: `**Area:** ${finding.area}\n\n**Issue:** ${finding.issue}\n\n**Recommendation:** ${finding.recommendation}\n\n**Expected Impact:** ${finding.expected_impact}\n\n**Priority:** ${finding.priority}`,
      },
    };
    const id = await createDraft(userId, AGENT_NAME, draft);
    if (id) drafted++;
  }
  return drafted;
}
