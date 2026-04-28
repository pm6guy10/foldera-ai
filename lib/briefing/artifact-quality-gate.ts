import type { ConvictionArtifact, ConvictionDirective } from './types';

export type ArtifactQualityCategory =
  | 'DRAFT_EMAIL'
  | 'ROLE_FIT_PACKET'
  | 'ROLE_FIT_LINE'
  | 'DECISION_BRIEF'
  | 'RISK_ALERT'
  | 'SUPPRESSION_DECISION';

export type ArtifactQualityBlockReason =
  | 'internal_debug_token'
  | 'placeholder_content'
  | 'no_source_grounding'
  | 'reminder_only'
  | 'summary_only'
  | 'generic_coaching'
  | 'prepare_instead_of_finished_work'
  | 'only_follow_up_check_in_or_monitor'
  | 'stale_event'
  | 'no_concrete_outcome'
  | 'fabricated_claim'
  | 'unclassified_artifact';

export interface ArtifactQualityGateInput {
  directive: Pick<ConvictionDirective, 'action_type' | 'directive' | 'reason' | 'evidence'>;
  artifact: ConvictionArtifact;
  now?: Date;
  sourceFacts?: string[];
}

export interface ArtifactQualityGateResult {
  passes: boolean;
  category: ArtifactQualityCategory | null;
  reasons: ArtifactQualityBlockReason[];
}

export type ArtifactQualityFailSafeStatus = 'GREEN' | 'YELLOW' | 'RED';

export interface ArtifactQualityRunSummary {
  rejected: number;
  allowed: number;
  delivered: number;
}

const INTERNAL_DEBUG_PATTERN =
  /\b(request_id|provider_error|llm_failed|invalid_request_error|stale_date_in_directive|candidate blocked|all candidates blocked|stack trace|traceback|api usage limits)\b|req_[A-Za-z0-9]+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const PLACEHOLDER_PATTERN =
  /\[(?:NAME|DATE|COMPANY|ROLE|RECIPIENT|INSERT[^\]]*|SPECIFIC DETAIL)\]|\b(?:TBD|TODO|insert specific detail)\b/i;

const SOURCE_PATTERN =
  /\b(source|source email|evidence|thread|calendar|resume|job posting|job description|signal|from:|subject:|platform|providerone|hca|esd|dshs|chc|don)\b/i;

const FINISHED_LANGUAGE_PATTERN =
  /\b(subject:|body:|send this|use this|first-person answer:|decision:|next action:|remedy:|exact message:|draft:|to:)\b/i;

const GENERIC_COACHING_PATTERN =
  /\b(star framework|use star|dress code|business casual|what to wear|review (?:the )?(?:website|job description|company)|prepare examples|prep checklist|questions to ask|interview questions to ask|generic coaching|research advice)\b/i;

const PREP_INSTEAD_PATTERN =
  /\b(prepare|review|consider|think about|reflect on|practice|research)\b/i;

const REMINDER_ONLY_PATTERN =
  /\b(interview|meeting|phone screen|event)\s+(?:is\s+)?(?:tomorrow|today|coming up)\b[\s\S]{0,120}\b(prepare accordingly|prepare|review)\b/i;

const SUMMARY_ONLY_PATTERN =
  /\b(summary|summarize|recap|overview)\b/i;

const ONLY_MONITOR_PATTERN =
  /\b(monitor (?:the )?inbox|watch (?:the )?inbox|check in with|follow up with|touch base with)\b/i;

const GENERIC_NO_SEND_PATTERN = /\bnothing cleared the bar today\b/i;

const OUTCOME_PATTERN =
  /\b(confirm|send|decide|choose|reply|schedule|resolve|approve|decline|ask|request|escalate|submit|use this|next action|remedy|deadline|trigger|by \d{1,2}(?::\d{2})?\s*(?:am|pm)?|today|tomorrow|this week|before|after)\b/i;

const DRAFT_EMAIL_ANCHOR_PATTERN =
  /\b(to:|subject:|thread|platform|calendar|email|interview|reference|schedule|conflict|don|darlene|alex|providerone|hca|esd|chc|comprehensive healthcare)\b/i;

