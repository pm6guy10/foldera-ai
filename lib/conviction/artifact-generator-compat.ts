import Anthropic from '@anthropic-ai/sdk';
import type {
  CalendarEventArtifact,
  ConvictionArtifact,
  ConvictionDirective,
  DecisionFrameArtifact,
  DocumentArtifact,
  EmailArtifact,
  ResearchBriefArtifact,
  WaitRationaleArtifact,
} from '@/lib/briefing/types';
import {
  directiveLooksLikeScheduleConflict,
  scheduleConflictArtifactHasResolutionShape,
  scheduleConflictArtifactIsMessageShaped,
  scheduleConflictArtifactIsOwnerProcedure,
} from '@/lib/briefing/schedule-conflict-guards';

const ARTIFACT_MODEL = 'claude-haiku-4-5-20251001';

let anthropicClient: Anthropic | null = null;

function getAnthropic() {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isNonEmptyString).map((item) => item.trim());
}

const PLACEHOLDER_PATTERNS = [
  /\[(name|company|role|contact|date|amount|title|recipient)\]/i,
  /\[[^\]]*\bphone\b[^\]]*\]/i,
  /\[[^\]]*specific[^\]]*\]/i,
  /\bfrom recent contact\b/i,
  /\b(tbd|placeholder|lorem ipsum|example@|recipient@email\.com)\b/i,
  /\b(option a|option b)\b/i,
];

const GENERIC_FILLER_PATTERNS = [
  /hope you'?r?e? (?:doing )?well/i,
  /just (?:checking|reaching) (?:in|out)/i,
  /would love to (?:catch up|reconnect|connect)/i,
  /hope things are going well/i,
  /wanted to (?:touch base|circle back)/i,
];

const ANALYSIS_PATTERNS = [
  /^\s*(?:#+\s*)?(?:INSIGHT|WHY NOW|WINNING LOOP|RELATIONSHIP CONTEXT|RUNNER[\s-]?UPS?(?:\s+REJECTED)?|CONFIDENCE RATIONALE|CANDIDATE COMPETITION|SCORER|SCORE|DECISION PAYLOAD|INTERNAL ANALYSIS|PIPELINE)\s*[:\-]/i,
  /^\s*Beaten:\s*/i,
  /^\s*Selected because\b/i,
  /^\s*Rejected because\b/i,
  /^\s*This candidate\b/i,
  /^\s*Winner\b.*\b(?:score|scorer|beat|won|selected)\b/i,
  /\brunner[\s-]?ups?\s+rejected\b/i,
  /\brejected because\b/i,
  /\bconfidence rationale\b/i,
  /\bcandidate competition\b/i,
  /\bthis candidate\b.{0,120}\b(?:winner|won|beat|score|scorer|selected)\b/i,
  /\bwinner\b.{0,80}\b(?:score|scorer|beat|won|selected)\b/i,
  /\bscore\s*[:=]\s*\d/i,
];

function hasAnalysisScaffoldingLine(text: string): boolean {
  return ANALYSIS_PATTERNS.some((pattern) => pattern.test(text));
}

function hasAnalysisScaffolding(text: string): boolean {
  if (!isNonEmptyString(text)) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  return ANALYSIS_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function containsPlaceholderText(value: string): boolean {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value));
}

function containsGenericFiller(value: string): boolean {
  return GENERIC_FILLER_PATTERNS.some((pattern) => pattern.test(value));
}

function cleanTitle(value: string): string {
  return value.trim().slice(0, 120).replace(/[.!?]+$/, '').trim() || 'Document';
}

function countDocumentParagraphs(value: string): number {
  return value
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .length;
}

function extractDeadlineAnchor(text: string): string | null {
  const patterns = [
    /\b\d{4}-\d{2}-\d{2}\b/,
    /\b(?:today|tonight|tomorrow|this week|next week)\b/i,
    /\b(?:by|before)\s+(?:today|tonight|tomorrow|this week|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0].trim();
  }
  return null;
}

function isAnalysisDump(text: string): boolean {
  return ANALYSIS_PATTERNS.some((pattern) => pattern.test(text));
}

function isCleanFinishedDocument(text: string): boolean {
  return isNonEmptyString(text) && !isAnalysisDump(text) && !containsPlaceholderText(text) && !containsGenericFiller(text);
}

