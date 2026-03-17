import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/db/client';
import type { ActionType, ChiefOfStaffBriefing, ConvictionDirective, EvidenceItem } from './types';
import type { DeprioritizedLoop, ScoredLoop, ScorerResult } from './scorer';
import { scoreOpenLoops } from './scorer';
import { isOverDailyLimit, trackApiCall } from '@/lib/utils/api-tracker';
import { logStructuredEvent } from '@/lib/utils/structured-logger';

const GENERATION_FAILED_SENTINEL = '__GENERATION_FAILED__';
const GENERATION_MODEL = 'claude-sonnet-4-20250514';
const APPROVAL_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const DIRECTIVE_CONFIDENCE_THRESHOLD = 70;
const BANNED_DIRECTIVE_PATTERNS = [
  /\bconsider\b/i,
  /\breflect\b/i,
  /\bexplore\b/i,
  /\bbrainstorm\b/i,
  /\bthink about\b/i,
  /\bmaybe\b/i,
  /\bperhaps\b/i,
  /\btry to\b/i,
];
const PLACEHOLDER_PATTERNS = [
  /\[(name|company|role|contact|date|amount|title|recipient)\]/i,
  /\b(tbd|placeholder|lorem ipsum|example@|recipient@email\.com)\b/i,
  /\b(option a|option b)\b/i,
];

const SYSTEM_PROMPT = `You are finalizing Foldera's single winning daily directive.
The ranking is already done. Do not pick a different problem. Turn the winning thread into one concrete directive and one finished artifact.

Doctrine:
- Email first. One directive. One finished artifact.
- No fake confidence. No generic productivity filler.
- No multiple options in the brief itself.
- No speculative hobby or lifestyle suggestions.
- No vague language like consider, reflect, explore, think about, maybe, perhaps, try to.
- Name the actual person, project, deadline, decision, or constraint from the evidence.
- The artifact must be directly usable with no placeholders.
- If the action is wait, make the tripwire explicit and concrete.
- If the action is a decision, lead with the recommendation, then justify it with concrete tradeoffs.

Return strict JSON only:
{
  "directive": "One imperative sentence with the exact move",
  "artifact_type": "drafted_email | document | calendar_event | research_brief | decision_frame | wait_rationale",
  "artifact": {},
  "evidence": "One sentence naming the decisive evidence",
  "why_now": "One sentence explaining why this wins today",
  "requires_search": false,
  "search_context": ""
}`;

type GeneratorArtifactType =
  | 'drafted_email'
  | 'document'
  | 'calendar_event'
  | 'research_brief'
  | 'decision_frame'
  | 'wait_rationale';

interface GeneratedDirectivePayload {
  directive: string;
  artifact_type: GeneratorArtifactType;
  artifact: Record<string, unknown>;
  evidence: string;
  why_now: string;
  requires_search?: boolean;
  search_context?: string;
}

interface RecentActionRow {
  directive_text: string | null;
  action_type: string | null;
  generated_at: string;
}

interface RecentSkippedActionRow extends RecentActionRow {
  skip_reason: string | null;
}

interface PromptContext {
  winner: ScoredLoop;
  deprioritized: DeprioritizedLoop[];
  approvedRecently: RecentActionRow[];
  skippedRecently: RecentSkippedActionRow[];
}

let anthropicClient: Anthropic | null = null;

function getAnthropic(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

function emptyDirective(reason: string): ConvictionDirective {
  return {
    directive: GENERATION_FAILED_SENTINEL,
    action_type: 'do_nothing',
    confidence: 0,
    reason,
    evidence: [],
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarityScore(a: string, b: string): number {
  const normalizedA = normalizeText(a);
  const normalizedB = normalizeText(b);
  if (!normalizedA || !normalizedB) return 0;
  if (normalizedA === normalizedB) return 1;
  if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) return 0.9;

  const tokensA = new Set(normalizedA.split(' ').filter((token) => token.length >= 4));
  const tokensB = new Set(normalizedB.split(' ').filter((token) => token.length >= 4));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection++;
  }
  const union = new Set([...tokensA, ...tokensB]).size;
  return union > 0 ? intersection / union : 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function containsPlaceholderText(value: string): boolean {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value));
}

