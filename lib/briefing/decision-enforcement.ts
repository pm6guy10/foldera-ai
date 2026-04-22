import type { ConvictionArtifact } from './types';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

const PASSIVE_OR_IGNORABLE_PATTERNS = [
  /\bjust checking in\b/i,
  /\bit(?:'|’)?s been a while\b/i,
  /\bbeen a while\b/i,
  /\bfollow(?:ing)? up\b/i,
  /\btouching base\b/i,
  /\bcircling back\b/i,
  /\bwanted to\b/i,
  /\breaching out\b/i,
  /\bwhen you get a chance\b/i,
  /\bno rush\b/i,
];

const OBVIOUS_FIRST_LAYER_PATTERNS = [
  /\b(?:just\s+)?(?:follow(?:ing)?\s+up|check(?:ing)?\s+in|touch(?:ing)?\s+base|circle\s+back)\b/i,
  /\bstatus\s+update\b/i,
  /\bquick\s+check\b/i,
];

const EXPLICIT_ASK_PATTERNS = [
  /\bcan you\b/i,
  /\bcould (?:we|you)\b/i,
  /\bwould you\b/i,
  /(?:^|[\r\n])\s*ask\s*:/i,
  /\bplease confirm\b/i,
  /\bplease approve\b/i,
  /\bapprove or reject\b/i,
  /\bwhich option\b/i,
  /\breply with\b/i,
  /\bconfirm (?:yes|no)\b/i,
  /\bdecision required\b/i,
  /\bneeds your decision\b/i,
  /\bname the owner\b/i,
  /\bassign (?:an )?owner\b/i,
  /\blet me know\b/i,
  /\bplease let me know\b/i,
  /\bplease advise\b/i,
  /\bwould\s+\w+\s+work\b/i,
  /\bare you available\b/i,
  /\bdo you have\b/i,
  /\bhappy to\b/i,
  /\?$/m,
  /\?/,
  /https?:\/\/[^\s)\]]+/i,
  /\bpay\s+(?:the\s+)?(?:minimum|balance)\b/i,
  /\bpay\s+(?:the\s+)?\$\s*[\d,]+(?:\.\d{2})?\b/i,
  /\bsubmit\s+(?:the\s+)?payment\b/i,
];

const TIME_CONSTRAINT_PATTERNS = [
  /\bby\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i,
  /\bby\s+(?:today|tonight|tomorrow|eod|end of day|friday|monday|tuesday|wednesday|thursday|saturday|sunday)\b/i,
  /\bbefore\s+(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)|today|tomorrow|eod|deadline|cutoff|close)\b/i,
  /\bwithin\s+\d+\s*(?:hour|hours|day|days)\b/i,
  /\bdeadline\b/i,
  /\bcutoff\b/i,
  /\b\d{4}-\d{2}-\d{2}\b/,
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}\b/i,
  /\b(?:this|next)\s+week\b/i,
  /\b(?:last|past)\s+\d+\s+days?\b/i,
  /\bin\s+the\s+last\s+\d+\s+days?\b/i,
  /\b\d+\s+days?\s+(?:ago|without)\b/i,
];

const PRESSURE_OR_CONSEQUENCE_PATTERNS = [
  /\bif we miss\b/i,
  /\botherwise\b/i,
  /\bor we\b/i,
  /\bblocks?\b/i,
  /\bblocked\b/i,
  /\brisk\b/i,
  /\bslip(?:s|ped)?\b/i,
  /\bmiss(?:es|ed)?\s+(?:the\s+)?(?:deadline|window|cutoff)\b/i,
  /\bcompeting\b/i,
  /\bdependency\b/i,
  /\bconsequence\b/i,
  /\boverlapp(?:ing|ed)?\b/i,
  /\bdouble[- ]book/i,
  /\b(?:calendar|schedule)\s+conflict\b/i,
  /\bconflict\b/i,
  /\bconflicting\s+events?\b/i,
  /\bsame\s+time\b/i,
  /\btrade[-‐‑–—]?\s*off\b/u,
  /\bwhich\s+(?:takes\s+priority|(?:event|meeting)\s+wins)\b/i,
  /\b(?:late fee|late fees)\b/i,
  /\bavoid\s+(?:a\s+)?late\b/i,
  /\b(?:no|zero)\s+replies?\b/i,
  /\bunreplied\b/i,
  /\bwithout\s+(?:a\s+)?response\b/i,
  /\bstill\s+(?:waiting|no\s+word)\b/i,
];