function stripScaffoldLines(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (hasAnalysisScaffoldingLine(trimmed)) continue;
    if (ANALYSIS_PATTERNS.some((pattern) => pattern.test(trimmed))) continue;
    const normalized = trimmed.replace(/^[-*]\s+/, '').trim();
    if (normalized) kept.push(normalized);
  }
  return [...new Set(kept)];
}

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

function extractScheduleConflictFacts(text: string): {
  dateLabel?: string;
  eventA?: string;
  eventB?: string;
} {
  const dateMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  let eventA: string | undefined;
  let eventB: string | undefined;
  const patterns: RegExp[] = [
    /overlap[^.\n]*?["“]([^"”\n]+)["”]\s+(?:vs|and)\s+["“]([^"”\n]+)["”]/i,
    /overlapping.*?on\s+\d{4}-\d{2}-\d{2}:\s*["“]([^"”\n]+)["”]\s+and\s+["“]([^"”\n]+)["”]/i,
    /Overlap:\s*([^"\n]+?)\s+and\s+([^"\n]+)/i,
    /overlap:\s*["“]?([^"”\n]+?)["”]?\s+(?:vs|and)\s+["“]?([^"”\n]+?)["”]?/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      eventA = match[1]?.trim();
      eventB = match[2]?.trim();
      break;
    }
  }
  return {
    dateLabel: dateMatch?.[1],
    eventA: eventA?.replace(/[.\s]+$/, ''),
    eventB: eventB?.replace(/[.\s]+$/, ''),
  };
}

