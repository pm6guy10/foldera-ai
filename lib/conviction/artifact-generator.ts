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