const SIGN_OFF_PATTERN = /\b(thanks|thank you|best|regards|sincerely),?\s*\n?\s*[A-Z][a-z]+/i;

const ROLE_GROUNDING_PATTERN =
  /\b(role|job|posting|recruitment|benefits technician|providerone|hca|esd|dshs|resume|source)\b/i;

const FIRST_PERSON_PATTERN = /\bI (?:am|have|can|would|bring|built|led|handled|used|supported|worked|solve|keep|make|translate|treat)\b/i;

const DECISION_PATTERN = /\bdecision:\s*|(?:^|\n)\s*decision\b|\bdecide\b/i;
const CRITERION_PATTERN = /\bcriterion|criteria|because|deciding factor|tradeoff|constraint\b/i;
const NEXT_ACTION_PATTERN = /\bnext action|do this|send|reply|choose|commit|decline|approve\b/i;
const DEADLINE_PATTERN = /\b(deadline|trigger|today|tomorrow|by \d{1,2}|before|after|now|this matters now|window)\b/i;

const RISK_PATTERN = /\b(risk|blocked|blocking|exposure|failure|miss|stale|conflict)\b/i;
const REMEDY_PATTERN = /\b(remedy|fix|send|reply|confirm|escalate|resolve|ask|move|choose)\b/i;

const SUPPRESSION_PATTERN =
  /\b(skip|suppress|suppression|do not send|no send|nothing cleared|not worth interrupting|trust-preserving)\b/i;

const USER_CLAIM_PATTERNS = [
  /\bI (?:worked|work) (?:at|for|with) ([A-Z][A-Za-z0-9&/ -]{2,40})/g,
  /\bI (?:used|use|built|led|managed|handled|supported) ([A-Z][A-Za-z0-9&/ -]{2,40})/g,
  /\b(?:certified|certification|license|licensed) (?:in|for)?\s*([A-Z][A-Za-z0-9&/ -]{2,40})/g,
  /\b(\d+\+?\s+years?)[^.\n]{0,80}\b(?:experience|managed|led|worked|used)\b/gi,
];

function artifactText(artifact: ConvictionArtifact): string {
  const record = artifact as unknown as Record<string, unknown>;
  return [
    typeof record.to === 'string' ? `To: ${record.to}` : '',
    typeof record.subject === 'string' ? `Subject: ${record.subject}` : '',
    typeof record.body === 'string' ? record.body : '',
    typeof record.title === 'string' ? record.title : '',
    typeof record.content === 'string' ? record.content : '',
    typeof record.context === 'string' ? record.context : '',
    typeof record.evidence === 'string' ? record.evidence : '',
    Array.isArray(record.tripwires) ? record.tripwires.join('\n') : '',
  ].filter(Boolean).join('\n');
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function sentenceCount(text: string): number {
  return text.split(/[.!?]+/).filter((part) => part.trim().split(/\s+/).length >= 5).length;
}

function evidenceText(input: ArtifactQualityGateInput): string {
  return [
    input.directive.directive,
    input.directive.reason,
    ...(input.directive.evidence ?? []).map((item) => item.description),
    ...(input.sourceFacts ?? []),
  ].filter(Boolean).join('\n');
}

function hasSourceGrounding(text: string, evidence: string): boolean {
  if (SOURCE_PATTERN.test(text)) return true;
  const evidenceTokens = normalize(evidence)
    .split(/\s+/)
    .filter((token) => token.length >= 5 && !['today', 'tomorrow', 'source', 'email'].includes(token));
  if (evidenceTokens.length === 0) return false;
  const normalizedText = normalize(text);
  return evidenceTokens.some((token) => normalizedText.includes(token));
}

function onlyLowValueAction(text: string): boolean {
  if (!ONLY_MONITOR_PATTERN.test(text)) return false;
  return !FINISHED_LANGUAGE_PATTERN.test(text) && !OUTCOME_PATTERN.test(text.replace(ONLY_MONITOR_PATTERN, ''));
}

function isSummaryOnly(text: string): boolean {
  return SUMMARY_ONLY_PATTERN.test(text) && !FINISHED_LANGUAGE_PATTERN.test(text) && !OUTCOME_PATTERN.test(text);
}

function staleEventPrep(text: string, now: Date): boolean {
  if (!/\b(interview|phone screen|meeting|prep|prepare)\b/i.test(text)) return false;
  const match = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (!match) return false;
  const eventDate = new Date(`${match[1]}-${match[2]}-${match[3]}T23:59:59.999Z`);
  return eventDate.getTime() < now.getTime() && /\b(prep|prepare|review|interview is tomorrow)\b/i.test(text);
}

function hasFabricatedUserClaim(text: string, evidence: string): boolean {
  const normalizedEvidence = normalize(evidence);
  if (!normalizedEvidence) return false;

  for (const pattern of USER_CLAIM_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const claim = normalize(match[1] ?? '');
      if (!claim || claim.length < 4) continue;
      const claimTokens = claim.split(/\s+/).filter((token) => token.length >= 3);
      if (claimTokens.length === 0) continue;
      const grounded = claimTokens.every((token) => normalizedEvidence.includes(token));
      if (!grounded) return true;
    }
  }

  return false;
}

