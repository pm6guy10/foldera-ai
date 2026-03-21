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
 *   do_nothing    → WaitRationaleArtifact (context/evidence for waiting)
 *
 * When requires_search is true, the generator uses Claude's built-in web_search
 * tool so artifacts contain real, current, actionable information.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/db/client';
import { decryptWithStatus } from '@/lib/encryption';
import type {
  ConvictionDirective,
  ConvictionArtifact,
  EmailArtifact,
  DocumentArtifact,
  CalendarEventArtifact,
  ResearchBriefArtifact,
  DecisionFrameArtifact,
  WaitRationaleArtifact,
} from '@/lib/briefing/types';
import { trackApiCall } from '@/lib/utils/api-tracker';
import { logStructuredEvent } from '@/lib/utils/structured-logger';

// ---------------------------------------------------------------------------
// Clients (lazy)
// ---------------------------------------------------------------------------

let _anthropic: Anthropic | null = null;
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

function isSelfReferentialSignal(content: string): boolean {
  return content.startsWith('[Foldera Directive') || content.startsWith('[Foldera ·');
}

const PLACEHOLDER_PATTERNS = [
  /\[(name|company|role|contact|date|amount|title|recipient)\]/i,
  /\b(tbd|placeholder|lorem ipsum|example@|recipient@email\.com)\b/i,
  /\b(option a|option b)\b/i,
];


// ---------------------------------------------------------------------------
// Context loaders — pull graph data relevant to the artifact
// ---------------------------------------------------------------------------

async function loadRelationshipContext(userId: string, directive: string): Promise<string> {
  const supabase = createServerClient();
  const directiveLower = directive.toLowerCase();

  // Pull entities with interaction history
  const { data: entities, error } = await supabase
    .from('tkg_entities')
    .select('name, display_name, entity_type, patterns, total_interactions, primary_email, emails, role, company')
    .eq('user_id', userId)
    .neq('name', 'self')
    .order('total_interactions', { ascending: false })
    .limit(20);

  if (error) {
    throw error;
  }

  if (!entities || entities.length === 0) return 'No relationship data available.';

  return entities
    .map((entity: any) => {
      const name = (entity.display_name as string | null) || (entity.name as string | null) || 'Unknown';
      const role = typeof entity.role === 'string' && entity.role.trim().length > 0 ? entity.role.trim() : null;
      const company = typeof entity.company === 'string' && entity.company.trim().length > 0 ? entity.company.trim() : null;
      const email = typeof entity.primary_email === 'string' && entity.primary_email.trim().length > 0
        ? entity.primary_email.trim()
        : Array.isArray(entity.emails)
          ? (entity.emails as unknown[]).find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim() ?? null
          : null;
      const patterns = entity.patterns ? Object.values(entity.patterns as Record<string, any>)
        .map((pattern: any) => pattern.description)
        .filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
        .slice(0, 2)
        .join('; ') : '';

      const relevance =
        (directiveLower.includes(name.toLowerCase()) ? 3 : 0) +
        (email && directiveLower.includes(email.toLowerCase()) ? 2 : 0) +
        (company && directiveLower.includes(company.toLowerCase()) ? 1 : 0);

      const descriptor = [
        role,
        company,
        `${entity.total_interactions} interactions`,
      ].filter(Boolean).join(', ');

      return {
        relevance,
        line: `• ${name}${email ? ` <${email}>` : ''} (${descriptor || entity.entity_type || 'contact'})${patterns ? `: ${patterns}` : ''}`,
      };
    })
    .sort((left, right) => right.relevance - left.relevance)
    .slice(0, 8)
    .map((entity) => entity.line)
    .join('\n');
}

async function loadRecentSignals(userId: string, limit = 10): Promise<string> {
  const supabase = createServerClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: signals, error } = await supabase
    .from('tkg_signals')
    .select('type, source, content, occurred_at')
    .eq('user_id', userId)
    .gte('occurred_at', thirtyDaysAgo)
    .order('occurred_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  if (!signals || signals.length === 0) return 'No recent signals.';

  let skippedRows = 0;
  const lines = signals
    .map((signal: any) => {
      const decrypted = decryptWithStatus(signal.content as string ?? '');
      if (decrypted.usedFallback) {
        skippedRows++;
        return null;
      }

      if (isSelfReferentialSignal(decrypted.plaintext.trim())) {
        return null;
      }

      return `[${(signal.occurred_at as string).slice(0, 10)}] ${decrypted.plaintext.slice(0, 200)}`;
    })
    .filter((line): line is string => line !== null);

  if (skippedRows > 0) {
    logStructuredEvent({
      event: 'signal_skip',
      level: 'warn',
      userId,
      artifactType: null,
      generationStatus: 'decrypt_skip',
      details: {
        scope: 'artifact-generator',
        skipped_rows: skippedRows,
      },
    });
  }

  if (lines.length === 0) {
    return 'No recent signals.';
  }

  return lines
    .join('\n');
}