function subtractIsoDate(dateLabel: string, days: number): string | null {
  const d = new Date(`${dateLabel}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
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

function buildBehavioralPatternFallback(
  directive: ConvictionDirective,
  rawContext: string,
): DocumentArtifact | null {
  if (directive.discrepancyClass !== 'behavioral_pattern') return null;

  const patternLine = directive.directive.trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
  const whyNowLine =
    (directive.reason ?? rawContext).trim().replace(/\s+/g, ' ') ||
    'This pattern is recurring now, so another cycle without a decision will keep the stall open.';
  const deadlineAnchor =
    extractDeadlineAnchor([directive.directive, directive.reason ?? '', rawContext].join('\n')) ?? 'today';
  const title = cleanTitle(patternLine.slice(0, 90)) || 'Behavioral pattern note';
  const content = [
    '## Pattern observed',
    patternLine,
    '',
    '## Why it matters now',
    whyNowLine,
    '',
    '## Concrete decision / next move',
    'Send one direct follow-up today that names the gap, asks for the next step, and closes the loop on this pattern.',
    '',
    '## Owner / deadline',
    'Owner: account owner.',
    `Deadline: ${deadlineAnchor}.`,
  ].join('\n');

  const issues = getFinishedDocumentIssues(title, content);
  if (issues.length > 0) return null;

  return { type: 'document', title, content };
}

function buildScheduleConflictFallback(
  directive: ConvictionDirective,
  rawContext: string,
): DocumentArtifact | null {
  if (!directiveLooksLikeScheduleConflict(directive)) return null;
  const blob = [directive.directive, directive.reason ?? '', rawContext].filter(Boolean).join('\n');
  const { dateLabel, eventA, eventB } = extractScheduleConflictFacts(blob);

  const dateText = dateLabel ?? 'the upcoming window';
  const eventAText = eventA ? `"${eventA}"` : 'one event (title not present in signals)';
  const eventBText = eventB ? `"${eventB}"` : 'another event (title not present in signals)';
  const deadline = dateLabel ? subtractIsoDate(dateLabel, 1) : null;
  const deadlineLine = dateLabel
    ? `Decide by ${deadline ?? dateLabel} so the calendar is settled before ${dateLabel}.`
    : 'Deadline: decide before the overlapping window so the calendar is settled in time.';

  const content = [
    '## Situation',
    `You have overlapping calendar commitments on ${dateText}. ${eventAText} and ${eventBText} are scheduled for the same window.`,
    '',
    '## Conflicting commitments or risk',
    'Double-booking forces a trade-off; if no decision is made, you default under pressure in the moment.',
    '',
    '## Recommendation / decision',
    `Choose which commitment keeps the slot: ${eventAText} or ${eventBText}. If one is immovable, move the other commitment to the next open slot.`,
    '',
    '## Owner / next step',
    'Owner: calendar owner. Confirm which commitment keeps the slot so the other can move.',
    '',
    '## Timing / deadline',
    deadlineLine,
  ].join('\n');
  const title = dateLabel ? `Schedule conflict decision - ${dateLabel}` : 'Schedule conflict decision';
  const issues = getFinishedDocumentIssues(title, content);
  if (issues.length > 0) return null;
  return { type: 'document', title, content };
}

function buildDeterministicDocumentFallback(
  directive: ConvictionDirective,
  rawContext: string,
): DocumentArtifact | null {
  if (directiveLooksLikeScheduleConflict(directive)) {
    return buildScheduleConflictFallback(directive, rawContext);
  }
  if (directive.discrepancyClass === 'behavioral_pattern') {
    return buildBehavioralPatternFallback(directive, rawContext);
  }

  const uniqueSignals = stripScaffoldLines(rawContext).slice(0, 6);
  if (uniqueSignals.length === 0) return null;

  const title = cleanTitle(directive.directive);
  const content = [
    `Objective: ${directive.directive.trim()}`,
    '',
    'Execution Notes:',
    ...uniqueSignals.map((signal) => `- ${signal}`),
  ].join('\n');

  const issues = getFinishedDocumentIssues(title, content);
  if (issues.length > 0) return null;

  return { type: 'document', title, content };
}

function buildSendMessageRecipientGroundingBlob(directive: ConvictionDirective | undefined): string {
  if (!directive) return '';
  const ev = Array.isArray(directive.evidence) ? directive.evidence : [];
  const evText = ev.map((e) => (typeof e.description === 'string' ? e.description : '')).join('\n');
  const fullContext = typeof directive.fullContext === 'string' ? directive.fullContext : '';
  return [directive.directive, typeof directive.reason === 'string' ? directive.reason : '', evText, fullContext].join('\n');
}

function getSendMessageRecipientGroundingIssues(
  actionType: string,
  artifact: Record<string, unknown>,
  directive: ConvictionDirective | undefined,
): string[] {
  if (actionType !== 'send_message') return [];
  if (artifact.emergency_fallback === true) return [];
  const threadBacked =
    (typeof artifact.gmail_thread_id === 'string' && artifact.gmail_thread_id.trim().length > 0) ||
    (typeof artifact.in_reply_to === 'string' && artifact.in_reply_to.trim().length > 0);
  if (threadBacked) return [];

  const rawTo = artifact.to ?? artifact.recipient;
  if (typeof rawTo !== 'string') return [];
  const to = rawTo.trim().toLowerCase();
  if (!to.includes('@')) return [];

  const blob = buildSendMessageRecipientGroundingBlob(directive).toLowerCase();
  if (!directive || blob.trim().length < 8) {
    return ['send_message recipient cannot be verified (directive/evidence missing)'];
  }
  if (!blob.includes(to)) {
    return ['send_message artifact.to is not grounded in directive or evidence'];
  }
  return [];
}

function getArtifactPersistenceIssues(
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
    if (directive && actionType === 'write_document' && directiveLooksLikeScheduleConflict(directive)) {
      const title = isNonEmptyString(record.title) ? record.title.trim() : '';
      const content = isNonEmptyString(record.content) ? record.content.trim() : '';
      const blob = `${title}\n${content}`;
      if (scheduleConflictArtifactIsOwnerProcedure(blob)) {
        return ['schedule_conflict finished-work required (emergency fallback is owner-facing)'];
      }
      if (scheduleConflictArtifactIsMessageShaped(blob)) {
        return ['schedule_conflict finished-work required (emergency fallback is message-shaped)'];
      }
      if (!scheduleConflictArtifactHasResolutionShape(blob)) {
        return ['schedule_conflict finished-work required (emergency fallback lacks resolution shape)'];
      }
    }
    return [];
  }

  if (actionType === 'write_document') {
    const title = isNonEmptyString(record.title) ? record.title.trim() : '';
    const content = isNonEmptyString(record.content) ? record.content.trim() : '';
    issues.push(...getFinishedDocumentIssues(title, content));
    if (directive && directiveLooksLikeScheduleConflict(directive)) {
      const blob = `${title}\n${content}`;
      if (scheduleConflictArtifactIsOwnerProcedure(blob)) {
        issues.push(
          'schedule_conflict artifact must be a resolution decision note, not a calendar-owner chore list',
        );
      }
      if (scheduleConflictArtifactIsMessageShaped(blob)) {
        issues.push(
          'schedule_conflict artifact must be a resolution decision note, not outbound message copy',
        );
      }
      if (!scheduleConflictArtifactHasResolutionShape(blob)) {
        issues.push(
          'schedule_conflict document must include situation, conflict, recommendation, owner/next step, and timing grounded in calendar facts',
        );
      }
    }
  }

  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'string' && hasAnalysisScaffolding(value)) {
      issues.push(`artifact.${key} contains internal analysis scaffolding`);
    }
  }

  issues.push(...getSendMessageRecipientGroundingIssues(actionType, record, directive));
  return [...new Set(issues)];
}

function parseResponseText(raw: string): unknown | null {
  const cleaned = raw.replace(/```(?:json|JSON)?\s*\n?/g, '').trim();
  if (!cleaned.startsWith('{')) {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace <= firstBrace) return null;
    return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
  }
  return JSON.parse(cleaned);
}