function hasMeaningfulOverlap(candidate: string, winner: ScoredLoop): boolean {
  const directiveTokens = new Set(normalizeText(candidate).split(' ').filter((token) => token.length >= 4));
  if (directiveTokens.size === 0) return false;

  const sourceTokens = new Set(
    normalizeText(
      [winner.title, winner.content, winner.relationshipContext ?? '', ...(winner.relatedSignals ?? [])].join(' '),
    )
      .split(' ')
      .filter((token) => token.length >= 4),
  );

  for (const token of directiveTokens) {
    if (sourceTokens.has(token)) return true;
  }
  return false;
}

function normalizeArtifactType(value: unknown): GeneratorArtifactType | null {
  if (
    value === 'drafted_email' ||
    value === 'document' ||
    value === 'calendar_event' ||
    value === 'research_brief' ||
    value === 'decision_frame' ||
    value === 'wait_rationale'
  ) {
    return value;
  }
  return null;
}

function artifactTypeToActionType(artifactType: GeneratorArtifactType): ActionType {
  switch (artifactType) {
    case 'drafted_email':
      return 'send_message';
    case 'document':
      return 'write_document';
    case 'calendar_event':
      return 'schedule';
    case 'research_brief':
      return 'research';
    case 'decision_frame':
      return 'make_decision';
    case 'wait_rationale':
    default:
      return 'do_nothing';
  }
}

function actionTypeToArtifactType(actionType: ActionType): GeneratorArtifactType {
  switch (actionType) {
    case 'send_message':
      return 'drafted_email';
    case 'write_document':
      return 'document';
    case 'schedule':
      return 'calendar_event';
    case 'research':
      return 'research_brief';
    case 'make_decision':
      return 'decision_frame';
    case 'do_nothing':
    default:
      return 'wait_rationale';
  }
}

function expectedArtifactRules(actionType: ActionType): string {
  switch (actionType) {
    case 'send_message':
      return [
        'Action type is send_message. artifact_type must be drafted_email.',
        'Artifact JSON must include recipient or to, subject, and body.',
        'Use a real email address from the dossier if one is present. Never fabricate an address.',
      ].join('\n');
    case 'write_document':
      return [
        'Action type is write_document. artifact_type must be document.',
        'Artifact JSON must include title and content.',
        'Write the finished memo or note, not bullet prompts.',
      ].join('\n');
    case 'schedule':
      return [
        'Action type is schedule. artifact_type must be calendar_event.',
        'Artifact JSON must include title, start, end, and description.',
        'Choose a concrete time slot. Do not leave timing open ended.',
      ].join('\n');
    case 'research':
      return [
        'Action type is research. artifact_type must be research_brief.',
        'Artifact JSON must include findings, sources, and recommended_action.',
        'Cite real sources and make the recommendation concrete.',
      ].join('\n');
    case 'make_decision':
      return [
        'Action type is make_decision. artifact_type must be decision_frame.',
        'Artifact JSON must include options and recommendation.',
        'Recommendation must make the choice explicit in the first sentence.',
      ].join('\n');
    case 'do_nothing':
    default:
      return [
        'Action type is do_nothing. artifact_type must be wait_rationale.',
        'Artifact JSON must include context, evidence, and tripwires.',
        'Tripwires must be specific signals that would reopen the decision.',
      ].join('\n');
  }
}

function formatRecentAction(row: RecentActionRow): string {
  return `[${row.generated_at.slice(0, 10)}] [${row.action_type ?? 'unknown'}] ${row.directive_text ?? ''}`;
}

