import type { ConvictionArtifact, ConvictionDirective, GenerationCandidateSource } from './types';

export type DiscrepancyCardFrame = {
  claim: string;
  contradiction: string;
  risk: string;
  evidence: string[];
  next_action: string;
  why_now: string;
  source_refs: string[];
  confidence: number;
  pattern_keys: string[];
  rejection_reason?: string;
};

export type DiscrepancyQualityBlockReason =
  | 'missing_claim'
  | 'missing_contradiction'
  | 'weak_contradiction'
  | 'missing_risk'
  | 'weak_risk'
  | 'missing_evidence'
  | 'missing_next_action'
  | 'weak_next_action'
  | 'generic_helper_language'
  | 'missing_source_refs'
  | 'reminder_without_risk'
  | 'summary_without_action'
  | 'speculative_relationship_risk'
  | 'stale_duplicate_pattern'
  | 'noisy_pattern_memory';

export type DiscrepancyCardQualityResult = {
  passes: boolean;
  quality_score: number;
  blocked_by: DiscrepancyQualityBlockReason[];
  pattern_keys: string[];
  rejection_reason: string | null;
};

export type DiscrepancyPatternMemory = {
  boostedPatternKeys: string[];
  penalizedPatternKeys: string[];
  blockedPatternKeys: string[];
  weights: Record<string, number>;
};

type ActionHistoryRow = {
  status?: unknown;
  skip_reason?: unknown;
  action_type?: unknown;
  directive_text?: unknown;
  execution_result?: unknown;
};

const CONTRADICTION_RE =
  /\b(?:but|however|despite|without|missing|mismatch|conflict|contradict|changed|stale|blank|gap|blocked|not reflected|still has no|still lacks|no named|no matching|while)\b/i;
const RISK_RE =
  /\b(?:risk|miss|deadline|blocked|delay|fail|failure|late|slip|window|cost|loss|opportunity|submission|decision|conflict|stale|wrong|expires?|closes?|before|may)\b/i;
const GENERIC_HELPER_RE =
  /^\s*(?:follow\s+up|check\s+in|review|check|consider|touch\s+base|circle\s+back|monitor|look\s+into)\b/i;
const SUMMARY_RE = /^\s*(?:summari[sz]e|recap|provide\s+a\s+summary)\b/i;
const REMINDER_RE = /\b(?:remind|reminder|remember to)\b/i;
const RELATIONSHIP_RISK_RE = /\brelationship\b.*\b(?:risk|silence|decay|drop)\b/i;
const SPECIFIC_ACTION_RE =
  /\b(?:assign|ask|send|update|confirm|confirming|decide|schedule|block|request|draft|finish|complete|submit|notify|move|prepare|attach|upload|resolve|choose|write|create|route|escalate|approve|reject|use|save)\b/i;
const TITLE_LIKE_ACTION_RE =
  /^\s*(?:commitment\s+due|deadline\s+closing|goal\s+drift|inbound\s+email\s+unanswered|high-value\s+relationship|committed\s+to|calendar\s+conflict)\b/i;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return fallback;
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function comparableText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim();
      const record = asRecord(entry);
      return (
        asString(record?.description) ??
        asString(record?.summary) ??
        asString(record?.text) ??
        asString(record?.content) ??
        null
      );
    })
    .filter((entry): entry is string => Boolean(entry));
}

function firstSentence(value: string | null | undefined): string | null {
  const trimmed = asString(value);
  if (!trimmed) return null;
  const sentence = trimmed.split(/(?<=[.!?])\s+/)[0]?.trim();
  return sentence || trimmed;
}

function firstSentenceMatching(value: string | null | undefined, pattern: RegExp): string | null {
  const trimmed = asString(value);
  if (!trimmed) return null;
  const parts = trimmed
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.find((part) => pattern.test(part)) ?? null;
}

function normalizeConfidence(value: unknown): number {
  const numeric = asNumber(value, 0.7);
  if (numeric > 1) return Math.max(0, Math.min(1, numeric / 100));
  return Math.max(0, Math.min(1, numeric));
}

