import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/db/client';
import type { ActionType, ChiefOfStaffBriefing, ConvictionDirective, EvidenceItem } from './types';
import { isOverDailyLimit, trackApiCall } from '@/lib/utils/api-tracker';
import { logStructuredEvent } from '@/lib/utils/structured-logger';
import { decryptWithStatus } from '@/lib/encryption';

const GENERATION_FAILED_SENTINEL = '__GENERATION_FAILED__';
const RETRIEVAL_MODEL = 'claude-haiku-4-5-20251001';
const GENERATION_MODEL = 'claude-sonnet-4-20250514';
const APPROVAL_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const SIGNAL_LOOKBACK_MS = 48 * 60 * 60 * 1000;

const SYSTEM_PROMPT = `You are the user's chief of staff. You have their
goals, behavioral patterns, commitments, approval
history, skip history, and current signals.

Find the ONE thing they should do today that they
haven't thought of yet. Not summarize. Not remind.
Find.

Rules:
- Never repeat a directive approved in last 7 days.
- Never regenerate a skipped directive unless new
  evidence arrived since the skip.
- Never produce a directive the user obviously knows.
- Every directive ships with a finished artifact.
  Three types only:
  1. drafted_email: { recipient, subject, body }
  2. decision_frame: { option_a, option_b,
     tradeoff_a, tradeoff_b }
  3. wait_rationale: { reason, trigger_condition,
     check_date }
- If artifact is empty or malformed, directive
  does not persist.
- Confidence stays internal. Never surface scores.
- When best move is wait, emit wait_rationale with
  a specific trigger condition. Not patience. A
  tripwire.
- When one domain is quiet, surface a different
  domain. Never go dark.
- Test before emitting: would a $200/hr EA be
  embarrassed? If yes, go deeper.

Output strict JSON:
{
  "directive": "imperative sentence",
  "artifact_type": "drafted_email | decision_frame | wait_rationale",
  "artifact": {},
  "evidence": "one sentence citing specific data",
  "domain": "career | family | financial | health | project",
  "why_now": "one sentence"
}`;

type GeneratorArtifactType = 'drafted_email' | 'decision_frame' | 'wait_rationale';
type GeneratorDomain = 'career' | 'family' | 'financial' | 'health' | 'project';

interface GeneratedDirectivePayload {
  directive: string;
  artifact_type: GeneratorArtifactType;
  artifact: Record<string, unknown>;
  evidence: string;
  domain: GeneratorDomain;
  why_now: string;
}

interface ApprovedActionRow {
  directive_text: string | null;
  action_type: string | null;
  generated_at: string;
}

interface SkippedActionRow extends ApprovedActionRow {
  skip_reason: string | null;
}

interface GoalRow {
  goal_text: string;
  goal_category: string;
  priority: number;
}

interface PatternRow {
  name: string;
  description: string;
  domain: string;
  detectionCount: number;
}

interface FreshSignalRow {
  id: string;
  source: string | null;
  occurred_at: string;
  content: string;
}

interface ContextBundle {
  alreadyDone: ApprovedActionRow[];
  skippedRecently: SkippedActionRow[];
  activeGoals: GoalRow[];
  confirmedPatterns: PatternRow[];
  freshSignals: FreshSignalRow[];
}

