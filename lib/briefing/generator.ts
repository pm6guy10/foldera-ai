import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/db/client';
import type {
  ActionType,
  ChiefOfStaffBriefing,
  ConvictionArtifact,
  ConvictionDirective,
  EvidenceItem,
  GenerationCandidateDiscoveryLog,
  GenerationRunLog,
} from './types';
import type { DeprioritizedLoop, ScoredLoop, ScorerResult } from './scorer';
import { scoreOpenLoops } from './scorer';
import { isOverDailyLimit, trackApiCall } from '@/lib/utils/api-tracker';
import { logStructuredEvent } from '@/lib/utils/structured-logger';
import {
  getDirectiveConstraintViolations,
  getPinnedConstraintPrompt,
} from './pinned-constraints';
import { researchWinner } from './researcher';
import type { ResearchInsight } from './researcher';

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
  /\byou should\b/i,
  /\bfocus on\b/i,
  /\bstop doing\b/i,
  /\bstart doing\b/i,
];

/** Artifact types that count as concrete deliverables. */
const CONCRETE_ARTIFACT_TYPES: ReadonlySet<string> = new Set([
  'drafted_email',
  'document',
  'calendar_event',
]);

/** Maximum age (in days) for signal references — older signals with no recent reinforcement are stale. */
const STALE_SIGNAL_THRESHOLD_DAYS = 14;
const PLACEHOLDER_PATTERNS = [
  /\[(name|company|role|contact|date|amount|title|recipient)\]/i,
  /\[your\s*name\]/i,
  /\[RECIPIENT\]/i,
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
- No vague or consulting language: never use "consider", "reflect", "explore", "think about", "maybe", "perhaps", "try to", "you should", "focus on", "stop doing", "start doing".
- Name the actual person, project, deadline, decision, or constraint from the evidence.
- The artifact must be a concrete deliverable: a drafted email, a document, or a calendar event. Do NOT produce decision memos, wait rationales, or research briefs — those are consulting, not action.
- The artifact must be directly usable with no placeholders.
- Pinned constraints are hard vetoes. Never reopen a locked decision or turn the directive into a menu of options.
- The artifact object must stay nested under "artifact" and must match ARTIFACT_JSON_SCHEMA exactly.
- Do not move artifact fields like recipient, subject, body, title, options, or tripwires to the top level.

Return strict JSON only:
{
  "directive": "One imperative sentence with the exact move",
  "artifact_type": "drafted_email | document | calendar_event",
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
  userId: string;
  insight?: ResearchInsight | null;
  winner: ScoredLoop;
  deprioritized: DeprioritizedLoop[];
  approvedRecently: RecentActionRow[];
  skippedRecently: RecentSkippedActionRow[];
}

interface GeneratePayloadResult {
  issues: string[];
  payload: GeneratedDirectivePayload | null;
}

let anthropicClient: Anthropic | null = null;

function getAnthropic(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

function isInternalNoSendExecutionResult(executionResult: unknown): boolean {
  if (!executionResult || typeof executionResult !== 'object') return false;
  return (executionResult as Record<string, unknown>).outcome_type === 'no_send';
}

function buildSelectedGenerationLog(
  candidateDiscovery: GenerationCandidateDiscoveryLog | null,
): GenerationRunLog {
  return {
    outcome: 'selected',
    stage: 'generation',
    reason: candidateDiscovery?.selectionReason ?? 'Directive generated successfully.',
    candidateFailureReasons: (candidateDiscovery?.topCandidates ?? [])
      .filter((candidate) => candidate.decision === 'rejected')
      .map((candidate) => candidate.decisionReason),
    candidateDiscovery,
  };
}

function buildNoSendGenerationLog(
  reason: string,
  stage: GenerationRunLog['stage'],
  candidateDiscovery: GenerationCandidateDiscoveryLog | null,
): GenerationRunLog {
  const normalizedDiscovery = candidateDiscovery
    ? {
      ...candidateDiscovery,
      failureReason: candidateDiscovery.failureReason ?? reason,
    }
    : null;

  const candidateFailureReasons = normalizedDiscovery
    ? normalizedDiscovery.topCandidates.map((candidate) =>
      candidate.decision === 'selected'
        ? `Selected candidate blocked: ${reason}`
        : candidate.decisionReason)
    : [reason];

  return {
    outcome: 'no_send',
    stage,
    reason,
    candidateFailureReasons,
    candidateDiscovery: normalizedDiscovery,
  };
}

function formatValidationFailureReason(prefix: string, issues: string[]): string {
  const normalizedIssues = [...new Set(issues.map((issue) => issue.trim()).filter(Boolean))];
  if (normalizedIssues.length === 0) {
    return prefix;
  }

  return `${prefix} ${normalizedIssues.join('; ')}`;
}

function emptyDirective(reason: string, generationLog?: GenerationRunLog): ConvictionDirective {
  return {
    directive: GENERATION_FAILED_SENTINEL,
    action_type: 'do_nothing',
    confidence: 0,
    reason,
    evidence: [],
    generationLog,
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function buildDirectiveExecutionResult(input: {
  directive: ConvictionDirective;
  briefOrigin: string;
  artifact?: ConvictionArtifact | Record<string, unknown> | null;
  extras?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    ...(input.artifact ? { artifact: input.artifact } : {}),
    brief_origin: input.briefOrigin,
    ...(input.directive.generationLog ? { generation_log: input.directive.generationLog } : {}),
    ...(input.extras ?? {}),
  };
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

function countSentences(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const parts = trimmed
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length === 0 ? 1 : parts.length;
}

function isDecisionMenu(value: string): boolean {
  const lower = value.toLowerCase();
  return /\b(decide whether|whether to|option a|option b)\b/.test(lower) ||
    (lower.includes(' or ') && /\b(decide|choose|whether|abandon|commit|pivot)\b/.test(lower));
}

async function hydrateWinnerRelationshipContext(
  userId: string,
  winner: ScoredLoop,
): Promise<ScoredLoop> {
  if (winner.relationshipContext) {
    return winner;
  }

  const supabase = createServerClient();

  // For commitment-sourced candidates, resolve the recipient entity ONLY
  // from the commitment's promisor/promisee fields. Do not fall back to a
  // broad entity search by goal category — that produces wrong recipients
  // (e.g. DSHS contact for an HCA directive because both are "career").
  const commitmentSourceIds = (winner.sourceSignals ?? [])
    .filter((s) => s.kind === 'commitment' && typeof s.id === 'string')
    .map((s) => s.id as string);

  if (commitmentSourceIds.length > 0) {
    return hydrateFromCommitmentEntities(supabase, userId, winner, commitmentSourceIds);
  }

  // Non-commitment candidates: use text-based entity matching (existing behavior)
  return hydrateFromTextMatch(supabase, userId, winner);
}

/**
 * Resolve relationship context from commitment promisor/promisee entities.
 * Returns only entities directly linked to the commitment — no guessing.
 */
async function hydrateFromCommitmentEntities(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  winner: ScoredLoop,
  commitmentIds: string[],
): Promise<ScoredLoop> {
  // Get promisor and promisee entity IDs from the commitments
  const { data: commitments } = await supabase
    .from('tkg_commitments')
    .select('promisor_id, promisee_id')
    .in('id', commitmentIds);

  if (!commitments || commitments.length === 0) return winner;

  const entityIds = new Set<string>();
  for (const c of commitments) {
    if (c.promisor_id) entityIds.add(c.promisor_id);
    if (c.promisee_id) entityIds.add(c.promisee_id);
  }

  if (entityIds.size === 0) return winner;

  // Look up those specific entities
  const { data: entities } = await supabase
    .from('tkg_entities')
    .select('name, display_name, primary_email, emails, role, company, total_interactions, patterns')
    .eq('user_id', userId)
    .in('id', [...entityIds])
    .neq('name', 'self');

  if (!entities || entities.length === 0) return winner;

  const lines = entities.map((entity) => formatEntityLine(entity as Record<string, unknown>));
  if (lines.length === 0) return winner;

  return { ...winner, relationshipContext: lines.join('\n') };
}

/**
 * Fallback: resolve relationship context from text-based entity matching.
 * Used for signal and relationship candidates that don't have commitment links.
 */
async function hydrateFromTextMatch(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  winner: ScoredLoop,
): Promise<ScoredLoop> {
  const queryText = [
    winner.title,
    winner.content,
    ...winner.relatedSignals,
  ].join(' ').toLowerCase();

  const { data: entities, error } = await supabase
    .from('tkg_entities')
    .select('name, display_name, primary_email, emails, role, company, total_interactions, patterns')
    .eq('user_id', userId)
    .neq('name', 'self')
    .order('total_interactions', { ascending: false })
    .limit(20);

  if (error || !entities || entities.length === 0) return winner;

  const scored = entities
    .map((entity) => {
      const record = entity as Record<string, unknown>;
      const name = isNonEmptyString(record.display_name)
        ? record.display_name.trim()
        : isNonEmptyString(record.name)
          ? record.name.trim()
          : 'Unknown';
      const email = isNonEmptyString(record.primary_email)
        ? record.primary_email.trim()
        : Array.isArray(record.emails)
          ? (record.emails as unknown[]).find((value): value is string => isNonEmptyString(value))?.trim() ?? null
          : null;
      const company = isNonEmptyString(record.company) ? record.company.trim() : null;
      const relevance =
        (queryText.includes(name.toLowerCase()) ? 3 : 0) +
        (email && queryText.includes(email.toLowerCase()) ? 2 : 0) +
        (company && queryText.includes(company.toLowerCase()) ? 1 : 0);

      return {
        relevance,
        interactions: typeof record.total_interactions === 'number' ? record.total_interactions : 0,
        line: formatEntityLine(record),
      };
    })
    .sort((left, right) => {
      if (right.relevance !== left.relevance) return right.relevance - left.relevance;
      return right.interactions - left.interactions;
    })
    .slice(0, 8)
    .map((entity) => entity.line);

  if (scored.length === 0) return winner;
  return { ...winner, relationshipContext: scored.join('\n') };
}

function formatEntityLine(record: Record<string, unknown>): string {
  const name = isNonEmptyString(record.display_name)
    ? record.display_name.trim()
    : isNonEmptyString(record.name)
      ? record.name.trim()
      : 'Unknown';
  const role = isNonEmptyString(record.role) ? record.role.trim() : null;
  const company = isNonEmptyString(record.company) ? record.company.trim() : null;
  const email = isNonEmptyString(record.primary_email)
    ? record.primary_email.trim()
    : Array.isArray(record.emails)
      ? (record.emails as unknown[]).find((value): value is string => isNonEmptyString(value))?.trim() ?? null
      : null;
  const patterns = record.patterns && typeof record.patterns === 'object'
    ? Object.values(record.patterns as Record<string, unknown>)
      .map((pattern) =>
        pattern && typeof pattern === 'object' && isNonEmptyString((pattern as Record<string, unknown>).description)
          ? ((pattern as Record<string, unknown>).description as string).trim()
          : null)
      .filter((value): value is string => value !== null)
      .slice(0, 2)
      .join('; ')
    : '';
  const descriptor = [
    role,
    company,
    typeof record.total_interactions === 'number' ? `${record.total_interactions} interactions` : null,
  ].filter(Boolean).join(', ');

  return `- ${name}${email ? ` <${email}>` : ''}${descriptor ? ` (${descriptor})` : ''}${patterns ? `: ${patterns}` : ''}`;
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
  if (value === 'email' || value === 'email_compose' || value === 'email_reply') {
    return 'drafted_email';
  }
  if (value === 'calendar' || value === 'event') {
    return 'calendar_event';
  }
  if (value === 'research') {
    return 'research_brief';
  }
  if (value === 'decision') {
    return 'decision_frame';
  }
  if (value === 'wait' || value === 'do_nothing') {
    return 'wait_rationale';
  }
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
        'Artifact JSON must include subject and body. recipient is strongly preferred but optional.',
        'Use a real email address from the dossier or SUGGESTED_RECIPIENT if one is present. Never fabricate an address.',
        'If no real email address is available in the context, set recipient to an empty string. The user will fill it on approval.',
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
        'Action type is research. Do NOT produce a research_brief — that is consulting, not action.',
        'Instead, produce a concrete deliverable:',
        '- If research leads to contacting someone, artifact_type must be drafted_email with the outreach message.',
        '- If research is internal, artifact_type must be document with the findings and recommended next step.',
        'The directive sentence must name what was found and what to do with it.',
      ].join('\n');
    case 'make_decision':
      return [
        'Action type is make_decision. Do NOT produce a decision_frame — that is consulting, not action.',
        'Instead, produce a concrete deliverable:',
        '- If the decision involves another person, artifact_type must be drafted_email with the actual follow-up message.',
        '- If the decision is internal (no person to contact), artifact_type must be document with a one-page brief that states the decision and next steps.',
        'The directive sentence must name the specific decision being made, not ask the user to decide.',
      ].join('\n');
    case 'do_nothing':
    default:
      return [
        'Action type is do_nothing. Do NOT produce a wait_rationale — that is consulting, not action.',
        'Instead, produce a concrete deliverable:',
        '- artifact_type must be document with a brief that explains why no action is needed and names the specific tripwire that would change that.',
        '- Or if there is a person to notify about the wait, artifact_type must be drafted_email.',
        'The directive sentence must name what is being deliberately deferred and why.',
      ].join('\n');
  }
}

function formatRecentAction(row: RecentActionRow): string {
  return `[${row.generated_at.slice(0, 10)}] [${row.action_type ?? 'unknown'}] ${row.directive_text ?? ''}`;
}

function expectedArtifactSchema(actionType: ActionType): string {
  switch (actionType) {
    case 'send_message':
      return `{
  "recipient": "person@example.com or empty string if no real address is available",
  "subject": "Specific subject line",
  "body": "Complete email body with greeting and sign-off"
}`;
    case 'write_document':
      return `{
  "title": "Document title",
  "content": "Complete document in markdown"
}`;
    case 'schedule':
      return `{
  "title": "Meeting title",
  "start": "2026-03-18T15:00:00-07:00",
  "end": "2026-03-18T15:30:00-07:00",
  "description": "Calendar description with details"
}`;
    case 'research':
      return `If research leads to contacting someone, use drafted_email:
{
  "recipient": "person@example.com or empty string",
  "subject": "Subject about the research finding",
  "body": "Complete email communicating the finding or requesting info"
}
If research is internal, use document:
{
  "title": "Research: [topic]",
  "content": "Findings in markdown with recommended next step"
}`;
    case 'make_decision':
      return `If the decision involves another person, use drafted_email:
{
  "recipient": "person@example.com or empty string",
  "subject": "Specific subject about the decision",
  "body": "Complete email that communicates the decision or requests info"
}
If the decision is internal (no person to contact), use document:
{
  "title": "Decision: [specific decision name]",
  "content": "One-page brief stating the decision, reasoning, and next steps"
}`;
    case 'do_nothing':
    default:
      return `If there is a person to notify, use drafted_email:
{
  "recipient": "person@example.com or empty string",
  "subject": "Subject about the deferral",
  "body": "Complete email explaining the wait and what triggers action"
}
Otherwise, use document:
{
  "title": "Hold: [what is being deferred]",
  "content": "Brief explaining why no action is needed now and the specific tripwire that would change that"
}`;
  }
}

/**
 * Translate non-concrete action types into deliverable-oriented labels.
 * This prevents the LLM from seeing "make_decision" and defaulting to decision_frame.
 */
function translateToDeliverableAction(actionType: ActionType, winner: ScoredLoop): string {
  switch (actionType) {
    case 'make_decision': {
      // If there's a person in the context, steer to send_message
      const hasRecipient = extractBestRecipientEmail(winner.relationshipContext);
      return hasRecipient
        ? 'send_message (decision involves a person — draft the email)'
        : 'write_document (internal decision — write a one-page brief)';
    }
    case 'research':
      return 'write_document (research findings — write the findings document)';
    case 'do_nothing':
      return 'write_document (deliberate hold — write a brief explaining why)';
    default:
      return actionType;
  }
}

function extractBestRecipientEmail(relationshipContext: string | undefined): string | null {
  if (!relationshipContext) return null;
  const emailPattern = /<([^@\s>]+@[^@\s>]+\.[^@\s>]+)>/g;
  let match: RegExpExecArray | null;
  const candidates: string[] = [];
  while ((match = emailPattern.exec(relationshipContext)) !== null) {
    candidates.push(match[1]);
  }
  return candidates.length > 0 ? candidates[0] : null;
}

function buildGenerationPrompt(context: PromptContext): string {
  const { winner, deprioritized, approvedRecently, skippedRecently } = context;
  const pinnedConstraints = getPinnedConstraintPrompt(context.userId);
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

  // Translate non-concrete action types into deliverable-oriented labels
  // so the LLM doesn't default to decision_frame / wait_rationale / research_brief
  const deliverableAction = translateToDeliverableAction(winner.suggestedActionType, winner);

  const sections = [
    `TODAY: ${today()}`,
    `WINNING_LOOP_TITLE:\n${winner.title}`,
    `WINNING_LOOP_TYPE:\n${winner.type}`,
    `WINNING_ACTION_TYPE:\n${deliverableAction}`,
    `PINNED_CONSTRAINTS:\n${pinnedConstraints ?? '- None'}`,
    `GOAL_ALIGNMENT:\n${matchedGoal}`,
    `SCORE_BREAKDOWN:\n${scoreBreakdown}`,
    `PRIMARY_EVIDENCE:\n${winner.content}`,
    `RELATED_SIGNALS:\n${relatedSignals}`,
    `RELATIONSHIP_CONTEXT:\n${winner.relationshipContext ?? 'None'}`,
  ];

  if (winner.suggestedActionType === 'send_message') {
    const bestEmail = extractBestRecipientEmail(winner.relationshipContext);
    sections.push(
      `SUGGESTED_RECIPIENT:\n${bestEmail ?? 'No email found in dossier. Use the most relevant contact email from RELATIONSHIP_CONTEXT, or leave recipient empty if none is available.'}`,
    );
  }

  // Inject researcher insight when available — this becomes the primary context
  if (context.insight) {
    const insightSections = [
      `RESEARCHER_INSIGHT:\n${context.insight.synthesis}`,
    ];
    if (context.insight.window) {
      insightSections.push(`INSIGHT_WINDOW:\n${context.insight.window}`);
    }
    if (context.insight.external_context) {
      insightSections.push(`EXTERNAL_CONTEXT:\n${context.insight.external_context}`);
    }
    insightSections.push(
      `ARTIFACT_GUIDANCE:\n${context.insight.artifact_instructions}`,
      'INSTRUCTION: Draft the artifact that delivers this insight and captures its value before the window closes. The insight is the primary context — build the artifact around it, not around the raw commitment description.',
    );
    sections.push(...insightSections);
  }

  sections.push(
    `RUNNER_UPS_REJECTED:\n${runnerUps}`,
    `RECENTLY_APPROVED:\n${approvedLines}`,
    `RECENTLY_SKIPPED:\n${skippedLines}`,
    `ARTIFACT_RULES:\n${expectedArtifactRules(winner.suggestedActionType)}`,
    `ARTIFACT_JSON_SCHEMA:\n${expectedArtifactSchema(winner.suggestedActionType)}`,
  );

  return sections.join('\n\n');
}

function normalizeArtifactPayload(
  parsed: Record<string, unknown>,
  artifactType: GeneratorArtifactType,
): Record<string, unknown> {
  const artifact = parsed.artifact && typeof parsed.artifact === 'object'
    ? { ...(parsed.artifact as Record<string, unknown>) }
    : {};

  const knownFields = [
    'recipient',
    'to',
    'subject',
    'body',
    'title',
    'content',
    'start',
    'end',
    'description',
    'findings',
    'sources',
    'recommended_action',
    'options',
    'recommendation',
    'context',
    'evidence',
    'tripwires',
    'check_date',
    'draft_type',
  ];

  for (const field of knownFields) {
    if (artifact[field] === undefined && parsed[field] !== undefined) {
      artifact[field] = parsed[field];
    }
  }

  if (artifactType === 'drafted_email') {
    if (artifact.recipient === undefined && artifact.to !== undefined) {
      artifact.recipient = artifact.to;
    }
    if (artifact.to === undefined && artifact.recipient !== undefined) {
      artifact.to = artifact.recipient;
    }
  }

  return artifact;
}

function parseGeneratedPayload(raw: string): GeneratedDirectivePayload | null {
  const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;
  const nestedArtifact = parsed.artifact && typeof parsed.artifact === 'object'
    ? (parsed.artifact as Record<string, unknown>)
    : null;
  const artifactType = normalizeArtifactType(
    parsed.artifact_type ?? parsed.type ?? nestedArtifact?.type,
  );
  if (!artifactType) return null;

  return {
    directive: typeof parsed.directive === 'string' ? parsed.directive : '',
    artifact_type: artifactType,
    artifact: normalizeArtifactPayload(parsed, artifactType),
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
      const rawRecipient = artifact.recipient ?? artifact.to;
      const recipientPresent = isNonEmptyString(rawRecipient);
      if (recipientPresent) {
        const recipient = (rawRecipient as string).trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)) {
          issues.push('drafted_email recipient must be a real email address');
        }
        if (containsPlaceholderText(recipient)) {
          issues.push('drafted_email recipient contains placeholder text');
        }
      }
      // recipient is optional — the user can fill it on approval
      const subject = validateStringField(artifact.subject, 'drafted_email subject', issues, { allowShort: true });
      validateStringField(artifact.body, 'drafted_email body', issues);
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
      const recommendation = validateStringField(artifact.recommendation, 'decision_frame recommendation', issues);
      if (recommendation && isDecisionMenu(recommendation)) {
        issues.push('decision_frame recommendation must name the recommendation, not reopen the choice');
      }
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
  if (directive && countSentences(directive) !== 1) {
    issues.push('directive must be exactly one sentence');
  }
  if (directive && isDecisionMenu(directive)) {
    issues.push('directive must make one concrete move instead of reopening the choice');
  }
  if (directive && !hasMeaningfulOverlap(directive, promptContext.winner)) {
    issues.push('directive is not specific to the winning evidence');
  }

  // Concrete deliverable gate: reject decision memos, wait rationales, and research briefs.
  if (!CONCRETE_ARTIFACT_TYPES.has(payload.artifact_type)) {
    issues.push(`artifact type "${payload.artifact_type}" is not a concrete deliverable — must be drafted_email, document, or calendar_event`);
  }

  // Stale reference gate: reject if the newest source signal is older than 14 days.
  const signalDates = (promptContext.winner.sourceSignals ?? [])
    .map((s) => s.occurredAt)
    .filter((d): d is string => Boolean(d))
    .map((d) => new Date(d).getTime())
    .filter((t) => !Number.isNaN(t));
  const newestSignalMs = signalDates.length > 0 ? Math.max(...signalDates) : 0;
  const newestSignalAgeDays = newestSignalMs > 0
    ? (Date.now() - newestSignalMs) / (1000 * 60 * 60 * 24)
    : STALE_SIGNAL_THRESHOLD_DAYS + 1;
  if (newestSignalAgeDays > STALE_SIGNAL_THRESHOLD_DAYS) {
    issues.push(`directive references items older than ${STALE_SIGNAL_THRESHOLD_DAYS} days with no recent signal reinforcement`);
  }

  // For action types that we've redirected to concrete deliverables,
  // accept any concrete artifact type instead of the legacy mapping.
  const redirectedActionTypes: ActionType[] = ['make_decision', 'research', 'do_nothing'];
  if (redirectedActionTypes.includes(promptContext.winner.suggestedActionType)) {
    if (!CONCRETE_ARTIFACT_TYPES.has(payload.artifact_type)) {
      issues.push(`artifact type "${payload.artifact_type}" is not a concrete deliverable — must be drafted_email, document, or calendar_event`);
    }
  } else {
    const expectedArtifactType = actionTypeToArtifactType(promptContext.winner.suggestedActionType);
    if (payload.artifact_type !== expectedArtifactType) {
      issues.push(`artifact_type must be ${expectedArtifactType}`);
    }
  }

  // Validate artifact payload using the LLM's chosen artifact type (not the original action type)
  const validationActionType = artifactTypeToActionType(payload.artifact_type);
  validateArtifactPayload(validationActionType, payload.artifact, issues);

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

  const constraintViolations = getDirectiveConstraintViolations({
    userId: promptContext.userId,
    directive: payload.directive,
    reason: payload.why_now,
    evidence: [{ description: payload.evidence }],
    artifact: payload.artifact,
    actionType: artifactTypeToActionType(payload.artifact_type),
  });
  for (const violation of constraintViolations) {
    issues.push(violation.message);
  }

  return issues;
}

export function validateDirectiveForPersistence(input: {
  userId: string;
  directive: ConvictionDirective;
  artifact: ConvictionArtifact | Record<string, unknown> | null;
}): string[] {
  const issues: string[] = [];

  if (input.directive.directive === GENERATION_FAILED_SENTINEL) {
    issues.push('directive generation failed');
  }
  if (input.directive.confidence < DIRECTIVE_CONFIDENCE_THRESHOLD) {
    issues.push('directive confidence is below the send threshold');
  }
  if (!input.artifact || typeof input.artifact !== 'object') {
    issues.push('artifact is required before persistence');
  }
  // Concrete deliverable gate — backup check at persistence time
  const embeddedType = (input.directive as any).embeddedArtifactType;
  if (embeddedType && !CONCRETE_ARTIFACT_TYPES.has(embeddedType)) {
    issues.push(`artifact type "${embeddedType}" is not a concrete deliverable`);
  }
  // Consulting language gate — backup check at persistence time
  if (BANNED_DIRECTIVE_PATTERNS.some((p) => p.test(input.directive.directive))) {
    issues.push('directive uses consulting language');
  }
  if (countSentences(input.directive.directive) !== 1) {
    issues.push('directive must remain exactly one sentence');
  }
  if (isDecisionMenu(input.directive.directive)) {
    issues.push('directive reopens a decision instead of naming the move');
  }

  const constraintViolations = getDirectiveConstraintViolations({
    userId: input.userId,
    directive: input.directive.directive,
    reason: input.directive.reason,
    evidence: input.directive.evidence,
    artifact: input.artifact,
    actionType: input.directive.action_type,
  });
  for (const violation of constraintViolations) {
    issues.push(violation.message);
  }

  return [...new Set(issues)];
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
      .select('directive_text, action_type, generated_at, skip_reason, execution_result')
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
    skippedRecently: ((skippedRes.data ?? []) as Array<RecentSkippedActionRow & {
      execution_result?: unknown;
    }>).filter((row) => !isInternalNoSendExecutionResult(row.execution_result)),
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
): Promise<GeneratePayloadResult> {
  const initialPrompt = buildGenerationPrompt(promptContext);
  const attempts: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: initialPrompt },
  ];
  let lastIssues: string[] = [];

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

    const raw = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
    let parsed: GeneratedDirectivePayload | null = null;
    try {
      parsed = parseGeneratedPayload(raw);
    } catch {
      parsed = null;
    }

    const issues = validateGeneratedPayload(parsed, promptContext);
    lastIssues = issues;
    if (issues.length === 0 && parsed) {
      return {
        issues: [],
        payload: parsed,
      };
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
        content: `Validation failed. CRITICAL: artifact_type MUST be "drafted_email" or "document" or "calendar_event". Do NOT use decision_frame, research_brief, or wait_rationale.
Fix these issues and return JSON only.
Keep the artifact nested under "artifact" and match this schema exactly:
${expectedArtifactSchema(promptContext.winner.suggestedActionType)}

Issues:
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

  return {
    issues: lastIssues,
    payload: null,
  };
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
      return emptyDirective(
        'Daily spend cap reached.',
        buildNoSendGenerationLog('Daily spend cap reached.', 'system', null),
      );
    }

    const [scored, guardrails] = await Promise.all([
      scoreOpenLoops(userId),
      loadRecentActionGuardrails(userId),
    ]);

    if (!scored?.winner) {
      return emptyDirective(
        'No ranked daily brief candidate.',
        buildNoSendGenerationLog('No ranked daily brief candidate.', 'scoring', null),
      );
    }

    const hydratedWinner = await hydrateWinnerRelationshipContext(userId, scored.winner);

    // Research phase: deepen the winner into an insight before writing
    let insight: ResearchInsight | null = null;
    try {
      insight = await researchWinner(userId, hydratedWinner);
    } catch {
      // Researcher failure is non-blocking — fall through to raw mode
      logStructuredEvent({
        event: 'researcher_fallthrough',
        level: 'warn',
        userId,
        artifactType: null,
        generationStatus: 'researcher_fallthrough',
        details: { scope: 'generator' },
      });
    }

    const promptContext: PromptContext = {
      userId,
      insight,
      winner: hydratedWinner,
      deprioritized: scored.deprioritized,
      ...guardrails,
    };

    const payloadResult = await generatePayload(userId, promptContext);
    if (!payloadResult.payload) {
      const failureReason = formatValidationFailureReason(
        'Generation validation failed:',
        payloadResult.issues,
      );
      return emptyDirective(
        failureReason,
        buildNoSendGenerationLog(failureReason, 'generation', scored.candidateDiscovery),
      );
    }
    const payload = payloadResult.payload;

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
      return emptyDirective(
        'No directive cleared the confidence bar.',
        buildNoSendGenerationLog('No directive cleared the confidence bar.', 'validation', scored.candidateDiscovery),
      );
    }

    const directive = {
      directive: payload.directive.trim(),
      action_type: artifactTypeToActionType(payload.artifact_type),
      confidence,
      reason: payload.why_now.trim(),
      evidence: buildEvidenceItems(scored, payload),
      fullContext: buildFullContext({ ...scored, winner: hydratedWinner }, payload),
      embeddedArtifact: payload.artifact,
      embeddedArtifactType: payload.artifact_type,
      requires_search: payload.requires_search === true || artifactTypeToActionType(payload.artifact_type) === 'research',
      search_context: isNonEmptyString(payload.search_context)
        ? payload.search_context.trim()
        : scored.winner.content.slice(0, 500),
      generationLog: buildSelectedGenerationLog(scored.candidateDiscovery),
    } as ConvictionDirective & {
      embeddedArtifact?: Record<string, unknown>;
      embeddedArtifactType?: GeneratorArtifactType;
    };

    const persistenceIssues = validateDirectiveForPersistence({
      userId,
      directive,
      artifact: payload.artifact,
    });
    if (persistenceIssues.length > 0) {
      logStructuredEvent({
        event: 'generation_skipped',
        level: 'warn',
        userId,
        artifactType: payload.artifact_type,
        generationStatus: 'persistence_validation_failed',
        details: {
          scope: 'generator',
          issues: persistenceIssues,
        },
      });
      return emptyDirective(
        formatValidationFailureReason(
          'Directive rejected by persistence validation:',
          persistenceIssues,
        ),
        buildNoSendGenerationLog(
          formatValidationFailureReason(
            'Directive rejected by persistence validation:',
            persistenceIssues,
          ),
          'validation',
          scored.candidateDiscovery,
        ),
      );
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

    return directive;
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
    return emptyDirective(
      'Generation failed internally.',
      buildNoSendGenerationLog('Generation failed internally.', 'system', null),
    );
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