function buildDocumentSystemPrompt(directive: ConvictionDirective, rawContext: string): string {
  const parts = [
    'Write one finished document artifact.',
    'Return JSON with type=document, title, and content.',
    'Do not include analysis scaffolding, generic filler, or placeholder text.',
  ];
  if (directiveLooksLikeScheduleConflict(directive)) {
    parts.push('CALENDAR CONFLICT RESOLUTION NOTE: produce a grounded resolution note, not a checklist or message.');
  }
  if (directive.discrepancyClass === 'behavioral_pattern') {
    parts.push('Behavioral pattern case: write a finished note with a concrete next move, not raw analysis.');
  }
  if (isNonEmptyString(rawContext)) {
    parts.push(`Context: ${rawContext.slice(0, 4000)}`);
  }
  return parts.join('\n');
}

function buildDocumentUserPrompt(directive: ConvictionDirective, rawContext: string): string {
  return [`DIRECTIVE: ${directive.directive}`, `REASON: ${directive.reason ?? ''}`, `CONTEXT: ${rawContext}`].join('\n');
}

function buildSendMessagePrompt(directive: ConvictionDirective): { system: string; user: string } {
  return {
    system: 'Write one grounded send_message artifact as JSON with type, to, subject, and body.',
    user: [
      `DIRECTIVE: ${directive.directive}`,
      `REASON: ${directive.reason ?? ''}`,
      `EVIDENCE: ${(directive.evidence ?? []).map((e) => e.description).join(' | ')}`,
    ].join('\n'),
  };
}

function emergencyDocumentFromContext(directive: ConvictionDirective, rawContext: string): DocumentArtifact {
  const cleaned = stripScaffoldLines(rawContext);
  if (cleaned.length > 0) {
    return {
      type: 'document',
      title: cleanTitle(directive.directive),
      content: [`Objective: ${directive.directive.trim()}`, '', 'Execution Notes:', ...cleaned.map((line) => `- ${line}`)].join('\n'),
    };
  }
  return emergencyWriteDocumentArtifact(directive);
}

