/**
 * Agent 3 — GTM Strategist
 *
 * Thinks like a growth hacker who has launched 5 B2B SaaS products from 0 to 1.
 * Identifies the fastest path to the first 100 paying users.
 * Focuses on channels, hooks, positioning, and distribution tactics.
 * Stages actionable GTM proposals in DraftQueue.
 */

import { agentThink, createDraft, getSupabase, type AgentDraft } from './base-agent';
import type { ActionType } from '@/lib/briefing/types';
import { decrypt } from '@/lib/encryption';

const AGENT_NAME = 'gtm-strategist';

const SYSTEM = `You are a GTM strategist who has taken 5 B2B SaaS products from zero to their first 100 paying users.
You think in channels, hooks, distribution loops, and ICP precision.
You are advising Foldera — an AI personal chief of staff app targeting overwhelmed founders and executives.

The product promise: "Your AI that wakes up every morning, reads your world, and tells you the one thing to do today."

You will be given today's growth context. Identify up to 5 concrete, immediately executable GTM actions.
Focus on: specific channels to activate, exact content to create, specific communities to engage,
partnership opportunities, and hooks that would make someone stop scrolling.

Each action must be doable by one person in under 2 hours. No vague advice.

Return ONLY valid JSON (no markdown wrapping) in this exact format:
{
  "actions": [
    {
      "channel": "string — specific channel (e.g., Twitter/X, r/Entrepreneur, ProductHunt, cold email)",
      "action": "string — exactly what to do, step by step, in ≤ 3 sentences",
      "hook": "string — the exact hook/angle/headline to use",
      "why_now": "string — why this action makes sense right now",
      "effort": "15min|30min|1hr|2hr",
      "action_type": "write_document"
    }
  ]
}`;

interface GtmAction {
  channel:     string;
  action:      string;
  hook:        string;
  why_now:     string;
  effort:      string;
  action_type: ActionType;
}

interface GtmOutput {
  actions: GtmAction[];
}

/** Fetch recent pain signal posts to feed to the GTM strategist */
async function getRecentSignals(): Promise<string> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('tkg_signals')
    .select('source, content, type, occurred_at')
    .eq('source', 'social_scan')
    .order('occurred_at', { ascending: false })
    .limit(10);

  if (!data?.length) return 'No recent pain signals captured yet.';

  return data.map((s, i) =>
    `${i + 1}. [${s.type}] ${decrypt(String(s.content)).slice(0, 150)}`,
  ).join('\n');
}

export async function runGtmStrategist(userId: string): Promise<number> {
  const recentSignals = await getRecentSignals();

  const context = `
Foldera — GTM Context (as of ${new Date().toISOString().slice(0, 10)}):

STAGE: Pre-launch / early access. Zero public users. Building toward first 100.

TARGET ICP:
- Founders running $500k-$5M ARR companies without EAs
- Executives who reply to email at midnight
- ADHD professionals who are brilliant but forget to follow up
- Chief of staff wannabes who can't afford the real thing

PRODUCT DIFFERENTIATOR:
- Not a note-taking tool — it reads YOUR existing communication
- Not a calendar — it tracks commitments and decisions across all sources
- Not a chatbot — it wakes up before you and stages decisions for your one-tap approval
- First product to give a solo founder the operating leverage of a chief of staff

CURRENT TRACTION:
- Landing page live at foldera.ai
- Email capture on landing page
- Onboarding flow: 30-second demo directive to show value before signup
- No public users yet

RECENT PAIN SIGNALS FROM REDDIT/TWITTER:
${recentSignals}

ANGLES THAT HAVE WORKED FOR SIMILAR PRODUCTS:
- "I replaced my $120k/year EA with this" (authority)
- "What happened when I stopped managing my own inbox" (curiosity)
- "The one thing I do before checking email every morning" (habit frame)
- Specific subreddit posts: r/Entrepreneur, r/ADHD, r/startups, r/productivity

WHAT WE NEED RIGHT NOW:
One stranger to experience the holy crap moment this week.
`;

  const result = await agentThink(SYSTEM, context, AGENT_NAME) as GtmOutput | null;
  if (!result?.actions) return 0;

  let drafted = 0;
  for (const action of result.actions.slice(0, 5)) {
    const draft: AgentDraft = {
      title:       `[GTM] ${action.channel}: ${action.hook.slice(0, 80)}`,
      description: `GTM Strategist proposes a ${action.effort} action on ${action.channel}`,
      action_type: 'write_document',
      payload: {
        draft_type: 'gtm_action',
        channel:    action.channel,
        action:     action.action,
        hook:       action.hook,
        why_now:    action.why_now,
        effort:     action.effort,
        body: `**Channel:** ${action.channel}\n\n**Hook:** ${action.hook}\n\n**Action:** ${action.action}\n\n**Why now:** ${action.why_now}\n\n**Effort:** ${action.effort}`,
      },
    };
    const id = await createDraft(userId, AGENT_NAME, draft);
    if (id) drafted++;
  }
  return drafted;
}