async function loadGoals(userId: string): Promise<string> {
  const supabase = createServerClient();
  const { data: goals, error } = await supabase
    .from('tkg_goals')
    .select('goal_text, goal_category, priority')
    .eq('user_id', userId)
    .order('priority', { ascending: false })
    .limit(5);

  if (error) {
    throw error;
  }

  if (!goals || goals.length === 0) return 'No declared goals.';

  return goals
    .map((g: any) => `• [${g.goal_category}, priority ${g.priority}/5] ${g.goal_text}`)
    .join('\n');
}

async function loadPatterns(userId: string): Promise<string> {
  const supabase = createServerClient();
  const { data: entity, error } = await supabase
    .from('tkg_entities')
    .select('patterns')
    .eq('user_id', userId)
    .eq('name', 'self')
    .maybeSingle();

  if (error) {
    throw error;
  }

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

  const directiveEvidence = directive.evidence.length > 0
    ? directive.evidence.map((item) => `- [${item.type}] ${item.description}`).join('\n')
    : '- None captured.';

  const briefingContext = directive.fullContext?.trim() || 'No additional briefing context.';

  switch (directive.action_type) {
    case 'send_message':
      return {
        system: `${base}

You are drafting an email. Produce a complete, ready-to-send email.
Use the relationship history and recent signals to personalize tone and content.
If the directive references a specific person, use their name, company, and email address from Relationships when available.
Never invent a recipient email address.
Never use placeholders.
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
EVIDENCE:
${directiveEvidence}
BRIEFING CONTEXT:
${briefingContext}
${directive.search_context ? `SEARCH CONTEXT: ${directive.search_context}` : ''}
${contextBlock}

Produce the email. Return JSON only.`,
      };

    case 'write_document':
      return {
        system: `${base}

You are writing a complete document. Not an outline — the finished document.
Never use placeholders or template headings.
${directive.requires_search ? 'Use web search to include current, accurate information (data, deadlines, requirements).' : ''}

Return ONLY valid JSON:
{
  "type": "document",
  "title": "Document title",
  "content": "The complete document text in markdown format"
}`,
        user: `DIRECTIVE: ${directive.directive}
REASON: ${directive.reason}
EVIDENCE:
${directiveEvidence}
BRIEFING CONTEXT:
${briefingContext}
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
Never leave the schedule ambiguous.
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
EVIDENCE:
${directiveEvidence}
BRIEFING CONTEXT:
${briefingContext}
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
Never return generic market color with no decision.

Return ONLY valid JSON:
{
  "type": "research_brief",
  "findings": "Detailed research findings in markdown",
  "sources": ["https://source1.com", "https://source2.com"],
  "recommended_action": "One specific next action based on findings"
}`,
        user: `DIRECTIVE: ${directive.directive}
REASON: ${directive.reason}
EVIDENCE:
${directiveEvidence}
BRIEFING CONTEXT:
${briefingContext}
${directive.search_context ? `SEARCH CONTEXT: ${directive.search_context}` : ''}
${contextBlock}

Do the research. Return JSON only.`,
      };

    case 'make_decision':
      return {
        system: `${base}

You are building a decision frame weighted by this person's actual behavioral history.
Use their patterns and past outcomes to weight each option.
Lead with the recommendation. The options should support the decision, not leave it open.
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
EVIDENCE:
${directiveEvidence}
BRIEFING CONTEXT:
${briefingContext}
${directive.search_context ? `SEARCH CONTEXT: ${directive.search_context}` : ''}
${contextBlock}

Build the decision frame. Return JSON only.`,
      };

    case 'do_nothing':
    default:
      return {
        system: `${base}

You are writing the finished rationale for waiting.
This artifact should make clear why no external action is the right move today and what would change that call.
Tripwires must be observable signals, not moods.

Return ONLY valid JSON:
{
  "type": "wait_rationale",
  "context": "Why waiting is the highest-leverage move right now",
  "evidence": "Specific pattern or outcome that supports waiting today",
  "tripwires": ["What new signal would make this active again"]
}`,
        user: `DIRECTIVE: ${directive.directive}
REASON: ${directive.reason}
EVIDENCE:
${directiveEvidence}
BRIEFING CONTEXT:
${briefingContext}
${contextBlock}

Explain why waiting is correct. Return JSON only.`,
      };
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

// Use haiku for artifact generation (data retrieval and context assembly)
// Sonnet reserved for final directive generation only
const ARTIFACT_MODEL = 'claude-haiku-4-5-20251001';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isNonEmptyString).map((item) => item.trim());
}