function validateArtifact(
  actionType: ConvictionDirective['action_type'],
  parsed: unknown,
  directive?: ConvictionDirective,
): ConvictionArtifact {
  const record = parsed as Record<string, unknown> | null;
  if (!record || typeof record !== 'object') {
    throw new Error('artifact payload must be an object');
  }

  switch (actionType) {
    case 'send_message': {
      const recipient = isNonEmptyString(record.recipient)
        ? record.recipient.trim()
        : isNonEmptyString(record.to)
          ? record.to.trim()
          : '';
      const subject = isNonEmptyString(record.subject) ? record.subject.trim() : '';
      const body = isNonEmptyString(record.body) ? record.body.trim() : '';
      if (!recipient || !subject || !body) {
        throw new Error('Email artifact missing required fields (to/subject/body)');
      }
      if (containsPlaceholderText(recipient) || containsPlaceholderText(subject) || containsPlaceholderText(body)) {
        throw new Error('Email artifact contains placeholder text');
      }
      if (containsGenericFiller(body)) {
        throw new Error('Email artifact contains generic filler');
      }
      return {
        type: 'email',
        to: recipient,
        subject,
        body,
        draft_type: (isNonEmptyString(record.draft_type) ? record.draft_type : 'email_compose') as EmailArtifact['draft_type'],
        ...(isNonEmptyString(record.gmail_thread_id) ? { gmail_thread_id: record.gmail_thread_id.trim() } : {}),
        ...(isNonEmptyString(record.in_reply_to) ? { in_reply_to: record.in_reply_to.trim() } : {}),
        ...(isNonEmptyString(record.references) ? { references: record.references.trim() } : {}),
      };
    }
    case 'write_document': {
      const title = isNonEmptyString(record.title) ? record.title.trim() : '';
      const content = isNonEmptyString(record.content) ? record.content.trim() : '';
      if (!title || !content) {
        throw new Error('Document artifact missing required fields');
      }
      if (containsPlaceholderText(title) || containsPlaceholderText(content)) {
        throw new Error('Document artifact contains placeholder text');
      }
      if (containsGenericFiller(content)) {
        throw new Error('Document artifact contains generic filler');
      }
      if (directive && directiveLooksLikeScheduleConflict(directive)) {
        const blob = `${title}\n${content}`;
        if (scheduleConflictArtifactIsOwnerProcedure(blob)) {
          throw new Error('schedule_conflict document must be a resolution decision note, not a calendar-owner chore checklist');
        }
        if (scheduleConflictArtifactIsMessageShaped(blob)) {
          throw new Error('schedule_conflict document must be a resolution decision note, not outbound message or chat copy');
        }
        if (!scheduleConflictArtifactHasResolutionShape(blob)) {
          throw new Error('schedule_conflict document must include situation, conflict, recommendation, owner/next step, and timing');
        }
      }
      if (isAnalysisDump(content)) {
        throw new Error('Document content contains internal analysis scaffolding');
      }
      return {
        type: 'document',
        title,
        content,
      };
    }
    case 'schedule': {
      const title = isNonEmptyString(record.title) ? record.title.trim() : '';
      const start = isNonEmptyString(record.start) ? record.start.trim() : '';
      const end = isNonEmptyString(record.end) ? record.end.trim() : '';
      const description = isNonEmptyString(record.description) ? record.description.trim() : '';
      if (!title || !start || !end) {
        throw new Error('Calendar artifact missing required fields');
      }
      return { type: 'calendar_event', title, start, end, description };
    }
    case 'research': {
      const findings = isNonEmptyString(record.findings) ? record.findings.trim() : '';
      const recommendedAction = isNonEmptyString(record.recommended_action) ? record.recommended_action.trim() : '';
      const sources = Array.isArray(record.sources) ? record.sources.filter(isNonEmptyString).map((value) => value.trim()) : [];
      if (!findings || !recommendedAction || sources.length === 0) {
        throw new Error('Research artifact missing required fields');
      }
      return { type: 'research_brief', findings, recommended_action: recommendedAction, sources };
    }
    case 'make_decision': {
      const options = Array.isArray(record.options)
        ? record.options
            .filter(
              (option): option is { option: string; weight: number; rationale?: string } =>
                !!option && typeof option === 'object' && isNonEmptyString((option as any).option) && typeof (option as any).weight === 'number',
            )
            .map((option) => ({
              option: option.option.trim(),
              weight: option.weight,
              rationale: isNonEmptyString(option.rationale) ? option.rationale.trim() : '',
            }))
        : [];
      if (options.length < 2) {
        throw new Error('Decision artifact missing required fields');
      }
      return {
        type: 'decision_frame',
        options,
        recommendation: isNonEmptyString(record.recommendation) ? record.recommendation.trim() : '',
      };
    }
    case 'do_nothing':
    default: {
      const context = isNonEmptyString(record.context)
        ? record.context.trim()
        : isNonEmptyString(record.why_wait)
          ? record.why_wait.trim()
          : isNonEmptyString(record.reason)
            ? record.reason.trim()
            : '';
      const evidence = isNonEmptyString(record.evidence)
        ? record.evidence.trim()
        : isNonEmptyString(record.trigger_condition)
          ? record.trigger_condition.trim()
          : isNonEmptyString(record.what_changes)
            ? record.what_changes.trim()
            : '';
      if (!context || !evidence) {
        throw new Error('Wait artifact missing required fields');
      }
      return {
        type: 'wait_rationale',
        context,
        evidence,
        tripwires: normalizeStringArray(record.tripwires).length > 0 ? normalizeStringArray(record.tripwires) : [evidence],
        ...(isNonEmptyString(record.check_date) ? { check_date: record.check_date.trim() } : {}),
      } as WaitRationaleArtifact;
    }
  }
}

