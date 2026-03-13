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
Foldera App — Current State (as of 2026-03-10):

LANDING PAGE (app/page.tsx):
- Dark hero (#0B0B0C bg) with "Your patterns. Finally visible." headline
- Live Cognition Engine card showing animated historical evidence timeline + pattern card
- Three CTAs: "See your patterns" → /onboard; "Log in" → signin; bottom CTA → /onboard
- Sections: mechanism (3 steps), domain cards (Career/Relationships/Decisions), big CTA
- Live ticker with behavioral insights scrolling horizontally
- No mobile hamburger menu; nav has Log in + Get Early Access

ONBOARDING (/onboard):
- Minimal dark page, shows "Finding your patterns..." then a directive
- Action type (e.g. DECIDE), confidence % (now visible at #8b7355), directive text, reason
- CTA: "Get your dashboard →" → /api/auth/signin
- Tagline: "Free · Takes 30 seconds · No card required"

DASHBOARD (/dashboard):
- Greeting + human-readable date
- 3 metric cards (Signals, Commitments, Patterns) — zeros show context hints
- DraftQueue (hidden when empty): shows pending agent proposals with Approve/Reject
- ConvictionCard (2/3 width): Today's Directive with action type badge, directive text,
  confidence %, reason, Approve/Skip buttons → leads to "Did it work?" ThumbsUp/ThumbsDown
- Teach Foldera panel (1/3 width): textarea to paste conversations
- Mobile: bottom 4-tab nav (Home/Briefings/Signals/Settings)

SIDEBAR (desktop):
- Foldera logo, 5 nav items (Dashboard, Briefings, Relationships, Signals, Settings)
- Bottom: Brandon + Pro Plan avatar section

TOP BAR:
- Search/command button (⌘K) → command palette with 4 navigation items
- "Shadow Mode Active" status indicator
- Bell icon (no red dot currently)

DASHBOARD PAGES (mostly placeholder):
- /dashboard/briefings — empty state message
- /dashboard/relationships — empty state message
- /dashboard/signals — empty state message
- /dashboard/settings — integration connect page (Gmail, Outlook, Google Drive)
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