function buildGenerationPrompt(context: PromptContext): string {
  const { winner, deprioritized, approvedRecently, skippedRecently } = context;
  const relatedSignals = winner.relatedSignals.length > 0
    ? winner.relatedSignals.map((signal) => `- ${signal}`).join('\n')
    : '- None';
  const runnerUps = deprioritized.length > 0
    ? deprioritized
      .map((loop) => `- ${loop.title} — ${loop.killExplanation}`)
      .join('\n')
    : '- None';
  const approvedLines = approvedRecently.length > 0
    ? approvedRecently.map(formatRecentAction).map((line) => `- ${line}`).join('\n')
    : '- None';
  const skippedLines = skippedRecently.length > 0
    ? skippedRecently
      .map((row) => `${formatRecentAction(row)}${row.skip_reason ? ` (skip: ${row.skip_reason})` : ''}`)
      .map((line) => `- ${line}`)
      .join('\n')
    : '- None';

  const matchedGoal = winner.matchedGoal
    ? `${winner.matchedGoal.text} [${winner.matchedGoal.category}, priority ${winner.matchedGoal.priority}/5]`
    : 'No explicit goal match.';

  const scoreBreakdown = [
    `stakes=${winner.breakdown.stakes.toFixed(2)}`,
    `urgency=${winner.breakdown.urgency.toFixed(2)}`,
    `tractability=${winner.breakdown.tractability.toFixed(2)}`,
    `freshness=${winner.breakdown.freshness.toFixed(2)}`,
    `total=${winner.score.toFixed(2)}`,
  ].join(', ');

  return [
    `TODAY: ${today()}`,
    `WINNING_LOOP_TITLE:\n${winner.title}`,
    `WINNING_LOOP_TYPE:\n${winner.type}`,
    `WINNING_ACTION_TYPE:\n${winner.suggestedActionType}`,
    `GOAL_ALIGNMENT:\n${matchedGoal}`,
    `SCORE_BREAKDOWN:\n${scoreBreakdown}`,
    `PRIMARY_EVIDENCE:\n${winner.content}`,
    `RELATED_SIGNALS:\n${relatedSignals}`,
    `RELATIONSHIP_CONTEXT:\n${winner.relationshipContext ?? 'None'}`,
    `RUNNER_UPS_REJECTED:\n${runnerUps}`,
    `RECENTLY_APPROVED:\n${approvedLines}`,
    `RECENTLY_SKIPPED:\n${skippedLines}`,
    `ARTIFACT_RULES:\n${expectedArtifactRules(winner.suggestedActionType)}`,
  ].join('\n\n');
}

function parseGeneratedPayload(raw: string): GeneratedDirectivePayload | null {
  const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
  const parsed = JSON.parse(cleaned) as Partial<GeneratedDirectivePayload>;
  const artifactType = normalizeArtifactType(parsed.artifact_type);
  if (!artifactType) return null;

  return {
    directive: typeof parsed.directive === 'string' ? parsed.directive : '',
    artifact_type: artifactType,
    artifact: typeof parsed.artifact === 'object' && parsed.artifact !== null ? parsed.artifact as Record<string, unknown> : {},
    evidence: typeof parsed.evidence === 'string' ? parsed.evidence : '',
    why_now: typeof parsed.why_now === 'string' ? parsed.why_now : '',
    requires_search: parsed.requires_search === true,
    search_context: typeof parsed.search_context === 'string' ? parsed.search_context : '',
  };
}

function validateStringField(
  value: unknown,
  label: string,
  issues: string[],
  options?: { allowShort?: boolean },
): string {
  if (!isNonEmptyString(value)) {
    issues.push(`${label} is required`);
    return '';
  }

  const trimmed = value.trim();
  if (!options?.allowShort && trimmed.length < 12) {
    issues.push(`${label} is too short`);
  }
  if (containsPlaceholderText(trimmed)) {
    issues.push(`${label} contains placeholder text`);
  }
  return trimmed;
}

function validateArtifactPayload(
  actionType: ActionType,
  artifact: Record<string, unknown>,
  issues: string[],
): void {
  switch (actionType) {
    case 'send_message': {
      const recipient = validateStringField(
        artifact.recipient ?? artifact.to,
        'drafted_email recipient',
        issues,
        { allowShort: true },
      );
      const subject = validateStringField(artifact.subject, 'drafted_email subject', issues, { allowShort: true });
      validateStringField(artifact.body, 'drafted_email body', issues);
      if (recipient && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)) {
        issues.push('drafted_email recipient must be a real email address');
      }
      if (subject && BANNED_DIRECTIVE_PATTERNS.some((pattern) => pattern.test(subject))) {
        issues.push('drafted_email subject is vague');
      }
      break;
    }
    case 'write_document':
      validateStringField(artifact.title, 'document title', issues, { allowShort: true });
      validateStringField(artifact.content, 'document content', issues);
      break;
    case 'schedule':
      validateStringField(artifact.title, 'calendar_event title', issues, { allowShort: true });
      validateStringField(artifact.start, 'calendar_event start', issues, { allowShort: true });
      validateStringField(artifact.end, 'calendar_event end', issues, { allowShort: true });
      validateStringField(artifact.description, 'calendar_event description', issues);
      break;
    case 'research': {
      validateStringField(artifact.findings, 'research_brief findings', issues);
      validateStringField(artifact.recommended_action, 'research_brief recommended_action', issues);
      const sources = Array.isArray(artifact.sources) ? artifact.sources.filter(isNonEmptyString) : [];
      if (sources.length === 0) {
        issues.push('research_brief sources are required');
      }
      break;
    }
    case 'make_decision': {
      const options = Array.isArray(artifact.options) ? artifact.options : [];
      if (options.length < 2) {
        issues.push('decision_frame requires at least two options');
      }
      for (const option of options) {
        if (!option || typeof option !== 'object') {
          issues.push('decision_frame options must be objects');
          continue;
        }

        const record = option as Record<string, unknown>;
        const label = validateStringField(record.option, 'decision_frame option', issues, { allowShort: true });
        if (label && containsPlaceholderText(label)) {
          issues.push('decision_frame option contains placeholder text');
        }
        if (typeof record.weight !== 'number' || Number.isNaN(record.weight)) {
          issues.push('decision_frame option weight must be numeric');
        }
      }
      validateStringField(artifact.recommendation, 'decision_frame recommendation', issues);
      break;
    }
    case 'do_nothing':
    default: {
      validateStringField(artifact.context, 'wait_rationale context', issues);
      validateStringField(artifact.evidence, 'wait_rationale evidence', issues);
      const tripwires = Array.isArray(artifact.tripwires)
        ? artifact.tripwires.filter(isNonEmptyString).map((value) => value.trim())
        : [];
      if (tripwires.length === 0) {
        issues.push('wait_rationale tripwires are required');
      }
      if (tripwires.some(containsPlaceholderText)) {
        issues.push('wait_rationale tripwires contain placeholder text');
      }
      break;
    }
  }
}