function normalizeFrame(value: unknown): DiscrepancyCardFrame | null {
  const record = asRecord(value);
  if (!record) return null;
  return {
    claim: asString(record.claim) ?? '',
    contradiction: asString(record.contradiction) ?? '',
    risk: asString(record.risk) ?? '',
    evidence: stringArray(record.evidence),
    next_action: asString(record.next_action) ?? asString(record.nextAction) ?? '',
    why_now: asString(record.why_now) ?? asString(record.whyNow) ?? '',
    source_refs: stringArray(record.source_refs ?? record.sourceRefs),
    confidence: normalizeConfidence(record.confidence),
    pattern_keys: uniq(stringArray(record.pattern_keys ?? record.patternKeys)),
    ...(asString(record.rejection_reason ?? record.rejectionReason)
      ? { rejection_reason: asString(record.rejection_reason ?? record.rejectionReason) ?? undefined }
      : {}),
  };
}

function getNestedRecord(record: Record<string, unknown>, keys: string[]): Record<string, unknown> | null {
  for (const key of keys) {
    const nested = asRecord(record[key]);
    if (nested) return nested;
  }
  return null;
}

function extractSourceFactsFromCandidateSources(sources: GenerationCandidateSource[]): string[] {
  return sources
    .map((source) =>
      [source.source, source.summary, source.occurredAt]
        .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
        .join(': '),
    )
    .filter((entry) => entry.trim().length > 0);
}

function sourceRefsFromCandidateSources(sources: GenerationCandidateSource[]): string[] {
  return sources
    .map((source, index) =>
      [source.source ?? source.kind, source.id ?? `source-${index + 1}`]
        .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
        .join(':'),
    )
    .filter((entry) => entry.trim().length > 0);
}

function artifactText(artifact: ConvictionArtifact | Record<string, unknown> | null | undefined): string {
  const record = asRecord(artifact);
  if (!record) return '';
  return [
    asString(record.title),
    asString(record.subject),
    asString(record.body),
    asString(record.content),
    asString(record.text),
    asString(record.context),
    asString(record.recommended_action),
    asString(record.recommendation),
  ]
    .filter((entry): entry is string => Boolean(entry))
    .join('\n');
}

function deriveFramePatternKeys(input: {
  actionType?: unknown;
  discrepancyClass?: unknown;
  candidateType?: unknown;
  text?: string;
}): string[] {
  const keys: string[] = [];
  const actionType = asString(input.actionType);
  const discrepancyClass = asString(input.discrepancyClass);
  const candidateType = asString(input.candidateType);
  if (discrepancyClass) keys.push(`discrepancy:${discrepancyClass}`);
  if (candidateType) keys.push(`candidate:${candidateType}`);
  if (actionType) keys.push(`action:${actionType}`);
  const text = input.text ?? '';
  if (/^\s*(?:follow\s+up|check\s+in|touch\s+base|circle\s+back)\b/i.test(text)) {
    keys.push('generic:follow_up');
  }
  if (/^\s*(?:review|check|consider)\b/i.test(text)) {
    keys.push('generic:review_check');
  }
  if (RELATIONSHIP_RISK_RE.test(text)) {
    keys.push('risk:relationship_silence');
  }
  return uniq(keys);
}

export function deriveDiscrepancyPatternKeys(input: {
  actionType?: unknown;
  discrepancyClass?: unknown;
  candidateType?: unknown;
  title?: unknown;
  content?: unknown;
}): string[] {
  return deriveFramePatternKeys({
    actionType: input.actionType,
    discrepancyClass: input.discrepancyClass,
    candidateType: input.candidateType,
    text: [asString(input.title), asString(input.content)].filter(Boolean).join('\n'),
  });
}

function isOperationalSkipReason(value: string): boolean {
  return /\b(?:auto[-\s]?suppressed|force[-\s]?fresh|already[-\s]?sent|dev\s+brain[-\s]?receipt)\b/i.test(value);
}

