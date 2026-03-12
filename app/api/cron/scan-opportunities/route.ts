/**
 * GET /api/cron/scan-opportunities
 * Schedule: daily at 6am UTC (before daily-brief at 7am)
 * Auth: Bearer CRON_SECRET
 *
 * Pulls current_priority goals from the graph and proactively
 * searches for relevant opportunities:
 *   - Career goals → web search for job postings, programs
 *   - Financial goals → search for deals, assistance, deadlines
 *   - Relationship goals → check for stale contacts (14+ days)
 *
 * Results written to tkg_signals with source='proactive_scan',
 * type='opportunity_found'. Daily-brief at 7am picks these up.
 */

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

export const dynamic  = 'force-dynamic';
export const maxDuration = 60;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

let _anthropic: Anthropic | null = null;
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function isAuthorized(request: Request): boolean {
  const auth = request.headers.get('authorization') ?? '';
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

// ---------------------------------------------------------------------------
// Relationship staleness check — no API call needed
// ---------------------------------------------------------------------------

interface StaleContact {
  name: string;
  last_interaction: string;
  days_since: number;
}

async function findStaleContacts(userId: string): Promise<StaleContact[]> {
  const supabase = getSupabase();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data: entities } = await supabase
    .from('tkg_entities')
    .select('name, last_interaction')
    .eq('user_id', userId)
    .neq('name', 'self')
    .lt('last_interaction', fourteenDaysAgo)
    .order('last_interaction', { ascending: true })
    .limit(10);

  if (!entities || entities.length === 0) return [];

  return entities.map((e: any) => {
    const last = new Date(e.last_interaction);
    const days = Math.floor((Date.now() - last.getTime()) / (1000 * 60 * 60 * 24));
    return { name: e.name, last_interaction: e.last_interaction, days_since: days };
  });
}

// ---------------------------------------------------------------------------
// Web-search-based opportunity scan (career, financial, project goals)
// ---------------------------------------------------------------------------

interface OpportunityResult {
  goal_text: string;
  goal_category: string;
  opportunities: string; // summarized findings
}

