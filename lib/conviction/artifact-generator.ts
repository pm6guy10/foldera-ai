import type { ConvictionArtifact, ConvictionDirective, DocumentArtifact } from '@/lib/briefing/types';
import {
  generateArtifact as generateArtifactCompat,
  getSendMessageRecipientGroundingIssues,
  getArtifactPersistenceIssues,
} from './artifact-generator-compat';

type GoalCandidate = {
  text: string;
  score: number;
  source: 'active_goal' | 'matched_goal' | 'context_goal';
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function cleanText(value: string): string {
  return normalizeText(value).replace(/[.!?]+$/, '').trim();
}

function isGenericGoalText(value: string): boolean {
  const text = cleanText(value).toLowerCase();
  if (!text || text.length < 6) return true;
  if (/^[\d\s]+$/.test(text)) return true;
  return [
    /^(?:goal|objective|priority|progress|next step|follow up|follow-up|thread|decision|update|status)$/i,
    /^(?:make progress|move things forward|touch base|circle back|reconnect|catch up|check in)$/i,
    /^(?:something|anything|it|this|that|them|him|her)$/i,
  ].some((pattern) => pattern.test(text));
}

function parseBehavioralPatternFacts(text: string): {
  entityName?: string;
  count?: string;
  window?: string;
} {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const patterns: Array<{ pattern: RegExp; entityIndex: number; countIndex: number; windowIndex: number }> = [
    { pattern: /^(.+?)\s+has not replied after\s+(\d+)\s+messages?\s+in\s+(\d+\s+\w+)/i, entityIndex: 1, countIndex: 2, windowIndex: 3 },
    { pattern: /^(\d+)\s+(?:inbound\s+)?messages?\s+(?:to|for)\s+(.+?)\s+in\s+(\d+\s+\w+)(?:,?\s*\d+\s+replies?)?/i, entityIndex: 2, countIndex: 1, windowIndex: 3 },
    { pattern: /^(\d+)\s+unresolved\s+follow-?ups?\s+(?:to|for)\s+(.+?)\s+in\s+(\d+\s+\w+)(?:,?\s*\d+\s+replies?)?/i, entityIndex: 2, countIndex: 1, windowIndex: 3 },
    { pattern: /^(.+?)\s+after\s+(\d+)\s+(?:inbound\s+)?messages?\s+in\s+(\d+\s+\w+)/i, entityIndex: 1, countIndex: 2, windowIndex: 3 },
  ];

  for (const { pattern, entityIndex, countIndex, windowIndex } of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const entityName = match[entityIndex]?.trim().replace(/[.,;:!?]+$/, '');
    const count = match[countIndex]?.trim();
    const window = match[windowIndex]?.trim();
    if (entityName && count && window) {
      return { entityName, count, window };
    }
  }

  return {};
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

type InterviewWeekItem = {
  startIso: string;
  endIso: string;
  title: string;
  role: string;
  organization: string;
  focusNotes: string[];
  contacts: string[];
};

type InterviewWeekCluster = {
  windowStart: string;
  windowEnd: string;
  items: InterviewWeekItem[];
  exclusions: Array<{ startIso: string; title: string; reason: string }>;
};

function parseDelimitedFieldList(value: string): string[] {
  return value
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !/^no\b/i.test(part));
}

function parseInterviewWeekCluster(text: string): InterviewWeekCluster | null {
  if (!text.includes('INTERVIEW_WEEK_CLUSTER')) return null;

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const windowLine = lines.find((line) => line.startsWith('WINDOW_PT: '));
  if (!windowLine) return null;
  const [, rawWindow] = windowLine.split('WINDOW_PT: ');
  const [windowStart, windowEnd] = rawWindow.split(' || ').map((part) => part.trim());
  if (!windowStart || !windowEnd) return null;

  const items: InterviewWeekItem[] = [];
  const exclusions: Array<{ startIso: string; title: string; reason: string }> = [];

  for (const line of lines) {
    if (line.startsWith('INTERVIEW_ITEM:')) {
      const fields = line.replace(/^INTERVIEW_ITEM:\s*/, '').split(' || ').map((part) => part.trim());
      if (fields.length < 7) continue;
      items.push({
        startIso: fields[0],
        endIso: fields[1],
        title: fields[2],
        role: fields[3],
        organization: fields[4],
        focusNotes: parseDelimitedFieldList(fields[5]),
        contacts: parseDelimitedFieldList(fields[6]),
      });
    }
    if (line.startsWith('EXCLUDED_ITEM:')) {
      const fields = line.replace(/^EXCLUDED_ITEM:\s*/, '').split(' || ').map((part) => part.trim());
      if (fields.length < 3) continue;
      exclusions.push({
        startIso: fields[0],
        title: fields[1],
        reason: fields[2],
      });
    }
  }

  return items.length >= 2 ? { windowStart, windowEnd, items, exclusions } : null;
}

function formatPtDateRange(windowStart: string, windowEnd: string): string {
  const start = new Date(`${windowStart}T12:00:00Z`);
  const end = new Date(`${windowEnd}T12:00:00Z`);
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  const monthFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'long',
  });
  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    day: 'numeric',
  });
  const yearFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
  });
  const startMonth = monthFormatter.format(start);
  const endMonth = monthFormatter.format(end);
  const startDay = dayFormatter.format(start);
  const endDay = dayFormatter.format(end);
  const year = yearFormatter.format(end);
  return sameMonth
    ? `${startMonth} ${startDay}\u2013${endDay}, ${year}`
    : `${startMonth} ${startDay}\u2013${endMonth} ${endDay}, ${year}`;
}