export function evaluateDiscrepancyCardFrame(
  frame: DiscrepancyCardFrame | null | undefined,
  options: { patternMemory?: DiscrepancyPatternMemory | null } = {},
): DiscrepancyCardQualityResult {
  const normalized = normalizeFrame(frame);
  const blockedBy: DiscrepancyQualityBlockReason[] = [];
  const patternKeys = normalized?.pattern_keys ?? [];

  if (!normalized) {
    return {
      passes: false,
      quality_score: 0,
      blocked_by: [
        'missing_claim',
        'missing_contradiction',
        'missing_evidence',
        'missing_risk',
        'missing_next_action',
        'missing_source_refs',
      ],
      pattern_keys: [],
      rejection_reason:
        'missing_claim; missing_contradiction; missing_evidence; missing_risk; missing_next_action; missing_source_refs',
    };
  }

  const claim = normalized.claim.trim();
  const contradiction = normalized.contradiction.trim();
  const risk = normalized.risk.trim();
  const nextAction = normalized.next_action.trim();
  const evidence = normalized.evidence.filter((entry) => entry.trim().length >= 8);
  const sourceRefs = normalized.source_refs.filter((entry) => entry.trim().length >= 3);
  const frameText = [claim, contradiction, risk, nextAction, normalized.why_now].join('\n');

  if (!claim) blockedBy.push('missing_claim');
  if (!contradiction) blockedBy.push('missing_contradiction');
  else if (!CONTRADICTION_RE.test(contradiction)) blockedBy.push('weak_contradiction');
  if (evidence.length === 0) blockedBy.push('missing_evidence');
  if (!risk) blockedBy.push('missing_risk');
  else if (!RISK_RE.test(risk)) blockedBy.push('weak_risk');
  if (!nextAction) blockedBy.push('missing_next_action');
  else if (
    comparableText(nextAction) === comparableText(claim) ||
    TITLE_LIKE_ACTION_RE.test(nextAction) ||
    !SPECIFIC_ACTION_RE.test(nextAction)
  ) {
    blockedBy.push('weak_next_action');
  }
  if (sourceRefs.length === 0) blockedBy.push('missing_source_refs');

  const structurallyGrounded =
    contradiction.length > 0 &&
    CONTRADICTION_RE.test(contradiction) &&
    risk.length > 0 &&
    RISK_RE.test(risk) &&
    evidence.length > 0 &&
    sourceRefs.length > 0;

  if ((GENERIC_HELPER_RE.test(claim) || GENERIC_HELPER_RE.test(nextAction)) && !structurallyGrounded) {
    blockedBy.push('generic_helper_language');
  }
  if (REMINDER_RE.test(frameText) && (!risk || !RISK_RE.test(risk))) {
    blockedBy.push('reminder_without_risk');
  }
  if (SUMMARY_RE.test(claim) && !nextAction) {
    blockedBy.push('summary_without_action');
  }
  if (
    (RELATIONSHIP_RISK_RE.test(frameText) || patternKeys.includes('risk:relationship_silence')) &&
    (!structurallyGrounded || sourceRefs.length === 0)
  ) {
    blockedBy.push('speculative_relationship_risk');
  }

  const patternMemory = options.patternMemory;
  if (patternMemory) {
    if (patternKeys.some((key) => patternMemory.blockedPatternKeys.includes(key))) {
      blockedBy.push('noisy_pattern_memory');
    } else if (
      patternKeys.some((key) => patternMemory.penalizedPatternKeys.includes(key)) &&
      (patternKeys.some((key) => key.startsWith('generic:')) || !structurallyGrounded)
    ) {
      blockedBy.push('noisy_pattern_memory');
    }
  }

  const uniqueBlocked = Array.from(new Set(blockedBy));
  let score = 1;
  score -= uniqueBlocked.length * 0.14;
  if (claim.length < 12) score -= 0.08;
  if (contradiction.length < 28) score -= 0.08;
  if (risk.length < 22) score -= 0.08;
  if (nextAction.length < 18) score -= 0.08;
  score += Math.min(0.08, evidence.length * 0.02);
  if (patternMemory && patternKeys.some((key) => patternMemory.boostedPatternKeys.includes(key))) {
    score += 0.05;
  }
  score = Math.max(0, Math.min(1, Number(score.toFixed(2))));

  return {
    passes: uniqueBlocked.length === 0 && score >= 0.62,
    quality_score: score,
    blocked_by: uniqueBlocked,
    pattern_keys: patternKeys,
    rejection_reason: uniqueBlocked.length > 0 ? uniqueBlocked.join('; ') : null,
  };
}