function validateGeneratedPayload(
  payload: GeneratedDirectivePayload | null,
  promptContext: PromptContext,
): string[] {
  if (!payload) {
    return ['Response was not valid JSON in the required schema.'];
  }

  const issues: string[] = [];
  const directive = validateStringField(payload.directive, 'directive', issues);
  validateStringField(payload.evidence, 'evidence', issues);
  validateStringField(payload.why_now, 'why_now', issues);

  if (directive && BANNED_DIRECTIVE_PATTERNS.some((pattern) => pattern.test(directive))) {
    issues.push('directive uses vague language');
  }
  if (directive && !hasMeaningfulOverlap(directive, promptContext.winner)) {
    issues.push('directive is not specific to the winning evidence');
  }

  const expectedArtifactType = actionTypeToArtifactType(promptContext.winner.suggestedActionType);
  if (payload.artifact_type !== expectedArtifactType) {
    issues.push(`artifact_type must be ${expectedArtifactType}`);
  }

  validateArtifactPayload(promptContext.winner.suggestedActionType, payload.artifact, issues);

  const duplicateApproved = promptContext.approvedRecently.some((row) => {
    if (!row.directive_text) return false;
    return similarityScore(payload.directive, row.directive_text) >= 0.72;
  });
  if (duplicateApproved) {
    issues.push('directive repeats something already done in the last 7 days');
  }

  const duplicateSkippedWithoutEvidence = promptContext.skippedRecently.some((row) => {
    if (!row.directive_text) return false;
    if (similarityScore(payload.directive, row.directive_text) < 0.72) return false;
    return !promptContext.winner.relatedSignals.some((signal) => signal.length > 0);
  });
  if (duplicateSkippedWithoutEvidence) {
    issues.push('directive repeats a recently skipped item without new evidence');
  }

  if (payload.requires_search && !isNonEmptyString(payload.search_context)) {
    issues.push('search_context is required when requires_search is true');
  }

  return issues;
}

async function loadRecentActionGuardrails(userId: string): Promise<{
  approvedRecently: RecentActionRow[];
  skippedRecently: RecentSkippedActionRow[];
}> {
  const supabase = createServerClient();
  const approvedSince = new Date(Date.now() - APPROVAL_LOOKBACK_MS).toISOString();

  const [approvedRes, skippedRes] = await Promise.all([
    supabase
      .from('tkg_actions')
      .select('directive_text, action_type, generated_at')
      .eq('user_id', userId)
      .in('status', ['approved', 'executed'])
      .gte('generated_at', approvedSince)
      .order('generated_at', { ascending: false })
      .limit(10),
    supabase
      .from('tkg_actions')
      .select('directive_text, action_type, generated_at, skip_reason')
      .eq('user_id', userId)
      .in('status', ['skipped', 'draft_rejected', 'rejected'])
      .gte('generated_at', approvedSince)
      .order('generated_at', { ascending: false })
      .limit(10),
  ]);

  if (approvedRes.error) throw approvedRes.error;
  if (skippedRes.error) throw skippedRes.error;

  return {
    approvedRecently: (approvedRes.data ?? []) as RecentActionRow[],
    skippedRecently: (skippedRes.data ?? []) as RecentSkippedActionRow[],
  };
}