function classifyDraftEmail(artifact: ConvictionArtifact, text: string): boolean {
  const record = artifact as unknown as Record<string, unknown>;
  const to = typeof record.to === 'string' ? record.to : '';
  const subject = typeof record.subject === 'string' ? record.subject : '';
  const body = typeof record.body === 'string' ? record.body : text;
  const hasRecipient = to.includes('@') || /\b(to|recipient):\s*\S+/i.test(text);
  const hasSubject = subject.trim().length > 0 || /\bsubject:\s*\S+/i.test(text);
  return (
    hasRecipient &&
    hasSubject &&
    DRAFT_EMAIL_ANCHOR_PATTERN.test(text) &&
    body.trim().length >= 80 &&
    SIGN_OFF_PATTERN.test(body)
  );
}

function classifyRoleFitPacket(text: string): boolean {
  return (
    ROLE_GROUNDING_PATTERN.test(text) &&
    FIRST_PERSON_PATTERN.test(text) &&
    sentenceCount(text) >= 3 &&
    !GENERIC_COACHING_PATTERN.test(text)
  );
}

function classifyRoleFitLine(text: string): boolean {
  return (
    /\b(quotable line)\b/i.test(text) &&
    /\b(use when|when to use)\b/i.test(text) &&
    /"[^"]{20,}"/.test(text) &&
    FIRST_PERSON_PATTERN.test(text) &&
    hasSourceGrounding(text, text)
  );
}

function classifyDecisionBrief(text: string): boolean {
  const explicitDecision =
    DECISION_PATTERN.test(text) && CRITERION_PATTERN.test(text) && NEXT_ACTION_PATTERN.test(text) && DEADLINE_PATTERN.test(text);
  const executionDecision =
    /\bexecution move\b/i.test(text) &&
    /\bwhy this beats the alternatives\b/i.test(text) &&
    /\b(reopen trigger|deadline)\b/i.test(text);
  return explicitDecision || executionDecision;
}

function classifyRiskAlert(text: string): boolean {
  return SOURCE_PATTERN.test(text) && RISK_PATTERN.test(text) && DEADLINE_PATTERN.test(text) && REMEDY_PATTERN.test(text);
}

function classifySuppressionDecision(text: string): boolean {
  return SUPPRESSION_PATTERN.test(text) && text.length <= 700;
}

export function classifyArtifactCategory(
  directive: Pick<ConvictionDirective, 'action_type'>,
  artifact: ConvictionArtifact,
  text = artifactText(artifact),
): ArtifactQualityCategory | null {
  if (directive.action_type === 'do_nothing' && classifySuppressionDecision(text)) return 'SUPPRESSION_DECISION';
  if (classifyDraftEmail(artifact, text)) return 'DRAFT_EMAIL';
  if (classifyRoleFitLine(text)) return 'ROLE_FIT_LINE';
  if (classifyRoleFitPacket(text)) return 'ROLE_FIT_PACKET';
  if (classifyDecisionBrief(text)) return 'DECISION_BRIEF';
  if (classifyRiskAlert(text)) return 'RISK_ALERT';
  return null;
}