const OWNERSHIP_PATTERNS = [
  /\bowner\b/i,
  /\baccountable\b/i,
  /\bresponsible\b/i,
  /\bassign\b/i,
  /\byour\s+(?:calendar|schedule)\b/i,
  /\bI(?:'m| am)\s+.{0,60}(?:double[\s-]?book(?:ed)?|overlap(?:ping)?|conflict(?:ing)?)\b/i,
];

const REWRITE_REQUIRED_PATTERNS = [
  /\btemplate\b/i,
  /\bfill in\b/i,
  /\bto be completed\b/i,
  /\badd details\b/i,
];

const SUMMARY_ONLY_PATTERNS = [
  /\bthis (?:document|note|summary) summarizes\b/i,
  /\boverview\b/i,
  /\bfor reference\b/i,
  /\bbackground only\b/i,
];

export function normalizeDecisionActionType(actionType: string): 'send_message' | 'write_document' | 'other' {
  if (actionType === 'send_message') return 'send_message';
  if (
    actionType === 'write_document' ||
    actionType === 'make_decision' ||
    actionType === 'research' ||
    actionType === 'document'
  ) {
    return 'write_document';
  }
  return 'other';
}

export function textHasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function getArtifactTextForDecisionEnforcement(
  actionType: 'send_message' | 'write_document',
  artifact: Record<string, unknown>,
): string {
  if (actionType === 'send_message') {
    const subject = isNonEmptyString(artifact.subject) ? artifact.subject.trim() : '';
    const body = isNonEmptyString(artifact.body) ? artifact.body.trim() : '';
    return `${subject}\n${body}`.trim();
  }

  const title = isNonEmptyString(artifact.title) ? artifact.title.trim() : '';
  const content = isNonEmptyString(artifact.content) ? artifact.content.trim() : '';
  return `${title}\n${content}`.trim();
}

export function getWriteDocumentTaskManagerLabelIssues(artifact: Record<string, unknown> | null): string[] {
  if (!artifact || typeof artifact !== 'object') return [];
  const title = isNonEmptyString(artifact.title) ? artifact.title.trim() : '';
  const content = isNonEmptyString(artifact.content) ? artifact.content.trim() : '';
  const text = `${title}\n${content}`.trim();
  const out: string[] = [];
  if (/\bNEXT_ACTION\s*:/i.test(text)) {
    out.push('decision_enforcement:forbidden_task_manager_next_action_label');
  }
  if (/\bOwner\s*:\s*you\b/i.test(text)) {
    out.push('decision_enforcement:forbidden_owner_you_task_line');
  }
  return out;
}

export type WriteDocumentMode = 'outbound_resolution_note' | 'internal_execution_brief';

const INTERNAL_EXECUTION_PURPOSE_RE =
  /\b(interview|answer architecture|answer script|close[_\s-]?the[_\s-]?loop|execution brief|execution rule)\b/i;
const INTERNAL_EXECUTION_CONTEXT_RE =
  /\b(interview|phone screen|panel interview|role-specific answer|answer architecture|answer script|execution rule|execution move)\b/i;
const INTERNAL_EXECUTION_TARGET_RE = /\b(candidate|user|yourself|you)\b/i;
const INTERNAL_EXECUTION_MOVE_RE =
  /\b(use this|answer script|send this(?: email)?(?: (?:today|now|tonight|tomorrow))?|send the email above|copy(?:\/|-)?paste|open with|say:|draft email to send|execution\b|execution move)\b/i;
const INTERNAL_EXECUTION_CHECKLIST_LINE_RE =
  /^\s*(?:[-*]|\d+\.)\s*(?:prepare|review|research|gather|brainstorm|locate|find|list|outline|draft|confirm|write)\b/gim;
const INTERNAL_EXECUTION_QUESTION_RE =
  /\b(?:questions?\s+(?:to answer|for yourself)|ask yourself)\b|^\s*(?:[-*]|\d+\.)\s*(?:what|which|who|how|when|where|why)\b/gim;
const INTERNAL_EXECUTION_FUTURE_ARTIFACT_RE =
  /\b(?:starting point|outline for later|notes for later|future artifact|future brief|turn this into|build the full|draft for later|prep brief)\b/i;

function collectWriteDocumentArtifactText(input: {
  artifact?: Record<string, unknown> | null;
}): string {
  const artifact = input.artifact ?? null;
  return [
    typeof artifact?.document_purpose === 'string' ? artifact.document_purpose : '',
    typeof artifact?.target_reader === 'string' ? artifact.target_reader : '',
    typeof artifact?.title === 'string' ? artifact.title : '',
    typeof artifact?.content === 'string' ? artifact.content : '',
  ].join('\n');
}

/** Strip internal execution `target_reader` labels — they match HIRING `candidate` falsely. */
function writeDocumentArtifactTextForInterviewHiringCheck(artifact: Record<string, unknown> | null): string {
  if (!artifact) return '';
  const a = artifact;
  const rawTr = typeof a.target_reader === 'string' ? a.target_reader.trim() : '';
  const trLower = rawTr.toLowerCase();
  const internalOnlyTarget =
    trLower === 'candidate' ||
    trLower === 'yourself' ||
    trLower === 'you' ||
    trLower === 'user' ||
    trLower === 'the user';
  const targetReader = internalOnlyTarget ? '' : (typeof a.target_reader === 'string' ? a.target_reader : '');
  return [
    typeof a.document_purpose === 'string' ? a.document_purpose : '',
    targetReader,
    typeof a.title === 'string' ? a.title : '',
    typeof a.content === 'string' ? a.content : '',
  ].join('\n');
}

const ENFORCEMENT_INTERVIEW_ANCHOR_RE =
  /\b(?:interview|phone screen|screening interview|panel interview|final round|hiring panel|candidate interview)\b/i;
const ENFORCEMENT_HIRING_CONTEXT_RE =
  /\b(?:role|position|job|recruit(?:er|ment)|candidate|hiring|employer|interviewer|manager)\b/i;
const ENFORCEMENT_CONFIRMED_WINDOW_RE =
  /\b(?:accepted?\s+interview|interview\s+accepted|confirm(?:ed|ation)?|scheduled|schedule(?:d)?|invite(?:d|s|ation)?|appointment scheduled|selected\s+to\s+interview|phone screen)\b/i;
const ENFORCEMENT_DATED_WINDOW_RE =
  /\b(?:20\d{2}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/(?:20)?\d{2}|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;

/**
 * Interview-class write_document: finished prep, recap, or ready-to-send draft grounded in hiring signals.
 * Do not apply outbound-email "explicit ask / pressure / anti-passive" rules — those are wrong for this class.
 */
export function isInterviewClassWriteDocumentEnforcementRelaxation(input: {
  actionType: string;
  candidateTitle?: string | null;
  supportingContext?: string | null;
  directiveText?: string | null;
  reason?: string | null;
  artifact?: Record<string, unknown> | null;
}): boolean {
  if (normalizeDecisionActionType(input.actionType) !== 'write_document') return false;
  const artifactText = collectWriteDocumentArtifactText({ artifact: input.artifact ?? null });
  const artifactHiringText = writeDocumentArtifactTextForInterviewHiringCheck(
    input.artifact as Record<string, unknown> | null,
  );
  const fullText = [
    input.candidateTitle ?? '',
    input.supportingContext ?? '',
    input.directiveText ?? '',
    input.reason ?? '',
    artifactText,
  ].join('\n');
  const hiringHaystack = [
    input.candidateTitle ?? '',
    input.supportingContext ?? '',
    input.directiveText ?? '',
    input.reason ?? '',
    artifactHiringText,
  ].join('\n');
  if (!ENFORCEMENT_INTERVIEW_ANCHOR_RE.test(fullText)) return false;
  if (!ENFORCEMENT_HIRING_CONTEXT_RE.test(hiringHaystack)) return false;
  const hasConfirmed = ENFORCEMENT_CONFIRMED_WINDOW_RE.test(fullText);
  const hasDated = ENFORCEMENT_DATED_WINDOW_RE.test(fullText);
  if (!(hasConfirmed || hasDated)) return false;
  return true;
}

function collectWriteDocumentModeText(input: {
  artifact?: Record<string, unknown> | null;
  candidateTitle?: string | null;
  directiveText?: string | null;
  reason?: string | null;
}): string {
  return [
    collectWriteDocumentArtifactText({ artifact: input.artifact }),
    input.candidateTitle ?? '',
    input.directiveText ?? '',
    input.reason ?? '',
  ].join('\n');
}

export function getWriteDocumentMode(input: {
  actionType?: string | null;
  artifact?: Record<string, unknown> | null;
  discrepancyClass?: string | null;
  candidateTitle?: string | null;
  directiveText?: string | null;
  reason?: string | null;
}): WriteDocumentMode | null {
  if (normalizeDecisionActionType(input.actionType ?? '') !== 'write_document') {
    return null;
  }

  if (input.discrepancyClass === 'behavioral_pattern') {
    return 'internal_execution_brief';
  }

  const artifactText = collectWriteDocumentArtifactText({ artifact: input.artifact });
  const targetReader = typeof input.artifact?.target_reader === 'string'
    ? input.artifact.target_reader.trim()
    : '';
  if (!artifactText.trim()) {
    const fallbackCombined = collectWriteDocumentModeText(input);
    if (!fallbackCombined.trim()) {
      return 'outbound_resolution_note';
    }
    if (INTERNAL_EXECUTION_PURPOSE_RE.test(fallbackCombined)) {
      return 'internal_execution_brief';
    }
    if (
      INTERNAL_EXECUTION_CONTEXT_RE.test(fallbackCombined) &&
      INTERNAL_EXECUTION_MOVE_RE.test(fallbackCombined)
    ) {
      return 'internal_execution_brief';
    }
    return 'outbound_resolution_note';
  }

  if (INTERNAL_EXECUTION_PURPOSE_RE.test(artifactText)) {
    return 'internal_execution_brief';
  }

  if (targetReader && !INTERNAL_EXECUTION_TARGET_RE.test(targetReader)) {
    return 'outbound_resolution_note';
  }

  if (INTERNAL_EXECUTION_CONTEXT_RE.test(artifactText) && INTERNAL_EXECUTION_MOVE_RE.test(artifactText)) {
    return 'internal_execution_brief';
  }

  return 'outbound_resolution_note';
}

export function getInternalExecutionBriefIssues(
  artifact: Record<string, unknown> | null,
): Array<'missing_execution_move' | 'owner_checklist' | 'user_questions' | 'future_artifact'> {
  if (!artifact || typeof artifact !== 'object') return ['missing_execution_move'];
  const title = isNonEmptyString(artifact.title) ? artifact.title.trim() : '';
  const content = isNonEmptyString(artifact.content) ? artifact.content.trim() : '';
  const combined = `${title}\n${content}`.trim();
  const issues: Array<'missing_execution_move' | 'owner_checklist' | 'user_questions' | 'future_artifact'> = [];

  if (!INTERNAL_EXECUTION_MOVE_RE.test(combined)) {
    issues.push('missing_execution_move');
  }

  const checklistMatches = combined.match(INTERNAL_EXECUTION_CHECKLIST_LINE_RE) ?? [];
  if (checklistMatches.length >= 2) {
    issues.push('owner_checklist');
  }

  if (INTERNAL_EXECUTION_QUESTION_RE.test(combined)) {
    issues.push('user_questions');
  }

  if (INTERNAL_EXECUTION_FUTURE_ARTIFACT_RE.test(combined)) {
    issues.push('future_artifact');
  }

  return issues;
}

const BEHAVIORAL_PATTERN_GOAL_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'about',
  'after', 'before', 'while', 'where', 'when', 'what', 'have', 'will', 'would',
  'could', 'should', 'them', 'they', 'their', 'there', 'then', 'than', 'just',
  'real', 'yes', 'no', 'thread', 'decision',
]);