async function generateViaAnthropic(
  actionType: ConvictionDirective['action_type'],
  directive: ConvictionDirective,
  system: string,
  user: string,
  rawContext: string,
): Promise<ConvictionArtifact | null> {
  try {
    const response = await getAnthropic().messages.create({
      model: ARTIFACT_MODEL,
      max_tokens: actionType === 'write_document' ? 1200 : 800,
      temperature: 0.2 as any,
      system,
      messages: [{ role: 'user', content: user }],
    });

    const textBlocks = (response.content ?? []).filter((block: any) => block?.type === 'text');
    const raw = textBlocks.map((block: any) => block.text).join('');
    if (!raw.trim()) {
      return actionType === 'write_document'
        ? emergencyDocumentFromContext(directive, rawContext)
        : emergencyEmailArtifact(directive);
    }

    const parsed = parseResponseText(raw);
    if (parsed) {
      try {
        return validateArtifact(actionType, parsed, directive);
      } catch {
        // fall through to deterministic repair below
      }
    }

    if (actionType === 'write_document') {
      const repaired = buildDeterministicDocumentFallback(directive, rawContext);
      if (repaired) return repaired;
      return emergencyDocumentFromContext(directive, rawContext);
    }

    return emergencyEmailArtifact(directive);
  } catch {
    return actionType === 'write_document'
      ? emergencyDocumentFromContext(directive, rawContext)
      : emergencyEmailArtifact(directive);
  }
}

function generateArtifact(
  userId: string,
  directive: ConvictionDirective,
): Promise<ConvictionArtifact | null> {
  void userId;
  const rawContext =
    (directive as ConvictionDirective & { embeddedArtifact?: { context?: string } }).fullContext ??
    (directive as ConvictionDirective & { embeddedArtifact?: { context?: string } }).embeddedArtifact?.context ??
    directive.reason ??
    directive.directive;

  if (directive.action_type === 'write_document') {
    if (directive.discrepancyClass === 'behavioral_pattern') {
      return Promise.resolve(
        buildBehavioralPatternFallback(directive, rawContext) ?? emergencyDocumentFromContext(directive, rawContext),
      );
    }

    const fullContext = (directive as ConvictionDirective & { embeddedArtifact?: { context?: string } }).fullContext;
    if (isCleanFinishedDocument(fullContext ?? '')) {
      return Promise.resolve({
        type: 'document',
        title: cleanTitle(directive.directive),
        content: String(fullContext).trim(),
      });
    }

    const embeddedContext = (directive as ConvictionDirective & { embeddedArtifact?: { context?: string } }).embeddedArtifact?.context;
    if (isNonEmptyString(embeddedContext) && !isAnalysisDump(embeddedContext) && !directiveLooksLikeScheduleConflict(directive)) {
      return Promise.resolve({ type: 'document', title: cleanTitle(directive.directive), content: embeddedContext.trim() });
    }

    return generateViaAnthropic('write_document', directive, buildDocumentSystemPrompt(directive, rawContext), buildDocumentUserPrompt(directive, rawContext), rawContext);
  }

  if (directive.action_type === 'send_message') {
    const embedded = (directive as ConvictionDirective & { embeddedArtifact?: Record<string, unknown> }).embeddedArtifact;
    if (embedded) {
      try {
        return Promise.resolve(validateArtifact('send_message', embedded, directive));
      } catch {
        // fall through
      }
    }

    const { system, user } = buildSendMessagePrompt(directive);
    return generateViaAnthropic('send_message', directive, system, user, rawContext);
  }

  return Promise.resolve(null);
}

export { generateArtifact, getSendMessageRecipientGroundingIssues, getArtifactPersistenceIssues };
