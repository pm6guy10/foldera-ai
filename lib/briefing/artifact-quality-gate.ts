import type { ConvictionArtifact, ConvictionDirective } from './types';
import { isLikelyAutomatedTransactionalInbound } from './automated-inbound-signal';
import { evaluateGoldStandardArtifact } from './gold-standard-artifact-evaluator';

export type ArtifactQualityCategory =
  | 'DRAFT_EMAIL'
  | 'ROLE_FIT_PACKET'
  | 'ROLE_FIT_LINE'
  | 'DECISION_BRIEF'
  | 'RISK_ALERT'
  | 'SUPPRESSION_DECISION';

export type CommandCenterArtifactClass =
  | 'INTERVIEW_ROLE_FIT_PACKET'
  | 'FOLLOW_UP_EMAIL_DRAFT'
  | 'DEADLINE_RISK_DECISION_BRIEF'
  | 'BENEFITS_PAYMENT_ADMIN_ACTION_PACKET'
  | 'CALENDAR_CONFLICT_RESOLUTION_BRIEF';

export type ArtifactQualityBlockReason =
  | 'action_type_mismatch'
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
  | 'transactional_sender_decision_pressure'
  | 'relationship_silence_artifact'
  | 'outside_command_center_scope'
  | 'unclassified_artifact';

export interface ArtifactQualityGateInput {
  directive: Pick<ConvictionDirective, 'action_type' | 'directive' | 'reason' | 'evidence'>;
  artifact: ConvictionArtifact;
  now?: Date;
  sourceFacts?: string[];
  strictActionTypeMatch?: boolean;
}

export interface ArtifactQualityGateResult {
  passes: boolean;
  category: ArtifactQualityCategory | null;
  commandCenterClass: CommandCenterArtifactClass | null;
  reasons: ArtifactQualityBlockReason[];
  safeArtifactMessage: string | null;
}

export interface CommandCenterCandidateGateInput {
  recommendedAction: string;
  suggestedActionType?: string | null;
  hasRealRecipient?: boolean;
  candidateText: string;
  sourceFacts?: string[];
  discrepancyClass?: string | null;
}

export interface CommandCenterCandidateGateResult {
  passes: boolean;
  commandCenterClass: CommandCenterArtifactClass | null;
  reasons: ArtifactQualityBlockReason[];
}

export type ArtifactQualityFailSafeStatus = 'GREEN' | 'YELLOW' | 'RED';

export interface ArtifactQualityRunSummary {
  rejected: number;
  allowed: number;
  delivered: number;
}

export const NO_SAFE_ARTIFACT_TODAY = 'No safe artifact today.';

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

const TRANSACTIONAL_SYSTEM_SENDER_PATTERN =
  /\b(?:onboarding|no-?reply|noreply|notification|notifications|support|security|billing|system|admin|updates?|alerts?)@[a-z0-9.-]+\.[a-z]{2,}\b/i;
const WEAK_SILENCE_PATTERN =
  /\b(?:silent|silence|no\s+(?:reply|response)|zero replies|unreplied|has not (?:replied|responded))\b[\s\S]{0,80}\b(?:\d+\s+days?|days?|weeks?)\b|\b\d+\s+days?\b[\s\S]{0,80}\b(?:silent|silence|no\s+(?:reply|response)|unreplied)\b/i;
const INVENTED_PROFESSIONAL_PRESSURE_PATTERN =
  /\b(?:employer|vendor|relationship|professional risk|reputational risk|accepting another job|external decision|interview decisions?|moved on|must be addressed|decision map|before [^.]{0,80}(?:final|locked)|closure)\b/i;

const RELATIONSHIP_SILENCE_ARTIFACT_PATTERN =
  /\brelationship\b[\s\S]{0,160}\b(?:silent|silence|no\s+(?:reply|response)|zero replies|has not (?:replied|responded)|unreplied|moved on|closure)\b|\b(?:silent|silence|no\s+(?:reply|response)|zero replies|has not (?:replied|responded)|unreplied|moved on|closure)\b[\s\S]{0,160}\brelationship\b/i;

const INTERVIEW_JOB_PATTERN =
  /\b(interview|role-fit|role fit|job|posting|recruitment|recruiter|reference|resume|hiring|benefits technician|providerone|hca|esd|dshs|chc|comprehensive healthcare)\b/i;