function containsPlaceholderText(value: string): boolean {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value));
}

export async function generateArtifact(
  userId: string,
  directive: ConvictionDirective,
): Promise<ConvictionArtifact | null> {
  // If the directive already contains an embedded artifact (from new brain), use it directly
  const d = directive as ConvictionDirective & { embeddedArtifact?: any; embeddedArtifactType?: string };
  if (d.embeddedArtifact) {
    try {
      return validateArtifact(directive.action_type, d.embeddedArtifact);
    } catch {
      // Fall through to generation
    }
  }

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
      model: ARTIFACT_MODEL,
      max_tokens: 4000,
      temperature: 0.3 as any,
      system,
      messages: [{ role: 'user', content: user }],
      ...(tools.length > 0 ? { tools } : {}),
    });

    // Track API usage
    await trackApiCall({
      userId,
      model: ARTIFACT_MODEL,
      inputTokens:  response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      callType: 'artifact',
    });

    // Extract text from response — may contain web_search_tool_result blocks too
    const textBlocks = response.content.filter(
      (b): b is Anthropic.TextBlock => b.type === 'text',
    );
    const raw = textBlocks.map(b => b.text).join('');

    // Parse JSON from the response (strip markdown fences if present)
    let cleaned = raw.replace(/```(?:json|JSON)?\s*\n?/g, '').trim();
    // If result doesn't start with '{', extract the JSON object
    if (!cleaned.startsWith('{')) {
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.slice(firstBrace, lastBrace + 1);
      }
    }
    const parsed = JSON.parse(cleaned) as ConvictionArtifact;

    // Validate type matches expected
    return validateArtifact(directive.action_type, parsed);
  } catch (err) {
    logStructuredEvent({
      event: 'artifact_generation_failed',
      level: 'warn',
      userId,
      artifactType: null,
      generationStatus: 'artifact_failed',
      details: {
        scope: 'artifact-generator',
        error: err instanceof Error ? err.message : String(err),
      },
    });
    return null;
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
      const recipient = isNonEmptyString(parsed?.recipient) ? parsed.recipient.trim() : (isNonEmptyString(parsed?.to) ? parsed.to.trim() : '');
      const subject = parsed?.subject;
      const body = parsed?.body;
      if (!isNonEmptyString(subject) || !isNonEmptyString(body)) {
        throw new Error('Email artifact missing required fields (subject and body are required)');
      }
      if (recipient && containsPlaceholderText(recipient)) {
        throw new Error('Email artifact recipient contains placeholder text');
      }
      if (containsPlaceholderText(subject.trim()) || containsPlaceholderText(body.trim())) {
        throw new Error('Email artifact contains placeholder text');
      }
      return {
        type: 'email',
        to: recipient,
        subject: subject.trim(),
        body: body.trim(),
        draft_type: (parsed as EmailArtifact).draft_type || 'email_compose',
      };
    }
    case 'write_document': {
      const a = parsed as DocumentArtifact;
      if (!isNonEmptyString(a.title) || !isNonEmptyString(a.content)) {
        throw new Error('Document artifact missing required fields');
      }
      if (containsPlaceholderText(a.title.trim()) || containsPlaceholderText(a.content.trim())) {
        throw new Error('Document artifact contains placeholder text');
      }
      return {
        type: 'document',
        title: a.title.trim(),
        content: a.content.trim(),
      };
    }
    case 'schedule': {
      const a = parsed as CalendarEventArtifact;
      // Support both old (start/end) and new (start/duration_minutes) shapes
      const start = isNonEmptyString(a.start) ? a.start.trim() : (isNonEmptyString(parsed?.start) ? parsed.start.trim() : '');
      const durationMins = typeof parsed?.duration_minutes === 'number' ? parsed.duration_minutes : 30;
      let end = isNonEmptyString(a.end) ? a.end.trim() : '';
      // If no end but we have start + duration, compute end
      if (!end && start) {
        try {
          const startDate = new Date(start);
          if (!isNaN(startDate.getTime())) {
            end = new Date(startDate.getTime() + durationMins * 60 * 1000).toISOString();
          }
        } catch { /* use empty */ }
      }
      if (!isNonEmptyString(start)) {
        throw new Error('Calendar artifact missing required fields');
      }
      const title = isNonEmptyString(a.title) ? a.title.trim() : (isNonEmptyString(parsed?.title) ? parsed.title.trim() : '');
      if (!title) {
        throw new Error('Calendar artifact missing title');
      }
      if (containsPlaceholderText(title) || containsPlaceholderText((a.description ?? '').trim())) {
        throw new Error('Calendar artifact contains placeholder text');
      }
      return {
        type: 'calendar_event',
        title,
        start,
        end: end || start,
        description: typeof a.description === 'string' ? a.description.trim()
          : typeof parsed?.reason === 'string' ? parsed.reason.trim() : '',
      };
    }
    case 'research': {
      const a = parsed as ResearchBriefArtifact;
      const sources = normalizeStringArray(a.sources);
      if (!isNonEmptyString(a.findings) || !isNonEmptyString(a.recommended_action) || sources.length === 0) {
        throw new Error('Research artifact missing required fields');
      }
      if (containsPlaceholderText(a.findings.trim()) || containsPlaceholderText(a.recommended_action.trim())) {
        throw new Error('Research artifact contains placeholder text');
      }
      return {
        type: 'research_brief',
        findings: a.findings.trim(),
        sources,
        recommended_action: a.recommended_action.trim(),
      };
    }
    case 'make_decision': {
      const options = Array.isArray(parsed?.options)
        ? (parsed as DecisionFrameArtifact).options
          .filter((option) => isNonEmptyString(option?.option) && typeof option?.weight === 'number')
          .map((option) => ({
            option: option.option.trim(),
            weight: option.weight,
            rationale: typeof option.rationale === 'string' ? option.rationale.trim() : '',
          }))
        : [];

      if (options.length === 0 && isNonEmptyString(parsed?.option_a) && isNonEmptyString(parsed?.option_b)) {
        options.push(
          {
            option: parsed.option_a.trim(),
            weight: 0.5,
            rationale: isNonEmptyString(parsed?.tradeoff_a) ? parsed.tradeoff_a.trim() : '',
          },
          {
            option: parsed.option_b.trim(),
            weight: 0.5,
            rationale: isNonEmptyString(parsed?.tradeoff_b) ? parsed.tradeoff_b.trim() : '',
          },
        );
      }

      if (options.length < 2) {
        throw new Error('Decision artifact missing required fields');
      }
      if (options.some((option) => containsPlaceholderText(option.option) || containsPlaceholderText(option.rationale))) {
        throw new Error('Decision artifact contains placeholder text');
      }
      return {
        type: 'decision_frame',
        options,
        recommendation: isNonEmptyString(parsed?.recommendation)
          ? parsed.recommendation.trim()
          : '',
      };
    }
    case 'do_nothing':
    default: {
      // Support both old (context/evidence) and new (why_wait/tripwire_date/trigger_condition) shapes
      const context = isNonEmptyString(parsed?.context) ? parsed.context
        : isNonEmptyString(parsed?.why_wait) ? parsed.why_wait
        : isNonEmptyString(parsed?.reason) ? parsed.reason
        : isNonEmptyString(parsed?.exact_reason) ? parsed.exact_reason
        : null;
      const evidence = isNonEmptyString(parsed?.evidence) ? parsed.evidence
        : isNonEmptyString(parsed?.trigger_condition) ? parsed.trigger_condition
        : isNonEmptyString(parsed?.what_changes) ? parsed.what_changes
        : isNonEmptyString(parsed?.blocked_by) ? parsed.blocked_by
        : null;
      const checkDate = isNonEmptyString(parsed?.check_date) ? parsed.check_date.trim()
        : isNonEmptyString(parsed?.tripwire_date) ? parsed.tripwire_date.trim()
        : undefined;

      if (!isNonEmptyString(context) || !isNonEmptyString(evidence)) {
        throw new Error('Wait artifact missing required fields');
      }
      if (containsPlaceholderText(context.trim()) || containsPlaceholderText(evidence.trim())) {
        throw new Error('Wait artifact contains placeholder text');
      }
      return {
        type: 'wait_rationale',
        context: context.trim(),
        evidence: evidence.trim(),
        tripwires: normalizeStringArray(parsed?.tripwires).length > 0
          ? normalizeStringArray(parsed?.tripwires)
          : [evidence.trim()],
        ...(checkDate ? { check_date: checkDate } : {}),
      };
    }
  }
}
