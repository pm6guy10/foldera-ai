/**
 * Agent 1 — UI/UX Critic
 *
 * Thinks like a senior product designer with 10 years at Apple.
 * Walks every screen. Flags anything that violates: hierarchy, clarity,
 * trust, delight. Stages design fix proposals in DraftQueue.
 */

import { agentThink, createDraft, type AgentDraft } from './base-agent';
import type { ActionType } from '@/lib/briefing/types';

const AGENT_NAME = 'uiux-critic';

const SYSTEM = `You are a senior product designer with 10 years at Apple and Stripe.
You think about hierarchy, clarity, trust signals, and delight moments.
You are reviewing Foldera — an AI personal chief of staff app. It's dark-themed (zinc-950 bg),
uses cyan/emerald accent colors, shows behavioral directives, and lets users approve/reject agent actions.

You will be given a description of the current app state. Your job is to identify up to 5 concrete,
actionable design improvements. Focus on what a first-time user would experience.

Return ONLY valid JSON (no markdown wrapping) in this exact format:
{
  "findings": [
    {
      "screen": "string — which screen/component",
      "issue": "string — what's broken or suboptimal",
      "fix": "string — specific fix in ≤ 2 sentences",
      "severity": "critical|high|medium",
      "action_type": "write_document"
    }
  ]
}`;

interface Finding {
  screen:      string;
  issue:       string;
  fix:         string;
  severity:    string;
  action_type: ActionType;
}

interface CriticOutput {
  findings: Finding[];
}

/** Current app description — updated manually when major screens change */
const APP_DESCRIPTION = `
Foldera App — Current State (as of 2026-03-13):

LANDING PAGE (app/page.tsx):
- Dark hero (zinc-950 bg) with "The work is done before you ask." headline
- Interactive Chaos→Clarity demo: 3 scenario tabs (Job Hunt, Founder Overload, Life Admin)
  Each shows: chaotic inbox items on left → conviction card with Approve button on right
- CTAs: "Get started" → /start; "Sign in" → /start; nav has Product/Security/Pricing links
- Sections: features grid (6 cards), 3-step loop, artifact demo, security/pricing, footer
- Nav: Product/Security/Pricing hidden on mobile (md:flex), Sign in hidden on sm, Get started always visible
- Pricing: single $19/month plan, 14-day free trial, no credit card

ONBOARDING (/start, /start/processing, /start/result):
- /start: "Connect with Google" + "Connect with Microsoft" OAuth buttons + paste fallback
- /start/processing: animated spinner → syncs email → if thin history, offers paste textarea
  Edge cases: very_thin (email capture), thankyou (waitlisted), error (retry button)
- /start/result: full directive card (action badge, confidence %, directive text, evidence)
  3-step walkthrough overlay for first-time users (localStorage-gated), then trial CTA
  CTA: "Start 14-day free trial" → /dashboard

DASHBOARD (/dashboard):
- Greeting + human-readable date
- Signal line (compact): "N signals · N commitments · N patterns detected"
- DraftQueue (hidden when empty): shows pending agent proposals with Approve/Dismiss
- ConvictionCard (2/3 width): Today's Read — action type badge, directive, confidence %,
  reason, artifact preview, Approve/Skip buttons
  Post-skip state: terminal message "Skipped. The engine will recalibrate." + "Next read generates tomorrow morning." (no regenerate)
  Post-approve state: "Did it work?" thumbs up/down → outcome logged → done message
- Teach Foldera panel (1/3 width): textarea to paste conversations
- Mobile: bottom 4-tab nav (Home/Briefings/Signals/Settings)

SIDEBAR (desktop):
- Foldera logo, 5 nav items (Dashboard, Briefings, Relationships, Signals, Settings)
- Bottom: user name + Pro Plan avatar section

TOP BAR:
- Search/command button (⌘K) → command palette with 4 navigation items
- Bell icon

DASHBOARD PAGES:
- /dashboard/briefings — empty state with FileText icon, message about future reads
- /dashboard/relationships — live: fetches cooling relationships from /api/briefing/latest
- /dashboard/signals — live: Activity header, stats strip (items processed, sources, updated),
  empty state with connect-inbox CTA or activity list with source breakdown bars
- /dashboard/settings — integration connect page (Gmail, Outlook, Google Drive) + AI spend bar
`;

export async function runUiUxCritic(userId: string): Promise<number> {
  const result = await agentThink(SYSTEM, APP_DESCRIPTION, AGENT_NAME) as CriticOutput | null;
  if (!result?.findings) return 0;

  let drafted = 0;
  for (const finding of result.findings.slice(0, 5)) {
    const draft: AgentDraft = {
      title:       `[UX] ${finding.screen}: ${finding.issue.slice(0, 80)}`,
      description: `UI/UX Critic flagged a ${finding.severity} design issue in ${finding.screen}`,
      action_type: 'write_document',
      payload: {
        draft_type: 'design_fix',
        screen:     finding.screen,
        issue:      finding.issue,
        fix:        finding.fix,
        severity:   finding.severity,
        body:       `**Screen:** ${finding.screen}\n\n**Issue:** ${finding.issue}\n\n**Recommended fix:** ${finding.fix}\n\n**Severity:** ${finding.severity}`,
      },
    };
    const id = await createDraft(userId, AGENT_NAME, draft);
    if (id) drafted++;
  }
  return drafted;
}
