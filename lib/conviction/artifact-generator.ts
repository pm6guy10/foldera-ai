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
import * as Sentry from '@sentry/nextjs';
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
import type { DiscrepancyClass } from '@/lib/briefing/discrepancy-detector';
import { trackApiCall } from '@/lib/utils/api-tracker';
import { logStructuredEvent } from '@/lib/utils/structured-logger';
import {
  directiveLooksLikeScheduleConflict,
  scheduleConflictArtifactIsOwnerProcedure,
} from '@/lib/briefing/schedule-conflict-guards';
import { effectiveDiscrepancyClassForGates } from '@/lib/briefing/effective-discrepancy-class';

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
  /\[[^\]]*\bphone\b[^\]]*\]/i,
  /\[[^\]]*specific[^\]]*\]/i,
  /\bfrom recent contact\b/i,
  /\b(tbd|placeholder|lorem ipsum|example@|recipient@email\.com)\b/i,
  /\b(option a|option b)\b/i,
];

/**
 * Patterns that indicate generic social filler — the opposite of leverage.
 * If the user could easily have written it themselves, the artifact fails.
 */
const GENERIC_FILLER_PATTERNS = [
  /hope you'?r?e? (?:doing )?well/i,
  /just (?:checking|reaching) (?:in|out)/i,
  /would love to (?:catch up|reconnect|connect)/i,
  /hope things are going well/i,
  /hope (?:all is|everything'?s?) well/i,
  /wanted to (?:touch base|circle back)/i,
  /it'?s? been (?:a while|too long|a bit)/i,
  /let'?s? (?:grab|get) (?:coffee|lunch|a drink)/i,
];

/**
 * Internal-analysis scaffolding markers that must never surface in persisted
 * user artifacts. These are backend/meta labels, not finished-document prose.
 */
const ANALYSIS_HEADER_LINE_PATTERNS = [
  /^\s*(?:#+\s*)?(?:INSIGHT|WHY NOW|WINNING LOOP|RELATIONSHIP CONTEXT|RUNNER[\s-]?UPS?(?:\s+REJECTED)?|CONFIDENCE RATIONALE|CANDIDATE COMPETITION|SCORER|SCORE|DECISION PAYLOAD|INTERNAL ANALYSIS|PIPELINE)\s*[:\-]/i,
  /^\s*(?:runner[\s-]?ups?|runner[\s-]?up)\s+rejected\b/i,
];

const ANALYSIS_META_LINE_PATTERNS = [
  /^\s*Beaten:\s*/i,
  /^\s*Selected because\b/i,
  /^\s*Rejected because\b/i,
  /^\s*This candidate\b/i,
  /^\s*Winner\b.*\b(?:score|scorer|beat|won|selected)\b/i,
  /^\s*-\s*(?:rejected because|beaten:|this candidate|winner)\b/i,
];

const ANALYSIS_INLINE_PATTERNS = [
  /\brunner[\s-]?ups?\s+rejected\b/i,
  /\brejected because\b/i,
  /\bconfidence rationale\b/i,
  /\bcandidate competition\b/i,
  /\bthis candidate\b.{0,120}\b(?:winner|won|beat|score|scorer|selected)\b/i,
  /\bwinner\b.{0,80}\b(?:score|scorer|beat|won|selected)\b/i,
  /\bscorer[_\s-]?(?:score|note|rationale|decision)\b/i,
  /\bscore\s*[:=]\s*\d/i,
];

function hasAnalysisScaffoldingLine(text: string): boolean {
  return (
    ANALYSIS_HEADER_LINE_PATTERNS.some((pattern) => pattern.test(text)) ||
    ANALYSIS_META_LINE_PATTERNS.some((pattern) => pattern.test(text))
  );
}

/**
 * Exported for persistence-time defense-in-depth checks.
 */
export function hasAnalysisScaffolding(text: string): boolean {
  if (typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed) return false;

  const lines = trimmed.split(/\r?\n/);
  if (lines.some((line) => hasAnalysisScaffoldingLine(line))) {
    return true;
  }

  return ANALYSIS_INLINE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function countDocumentParagraphs(value: string): number {
  return value
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .length;
}

function getFinishedDocumentIssues(title: string, content: string): string[] {
  const issues: string[] = [];

  if (!isNonEmptyString(title) || title.trim().length < 4) {
    issues.push('Document title is required and must be specific');
  }
  if (!isNonEmptyString(content) || content.trim().length < 30) {
    issues.push('Document content is too short to be a finished artifact');
  }
  if (hasAnalysisScaffolding(title)) {
    issues.push('Document title contains internal analysis scaffolding');
  }
  if (hasAnalysisScaffolding(content)) {
    issues.push('Document content contains internal analysis scaffolding');
  }
  if (isNonEmptyString(content) && countDocumentParagraphs(content) === 0) {
    issues.push('Document content must include readable body text');
  }

  return issues;
}

/** Last-resort document so write_document never blocks the pipeline on generator failure. */
function emergencyWriteDocumentArtifact(directive: ConvictionDirective): DocumentArtifact {
  const full = (directive as ConvictionDirective & { fullContext?: string }).fullContext;
  const content =
    typeof full === 'string' && full.trim().length > 0 ? full.trim() : directive.directive;
  return {
    type: 'document',
    title: directive.directive.slice(0, 120),
    content,
    emergency_fallback: true,
  };
}

/** Last-resort email so send_message never returns null from this module. */
function emergencyEmailArtifact(directive: ConvictionDirective): EmailArtifact {
  const full = (directive as ConvictionDirective & { fullContext?: string }).fullContext;
  const body =
    typeof full === 'string' && full.trim().length > 0 ? full.trim() : directive.directive;
  const haystack = [directive.directive, directive.reason, full].filter(Boolean).join('\n');
  const match = haystack.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
  const to = match ? match[0] : '';
  return {
    type: 'email',
    to,
    subject: directive.directive.slice(0, 80),
    body,
    draft_type: 'email_compose',
    emergency_fallback: true,
  };
}

function buildDeterministicDocumentFallback(
  directive: ConvictionDirective,
  rawContext: string,
): DocumentArtifact | null {
  if (directiveLooksLikeScheduleConflict(directive)) {
    return null;
  }

  const lines = rawContext.split(/\r?\n/);
  const kept: string[] = [];
  const signals: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (kept.length > 0 && kept[kept.length - 1] !== '') kept.push('');
      continue;
    }
    if (hasAnalysisScaffoldingLine(trimmed)) continue;
    if (ANALYSIS_INLINE_PATTERNS.some((pattern) => pattern.test(trimmed))) continue;

    // Remove markdown bullets from scaffold-heavy context and keep the fact.
    const normalized = trimmed.replace(/^[-*]\s+/, '').trim();
    if (normalized.length > 0) {
      signals.push(normalized);
    }
  }

  const uniqueSignals = [...new Set(signals)].slice(0, 6);
  if (uniqueSignals.length === 0) return null;

  kept.push(`Objective: ${directive.directive.trim()}`);
  kept.push('');
  kept.push('Execution Notes:');
  for (const signal of uniqueSignals) {
    kept.push(`- ${signal}`);
  }

  const content = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const title = directive.directive.slice(0, 120).replace(/\.$/, '').trim();
  const issues = getFinishedDocumentIssues(title, content);
  if (issues.length > 0) return null;

  return {
    type: 'document',
    title,
    content,
  };
}

export function getArtifactPersistenceIssues(
  actionType: string,
  artifact: ConvictionArtifact | Record<string, unknown> | null,
  directive?: ConvictionDirective,
): string[] {
  const issues: string[] = [];
  if (!artifact || typeof artifact !== 'object') {
    return ['artifact is required before persistence'];
  }

  const record = artifact as Record<string, unknown>;
  if (record.emergency_fallback === true) {
    if (
      directive &&
      actionType === 'write_document' &&
      directiveLooksLikeScheduleConflict(directive)
    ) {
      const title = isNonEmptyString(record.title) ? record.title.trim() : '';
      const content = isNonEmptyString(record.content) ? record.content.trim() : '';
      if (scheduleConflictArtifactIsOwnerProcedure(`${title}\n${content}`)) {
        return ['schedule_conflict finished-work required (emergency fallback is owner-facing)'];
      }
    }
    return [];
  }
  if (actionType === 'write_document') {
    const title = isNonEmptyString(record.title) ? record.title.trim() : '';
    const content = isNonEmptyString(record.content) ? record.content.trim() : '';
    issues.push(...getFinishedDocumentIssues(title, content));
    if (
      directive &&
      directiveLooksLikeScheduleConflict(directive) &&
      scheduleConflictArtifactIsOwnerProcedure(`${title}\n${content}`)
    ) {
      issues.push('schedule_conflict artifact must be finished outbound work, not an owner checklist');
    }
  }

  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'string' && hasAnalysisScaffolding(value)) {
      issues.push(`artifact.${key} contains internal analysis scaffolding`);
    }
  }

  return [...new Set(issues)];
}


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
// Discrepancy transformation helpers
// ---------------------------------------------------------------------------

