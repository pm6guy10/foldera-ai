/**
 * Agent 5 — Trust Auditor
 *
 * Thinks like a skeptical first-time user who's been burned by AI products before.
 * Reads every claim, every permission request, every dark pattern as a reason to leave.
 * Flags trust violations, credibility gaps, and anxiety-inducing moments.
 * Stages fixes in DraftQueue.
 */

import { agentThink, createDraft, type AgentDraft } from './base-agent';
import type { ActionType } from '@/lib/briefing/types';

const AGENT_NAME = 'trust-auditor';

const SYSTEM = `You are a skeptical first-time user who's been burned by 10 AI products that overpromised.
You have a healthy distrust of: vague claims, data grabs, opaque AI behavior, and products that won't tell you what they do with your data.
You are auditing Foldera — an AI personal chief of staff that reads your emails and tracks your patterns.

You are specifically allergic to:
- Claims without evidence ("we use AI" with no explanation)
- Permission requests without clear benefit statement
- Behavioral tracking without explicit consent
- Dark patterns (pre-checked boxes, confusing cancellation, fake urgency)
- Copy that sounds corporate or evasive
- Missing privacy/security transparency

You will be given a description of the current app state. Identify up to 5 trust violations or
credibility gaps that would make a first-time user hesitate, doubt, or leave. Be specific. Be harsh.

Return ONLY valid JSON (no markdown wrapping) in this exact format:
{
  "findings": [
    {
      "location": "string — exactly where in the app this violation occurs",
      "violation": "string — what the trust issue is",
      "user_thought": "string — the exact skeptical thought a user would have (in first person)",
      "fix": "string — specific copy, UX, or transparency fix in ≤ 2 sentences",
      "severity": "critical|high|medium",
      "action_type": "write_document"
    }
  ]
}`;

interface TrustFinding {
  location:    string;
  violation:   string;
  user_thought: string;
  fix:         string;
  severity:    string;
  action_type: ActionType;
}

interface TrustOutput {
  findings: TrustFinding[];
}

/** Current app description from a trust/credibility perspective */
const APP_DESCRIPTION = `
Foldera App — Trust Audit State (as of 2026-03-10):

WHAT FOLDERA DOES (that touches sensitive data):
- Reads emails via Gmail OAuth and Microsoft OAuth
- Extracts patterns from conversations and decisions
- Stores behavioral data in a database
- Sends daily directive emails at 7AM
- Runs AI analysis on personal communication

WHAT THE APP CURRENTLY SAYS ABOUT PRIVACY/SECURITY:
- Landing page headline: "Your patterns. Finally visible."
- No explicit privacy policy link visible on landing page
- No "what we do with your data" explainer
- No "you can delete everything" option visible
- OAuth consent screen handled by Google/Microsoft (standard)
- "Shadow Mode Active" shown in dashboard top bar (no explanation of what this means)
- Settings page shows: Gmail, Outlook, Google Drive integration cards

LANDING PAGE (/):
- Dark hero with headline and 3 CTAs
- Claims: patterns visible, behavioral insights, cognition engine
- No specific data handling explanation
- "Free · Takes 30 seconds · No card required" — reassuring, but no data explanation

ONBOARDING (/onboard):
- Shows a demo directive with confidence %, action type badge, reason text
- CTA: "Get your dashboard →" → /api/auth/signin
- No explanation of what data Foldera accesses during onboarding

DASHBOARD:
- "Teach Foldera" panel: textarea to paste conversations
- No explicit statement about how pasted text is used or stored
- "Shadow Mode Active" in top bar — mysterious terminology
- DraftQueue: shows AI agent proposals, no explanation of what agent ran or why

INTEGRATIONS (settings):
- Gmail: "Connect Gmail" button
- Outlook: "Connect Outlook" button
- Google Drive: "Connect Google Drive" button
- No description of what each integration reads, how often, or what it does with data
`;

export async function runTrustAuditor(userId: string): Promise<number> {
  const result = await agentThink(SYSTEM, APP_DESCRIPTION, AGENT_NAME) as TrustOutput | null;
  if (!result?.findings) return 0;

  let drafted = 0;
  for (const finding of result.findings.slice(0, 5)) {
    const draft: AgentDraft = {
      title:       `[Trust] ${finding.location}: ${finding.violation.slice(0, 80)}`,
      description: `Trust Auditor flagged a ${finding.severity} trust violation at ${finding.location}`,
      action_type: 'write_document',
      payload: {
        draft_type:   'trust_fix',
        location:     finding.location,
        violation:    finding.violation,
        user_thought: finding.user_thought,
        fix:          finding.fix,
        severity:     finding.severity,
        body: `**Location:** ${finding.location}\n\n**Trust Violation:** ${finding.violation}\n\n**What the user is thinking:** "${finding.user_thought}"\n\n**Fix:** ${finding.fix}\n\n**Severity:** ${finding.severity}`,
      },
    };
    const id = await createDraft(userId, AGENT_NAME, draft);
    if (id) drafted++;
  }
  return drafted;
}
