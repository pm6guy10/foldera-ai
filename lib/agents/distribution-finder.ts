/**
 * Agent 6 — Distribution Finder
 *
 * Thinks like a connector who sees distribution opportunities everywhere.
 * Scans recent pain signal posts, identifies specific people and communities to reach,
 * and drafts personalized outreach or content ideas.
 * Stages the most promising distribution plays in DraftQueue.
 */

import { agentThink, createDraft, getSupabase, type AgentDraft } from './base-agent';
import type { ActionType } from '@/lib/briefing/types';

const AGENT_NAME = 'distribution-finder';

const SYSTEM = `You are a distribution strategist who finds under-the-radar channels for early-stage SaaS products.
You see opportunities that most founders miss: the right subreddit thread, the newsletter that serves the exact ICP,
the podcast guest slot, the Slack community, the Twitter/X account with 10k of the right followers.
You are growing Foldera — an AI personal chief of staff for overwhelmed founders and executives.

The product promise: "Your AI wakes up before you do. Reads everything. Tells you the one thing to do today."

You will be given today's pain signal data and distribution context. Identify up to 5 specific,
immediately actionable distribution opportunities. Be specific: name the community, name the person,
write the first line of the outreach, describe the content angle.

Return ONLY valid JSON (no markdown wrapping) in this exact format:
{
  "opportunities": [
    {
      "channel_type": "string — type (e.g., reddit, newsletter, podcast, community, twitter, cold_email)",
      "target": "string — specific target (subreddit name, newsletter name, person's handle, community name)",
      "opportunity": "string — what the specific opportunity is",
      "opening_line": "string — the exact first line to use in outreach or content",
      "why_fits": "string — why this channel/person is a perfect fit for Foldera's ICP",
      "action_type": "write_document"
    }
  ]
}`;

interface DistributionOpp {
  channel_type: string;
  target:       string;
  opportunity:  string;
  opening_line: string;
  why_fits:     string;
  action_type:  ActionType;
}

interface DistributionOutput {
  opportunities: DistributionOpp[];
}

/** Fetch recent high-scoring pain signal posts */
async function getTopPainSignals(): Promise<string> {
  const supabase = getSupabase();

  // Get recent social scan signals
  const { data: signals } = await supabase
    .from('tkg_signals')
    .select('source, content, type, occurred_at')
    .eq('source', 'social_scan')
    .order('occurred_at', { ascending: false })
    .limit(15);

  if (!signals?.length) {
    return 'No recent pain signals. Operate from general market knowledge.';
  }

  return signals.map((s, i) => {
    const content = String(s.content ?? '');
    return `${i + 1}. [${s.type ?? 'signal'}] ${content.slice(0, 200)}`;
  }).join('\n');
}

export async function runDistributionFinder(userId: string): Promise<number> {
  const painSignals = await getTopPainSignals();

  const context = `
Foldera — Distribution Context (as of ${new Date().toISOString().slice(0, 10)}):

PRODUCT STAGE: Pre-launch. Zero public users. Need first 100.

ICP (ideal customer profile):
- Solo founders ($500k-$5M ARR) who reply to Slack at midnight
- Executives who don't have a chief of staff but wish they did
- ADHD professionals who are brilliant but drop follow-ups
- Chiefs of staff who want AI leverage

PRODUCT VALUE PROPS (ranked by resonance):
1. "I stopped managing my own inbox. Foldera does it."
2. "It's like having a chief of staff who never sleeps."
3. "The first AI that tracks what you commit to — not just what you write down."
4. "Sent a directive I approved at 7AM. It was exactly right."

EXISTING CHANNELS:
- foldera.ai landing page (live)
- Reddit scanner: finds pain posts in r/productivity, r/Entrepreneur, r/ADHD, r/startups
- Twitter/X scanner: tracks decision fatigue, overwhelmed email, chief of staff keywords

WHERE OUR ICP HANGS OUT:
- r/Entrepreneur, r/startups, r/ADHD, r/productivity
- Indie Hackers, Hacker News "Show HN"
- Lenny's Newsletter / Lenny's Slack community
- MicroConf Slack
- On Deck community
- Twitter/X: productivity, indie hacker, SaaS founder circles
- Podcasts: My First Million, Indie Hackers, Acquired, Darknet Diaries (ADHD listeners)

TODAY'S PAIN SIGNALS (recent posts from our scanner):
${painSignals}

OUTREACH RULES (never violate):
- Never spam. One message per person. No follow-up unless they reply.
- Lead with their pain, not our product. Make them feel seen first.
- No pitch in the first message. The CTA is to share an experience or insight.
- Every outreach must be personalized to their specific post/situation.
- This is for Brandon to send manually — he approves each draft.
`;

  const result = await agentThink(SYSTEM, context, AGENT_NAME) as DistributionOutput | null;
  if (!result?.opportunities) return 0;

  let drafted = 0;
  for (const opp of result.opportunities.slice(0, 5)) {
    const draft: AgentDraft = {
      title:       `[Distribution] ${opp.channel_type} → ${opp.target.slice(0, 60)}`,
      description: `Distribution Finder found an opportunity on ${opp.channel_type}: ${opp.target}`,
      action_type: 'write_document',
      payload: {
        draft_type:   'distribution_opportunity',
        channel_type: opp.channel_type,
        target:       opp.target,
        opportunity:  opp.opportunity,
        opening_line: opp.opening_line,
        why_fits:     opp.why_fits,
        body: `**Channel:** ${opp.channel_type}\n\n**Target:** ${opp.target}\n\n**Opportunity:** ${opp.opportunity}\n\n**Opening Line:**\n> ${opp.opening_line}\n\n**Why This Fits:** ${opp.why_fits}`,
      },
    };
    const id = await createDraft(userId, AGENT_NAME, draft);
    if (id) drafted++;
  }
  return drafted;
}