function formatPtScheduleLine(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${dateFormatter.format(start)}, ${timeFormatter.format(start)}-${timeFormatter.format(end)} PT`;
}

function formatPtDateOnly(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));
}

function sentenceCaseTopic(topic: string): string {
  const cleaned = topic.trim().replace(/[.;:]+$/, '');
  if (!cleaned) return cleaned;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function buildInterviewWeekBattlePlanArtifact(cluster: InterviewWeekCluster): DocumentArtifact {
  const items = [...cluster.items].sort((a, b) => Date.parse(a.startIso) - Date.parse(b.startIso));
  const title = `Interview Week Battle Plan \u2014 ${formatPtDateRange(cluster.windowStart, cluster.windowEnd)}`;

  const frequency = new Map<string, number>();
  for (const item of items) {
    for (const note of item.focusNotes) {
      const key = note.toLowerCase();
      frequency.set(key, (frequency.get(key) ?? 0) + 1);
    }
  }
  const repeatedTopics = [...frequency.entries()]
    .filter(([, count]) => count >= 2)
    .map(([topic]) => topic);
  const storyTopics = repeatedTopics.length > 0
    ? repeatedTopics
    : items.flatMap((item) => item.focusNotes.map((note) => note.toLowerCase())).slice(0, 3);

  const masterSchedule = items.map((item) => {
    const noteText = item.focusNotes.length > 0
      ? ` Signals point to ${item.focusNotes.map(sentenceCaseTopic).join(', ')}.`
      : '';
    const contactText = item.contacts.length > 0
      ? ` Contact anchor: ${item.contacts.join(', ')}.`
      : '';
    return `- ${formatPtScheduleLine(item.startIso, item.endIso)} — ${item.title} (${item.organization}).${noteText}${contactText}`;
  });

  const priorityOrder = items.map((item, index) => {
    const roleAnchor = item.role !== 'unknown role' ? item.role : item.title;
    const focus = item.focusNotes[0] ? sentenceCaseTopic(item.focusNotes[0]) : 'the exact scope named in the signal';
    return `${index + 1}. ${roleAnchor} — ${focus} is the first story to lock before this slot because it is what the signal already named.`;
  });

  const coreStories = storyTopics.length > 0
    ? storyTopics.map((topic) => {
        const matching = items.filter((item) => item.focusNotes.some((note) => note.toLowerCase() === topic));
        const labels = matching.map((item) => item.role !== 'unknown role' ? item.role : item.title).join(', ');
        return `- ${sentenceCaseTopic(topic)} — reuse one tight story across ${labels}.`;
      })
    : items.map((item) => `- ${item.title} — keep one story tied directly to ${item.role !== 'unknown role' ? item.role : item.title}.`);

  const roleSpecificAngles = items.map((item) => {
    const angle = item.focusNotes.length > 0
      ? item.focusNotes.map(sentenceCaseTopic).join(', ')
      : `${item.role !== 'unknown role' ? item.role : item.title} decisions and execution`;
    return `- ${item.title}: stay on ${angle}; do not drift into generic public-sector filler.`;
  });

  const questionsToAsk = items.map((item) => {
    const focus = item.focusNotes.length > 0
      ? item.focusNotes.slice(0, 2).map(sentenceCaseTopic).join(' and ')
      : `${item.role !== 'unknown role' ? item.role : item.title} scope`;
    return `- ${item.title}: "What separates a strong first-90-days operator here on ${focus}?"`;
  });

  const firstItem = items[0];
  const prepTopics = storyTopics.slice(0, 2).map(sentenceCaseTopic).join(' and ');
  const todaysPrepPlan = [
    `- Rewrite your opening answer for ${firstItem.title} so it lands on ${prepTopics || 'the focus explicitly named in the signals'} in under 60 seconds.`,
    `- Tighten one reusable story that can travel across ${items.slice(0, 2).map((item) => item.title).join(' and ')} without changing the facts.`,
    `- Put the ${questionsToAsk.length > 0 ? 'role questions' : 'closing question'} in front of each slot now so you are not inventing them mid-week.`,
  ];

  const redFlags = [
    `- This week compresses ${items.length} interview signals into one artifact; treat it as one operating week, not isolated prep bursts.`,
    ...cluster.exclusions.map((item) => `- Excluded as ${item.reason}: ${item.title} (${formatPtDateOnly(item.startIso)}).`),
  ];

  const content = [
    'MASTER SCHEDULE',
    ...masterSchedule,
    '',
    'PRIORITY ORDER',
    ...priorityOrder,
    '',
    'CORE STORIES TO REUSE',
    ...coreStories,
    '',
    'ROLE-SPECIFIC ANGLES',
    ...roleSpecificAngles,
    '',
    'QUESTIONS TO ASK',
    ...questionsToAsk,
    '',
    'TODAY’S PREP PLAN',
    ...todaysPrepPlan,
    '',
    'RED FLAGS / CONFLICTS',
    ...redFlags,
  ].join('\n');

  return {
    type: 'document',
    title,
    content,
  };
}

function deriveGoalLabel(goalText: string): string {
  const normalized = cleanText(goalText);
  const contextualMatch = normalized.match(/(?:\bon\b|\babout\b|\baround\b|\bfor\b)\s+the\s+(.+)$/i);
  if (contextualMatch?.[1] && !isGenericGoalText(contextualMatch[1])) {
    return cleanText(contextualMatch[1]);
  }

  const shorterContextualMatch = normalized.match(/(?:\bon\b|\babout\b|\baround\b)\s+(.+)$/i);
  if (shorterContextualMatch?.[1] && !isGenericGoalText(shorterContextualMatch[1])) {
    return cleanText(shorterContextualMatch[1]);
  }

  return normalized;
}

function gatherBehavioralPatternGoalCandidates(directive: ConvictionDirective): GoalCandidate[] {
  const candidates: GoalCandidate[] = [];
  const generationLog = directive.generationLog;
  const activeGoals = generationLog?.brief_context_debug?.active_goals ?? [];

  for (const goal of activeGoals) {
    const text = cleanText(goal);
    if (!text || isGenericGoalText(text)) continue;
    candidates.push({
      text,
      score: 80 + Math.min(text.length, 120) / 10,
      source: 'active_goal',
    });
  }

  const discovery = generationLog?.candidateDiscovery;
  const topCandidates = discovery?.topCandidates ?? [];
  for (const candidate of topCandidates) {
    const goalText = candidate.targetGoal?.text;
    if (!isNonEmptyString(goalText)) continue;
    const text = cleanText(goalText);
    if (!text || isGenericGoalText(text)) continue;
    candidates.push({
      text,
      score: 90 + (candidate.targetGoal?.priority ?? 0) * 4 + Math.max(0, 3 - candidate.rank),
      source: 'matched_goal',
    });
  }

  const contextBlob = [
    directive.directive,
    directive.reason,
    directive.fullContext,
    generationLog?.reason,
    discovery?.selectionReason,
    ...topCandidates.map((candidate) => candidate.decisionReason),
  ]
    .filter(isNonEmptyString)
    .join('\n');

  const contextPatterns = [
    /(?:matched goal|active goal|goal|objective|target goal)\s*[:\-]\s*([^\n]+?)(?:[.!?]\s*|$)/i,
    /(?:trying to get|trying to move this thread toward|trying to move toward|working toward|aiming for)\s+([^\n.]+?)(?:[.!?]\s*|$)/i,
  ];
  for (const pattern of contextPatterns) {
    const match = contextBlob.match(pattern);
    const rawGoal = match?.[1] ? cleanText(match[1]) : '';
    if (!rawGoal || isGenericGoalText(rawGoal)) continue;
    candidates.push({
      text: rawGoal,
      score: 55,
      source: 'context_goal',
    });
  }

  return candidates;
}

function inferBehavioralPatternGoal(directive: ConvictionDirective): string | null {
  const candidates = gatherBehavioralPatternGoalCandidates(directive);
  if (candidates.length === 0) return null;

  const bestByText = new Map<string, GoalCandidate>();
  for (const candidate of candidates) {
    const key = candidate.text.toLowerCase();
    const existing = bestByText.get(key);
    if (!existing || candidate.score > existing.score || (candidate.score === existing.score && candidate.text.length > existing.text.length)) {
      bestByText.set(key, candidate);
    }
  }

  const ordered = [...bestByText.values()].sort((a, b) => b.score - a.score || b.text.length - a.text.length);
  const best = ordered[0];
  return best && !isGenericGoalText(best.text) ? best.text : null;
}

function buildBehavioralPatternArtifact(directive: ConvictionDirective): DocumentArtifact {
  const cluster = parseInterviewWeekCluster(
    [
      directive.directive,
      directive.reason ?? '',
      directive.fullContext ?? '',
    ].join('\n'),
  );
  if (cluster) {
    return buildInterviewWeekBattlePlanArtifact(cluster);
  }

  const rawContext =
    (directive as ConvictionDirective & { embeddedArtifact?: { context?: string } }).fullContext ??
    (directive as ConvictionDirective & { embeddedArtifact?: { context?: string } }).embeddedArtifact?.context ??
    directive.reason ??
    directive.directive;
  const signalText = [directive.directive, directive.reason ?? '', rawContext].filter(Boolean).join('\n');
  const parsedFacts = parseBehavioralPatternFacts(signalText);
  const entityName = parsedFacts.entityName ?? (cleanText(directive.directive) || 'thread');
  const count = parsedFacts.count ?? '1';
  const window = parsedFacts.window ?? '14 days';
  const salutation = entityName.split(/\s+/)[0] || entityName;
  const deadlineAnchor = extractDeadlineAnchor(signalText) ?? 'today';
  const inferredGoal = inferBehavioralPatternGoal(directive);
  const goalLabel = inferredGoal ? deriveGoalLabel(inferredGoal) : null;
  const title = goalLabel
    ? `${entityName} going dark is now blocking the ${goalLabel}`
    : `${entityName} going dark is now blocking the thread`;
  const intro = goalLabel
    ? `You were trying to get this thread to a real yes/no on the ${goalLabel}. ${count} follow-ups in ${window} without a reply means it is no longer active, just mentally open.`
    : `${count} follow-ups in ${window} without a reply means this thread is stalled, not active.`;
  const content = [
    intro,
    '',
    'Send this today:',
    '',
    `“Hey ${salutation} — I’ve followed up a few times and don’t want to keep this half-open if priorities have shifted. Is this something you still want to pursue, or should I close the loop on my side?”`,
    '',
    'If there is no reply after this, mark the thread stalled and stop allocating attention to it.',
    '',
    `Deadline: ${deadlineAnchor}`,
  ].join('\n');

  return {
    type: 'document',
    title,
    content,
  };
}

export async function generateArtifact(
  userId: string,
  directive: ConvictionDirective,
): Promise<ConvictionArtifact | null> {
  if (directive.action_type === 'write_document' && directive.discrepancyClass === 'behavioral_pattern') {
    return buildBehavioralPatternArtifact(directive);
  }

  return generateArtifactCompat(userId, directive);
}

export { getSendMessageRecipientGroundingIssues, getArtifactPersistenceIssues };