export function buildDiscrepancyFrameFromActionPayload(
  action: Record<string, unknown> | null | undefined,
): DiscrepancyCardFrame | null {
  const record = asRecord(action);
  if (!record) return null;

  const executionResult =
    getNestedRecord(record, ['executionResult', 'execution_result']) ?? record;
  const directFrame =
    normalizeFrame(record.discrepancy_card) ??
    normalizeFrame(executionResult.discrepancy_card);
  if (directFrame) return directFrame;

  const artifact =
    asRecord(record.artifact) ??
    asRecord(executionResult.artifact);
  const evidence = stringArray(record.evidence ?? executionResult.evidence);
  const reason = asString(record.reason) ?? asString(executionResult.reason);
  const claim =
    asString(record.directive) ??
    asString(record.directive_text) ??
    asString(artifact?.title) ??
    asString(artifact?.subject) ??
    '';
  const artifactBody = artifactText(artifact);
  const contradiction =
    asString(executionResult.contradiction) ??
    (reason && CONTRADICTION_RE.test(reason) ? reason : null) ??
    firstSentenceMatching(artifactBody, CONTRADICTION_RE);
  const risk =
    asString(executionResult.risk) ??
    (reason && RISK_RE.test(reason) ? reason : null) ??
    firstSentenceMatching(artifactBody, RISK_RE);
  const nextAction =
    asString(executionResult.next_action) ??
    asString(artifact?.recommended_action) ??
    asString(artifact?.recommendation) ??
    (claim && !GENERIC_HELPER_RE.test(claim) ? claim : null) ??
    '';
  const sourceRefs = stringArray(executionResult.source_refs);

  const frame = normalizeFrame({
    claim,
    contradiction: contradiction ?? '',
    risk: risk ?? '',
    evidence,
    next_action: nextAction,
    why_now: reason ?? '',
    source_refs: sourceRefs,
    confidence: record.confidence,
    pattern_keys: deriveFramePatternKeys({
      actionType: record.action_type,
      discrepancyClass: executionResult.discrepancy_class,
      candidateType: executionResult.candidate_type,
      text: [claim, reason, artifactBody].filter(Boolean).join('\n'),
    }),
  });

  return evaluateDiscrepancyCardFrame(frame).passes ? frame : null;
}

export function buildDiscrepancyFrameFromDirective(
  directive: ConvictionDirective,
  artifact?: ConvictionArtifact | Record<string, unknown> | null,
): DiscrepancyCardFrame | null {
  const selectedCandidate = directive.generationLog?.candidateDiscovery?.topCandidates?.find(
    (candidate) => candidate.decision === 'selected',
  ) ?? directive.generationLog?.candidateDiscovery?.topCandidates?.[0] ?? null;
  const sourceSignals = selectedCandidate?.sourceSignals ?? [];
  const evidence = uniq([
    ...directive.evidence.map((entry) => entry.description),
    ...extractSourceFactsFromCandidateSources(sourceSignals),
  ]);
  const artifactBody = artifactText(artifact);
  const reason = asString(directive.reason) ?? '';
  const selectedText = selectedCandidate
    ? [
        selectedCandidate.candidateType,
        selectedCandidate.discrepancyClass,
        selectedCandidate.decisionReason,
        ...extractSourceFactsFromCandidateSources(sourceSignals),
      ].join('\n')
    : '';
  const contradiction =
    (reason && CONTRADICTION_RE.test(reason) ? reason : null) ??
    firstSentence(evidence.find((entry) => CONTRADICTION_RE.test(entry))) ??
    firstSentenceMatching(artifactBody, CONTRADICTION_RE) ??
    (evidence.length > 0 && directive.directive
      ? `The source evidence says ${evidence[0]}, but the required action is still unresolved: ${directive.directive}`
      : null) ??
    '';
  const risk =
    firstSentence(evidence.find((entry) => RISK_RE.test(entry))) ??
    (reason && RISK_RE.test(reason) ? reason : null) ??
    firstSentenceMatching(artifactBody, RISK_RE) ??
    '';
  const nextAction =
    asString((asRecord(artifact)?.recommended_action)) ??
    asString((asRecord(artifact)?.recommendation)) ??
    firstSentenceMatching(artifactBody, SPECIFIC_ACTION_RE) ??
    (SPECIFIC_ACTION_RE.test(directive.directive) ? directive.directive : null) ??
    firstSentence(artifactBody && !SUMMARY_RE.test(artifactBody) ? artifactBody : null) ??
    directive.directive;
  const sourceRefs = uniq([
    ...directive.evidence.map((entry, index) => `${entry.type}:${index + 1}`),
    ...sourceRefsFromCandidateSources(sourceSignals),
  ]);
  const patternKeys = deriveFramePatternKeys({
    actionType: directive.action_type,
    discrepancyClass:
      directive.discrepancyClass ??
      selectedCandidate?.discrepancyClass ??
      null,
    candidateType: selectedCandidate?.candidateType ?? null,
    text: [directive.directive, reason, artifactBody, selectedText].join('\n'),
  });

  const frame = normalizeFrame({
    claim: directive.directive,
    contradiction,
    risk,
    evidence,
    next_action: nextAction,
    why_now: reason,
    source_refs: sourceRefs,
    confidence: directive.confidence,
    pattern_keys: patternKeys,
  });

  if (!frame) return null;
  const hasAnyFrameMaterial =
    frame.claim.trim() ||
    frame.contradiction.trim() ||
    frame.risk.trim() ||
    frame.evidence.length > 0 ||
    frame.next_action.trim() ||
    frame.source_refs.length > 0;
  return hasAnyFrameMaterial ? frame : null;
}