async function searchOpportunities(
  goals: Array<{ goal_text: string; goal_category: string }>,
  patternsContext: string,
): Promise<OpportunityResult[]> {
  if (goals.length === 0) return [];

  const goalBlock = goals
    .map(g => `• [${g.goal_category}] ${g.goal_text}`)
    .join('\n');

  const system = `You are a proactive opportunity scanner for a personal chief-of-staff system.
Given the user's current priority goals and their behavioral context, search the web for
actionable opportunities that match each goal RIGHT NOW.

For career goals: search for relevant job postings, programs, certifications, networking events.
For financial goals: search for deals, assistance programs, deadline reminders, savings opportunities.
For project goals: search for tools, resources, collaborators, relevant events.
For health goals: search for programs, events, resources.

Return ONLY valid JSON — an array of objects, one per goal:
[
  {
    "goal_text": "the goal",
    "goal_category": "the category",
    "opportunities": "2-4 sentences summarizing the most actionable findings with specifics (names, dates, URLs if found)"
  }
]

If web search returns nothing relevant for a goal, still include it with opportunities: "No current opportunities found."`;

  const user = `CURRENT PRIORITY GOALS:
${goalBlock}

USER CONTEXT:
${patternsContext}

Today: ${new Date().toISOString().slice(0, 10)}

Search for current opportunities matching each goal. Return JSON only.`;

  try {
    const response = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      temperature: 0.2 as any,
      system,
      tools: [{ type: 'web_search_20250305' as const, name: 'web_search', max_uses: 5 }],
      messages: [{ role: 'user', content: user }],
    });

    const textBlocks = response.content.filter(
      (b): b is Anthropic.TextBlock => b.type === 'text',
    );
    const raw = textBlocks.map(b => b.text).join('');
    const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleaned) as OpportunityResult[];
  } catch (err) {
    console.error('[scan-opportunities] Claude call failed:', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const userId = process.env.INGEST_USER_ID;
  if (!userId) {
    return NextResponse.json({ error: 'INGEST_USER_ID not set' }, { status: 500 });
  }

  // 1. Fetch current priority goals
  const { data: priorities } = await supabase
    .from('tkg_goals')
    .select('goal_text, goal_category, priority')
    .eq('user_id', userId)
    .eq('current_priority', true)
    .order('priority', { ascending: false });

  if (!priorities || priorities.length === 0) {
    return NextResponse.json({ message: 'No current priorities set', signals_created: 0 });
  }

  // 2. Split goals by type
  const relationshipGoals = priorities.filter(g => g.goal_category === 'relationship');
  const searchableGoals = priorities.filter(g => g.goal_category !== 'relationship');

  // 3. Load patterns for context
  const { data: entity } = await supabase
    .from('tkg_entities')
    .select('patterns')
    .eq('user_id', userId)
    .eq('name', 'self')
    .maybeSingle();

  const patterns = (entity?.patterns as Record<string, any>) ?? {};
  const patternsContext = Object.values(patterns)
    .slice(0, 10)
    .map((p: any) => `${p.name}: ${p.description}`)
    .join('\n') || 'No patterns yet.';

  let signalsCreated = 0;
  const errors: string[] = [];

  // 4. Relationship goals: check stale contacts
  if (relationshipGoals.length > 0) {
    try {
      const stale = await findStaleContacts(userId);
      if (stale.length > 0) {
        const content = stale
          .map(c => `${c.name}: last contact ${c.days_since} days ago (${new Date(c.last_interaction).toLocaleDateString()})`)
          .join('\n');

        const { error: insertErr } = await supabase.from('tkg_signals').insert({
          user_id: userId,
          source: 'proactive_scan',
          source_id: `stale-contacts-${new Date().toISOString().slice(0, 10)}`,
          type: 'opportunity_found',
          content: `Stale relationships detected (14+ days since last contact):\n${content}`,
          content_hash: `stale-contacts-${userId}-${new Date().toISOString().slice(0, 10)}`,
          author: 'foldera-scanner',
          occurred_at: new Date().toISOString(),
          processed: true,
        });
        if (insertErr) {
          // Duplicate hash = already scanned today, skip silently
          if (!insertErr.message.includes('duplicate')) {
            errors.push(`stale-contacts: ${insertErr.message}`);
          }
        } else {
          signalsCreated++;
        }
      }
    } catch (err: any) {
      errors.push(`stale-contacts: ${err.message}`);
    }
  }

  // 5. Career/financial/project goals: web search
  if (searchableGoals.length > 0) {
    try {
      const results = await searchOpportunities(searchableGoals, patternsContext);
      for (const result of results) {
        if (!result.opportunities || result.opportunities === 'No current opportunities found.') continue;

        const dateKey = new Date().toISOString().slice(0, 10);
        const hash = `opp-${userId}-${result.goal_category}-${dateKey}`;

        const { error: insertErr } = await supabase.from('tkg_signals').insert({
          user_id: userId,
          source: 'proactive_scan',
          source_id: `opportunity-${result.goal_category}-${dateKey}`,
          type: 'opportunity_found',
          content: `[${result.goal_category}] Goal: ${result.goal_text}\n\nOpportunities found:\n${result.opportunities}`,
          content_hash: hash,
          author: 'foldera-scanner',
          occurred_at: new Date().toISOString(),
          processed: true,
        });
        if (insertErr) {
          if (!insertErr.message.includes('duplicate')) {
            errors.push(`${result.goal_category}: ${insertErr.message}`);
          }
        } else {
          signalsCreated++;
        }
      }
    } catch (err: any) {
      errors.push(`web-search: ${err.message}`);
    }
  }

  return NextResponse.json({
    message: 'Scan complete',
    priorities_scanned: priorities.length,
    signals_created: signalsCreated,
    errors: errors.length > 0 ? errors : undefined,
  });
}