/**
 * True when fullContext is a raw analysis dump from buildFullContext() in generator.ts
 * (contains internal section headers that must never surface to users).
 */
function isAnalysisDump(text: string): boolean {
  return hasAnalysisScaffolding(text);
}

type DiscrepancyFlavor = 'person' | 'deadline' | 'goal' | 'schedule_conflict';

/**
 * Infer what kind of finished artifact the discrepancy should become.
 * person  → sendable outreach message (decay / risk only)
 * schedule_conflict → ready-to-send outbound copy only (no owner checklist)
 * deadline → pre-filled execution steps (calendar pressure, exposure, drift, etc.)
 * goal    → concrete action plan (fallback)
 *
 * Class wins over prose: schedule_conflict copy often mentions "reconnect" from runner-up
 * context — must not route to the person/outreach template for a write_document calendar win.
 */
function detectDiscrepancyFlavor(directive: ConvictionDirective): DiscrepancyFlavor {
  const cls = directive.discrepancyClass as DiscrepancyClass | undefined;

  if (cls === 'decay' || cls === 'risk') {
    return 'person';
  }
  if (cls === 'schedule_conflict') {
    return 'schedule_conflict';
  }
  if (cls) {
    return 'deadline';
  }

  const text = `${directive.directive} ${directive.reason ?? ''}`.toLowerCase();
  if (
    /\boverlap|double[- ]book|schedule conflict|conflicting events|calendar conflict|both events\b/i.test(
      text,
    )
  ) {
    return 'schedule_conflict';
  }
  if (/silent|reach out|reconnect|relationship|contact|follow.?up/i.test(text)) return 'person';
  if (/due|deadline|overdue|stalled.*commit|commitment|exposure|at.?risk/i.test(text)) return 'deadline';
  return 'goal';
}