function extractPatternKeys(row: ActionHistoryRow): string[] {
  const execution = asRecord(row.execution_result);
  const quality = asRecord(execution?.discrepancy_quality);
  const frame = asRecord(execution?.discrepancy_card);
  const keys = [
    ...stringArray(quality?.pattern_keys ?? quality?.patternKeys),
    ...stringArray(frame?.pattern_keys ?? frame?.patternKeys),
    ...deriveFramePatternKeys({
      actionType: row.action_type,
      text: asString(row.directive_text) ?? '',
    }),
  ];
  return uniq(keys);
}

export function deriveDiscrepancyPatternMemory(rows: ActionHistoryRow[]): DiscrepancyPatternMemory {
  const positiveCounts = new Map<string, number>();
  const negativeCounts = new Map<string, number>();
  const blockedCounts = new Map<string, number>();

  for (const row of rows) {
    const keys = extractPatternKeys(row);
    if (keys.length === 0) continue;
    const status = asString(row.status)?.toLowerCase() ?? '';
    const skipReason = asString(row.skip_reason)?.toLowerCase() ?? '';
    const operationalSkip = isOperationalSkipReason(skipReason);
    const execution = asRecord(row.execution_result);
    const quality = asRecord(execution?.discrepancy_quality);
    const rejected =
      (status === 'skipped' && !operationalSkip) ||
      status === 'draft_rejected' ||
      status === 'rejected' ||
      skipReason === 'not_relevant' ||
      skipReason === 'wrong_approach';
    const accepted =
      status === 'approved' ||
      status === 'executed' ||
      status === 'sent';
    const blocked =
      status === 'no_send' ||
      asString(quality?.rejection_reason) != null ||
      Array.isArray(quality?.blocked_by);

    for (const key of keys) {
      if (accepted) positiveCounts.set(key, (positiveCounts.get(key) ?? 0) + 1);
      if (rejected) negativeCounts.set(key, (negativeCounts.get(key) ?? 0) + 1);
      if (blocked) blockedCounts.set(key, (blockedCounts.get(key) ?? 0) + 1);
    }
  }

  const allKeys = uniq([
    ...positiveCounts.keys(),
    ...negativeCounts.keys(),
    ...blockedCounts.keys(),
  ]);
  const weights: Record<string, number> = {};
  for (const key of allKeys) {
    const positive = positiveCounts.get(key) ?? 0;
    const negative = negativeCounts.get(key) ?? 0;
    const blocked = blockedCounts.get(key) ?? 0;
    weights[key] = Number((1 + positive * 0.08 - negative * 0.18 - blocked * 0.28).toFixed(2));
  }

  return {
    boostedPatternKeys: allKeys.filter((key) => (positiveCounts.get(key) ?? 0) > (negativeCounts.get(key) ?? 0)),
    penalizedPatternKeys: allKeys.filter((key) => (negativeCounts.get(key) ?? 0) > 0),
    blockedPatternKeys: allKeys.filter((key) => {
      if (key.startsWith('action:')) return false;
      if (key.startsWith('candidate:')) return false;
      return (
        (blockedCounts.get(key) ?? 0) > 0 ||
        (negativeCounts.get(key) ?? 0) >= 2 ||
        (key.startsWith('generic:') && (negativeCounts.get(key) ?? 0) > 0)
      );
    }),
    weights,
  };
}