function extractBehavioralPatternGoalLabel(candidateGoal: string | null | undefined): string | null {
  if (!isNonEmptyString(candidateGoal)) return null;
  const cleaned = candidateGoal.replace(/\s*\[[^\]]+\]\s*$/, '').trim();
  return cleaned.length > 0 ? cleaned : null;
}

function normalizeBehavioralPatternText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function behavioralPatternGoalAppearsInText(text: string, goalLabel: string): boolean {
  const normalizedText = normalizeBehavioralPatternText(text);
  const normalizedGoal = normalizeBehavioralPatternText(goalLabel);
  if (!normalizedText || !normalizedGoal) return false;
  if (normalizedText.includes(normalizedGoal)) return true;

  const goalTokens = normalizedGoal
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !BEHAVIORAL_PATTERN_GOAL_STOPWORDS.has(token));
  if (goalTokens.length === 0) return false;

  const matched = goalTokens.filter((token) => normalizedText.includes(token));
  return matched.length >= Math.min(2, goalTokens.length);
}

function normalizeBehavioralPatternDirectiveEcho(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/g, '')
    .trim()
    .toLowerCase();
}

export function behavioralPatternArtifactHasGroundedTarget(
  artifact: Record<string, unknown> | null,
): boolean {
  if (!artifact || typeof artifact !== 'object') return false;
  const title = isNonEmptyString(artifact.title) ? artifact.title.trim() : '';
  const content = isNonEmptyString(artifact.content) ? artifact.content.trim() : '';
  const combined = `${title}\n${content}`;

  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(combined)) return true;
  if (/[“"]?(?:Hey|Hi|Dear)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/.test(combined)) return true;
  if (/\b(?:to|recipient):\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/im.test(combined)) return true;

  return false;
}

function getBehavioralPatternFinishedWorkIssues(input: {
  directiveText: string;
  reason: string;
  artifact: Record<string, unknown> | null;
  candidateGoal: string | null;
}): string[] {
  if (!input.artifact || typeof input.artifact !== 'object') return [];

  const title = isNonEmptyString(input.artifact.title) ? input.artifact.title.trim() : '';
  const content = isNonEmptyString(input.artifact.content) ? input.artifact.content.trim() : '';
  const interviewWeekExecutionBrief =
    /\binterview week (?:prep pack|execution brief)\b/i.test(`${title}\n${content}`) ||
    /\bINTERVIEW_WEEK_CLUSTER\b/i.test(`${input.directiveText}\n${input.reason}`) ||
    (
      /\bACTUAL INTERVIEW SCHEDULE\b/i.test(content) &&
      /\bCROSS-ROLE STORY REUSE\b/i.test(content) &&
      /\bROLE-SPECIFIC ANGLES\b/i.test(content)
    );
  if (interviewWeekExecutionBrief) return [];
  const combined = `${input.directiveText}\n${input.reason}\n${title}\n${content}`.trim();
  const issues: string[] = [];
  const goalLabel = extractBehavioralPatternGoalLabel(input.candidateGoal);
  const normalizedDirective = normalizeBehavioralPatternDirectiveEcho(input.directiveText);
  const normalizedContent = normalizeBehavioralPatternDirectiveEcho(content);
  const hasDecisionArtifactMove =
    /\b(?:Execution move|Actual move|Use this rule)\b/i.test(content) ||
    /\bStop holding\b[\s\S]{0,120}\bbandwidth\b/i.test(content) ||
    /\bTreat\b[\s\S]{0,120}\bas inactive\b/i.test(content);
  const hasWhyWins =
    /\bWhy this beats\b/i.test(content) ||
    /\bbeats the alternatives\b/i.test(content) ||
    /\bchanges the next 30-90 days\b/i.test(content) ||
    /\bhigher[-\s]leverage\b/i.test(content);
  const hasDeprioritize =
    /\bDeprioritize:\b/i.test(content) ||
    /\bDo not\b[\s\S]{0,120}\b(?:draft|hold|keep|treat)\b/i.test(content);
  const hasReopenTrigger =
    /\bReopen trigger:\b/i.test(content) ||
    /\bReopen only if\b/i.test(content) ||
    /\bNext trigger:\b/i.test(content) ||
    /\buntil a concrete next-step signal arrives\b/i.test(content);

  if (goalLabel && !behavioralPatternGoalAppearsInText(combined, goalLabel)) {
    issues.push('decision_enforcement:behavioral_pattern_missing_goal_anchor');
  }
  const hasSendReadyLead =
    /\bSend this (?:today|now|tonight|tomorrow)\b/i.test(content) ||
    /\bSend this email\b/i.test(content) ||
    /\bSend (?:it|this) (?:today|now|tonight|tomorrow)\b/i.test(content) ||
    /\bSend (?:today|now|tonight|tomorrow)\b/i.test(content) ||
    /\bDRAFT EMAIL TO SEND\b/i.test(content) ||
    /\bEXECUTION\b[\s\S]{0,220}\bSend this email\b/i.test(content);
  const hasQuotedCopyPasteBlock = /[“"][^"”\n]{20,}[”"]/.test(content);
  if (!hasSendReadyLead && !hasQuotedCopyPasteBlock && !hasDecisionArtifactMove) {
    issues.push('decision_enforcement:behavioral_pattern_missing_actual_move');
  }
  if (
    normalizedDirective.startsWith('stop holding live bandwidth open for ') &&
    normalizedContent.includes(normalizedDirective)
  ) {
    issues.push('decision_enforcement:behavioral_pattern_directive_echoed_into_artifact');
  }
  if (
    /\bExecution move:\s*stop holding live bandwidth open for\s+Stop holding live bandwidth open for\b/i.test(content) ||
    /\b(?:means|reserved for)\s+Stop holding live bandwidth open for\b/i.test(content)
  ) {
    issues.push('decision_enforcement:behavioral_pattern_directive_echoed_into_artifact');
  }
  if (hasDecisionArtifactMove && !hasWhyWins) {
    issues.push('decision_enforcement:behavioral_pattern_missing_long_horizon_rationale');
  }
  if (hasDecisionArtifactMove && !hasDeprioritize) {
    issues.push('decision_enforcement:behavioral_pattern_missing_deprioritization');
  }
  const hasNoReplyStopCondition =
    /\bif (?:there is )?no (?:reply|response|answer)\b/i.test(content) ||
    /\bif no (?:reply|response|answer) (?:arrives?|comes?) by\b/i.test(content) ||
    /\bif silence continues past\b/i.test(content) ||
    /\bif you (?:do not|don['’]t) hear back\b/i.test(content) ||
    /\bif (?:they|he|she|we)\s+(?:do not|don['’]t)\s+(?:reply|respond|get back)\b/i.test(content);
  const hasStopAction =
    /\bmark (?:the |this )?(?:thread|conversation)\s+(?:as\s+)?stalled\b/i.test(content) ||
    /\bstop\b[^.\n]{0,40}\b(?:allocating attention|spending attention|following up|pursuing|chasing)\b/i.test(content) ||
    /\bclose the loop\b/i.test(content) ||
    /\barchive (?:the )?(?:thread|conversation)\b/i.test(content);
  if (hasDecisionArtifactMove) {
    if (!hasReopenTrigger) {
      issues.push('decision_enforcement:behavioral_pattern_missing_reopen_trigger');
    }
  } else if (!hasNoReplyStopCondition || !hasStopAction) {
    issues.push('decision_enforcement:behavioral_pattern_missing_stop_rule');
  }
  const usesGenericThreadLabel =
    /\bThis thread\b/i.test(title) ||
    /\bThis thread\b/i.test(content) ||
    /[“"]I['’]ve followed up a few times/i.test(content);
  if (usesGenericThreadLabel && !behavioralPatternArtifactHasGroundedTarget(input.artifact)) {
    issues.push('decision_enforcement:behavioral_pattern_missing_grounded_target');
  }

  return issues;
}

function financialPaymentWriteDocumentLooksFinished(combinedText: string): boolean {
  const hasDollar = /\$\s*[\d,]+(?:\.\d{2})?/.test(combinedText);
  const hasPayPath =
    /https?:\/\/[^\s)\]]+/i.test(combinedText) ||
    /\bpay\s+(?:the\s+)?(?:minimum|balance)\b/i.test(combinedText) ||
    /\bpay\s+(?:the\s+)?\$\s*[\d,]+(?:\.\d{2})?/i.test(combinedText);
  return hasDollar && hasPayPath;
}

export function getDecisionEnforcementIssues(input: {
  actionType: string;
  directiveText: string;
  reason: string;
  artifact: ConvictionArtifact | Record<string, unknown> | null;
  discrepancyClass?: string | null;
  matchedGoalCategory?: string | null;
  candidateTitle?: string | null;
  supportingContext?: string | null;
}): string[] {
  const normalizedType = normalizeDecisionActionType(input.actionType);
  if (normalizedType === 'other') return [];
  if (!input.artifact || typeof input.artifact !== 'object') {
    return ['decision_enforcement:missing_artifact'];
  }

  const artifactRecord = input.artifact as Record<string, unknown>;
  const artifactText = getArtifactTextForDecisionEnforcement(normalizedType, artifactRecord);
  const combinedText = `${input.directiveText}\n${input.reason}\n${artifactText}`.trim();
  const issues: string[] = [];
  const writeDocumentMode = getWriteDocumentMode({
    actionType: input.actionType,
    artifact: artifactRecord,
    discrepancyClass: input.discrepancyClass ?? null,
    directiveText: input.directiveText,
    reason: input.reason,
  });
  const isInternalExecutionBrief = writeDocumentMode === 'internal_execution_brief';
  const interviewClassRelax = isInterviewClassWriteDocumentEnforcementRelaxation({
    actionType: input.actionType,
    candidateTitle: input.candidateTitle ?? null,
    supportingContext: input.supportingContext ?? null,
    directiveText: input.directiveText,
    reason: input.reason,
    artifact: artifactRecord,
  });

  const sendMessageHasQuestion =
    normalizedType === 'send_message' && artifactText.length > 0 && /\?/.test(artifactText);
  const internalExecutionIssues =
    normalizedType === 'write_document' && isInternalExecutionBrief
      ? getInternalExecutionBriefIssues(artifactRecord)
      : [];
  const internalExecutionHasMove = !internalExecutionIssues.includes('missing_execution_move');
  if (!textHasAny(combinedText, EXPLICIT_ASK_PATTERNS) && !sendMessageHasQuestion && !internalExecutionHasMove) {
    issues.push('decision_enforcement:missing_explicit_ask');
  }
  if (!textHasAny(combinedText, TIME_CONSTRAINT_PATTERNS)) {
    issues.push('decision_enforcement:missing_time_constraint');
  }
  if (!textHasAny(combinedText, PRESSURE_OR_CONSEQUENCE_PATTERNS)) {
    issues.push('decision_enforcement:missing_pressure_or_consequence');
  }
  if (textHasAny(combinedText, PASSIVE_OR_IGNORABLE_PATTERNS)) {
    issues.push('decision_enforcement:passive_or_ignorable_tone');
  }
  if (textHasAny(combinedText, OBVIOUS_FIRST_LAYER_PATTERNS)) {
    issues.push('decision_enforcement:obvious_first_layer_advice');
  }
  if (normalizedType === 'write_document' && textHasAny(combinedText, SUMMARY_ONLY_PATTERNS)) {
    issues.push('decision_enforcement:summary_without_decision');
  }
  if (normalizedType === 'write_document' && !isInternalExecutionBrief && !textHasAny(combinedText, OWNERSHIP_PATTERNS)) {
    issues.push('decision_enforcement:missing_owner_assignment');
  }
  if (textHasAny(combinedText, REWRITE_REQUIRED_PATTERNS)) {
    issues.push('decision_enforcement:requires_rewriting');
  }
  if (normalizedType === 'write_document') {
    issues.push(...getWriteDocumentTaskManagerLabelIssues(artifactRecord));
    if (isInternalExecutionBrief) {
      if (internalExecutionIssues.includes('owner_checklist')) {
        issues.push('decision_enforcement:internal_execution_brief_owner_checklist');
      }
      if (internalExecutionIssues.includes('user_questions')) {
        issues.push('decision_enforcement:internal_execution_brief_user_questions');
      }
      if (internalExecutionIssues.includes('future_artifact')) {
        issues.push('decision_enforcement:internal_execution_brief_future_artifact');
      }
    }
  }

  let out = [...new Set(issues)];
  if (input.discrepancyClass === 'decay' && normalizedType === 'send_message') {
    out = out.filter(
      (issue) =>
        issue !== 'decision_enforcement:missing_time_constraint' &&
        issue !== 'decision_enforcement:missing_pressure_or_consequence',
    );
  }
  if (normalizedType === 'send_message' && input.discrepancyClass) {
    const to = typeof artifactRecord.to === 'string' ? artifactRecord.to : '';
    const body = typeof artifactRecord.body === 'string' ? artifactRecord.body : '';
    if (to.includes('@') && body.length > 50) {
      out = out.filter((issue) => issue !== 'decision_enforcement:missing_explicit_ask');
    }
  }
  if (
    input.matchedGoalCategory === 'financial' &&
    normalizedType === 'write_document' &&
    financialPaymentWriteDocumentLooksFinished(combinedText)
  ) {
    out = out.filter((issue) => issue !== 'decision_enforcement:missing_owner_assignment');
  }
  if (sendMessageHasQuestion) {
    out = out.filter(
      (issue) =>
        issue !== 'decision_enforcement:passive_or_ignorable_tone' &&
        issue !== 'decision_enforcement:obvious_first_layer_advice',
    );
  }
  if (interviewClassRelax) {
    const drop = new Set<string>([
      'decision_enforcement:missing_explicit_ask',
      'decision_enforcement:missing_pressure_or_consequence',
      'decision_enforcement:passive_or_ignorable_tone',
      'decision_enforcement:missing_owner_assignment',
      // Interview prep docs are finished user-facing work, not internal execution memos.
      'decision_enforcement:internal_execution_brief_owner_checklist',
      'decision_enforcement:internal_execution_brief_user_questions',
      'decision_enforcement:internal_execution_brief_future_artifact',
    ]);
    out = out.filter((issue) => !drop.has(issue));
  }

  return out;
}

export { PASSIVE_OR_IGNORABLE_PATTERNS };