export function evaluateArtifactQualityGate(
  input: ArtifactQualityGateInput,
): ArtifactQualityGateResult {
  const text = artifactText(input.artifact);
  const combined = [input.directive.directive, input.directive.reason, text].filter(Boolean).join('\n');
  const evidence = evidenceText(input);
  const reasons: ArtifactQualityBlockReason[] = [];
  const category = classifyArtifactCategory(input.directive, input.artifact, text);
  const suppressionDecision = category === 'SUPPRESSION_DECISION';

  if (INTERNAL_DEBUG_PATTERN.test(combined)) reasons.push('internal_debug_token');
  if (PLACEHOLDER_PATTERN.test(combined)) reasons.push('placeholder_content');
  if (!hasSourceGrounding(combined, evidence)) reasons.push('no_source_grounding');
  if (!suppressionDecision && REMINDER_ONLY_PATTERN.test(combined)) reasons.push('reminder_only');
  if (!suppressionDecision && isSummaryOnly(combined)) reasons.push('summary_only');
  if (!suppressionDecision && GENERIC_COACHING_PATTERN.test(combined)) reasons.push('generic_coaching');
  if (!suppressionDecision && !category && PREP_INSTEAD_PATTERN.test(combined) && !FINISHED_LANGUAGE_PATTERN.test(combined)) {
    reasons.push('prepare_instead_of_finished_work');
  }
  if (!suppressionDecision && onlyLowValueAction(combined)) reasons.push('only_follow_up_check_in_or_monitor');
  if (!suppressionDecision && staleEventPrep(combined, input.now ?? new Date())) reasons.push('stale_event');
  if (!suppressionDecision && (GENERIC_NO_SEND_PATTERN.test(combined) || (!OUTCOME_PATTERN.test(combined) && !FINISHED_LANGUAGE_PATTERN.test(combined)))) {
    reasons.push('no_concrete_outcome');
  }
  if (hasFabricatedUserClaim(combined, evidence)) reasons.push('fabricated_claim');

  if (!category) reasons.push('unclassified_artifact');

  const uniqueReasons = [...new Set(reasons)];
  return {
    passes: uniqueReasons.length === 0,
    category,
    reasons: uniqueReasons,
  };
}

export function summarizeArtifactQualityRun(results: ArtifactQualityGateResult[]): ArtifactQualityRunSummary {
  const rejected = results.filter((result) => !result.passes).length;
  const allowed = results.length - rejected;
  return { rejected, allowed, delivered: allowed };
}

export function evaluateArtifactQualityFailSafe(input: {
  current: ArtifactQualityRunSummary;
  previous?: ArtifactQualityRunSummary | null;
  deliveredLast24h: number;
}): {
  status: ArtifactQualityFailSafeStatus;
  rejectRate: number;
  reason: string | null;
} {
  const total = input.current.rejected + input.current.allowed;
  const rejectRate = total === 0 ? 0 : input.current.rejected / total;
  const previousTotal = (input.previous?.rejected ?? 0) + (input.previous?.allowed ?? 0);
  const previousRejectRate = previousTotal === 0 ? 0 : (input.previous?.rejected ?? 0) / previousTotal;

  if (total > 0 && rejectRate === 1 && input.deliveredLast24h === 0) {
    return { status: 'RED', rejectRate, reason: 'all_artifacts_rejected_and_zero_delivered_24h' };
  }

  if (total > 0 && previousTotal > 0 && rejectRate > 0.85 && previousRejectRate > 0.85) {
    return { status: 'YELLOW', rejectRate, reason: 'reject_rate_above_85pct_two_runs' };
  }

  return { status: 'GREEN', rejectRate, reason: null };
}