const BENEFITS_PAYMENT_ADMIN_PATTERN =
  /\b(benefits?\s+(?:office|payment|deadline|verification|coverage|claim|premium|processing)|payment|invoice|receipt|admin|administrative|verification|eligibility|coverage|claim|premium|account|office|submit|form)\b/i;

const CALENDAR_CONFLICT_PATTERN =
  /\b(calendar|schedule)\b[\s\S]{0,160}\b(conflict|overlap|double-book|move|reschedule)\b|\b(conflict|overlap|double-book|move|reschedule)\b[\s\S]{0,160}\b(calendar|schedule)\b/i;

const DEADLINE_RISK_PATTERN =
  /\b(deadline|risk|blocked|blocking|exposure|failure|miss|stale|cutoff|window|before|by \d{1,2}|today|tomorrow|this week)\b/i;

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

function hasTransactionalSenderDecisionPressure(text: string, evidence: string): boolean {
  const combined = [text, evidence].join('\n');
  return (
    TRANSACTIONAL_SYSTEM_SENDER_PATTERN.test(combined) &&
    WEAK_SILENCE_PATTERN.test(combined) &&
    INVENTED_PROFESSIONAL_PRESSURE_PATTERN.test(text)
  );
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
    (DRAFT_EMAIL_ANCHOR_PATTERN.test(text) || OUTCOME_PATTERN.test(text)) &&
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

function classifyCommandCenterArtifact(
  category: ArtifactQualityCategory | null,
  text: string,
): CommandCenterArtifactClass | null {
  if (!category || category === 'SUPPRESSION_DECISION') return null;
  if (RELATIONSHIP_SILENCE_ARTIFACT_PATTERN.test(text)) return null;
  if ((category === 'ROLE_FIT_PACKET' || category === 'ROLE_FIT_LINE') && INTERVIEW_JOB_PATTERN.test(text)) {
    return 'INTERVIEW_ROLE_FIT_PACKET';
  }
  if (category === 'DRAFT_EMAIL') return 'FOLLOW_UP_EMAIL_DRAFT';
  if (CALENDAR_CONFLICT_PATTERN.test(text)) return 'CALENDAR_CONFLICT_RESOLUTION_BRIEF';
  if (BENEFITS_PAYMENT_ADMIN_PATTERN.test(text)) return 'BENEFITS_PAYMENT_ADMIN_ACTION_PACKET';
  if ((category === 'DECISION_BRIEF' || category === 'RISK_ALERT') && DEADLINE_RISK_PATTERN.test(text)) {
    return 'DEADLINE_RISK_DECISION_BRIEF';
  }
  return null;
}

function classifyCandidateCommandCenterClass(text: string): CommandCenterArtifactClass | null {
  if (RELATIONSHIP_SILENCE_ARTIFACT_PATTERN.test(text)) return null;
  if (INTERVIEW_JOB_PATTERN.test(text)) return 'INTERVIEW_ROLE_FIT_PACKET';
  if (CALENDAR_CONFLICT_PATTERN.test(text)) return 'CALENDAR_CONFLICT_RESOLUTION_BRIEF';
  if (BENEFITS_PAYMENT_ADMIN_PATTERN.test(text)) return 'BENEFITS_PAYMENT_ADMIN_ACTION_PACKET';
  if (DEADLINE_RISK_PATTERN.test(text) && (DECISION_PATTERN.test(text) || NEXT_ACTION_PATTERN.test(text) || /\b(decision|action|packet|brief)\b/i.test(text))) {
    return 'DEADLINE_RISK_DECISION_BRIEF';
  }
  return null;
}

export function evaluateCommandCenterCandidateGate(
  input: CommandCenterCandidateGateInput,
): CommandCenterCandidateGateResult {
  const combined = [
    input.candidateText,
    ...(input.sourceFacts ?? []),
    input.discrepancyClass ? `discrepancy_class:${input.discrepancyClass}` : '',
  ].filter(Boolean).join('\n');
  const reasons: ArtifactQualityBlockReason[] = [];
  const recommendedAction = input.recommendedAction;
  const suggestedAction = input.suggestedActionType ?? recommendedAction;
  const hasRealRecipient = input.hasRealRecipient === true;
  const commandCenterClass = classifyCandidateCommandCenterClass(combined);
  const automatedTransactional =
    isLikelyAutomatedTransactionalInbound(combined) ||
    TRANSACTIONAL_SYSTEM_SENDER_PATTERN.test(combined);

  if (automatedTransactional && (WEAK_SILENCE_PATTERN.test(combined) || INVENTED_PROFESSIONAL_PRESSURE_PATTERN.test(combined))) {
    reasons.push('transactional_sender_decision_pressure');
  }
  if (RELATIONSHIP_SILENCE_ARTIFACT_PATTERN.test(combined)) {
    reasons.push('relationship_silence_artifact');
  }
  if (
    suggestedAction === 'send_message' &&
    !hasRealRecipient &&
    recommendedAction !== 'send_message' &&
    !commandCenterClass
  ) {
    reasons.push('action_type_mismatch');
  }
  if (recommendedAction === 'write_document' && !commandCenterClass) {
    reasons.push('outside_command_center_scope');
    reasons.push('unclassified_artifact');
  }
  if (recommendedAction === 'send_message' && !hasRealRecipient) {
    reasons.push('action_type_mismatch');
  }
  if (!commandCenterClass && !reasons.includes('outside_command_center_scope')) {
    reasons.push('outside_command_center_scope');
  }

  const uniqueReasons = [...new Set(reasons)];
  return {
    passes: uniqueReasons.length === 0,
    commandCenterClass,
    reasons: uniqueReasons,
  };
}

export function classifyArtifactCategory(
  directive: Pick<ConvictionDirective, 'action_type'>,
  artifact: ConvictionArtifact,
  text = artifactText(artifact),
): ArtifactQualityCategory | null {
  if (directive.action_type === 'do_nothing' && classifySuppressionDecision(text)) return 'SUPPRESSION_DECISION';
  if (directive.action_type === 'send_message' && classifyDraftEmail(artifact, text)) return 'DRAFT_EMAIL';
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
  const commandCenterClass = classifyCommandCenterArtifact(category, combined);
  const suppressionDecision = category === 'SUPPRESSION_DECISION';
  const draftEmailOnNonEmailAction =
    input.strictActionTypeMatch === true &&
    input.directive.action_type !== 'send_message' &&
    classifyDraftEmail(input.artifact, text);

  if (draftEmailOnNonEmailAction) reasons.push('action_type_mismatch');
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
  if (input.directive.action_type === 'write_document' && !suppressionDecision) {
    const gold = evaluateGoldStandardArtifact({
      artifactText: [text, evidence].filter(Boolean).join('\n'),
      situation: [input.directive.directive, input.directive.reason].filter(Boolean).join('\n'),
      sourceFacts: input.sourceFacts?.length ? input.sourceFacts : [evidence].filter(Boolean),
    });
    if (!gold.passes) {
      if (
        gold.missing.includes('identifies_hidden_leverage_point') ||
        gold.missing.includes('produces_usable_finished_work')
      ) {
        reasons.push('no_concrete_outcome');
      }
      if (
        gold.genericFailureReasons.includes('homework_language') ||
        gold.genericFailureReasons.includes('checklist_instead_of_finished_asset')
      ) {
        reasons.push('prepare_instead_of_finished_work');
      }
      if (
        gold.genericFailureReasons.includes('generic_advice') ||
        gold.genericFailureReasons.includes('generic_chatbot_quality')
      ) {
        reasons.push('generic_coaching');
      }
    }
  }
  if (!suppressionDecision && hasTransactionalSenderDecisionPressure(combined, evidence)) {
    reasons.push('transactional_sender_decision_pressure');
  }
  if (RELATIONSHIP_SILENCE_ARTIFACT_PATTERN.test(combined)) reasons.push('relationship_silence_artifact');
  if (!commandCenterClass) reasons.push('outside_command_center_scope');

  if (!category) reasons.push('unclassified_artifact');

  const uniqueReasons = [...new Set(reasons)];
  const passes = uniqueReasons.length === 0 && commandCenterClass !== null;
  return {
    passes,
    category,
    commandCenterClass,
    reasons: uniqueReasons,
    safeArtifactMessage: passes ? null : NO_SAFE_ARTIFACT_TODAY,
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