function computeDirectiveConfidence(result: ScorerResult): number {
  const runnerUpScore = result.deprioritized[0]?.score ?? 0;
  const winner = result.winner;
  const stakes = Math.min(1, winner.breakdown.stakes / 5);
  const urgency = Math.max(0, Math.min(1, winner.breakdown.urgency));
  const tractability = Math.max(0, Math.min(1, winner.breakdown.tractability));
  const freshness = Math.max(0, Math.min(1, winner.breakdown.freshness));
  const evidenceDepth = Math.min(
    1,
    (
      (winner.relatedSignals.length > 0 ? Math.min(winner.relatedSignals.length, 3) : 0) +
      (winner.matchedGoal ? 2 : 0) +
      (winner.relationshipContext ? 2 : 0)
    ) / 7,
  );
  const margin = winner.score <= 0
    ? 0
    : Math.max(0, Math.min(1, (winner.score - runnerUpScore) / Math.max(winner.score, 0.01)));

  const composite =
    (stakes * 0.24) +
    (urgency * 0.18) +
    (tractability * 0.24) +
    (freshness * 0.12) +
    (evidenceDepth * 0.12) +
    (margin * 0.10);

  return Math.max(40, Math.min(95, Math.round(40 + (composite * 55))));
}

function buildEvidenceItems(result: ScorerResult, payload: GeneratedDirectivePayload): EvidenceItem[] {
  const evidence: EvidenceItem[] = [
    {
      type: 'signal',
      description: payload.evidence.trim(),
    },
  ];

  if (result.winner.matchedGoal) {
    evidence.push({
      type: 'goal',
      description: `${result.winner.matchedGoal.text} [${result.winner.matchedGoal.category}]`,
    });
  }

  for (const signal of result.winner.relatedSignals.slice(0, 2)) {
    evidence.push({
      type: 'signal',
      description: signal.slice(0, 220),
    });
  }

  return evidence;
}

function buildFullContext(result: ScorerResult, payload: GeneratedDirectivePayload): string {
  const sections = [
    `Winning loop: ${result.winner.title}`,
    result.winner.content,
    payload.evidence.trim(),
    payload.why_now.trim(),
  ];

  if (result.winner.relationshipContext) {
    sections.push(`Relationship context:\n${result.winner.relationshipContext}`);
  }

  if (result.deprioritized.length > 0) {
    sections.push(
      `Runner-ups rejected:\n${result.deprioritized
        .map((loop) => `- ${loop.title}: ${loop.killExplanation}`)
        .join('\n')}`,
    );
  }

  return sections.join('\n\n');
}

async function generatePayload(
  userId: string,
  promptContext: PromptContext,
): Promise<GeneratedDirectivePayload | null> {
  const initialPrompt = buildGenerationPrompt(promptContext);
  const attempts: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: initialPrompt },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await getAnthropic().messages.create({
      model: GENERATION_MODEL,
      max_tokens: 2400,
      temperature: 0.15,
      system: SYSTEM_PROMPT,
      messages: attempts,
    });

    await trackApiCall({
      userId,
      model: GENERATION_MODEL,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      callType: attempt === 0 ? 'directive' : 'directive_retry',
    });

    const raw = response.content[0]?.type === 'text' ? response.content[0].text : '';
    let parsed: GeneratedDirectivePayload | null = null;
    try {
      parsed = parseGeneratedPayload(raw);
    } catch {
      parsed = null;
    }

    const issues = validateGeneratedPayload(parsed, promptContext);
    if (issues.length === 0 && parsed) {
      return parsed;
    }

    if (attempt === 0) {
      logStructuredEvent({
        event: 'generation_retry',
        level: 'warn',
        userId,
        artifactType: parsed?.artifact_type ?? null,
        generationStatus: 'retrying_validation',
        details: {
          scope: 'generator',
          issues,
          action_type: promptContext.winner.suggestedActionType,
        },
      });

      attempts.push({ role: 'assistant', content: raw });
      attempts.push({
        role: 'user',
        content: `Validation failed. Fix these issues and return JSON only:
- ${issues.join('\n- ')}`,
      });
      continue;
    }

    logStructuredEvent({
      event: 'generation_incomplete',
      level: 'error',
      userId,
      artifactType: parsed?.artifact_type ?? null,
      generationStatus: 'generation_incomplete',
      details: {
        scope: 'generator',
        issues,
        action_type: promptContext.winner.suggestedActionType,
      },
    });
  }

  return null;
}

