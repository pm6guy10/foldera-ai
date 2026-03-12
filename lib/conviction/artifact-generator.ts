/**
 * Artifact Generator — produces finished work products from directives.
 *
 * The directive without an artifact is a to-do list.
 * The artifact is the product.
 *
 * Each action_type maps to a specific artifact shape:
 *   send_message  → EmailArtifact  (to/subject/body, ready to send)
 *   write_document → DocumentArtifact (title/content, complete document)
 *   schedule      → CalendarEventArtifact (title/start/end/description)
 *   research      → ResearchBriefArtifact (findings/sources/recommended_action)
 *   make_decision → DecisionFrameArtifact (options/weights/recommendation)
 *   do_nothing    → AffirmationArtifact (context/evidence for waiting)
 *
 * When requires_search is true, the generator uses Claude's built-in web_search
 * tool so artifacts contain real, current, actionable information.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import type {
  ConvictionDirective,
  ConvictionArtifact,
  EmailArtifact,
  DocumentArtifact,
  CalendarEventArtifact,
  ResearchBriefArtifact,
  DecisionFrameArtifact,
  AffirmationArtifact,
} from '@/lib/briefing/types';

// ---------------------------------------------------------------------------
// Clients (lazy)
// ---------------------------------------------------------------------------

let _anthropic: Anthropic | null = null;
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ---------------------------------------------------------------------------
// Context loaders — pull graph data relevant to the artifact
// ---------------------------------------------------------------------------

async function loadRelationshipContext(userId: string, directive: string): Promise<string> {
  const supabase = getSupabase();

  // Pull entities with interaction history
  const { data: entities } = await supabase
    .from('tkg_entities')
    .select('name, entity_type, patterns, total_interactions')
    .eq('user_id', userId)
    .neq('name', 'self')
    .order('total_interactions', { ascending: false })
    .limit(10);

  if (!entities || entities.length === 0) return 'No relationship data available.';

  return entities
    .map((e: any) => {
      const pats = e.patterns ? Object.values(e.patterns as Record<string, any>)
        .map((p: any) => p.description).slice(0, 2).join('; ') : '';
      return `• ${e.name} (${e.entity_type}, ${e.total_interactions} interactions)${pats ? ': ' + pats : ''}`;
    })
    .join('\n');
}

async function loadRecentSignals(userId: string, limit = 10): Promise<string> {
  const supabase = getSupabase();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: signals } = await supabase
    .from('tkg_signals')
    .select('type, source, content, occurred_at')
    .eq('user_id', userId)
    .gte('occurred_at', thirtyDaysAgo)
    .order('occurred_at', { ascending: false })
    .limit(limit);

  if (!signals || signals.length === 0) return 'No recent signals.';

  return signals
    .map((s: any) => `[${(s.occurred_at as string).slice(0, 10)}] ${(s.content as string).slice(0, 200)}`)
    .join('\n');
}

async function loadGoals(userId: string): Promise<string> {
  const supabase = getSupabase();
  const { data: goals } = await supabase
    .from('tkg_goals')
    .select('goal_text, goal_category, priority')
    .eq('user_id', userId)
    .order('priority', { ascending: false })
    .limit(5);

  if (!goals || goals.length === 0) return 'No declared goals.';

  return goals
    .map((g: any) => `• [${g.goal_category}, priority ${g.priority}/5] ${g.goal_text}`)
    .join('\n');
}

async function loadPatterns(userId: string): Promise<string> {
  const supabase = getSupabase();
  const { data: entity } = await supabase
    .from('tkg_entities')
    .select('patterns')
    .eq('user_id', userId)
    .eq('name', 'self')
    .maybeSingle();

  const patterns = (entity?.patterns as Record<string, any>) ?? {};
  if (Object.keys(patterns).length === 0) return 'No patterns extracted yet.';

  return Object.values(patterns)
    .map((p: any) => `• ${p.name} (${p.activation_count}×): ${p.description}`)
    .join('\n');
}

// ---------------------------------------------------------------------------
// System prompts per artifact type
// ---------------------------------------------------------------------------

function buildArtifactPrompt(
  directive: ConvictionDirective,
  context: {
    relationships: string;
    signals: string;
    goals: string;
    patterns: string;
  },
): { system: string; user: string } {
  const base = `You are an execution engine inside a personal chief-of-staff system.
You have been given a directive and the user's behavioral context.
Your job: produce the FINISHED work product. Not an outline. Not suggestions. The actual deliverable.

The user approves with one tap. If they have to do work after approving, you failed.`;

  const contextBlock = `
USER CONTEXT:
Goals: ${context.goals}

Relationships: ${context.relationships}

Recent activity: ${context.signals}

Behavioral patterns: ${context.patterns}`;

  switch (directive.action_type) {
    case 'send_message':
      return {
        system: `${base}

You are drafting an email. Produce a complete, ready-to-send email.
Use the relationship history and recent signals to personalize tone and content.
If the directive references a specific person, use their name and relevant context.
${directive.requires_search ? 'Use web search to find any current information needed (job postings, events, contact info).' : ''}

Return ONLY valid JSON:
{
  "type": "email",
  "to": "recipient@email.com",
  "subject": "Clear, specific subject line",
  "body": "Complete email body with greeting and sign-off",
  "draft_type": "email_compose"
}`,
        user: `DIRECTIVE: ${directive.directive}
REASON: ${directive.reason}
${directive.search_context ? `SEARCH CONTEXT: ${directive.search_context}` : ''}
${contextBlock}

Produce the email. Return JSON only.`,
      };

    case 'write_document':
      return {
        system: `${base}

You are writing a complete document. Not an outline — the finished document.
${directive.requires_search ? 'Use web search to include current, accurate information (data, deadlines, requirements).' : ''}

Return ONLY valid JSON:
{
  "type": "document",
  "title": "Document title",
  "content": "The complete document text in markdown format"
}`,
        user: `DIRECTIVE: ${directive.directive}
REASON: ${directive.reason}
${directive.search_context ? `SEARCH CONTEXT: ${directive.search_context}` : ''}
${contextBlock}

Write the complete document. Return JSON only.`,
      };

    case 'schedule':
      return {
        system: `${base}

You are creating a calendar event. Find an appropriate time slot based on context.
Use today's date as reference: ${new Date().toISOString().slice(0, 10)}.
If no specific time is mentioned, suggest a reasonable time within the next 7 days.
${directive.requires_search ? 'Use web search to find event details, locations, or timing information.' : ''}

Return ONLY valid JSON:
{
  "type": "calendar_event",
  "title": "Event title",
  "start": "ISO 8601 datetime",
  "end": "ISO 8601 datetime",
  "description": "Event description with all relevant details"
}`,
        user: `DIRECTIVE: ${directive.directive}
REASON: ${directive.reason}
${directive.search_context ? `SEARCH CONTEXT: ${directive.search_context}` : ''}
${contextBlock}

Create the calendar event. Return JSON only.`,
      };

    case 'research':
      return {
        system: `${base}

You are doing actual research — not suggesting what to research.
Use web search to find real, current information.
Synthesize findings into actionable intelligence.
Include specific sources with URLs.

Return ONLY valid JSON:
{
  "type": "research_brief",
  "findings": "Detailed research findings in markdown",
  "sources": ["https://source1.com", "https://source2.com"],
  "recommended_action": "One specific next action based on findings"
}`,
        user: `DIRECTIVE: ${directive.directive}
REASON: ${directive.reason}
${directive.search_context ? `SEARCH CONTEXT: ${directive.search_context}` : ''}
${contextBlock}

Do the research. Return JSON only.`,
      };

    case 'make_decision':
      return {
        system: `${base}

You are building a decision frame weighted by this person's actual behavioral history.
Use their patterns and past outcomes to weight each option.
${directive.requires_search ? 'Use web search for any external data needed to evaluate options (prices, deadlines, reviews).' : ''}

Return ONLY valid JSON:
{
  "type": "decision_frame",
  "options": [
    { "option": "Option description", "weight": 0.0, "rationale": "Why this weight, citing behavioral evidence" }
  ],
  "recommendation": "The recommended choice with one sentence justification"
}`,
        user: `DIRECTIVE: ${directive.directive}
REASON: ${directive.reason}
${directive.search_context ? `SEARCH CONTEXT: ${directive.search_context}` : ''}
${contextBlock}

Build the decision frame. Return JSON only.`,
      };

    case 'do_nothing':
    default:
      return {
        system: `${base}

You are affirming that the best action is to wait.
Cite specific historical outcomes where waiting resolved favorably for this person.

Return ONLY valid JSON:
{
  "type": "affirmation",
  "context": "Why waiting is the highest-leverage move right now",
  "evidence": "Specific past outcomes where patience paid off for this person"
}`,
        user: `DIRECTIVE: ${directive.directive}
REASON: ${directive.reason}
${contextBlock}

Explain why waiting is correct. Return JSON only.`,
      };
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function generateArtifact(
  userId: string,
  directive: ConvictionDirective,
): Promise<ConvictionArtifact> {
  // Load context in parallel
  const [relationships, signals, goals, patterns] = await Promise.all([
    loadRelationshipContext(userId, directive.directive),
    loadRecentSignals(userId),
    loadGoals(userId),
    loadPatterns(userId),
  ]);

  const { system, user } = buildArtifactPrompt(directive, {
    relationships,
    signals,
    goals,
    patterns,
  });

  // Build tools array — include web_search when the directive needs current info
  const useSearch = directive.requires_search ||
    directive.action_type === 'research' ||
    !!directive.search_context;

  const tools: any[] = useSearch
    ? [{ type: 'web_search_20250305' as const, name: 'web_search', max_uses: 5 }]
    : [];

  try {
    const response = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      temperature: 0.3 as any,
      system,
      messages: [{ role: 'user', content: user }],
      ...(tools.length > 0 ? { tools } : {}),
    });

    // Extract text from response — may contain web_search_tool_result blocks too
    const textBlocks = response.content.filter(
      (b): b is Anthropic.TextBlock => b.type === 'text',
    );
    const raw = textBlocks.map(b => b.text).join('');

    // Parse JSON from the response (strip markdown fences if present)
    const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleaned) as ConvictionArtifact;

    // Validate type matches expected
    return validateArtifact(directive.action_type, parsed);
  } catch (err) {
    console.error('[generateArtifact] failed:', err);
    return fallbackArtifact(directive);
  }
}

// ---------------------------------------------------------------------------
// Validation — ensure artifact shape matches action type
// ---------------------------------------------------------------------------

function validateArtifact(
  actionType: string,
  parsed: any,
): ConvictionArtifact {
  switch (actionType) {
    case 'send_message': {
      const a = parsed as EmailArtifact;
      return {
        type: 'email',
        to: a.to || '',
        subject: a.subject || '',
        body: a.body || '',
        draft_type: a.draft_type || 'email_compose',
      };
    }
    case 'write_document': {
      const a = parsed as DocumentArtifact;
      return {
        type: 'document',
        title: a.title || 'Untitled',
        content: a.content || '',
      };
    }
    case 'schedule': {
      const a = parsed as CalendarEventArtifact;
      return {
        type: 'calendar_event',
        title: a.title || '',
        start: a.start || new Date().toISOString(),
        end: a.end || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        description: a.description || '',
      };
    }
    case 'research': {
      const a = parsed as ResearchBriefArtifact;
      return {
        type: 'research_brief',
        findings: a.findings || '',
        sources: Array.isArray(a.sources) ? a.sources : [],
        recommended_action: a.recommended_action || '',
      };
    }
    case 'make_decision': {
      const a = parsed as DecisionFrameArtifact;
      return {
        type: 'decision_frame',
        options: Array.isArray(a.options) ? a.options : [],
        recommendation: a.recommendation || '',
      };
    }
    case 'do_nothing':
    default: {
      const a = parsed as AffirmationArtifact;
      return {
        type: 'affirmation',
        context: a.context || '',
        evidence: a.evidence || '',
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Fallback — if generation fails, return a minimal artifact
// ---------------------------------------------------------------------------

function fallbackArtifact(directive: ConvictionDirective): ConvictionArtifact {
  switch (directive.action_type) {
    case 'send_message':
      return { type: 'email', to: '', subject: '', body: directive.directive, draft_type: 'email_compose' };
    case 'write_document':
      return { type: 'document', title: directive.directive, content: '' };
    case 'schedule':
      return {
        type: 'calendar_event',
        title: directive.directive,
        start: new Date().toISOString(),
        end: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        description: directive.reason,
      };
    case 'research':
      return { type: 'research_brief', findings: '', sources: [], recommended_action: directive.directive };
    case 'make_decision':
      return { type: 'decision_frame', options: [], recommendation: directive.directive };
    case 'do_nothing':
    default:
      return { type: 'affirmation', context: directive.reason, evidence: '' };
  }
}