interface ContextSections {
  ALREADY_DONE: string[];
  SKIPPED_RECENTLY: string[];
  ACTIVE_GOALS: string[];
  CONFIRMED_PATTERNS: string[];
  FRESH_SIGNALS: string[];
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

function isSelfReferentialSignal(content: string): boolean {
  return content.startsWith('[Foldera Directive') || content.startsWith('[Foldera ·');
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

function normalizeArtifactType(value: unknown): GeneratorArtifactType | null {
  if (value === 'drafted_email' || value === 'decision_frame' || value === 'wait_rationale') {
    return value;
  }
  return null;
}

function artifactTypeToActionType(artifactType: GeneratorArtifactType): ActionType {
  switch (artifactType) {
    case 'drafted_email':
      return 'send_message';
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
    case 'make_decision':
      return 'decision_frame';
    case 'do_nothing':
    default:
      return 'wait_rationale';
  }
}

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

function extractConfirmedPatterns(patternsValue: unknown): PatternRow[] {
  if (!patternsValue || typeof patternsValue !== 'object' || Array.isArray(patternsValue)) {
    return [];
  }

  return Object.values(patternsValue as Record<string, unknown>)
    .map((pattern): PatternRow | null => {
      if (!pattern || typeof pattern !== 'object') return null;
      const record = pattern as Record<string, unknown>;
      const detectionCount = Number(record.detection_count ?? record.activation_count ?? 0);
      if (Number.isNaN(detectionCount) || detectionCount < 3) return null;

      return {
        name: typeof record.name === 'string' ? record.name : 'Unnamed pattern',
        description: typeof record.description === 'string' ? record.description : 'No description',
        domain: typeof record.domain === 'string' ? record.domain : 'project',
        detectionCount,
      };
    })
    .filter((pattern): pattern is PatternRow => pattern !== null)
    .sort((left, right) => right.detectionCount - left.detectionCount);
}

function deterministicSections(context: ContextBundle): ContextSections {
  return {
    ALREADY_DONE: context.alreadyDone.map((row) => `[${formatDate(row.generated_at)}] [${row.action_type ?? 'unknown'}] ${row.directive_text ?? ''}`),
    SKIPPED_RECENTLY: context.skippedRecently.map((row) => {
      const suffix = row.skip_reason ? ` (skip reason: ${row.skip_reason})` : '';
      return `[${formatDate(row.generated_at)}] ${row.directive_text ?? ''}${suffix}`;
    }),
    ACTIVE_GOALS: context.activeGoals.map((row) => `[${row.goal_category}] priority ${row.priority}/5: ${row.goal_text}`),
    CONFIRMED_PATTERNS: context.confirmedPatterns.map((row) => `[${row.domain}] ${row.name} (${row.detectionCount}x): ${row.description}`),
    FRESH_SIGNALS: context.freshSignals.map((row) => `[${formatDate(row.occurred_at)}] (${row.source ?? 'unknown'}) ${row.content.slice(0, 260)}`),
  };
}

async function assembleContextSections(userId: string, context: ContextBundle): Promise<ContextSections> {
  const fallback = deterministicSections(context);
  const response = await getAnthropic().messages.create({
    model: RETRIEVAL_MODEL,
    max_tokens: 1200,
    temperature: 0,
    system: `You assemble retrieval context for a chief-of-staff generator.
Return strict JSON with keys ALREADY_DONE, SKIPPED_RECENTLY, ACTIVE_GOALS,
CONFIRMED_PATTERNS, and FRESH_SIGNALS. Each value must be an array of short
factual strings. Preserve dates, names, and concrete evidence. Do not invent.
Do not include scores.`,
    messages: [
      {
        role: 'user',
        content: JSON.stringify(
          {
            ALREADY_DONE: context.alreadyDone,
            SKIPPED_RECENTLY: context.skippedRecently,
            ACTIVE_GOALS: context.activeGoals,
            CONFIRMED_PATTERNS: context.confirmedPatterns,
            FRESH_SIGNALS: context.freshSignals,
          },
          null,
          2,
        ),
      },
    ],
  });

  await trackApiCall({
    userId,
    model: RETRIEVAL_MODEL,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    callType: 'directive_context',
  });

  const raw = response.content[0]?.type === 'text' ? response.content[0].text : '';
  const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
  const parsed = JSON.parse(cleaned) as Partial<Record<keyof ContextSections, unknown>>;

  return {
    ALREADY_DONE: Array.isArray(parsed.ALREADY_DONE) ? parsed.ALREADY_DONE.filter(isNonEmptyString).map((item) => item.trim()) : fallback.ALREADY_DONE,
    SKIPPED_RECENTLY: Array.isArray(parsed.SKIPPED_RECENTLY) ? parsed.SKIPPED_RECENTLY.filter(isNonEmptyString).map((item) => item.trim()) : fallback.SKIPPED_RECENTLY,
    ACTIVE_GOALS: Array.isArray(parsed.ACTIVE_GOALS) ? parsed.ACTIVE_GOALS.filter(isNonEmptyString).map((item) => item.trim()) : fallback.ACTIVE_GOALS,
    CONFIRMED_PATTERNS: Array.isArray(parsed.CONFIRMED_PATTERNS) ? parsed.CONFIRMED_PATTERNS.filter(isNonEmptyString).map((item) => item.trim()) : fallback.CONFIRMED_PATTERNS,
    FRESH_SIGNALS: Array.isArray(parsed.FRESH_SIGNALS) ? parsed.FRESH_SIGNALS.filter(isNonEmptyString).map((item) => item.trim()) : fallback.FRESH_SIGNALS,
  };
}

function buildGenerationPrompt(sections: ContextSections): string {
  const section = (label: keyof ContextSections) => {
    const items = sections[label];
    if (items.length === 0) return `${label}:\n- None`;
    return `${label}:\n${items.map((item) => `- ${item}`).join('\n')}`;
  };

  return [
    `TODAY: ${today()}`,
    section('ALREADY_DONE'),
    section('SKIPPED_RECENTLY'),
    section('ACTIVE_GOALS'),
    section('CONFIRMED_PATTERNS'),
    section('FRESH_SIGNALS'),
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
    domain: (parsed.domain === 'career' || parsed.domain === 'family' || parsed.domain === 'financial' || parsed.domain === 'health' || parsed.domain === 'project')
      ? parsed.domain
      : 'project',
    why_now: typeof parsed.why_now === 'string' ? parsed.why_now : '',
  };
}

function validateGeneratedPayload(
  payload: GeneratedDirectivePayload | null,
  context: ContextBundle,
): string[] {
  if (!payload) {
    return ['Response was not valid JSON in the required schema.'];
  }

  const issues: string[] = [];
  if (!isNonEmptyString(payload.directive)) {
    issues.push('directive is required');
  }
  if (!isNonEmptyString(payload.evidence)) {
    issues.push('evidence is required');
  }
  if (!isNonEmptyString(payload.why_now)) {
    issues.push('why_now is required');
  }

  switch (payload.artifact_type) {
    case 'drafted_email':
      if (!isNonEmptyString(payload.artifact.recipient)) issues.push('drafted_email requires recipient');
      if (!isNonEmptyString(payload.artifact.subject)) issues.push('drafted_email requires subject');
      if (!isNonEmptyString(payload.artifact.body)) issues.push('drafted_email requires body');
      break;
    case 'decision_frame':
      if (!isNonEmptyString(payload.artifact.option_a)) issues.push('decision_frame requires option_a');
      if (!isNonEmptyString(payload.artifact.option_b)) issues.push('decision_frame requires option_b');
      break;
    case 'wait_rationale':
      if (!isNonEmptyString(payload.artifact.trigger_condition)) issues.push('wait_rationale requires trigger_condition');
      break;
  }

  const duplicateApproved = context.alreadyDone.some((row) => {
    if (!row.directive_text) return false;
    return similarityScore(payload.directive, row.directive_text) >= 0.72;
  });
  if (duplicateApproved) {
    issues.push('directive repeats something already done in the last 7 days');
  }

  const duplicateSkippedWithoutEvidence = context.skippedRecently.some((row) => {
    if (!row.directive_text) return false;
    if (similarityScore(payload.directive, row.directive_text) < 0.72) return false;
    return !context.freshSignals.some((signal) => signal.occurred_at > row.generated_at);
  });
  if (duplicateSkippedWithoutEvidence) {
    issues.push('directive repeats a recently skipped item without new evidence');
  }

  return issues;
}

async function computeInternalConfidence(
  userId: string,
  actionType: ActionType,
  domain: GeneratorDomain,
  context: ContextBundle,
): Promise<number> {
  const supabase = createServerClient();
  const patternHash = `${actionType}:${domain}`;
  let historyConfidence: number | null = null;

  try {
    const { data, error } = await supabase
      .from('tkg_pattern_metrics')
      .select('total_activations, successful_outcomes, failed_outcomes')
      .eq('user_id', userId)
      .eq('pattern_hash', patternHash)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      const successes = data.successful_outcomes ?? 0;
      const failures = data.failed_outcomes ?? 0;
      historyConfidence = Math.round(((successes + 1) / (successes + failures + 2)) * 100);

      const { error: upsertError } = await supabase.from('tkg_pattern_metrics').upsert(
        {
          user_id: userId,
          pattern_hash: patternHash,
          category: actionType,
          domain,
          total_activations: (data.total_activations ?? 0) + 1,
          successful_outcomes: successes,
          failed_outcomes: failures,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,pattern_hash' },
      );

      if (upsertError) throw upsertError;
    } else {
      const { error: upsertError } = await supabase.from('tkg_pattern_metrics').upsert(
        {
          user_id: userId,
          pattern_hash: patternHash,
          category: actionType,
          domain,
          total_activations: 1,
          successful_outcomes: 0,
          failed_outcomes: 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,pattern_hash' },
      );

      if (upsertError) throw upsertError;
    }
  } catch (error) {
    logStructuredEvent({
      event: 'pattern_metric_update_failed',
      level: 'warn',
      userId,
      artifactType: actionTypeToArtifactType(actionType),
      generationStatus: 'pattern_metrics_unavailable',
      details: {
        scope: 'generator',
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }

  const contextualConfidence = Math.min(
    95,
    72 +
      Math.min(context.activeGoals.length, 3) * 3 +
      Math.min(context.confirmedPatterns.length, 3) * 2 +
      Math.min(context.freshSignals.length, 4) * 2 +
      (context.alreadyDone.length > 0 ? 2 : 0) +
      (context.skippedRecently.length > 0 ? 2 : 0),
  );

  if (historyConfidence === null) {
    return contextualConfidence;
  }

  return Math.max(70, Math.min(95, Math.round((historyConfidence * 0.35) + (contextualConfidence * 0.65))));
}

async function loadContext(userId: string): Promise<ContextBundle> {
  const supabase = createServerClient();
  const approvedSince = new Date(Date.now() - APPROVAL_LOOKBACK_MS).toISOString();
  const signalsSince = new Date(Date.now() - SIGNAL_LOOKBACK_MS).toISOString();

  const [approvedRes, skippedRes, goalsRes, patternsRes, freshSignalsRes] = await Promise.all([
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
    supabase
      .from('tkg_goals')
      .select('goal_text, goal_category, priority')
      .eq('user_id', userId)
      .order('priority', { ascending: false })
      .limit(20),
    supabase
      .from('tkg_entities')
      .select('patterns')
      .eq('user_id', userId)
      .eq('name', 'self')
      .maybeSingle(),
    supabase
      .from('tkg_signals')
      .select('id, source, occurred_at, content')
      .eq('user_id', userId)
      .gte('occurred_at', signalsSince)
      .order('occurred_at', { ascending: false })
      .limit(25),
  ]);

  if (approvedRes.error) throw approvedRes.error;
  if (skippedRes.error) throw skippedRes.error;
  if (goalsRes.error) throw goalsRes.error;
  if (patternsRes.error) throw patternsRes.error;
  if (freshSignalsRes.error) throw freshSignalsRes.error;

  const freshSignals: FreshSignalRow[] = [];
  let skippedDecryptRows = 0;

  for (const signal of freshSignalsRes.data ?? []) {
    const decrypted = decryptWithStatus(signal.content ?? '');
    if (decrypted.usedFallback) {
      skippedDecryptRows++;
      continue;
    }

    const content = decrypted.plaintext.trim();
    if (!content || isSelfReferentialSignal(content)) continue;

    freshSignals.push({
      id: signal.id as string,
      source: (signal.source as string | null) ?? null,
      occurred_at: signal.occurred_at as string,
      content: content.slice(0, 1200),
    });
  }

  if (skippedDecryptRows > 0) {
    logStructuredEvent({
      event: 'signal_skip',
      level: 'warn',
      userId,
      artifactType: null,
      generationStatus: 'decrypt_skip',
      details: {
        scope: 'generator',
        skipped_rows: skippedDecryptRows,
      },
    });
  }

  return {
    alreadyDone: (approvedRes.data ?? []) as ApprovedActionRow[],
    skippedRecently: (skippedRes.data ?? []) as SkippedActionRow[],
    activeGoals: (goalsRes.data ?? []) as GoalRow[],
    confirmedPatterns: extractConfirmedPatterns(patternsRes.data?.patterns),
    freshSignals,
  };
}

async function generatePayload(
  userId: string,
  sections: ContextSections,
  context: ContextBundle,
): Promise<GeneratedDirectivePayload | null> {
  const initialPrompt = buildGenerationPrompt(sections);
  const attempts: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: initialPrompt },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await getAnthropic().messages.create({
      model: GENERATION_MODEL,
      max_tokens: 2000,
      temperature: 0.2,
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

    const issues = validateGeneratedPayload(parsed, context);
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

    const context = await loadContext(userId);

    let sections: ContextSections;
    try {
      sections = await assembleContextSections(userId, context);
    } catch (error) {
      sections = deterministicSections(context);
      logStructuredEvent({
        event: 'context_assembly_fallback',
        level: 'warn',
        userId,
        artifactType: null,
        generationStatus: 'context_fallback',
        details: {
          scope: 'generator',
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }

    const payload = await generatePayload(userId, sections, context);
    if (!payload) {
      return emptyDirective('Generation validation failed.');
    }

    const actionType = artifactTypeToActionType(payload.artifact_type);
    const confidence = await computeInternalConfidence(userId, actionType, payload.domain, context);
    const evidence: EvidenceItem[] = [
      {
        type: 'signal',
        description: payload.evidence.trim(),
        date: context.freshSignals[0]?.occurred_at ?? undefined,
      },
    ];

    logStructuredEvent({
      event: 'directive_generated',
      userId,
      artifactType: payload.artifact_type,
      generationStatus: 'generated',
      details: {
        scope: 'generator',
        context_counts: {
          already_done: context.alreadyDone.length,
          skipped_recently: context.skippedRecently.length,
          active_goals: context.activeGoals.length,
          confirmed_patterns: context.confirmedPatterns.length,
          fresh_signals: context.freshSignals.length,
        },
      },
    });

    return {
      directive: payload.directive.trim(),
      action_type: actionType,
      confidence,
      reason: payload.why_now.trim(),
      evidence,
      fullContext: payload.evidence.trim(),
      embeddedArtifact: payload.artifact,
      embeddedArtifactType: payload.artifact_type,
      domain: payload.domain,
      why_now: payload.why_now.trim(),
      requires_search: false,
      search_context: undefined,
    } as ConvictionDirective & {
      embeddedArtifact?: Record<string, unknown>;
      embeddedArtifactType?: GeneratorArtifactType;
      domain?: GeneratorDomain;
      why_now?: string;
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