export async function generateDirective(userId: string): Promise<ConvictionDirective> {
  try {
    if (await isOverDailyLimit(userId)) {
      logStructuredEvent({
        event: 'generation_skipped',
        level: 'warn',
        userId,
        artifactType: null,
        generationStatus: 'daily_cap_reached',
        details: { scope: 'generator' },
      });
      return emptyDirective('Daily spend cap reached.');
    }

    const [scored, guardrails] = await Promise.all([
      scoreOpenLoops(userId),
      loadRecentActionGuardrails(userId),
    ]);

    if (!scored?.winner) {
      return emptyDirective('No ranked daily brief candidate.');
    }

    const promptContext: PromptContext = {
      winner: scored.winner,
      deprioritized: scored.deprioritized,
      ...guardrails,
    };

    const payload = await generatePayload(userId, promptContext);
    if (!payload) {
      return emptyDirective('Generation validation failed.');
    }

    const confidence = computeDirectiveConfidence(scored);
    if (confidence < DIRECTIVE_CONFIDENCE_THRESHOLD) {
      logStructuredEvent({
        event: 'generation_skipped',
        level: 'warn',
        userId,
        artifactType: payload.artifact_type,
        generationStatus: 'below_confidence_threshold',
        details: {
          scope: 'generator',
          confidence,
          threshold: DIRECTIVE_CONFIDENCE_THRESHOLD,
        },
      });
      return emptyDirective('No directive cleared the confidence bar.');
    }

    logStructuredEvent({
      event: 'directive_generated',
      userId,
      artifactType: payload.artifact_type,
      generationStatus: 'generated',
      details: {
        scope: 'generator',
        action_type: scored.winner.suggestedActionType,
        winner_type: scored.winner.type,
        score: Number(scored.winner.score.toFixed(2)),
      },
    });

    return {
      directive: payload.directive.trim(),
      action_type: artifactTypeToActionType(payload.artifact_type),
      confidence,
      reason: payload.why_now.trim(),
      evidence: buildEvidenceItems(scored, payload),
      fullContext: buildFullContext(scored, payload),
      embeddedArtifact: payload.artifact,
      embeddedArtifactType: payload.artifact_type,
      requires_search: payload.requires_search === true || artifactTypeToActionType(payload.artifact_type) === 'research',
      search_context: isNonEmptyString(payload.search_context)
        ? payload.search_context.trim()
        : scored.winner.content.slice(0, 500),
    } as ConvictionDirective & {
      embeddedArtifact?: Record<string, unknown>;
      embeddedArtifactType?: GeneratorArtifactType;
    };
  } catch (error) {
    logStructuredEvent({
      event: 'directive_generation_failed',
      level: 'error',
      userId,
      artifactType: null,
      generationStatus: 'failed',
      details: {
        scope: 'generator',
        error: error instanceof Error ? error.message : String(error),
      },
    });
    return emptyDirective('Generation failed internally.');
  }
}

export async function generateBriefing(userId: string): Promise<ChiefOfStaffBriefing> {
  const supabase = createServerClient();
  const directive = await generateDirective(userId);

  if (directive.directive === GENERATION_FAILED_SENTINEL) {
    throw new Error('Briefing generation failed');
  }

  const brief: ChiefOfStaffBriefing = {
    userId,
    briefingDate: today(),
    generatedAt: new Date(),
    topInsight: directive.reason,
    confidence: directive.confidence,
    recommendedAction: directive.directive,
    fullBrief: directive.fullContext ?? directive.reason,
  };

  const { error } = await supabase.from('tkg_briefings').insert({
    user_id: userId,
    briefing_date: brief.briefingDate,
    generated_at: brief.generatedAt.toISOString(),
    top_insight: brief.topInsight,
    confidence: brief.confidence,
    recommended_action: brief.recommendedAction,
    stats: {
      signalsAnalyzed: 0,
      commitmentsReviewed: 0,
      patternsActive: 0,
      fullBrief: brief.fullBrief,
      directive,
    },
  });

  if (error) {
    logStructuredEvent({
      event: 'briefing_cache_failed',
      level: 'warn',
      userId,
      artifactType: actionTypeToArtifactType(directive.action_type),
      generationStatus: 'briefing_cache_failed',
      details: {
        scope: 'generator',
        error: error.message,
      },
    });
  }

  return brief;
}