/**
 * Build a transformation prompt that strips all analysis metadata and
 * produces a single finished, zero-thinking-required artifact.
 */
function buildDiscrepancyTransformPrompt(
  directive: ConvictionDirective,
  flavor: DiscrepancyFlavor,
  relationships: string,
): { system: string; user: string } {
  const fullCtx = ((directive as any).fullContext as string | undefined) ?? directive.reason ?? '';

  const shared = `
SITUATION: ${directive.directive}
REASON: ${directive.reason ?? ''}
ANALYSIS:
${fullCtx.slice(0, 900)}
RELATIONSHIPS:
${relationships.slice(0, 400)}`;

  switch (flavor) {
    case 'schedule_conflict':
      return {
        system: `You write FINISHED OUTBOUND MESSAGES for a calendar double-booking — not a memo, checklist, or instructions to the calendar owner.

The product requires one-tap approval of real work product: only text the user can send as-is (SMS, email, or chat) to someone else involved in the overlap.

Rules (non-negotiable):
- Return JSON with type "document", a short title, and content that contains ONLY send-ready messages.
- If multiple people need different messages, label each block on its own line, e.g. "To Mom (text):" then the message, blank line, then "To Alex (text):" etc.
- Each message must reference the real conflict using event titles and the date from SITUATION/ANALYSIS; propose a specific reschedule, regret, or time trade-off in natural language.
- Forbidden anywhere in content: numbered lists (1. 2. 3.), bullet step lists, "Open your calendar", "Click", "Decide which", "Update/decline/reschedule the event" as orders to the user, "Block time", "within X minutes/hours", "Step 1", planning notes, or "you should" coaching.
- No bracket placeholders ([phone], [date], [name]) — use facts from SITUATION or plain wording.
- No INSIGHT/WHY NOW labels or analysis scaffolding.
- Under 450 words total.

Return ONLY valid JSON:
{"type":"document","title":"<3-8 words>","content":"<only labeled outbound messages>"}`,
        user: `${shared}

Write only send-ready messages for the people involved in the overlap. Return JSON only.`,
      };

    case 'person':
      return {
        system: `You write short, high-leverage outreach messages that create FORWARD MOTION.
The message must do one of:
- Ask for a concrete decision or next step
- Unblock a stalled thread with a specific proposal
- Reference the actual context (project, deliverable, conversation) and advance it

FORBIDDEN (hard reject — your output will be thrown away if it contains any of these):
- "Hope you're doing well" or any variant
- "Just checking in" or "reaching out"
- "Would love to catch up / reconnect / connect"
- "It's been a while"
- "Let's grab coffee"
- Any vague warmth without a concrete ask or proposal
- Generic relationship-maintenance language

Rules:
- Under 150 words
- Reference specific context from the analysis (project names, deliverables, dates)
- End with a concrete ask — not "let me know if you'd like to chat"
- No analysis, no INSIGHT/WHY NOW labels, no scoring language
- Do not mention Foldera or any analytics system

Return ONLY valid JSON:
{"type":"document","title":"<3-7 word action title>","content":"<the ready-to-send message>"}`,
        user: `${shared}

Write a message that creates forward motion. Return JSON only.`,
      };

    case 'deadline':
      return {
        system: `You write pre-filled execution artifacts for time-sensitive commitments.
The output must reduce consequence, not merely acknowledge risk.

Rules (non-negotiable):
- Numbered steps, each completable in under 10 minutes
- Fill in ALL names, dates, amounts, and details from the analysis — no placeholders
- Each step must be a concrete action verb (send, call, submit, book, draft), not commentary
- Include the specific constraint or deadline driving urgency
- No analysis, no INSIGHT/WHY NOW labels, no scoring language
- No vague instructions like "consider", "think about", or "review your options"

Return ONLY valid JSON:
{"type":"document","title":"<3-7 word action title>","content":"<numbered execution steps in markdown>"}`,
        user: `${shared}

Write pre-filled execution steps that reduce consequence. Return JSON only.`,
      };

    case 'goal':
    default:
      return {
        system: `You write decision frames or concrete action plans that convert hesitation into motion.
The output must close ambiguity — not restate the problem.

Rules (non-negotiable):
- If the stall is caused by indecision: frame the decision with 2 options, constraints, and a recommendation
- If the stall is caused by inaction: list 3-5 concrete next steps with specific timeframes
- Fill in ALL details from the analysis — names, dates, amounts, deliverables
- Each action must be completable in under 30 minutes
- No analysis, no INSIGHT/WHY NOW labels, no scoring language
- No vague language like "revisit", "explore", or "align on"

Return ONLY valid JSON:
{"type":"document","title":"<3-7 word action title>","content":"<decision frame or action plan in markdown>"}`,
        user: `${shared}

Convert this stall into forward motion. Return JSON only.`,
      };
  }
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

You are drafting an email that creates FORWARD MOTION.
The email must advance a real situation — not maintain a relationship.
Use the relationship history and recent signals to personalize tone and content.
If the directive references a specific person, use their name, company, and email address from Relationships when available.
Never invent a recipient email address.
Never use placeholders.

FORBIDDEN (your output will be rejected if it contains any of these):
- "Hope you're doing well" or any variant
- "Just checking in" or "reaching out"
- "Would love to catch up / reconnect"
- Any warm-but-empty opener without a concrete ask
- Generic relationship maintenance

Every email must:
- Reference a specific project, deliverable, decision, or thread
- End with a concrete ask or proposal (not "let me know")
- Create a reason for the recipient to respond with substance
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

Write an email that creates forward motion. Return JSON only.`,
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

function containsGenericFiller(value: string): boolean {
  return GENERIC_FILLER_PATTERNS.some((pattern) => pattern.test(value));
}

export async function generateArtifact(
  userId: string,
  directive: ConvictionDirective,
): Promise<ConvictionArtifact | null> {
  // If the directive already contains an embedded artifact (from new brain), use it directly
  const d = directive as ConvictionDirective & { embeddedArtifact?: any; embeddedArtifactType?: string };
  if (d.embeddedArtifact) {
    try {
      return validateArtifact(directive.action_type, d.embeddedArtifact, directive);
    } catch {
      // If canonical action is write_document but LLM produced a wait_rationale,
      // convert directly — discrepancy candidates write analysis prose that is
      // perfectly valid as a document artifact without a second LLM call.
      // Skip this shortcut when the context is a raw analysis dump (contains
      // INSIGHT:/WHY NOW:/Winning loop: headers) — those must fall through to
      // the isAnalysisDump LLM transformation path below instead of leaking raw.
      if (
        directive.action_type === 'write_document' &&
        d.embeddedArtifact?.type === 'wait_rationale' &&
        typeof d.embeddedArtifact?.context === 'string' &&
        d.embeddedArtifact.context.length > 20 &&
        !isAnalysisDump(d.embeddedArtifact.context)
      ) {
        const ctx = d.embeddedArtifact.context.trim();
        if (
          !directiveLooksLikeScheduleConflict(directive) ||
          !scheduleConflictArtifactIsOwnerProcedure(ctx)
        ) {
          return {
            type: 'document',
            title: directive.directive.slice(0, 120).replace(/\.$/, '').trim(),
            content: ctx,
          } as DocumentArtifact;
        }
      }

      if (
        directive.action_type === 'write_document' &&
        typeof d.embeddedArtifact?.context === 'string' &&
        d.embeddedArtifact.context.trim().length > 20 &&
        !directiveLooksLikeScheduleConflict(directive)
      ) {
        const deterministic = buildDeterministicDocumentFallback(directive, d.embeddedArtifact.context);
        if (deterministic) return deterministic;
      }
      // Fall through to generation for all other mismatches
    }
  }

  // Fast-path for write_document — two cases:
  //
  // 1. Analysis dump (fullContext has INSIGHT/WHY NOW/Winning loop headers):
  //    Transform into a finished, flavor-appropriate artifact via LLM.
  //    This is the primary case for discrepancy candidates.
  //
  // 2. Already-finished content (no analysis markers):
  //    Return as-is — no LLM call needed.
  if (directive.action_type === 'write_document') {
    const fullCtx = (directive as any).fullContext as string | undefined;

    if (typeof fullCtx === 'string' && fullCtx.trim().length > 20 && isAnalysisDump(fullCtx)) {
      // Transform: analysis → finished artifact
      const flavor = detectDiscrepancyFlavor(directive);
      let relationships = 'No relationship data available.';
      try {
        relationships = await loadRelationshipContext(userId, directive.directive);
      } catch (relErr) {
        logStructuredEvent({
          event: 'artifact_relationship_context_failed',
          level: 'warn',
          userId,
          artifactType: null,
          generationStatus: 'context_load_failed',
          details: {
            scope: 'artifact-generator',
            error: relErr instanceof Error ? relErr.message : String(relErr),
          },
        });
      }
      const { system, user } = buildDiscrepancyTransformPrompt(directive, flavor, relationships);

      try {
        const response = await getAnthropic().messages.create({
          model: ARTIFACT_MODEL,
          max_tokens: 800,
          temperature: 0.2 as any,
          system,
          messages: [{ role: 'user', content: user }],
        });

        await trackApiCall({
          userId,
          model: ARTIFACT_MODEL,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          callType: 'artifact',
        });

        const textBlocks = response.content.filter(
          (b): b is Anthropic.TextBlock => b.type === 'text',
        );
        const raw = textBlocks.map((b) => b.text).join('');
        let cleaned = raw.replace(/```(?:json|JSON)?\s*\n?/g, '').trim();
        if (!cleaned.startsWith('{')) {
          const firstBrace = cleaned.indexOf('{');
          const lastBrace = cleaned.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace > firstBrace) {
            cleaned = cleaned.slice(firstBrace, lastBrace + 1);
          }
        }
        const parsed = JSON.parse(cleaned);
        return validateArtifact('write_document', parsed, directive);
      } catch {
        // Transformation failed — deterministic repair before emergency fallback.
        const deterministic = buildDeterministicDocumentFallback(directive, fullCtx);
        if (deterministic) return deterministic;
        return emergencyWriteDocumentArtifact(directive);
      }
    }

    // Non-analysis content: use as-is
    const bodyContent =
      typeof fullCtx === 'string' && fullCtx.trim().length > 20 && !isAnalysisDump(fullCtx)
        ? fullCtx.trim()
        : typeof directive.reason === 'string' && directive.reason.trim().length > 10
          ? directive.reason.trim()
          : null;
    if (bodyContent) {
      if (
        effectiveDiscrepancyClassForGates(directive) === 'schedule_conflict' &&
        scheduleConflictArtifactIsOwnerProcedure(bodyContent)
      ) {
        // Do not ship owner checklists as finished work — force transform / fallback paths.
      } else {
        return {
          type: 'document',
          title: directive.directive.slice(0, 120).replace(/\.$/, '').trim(),
          content: bodyContent,
        } as DocumentArtifact;
      }
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
    return validateArtifact(directive.action_type, parsed, directive);
  } catch (err) {
    Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
      tags: { scope: 'artifact-generator', userId: userId?.substring(0, 8) },
      extra: { actionType: directive.action_type },
    });
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
    if (directive.action_type === 'write_document') {
      return emergencyWriteDocumentArtifact(directive);
    }
    if (directive.action_type === 'send_message') {
      return emergencyEmailArtifact(directive);
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Validation — ensure artifact shape matches action type
// ---------------------------------------------------------------------------

function validateArtifact(
  actionType: string,
  parsed: any,
  directive?: ConvictionDirective,
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
      if (containsGenericFiller(body.trim())) {
        throw new Error('Email artifact contains generic filler — must create forward motion');
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
      if (containsGenericFiller(a.content.trim())) {
        throw new Error('Document artifact contains generic filler — must create forward motion');
      }
      const documentIssues = getFinishedDocumentIssues(a.title.trim(), a.content.trim());
      if (documentIssues.length > 0) {
        throw new Error(documentIssues.join('; '));
      }
      if (
        directive &&
        directiveLooksLikeScheduleConflict(directive) &&
        scheduleConflictArtifactIsOwnerProcedure(a.content)
      ) {
        throw new Error(
          'schedule_conflict document must be finished outbound messages only — not a calendar-owner checklist',
        );
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
