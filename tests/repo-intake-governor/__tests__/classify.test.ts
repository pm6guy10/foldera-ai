import { describe, expect, it } from 'vitest';
import { classifyInput } from '@/lib/repo-intake-governor';

describe('Repo Intake Governor classification', () => {
  it.each([
    ['VISION', 'Foldera should feel like it found my re-entry point before I reopened five tools.'],
    ['AUDIT_FINDING', 'Audit finding: ACTIVE_HANDOFF still points at a closed issue after the PR merged.'],
    ['ACTIVE_SEAM_COMMAND', 'Run issue #166 only and execute the active Repo Intake Governor seam.'],
    ['BLOCKER_REPORT', 'Blocker report: PR #142 CI failed and Vercel did not receive POST /api/slack/interaction.'],
    ['BUSINESS_PLAN_UPDATE', 'Pricing thought: start with pilot-honest pricing after first value proof.'],
    ['ARCHITECTURE_DOCTRINE', 'Architecture doctrine: GitHub source truth beats labels, projects, chat, and stale docs.'],
    ['PRODUCT_PROOF', 'Proof: the Right Now card rendered, I clicked Done, and workday state updated.'],
    ['REPO_HYGIENE', 'Repo hygiene: archive stale docs and remove old ghost files.'],
    ['LESSON_LEARNED', 'Lesson learned: do not treat screenshots as product proof without the route flow.'],
    ['REFERENCE_ONLY', 'Duplicate idea already represented in the North Star Lock; keep as reference only.'],
    ['UNSAFE_EXPANSION', 'Build the dashboard, Slack live send, Supabase schema, Stripe billing, and outreach scraper now.'],
    ['OPEN_THREAD_CAPTURE', "What's on my mind: Foldera feels close, but I am not sure where this belongs yet."],
  ] as const)('classifies %s input', (classification, input) => {
    expect(classifyInput(input).classification).toBe(classification);
  });
});
