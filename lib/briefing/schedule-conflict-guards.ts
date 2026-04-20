import type { ConvictionDirective } from './types';
import { effectiveDiscrepancyClassForGates } from './effective-discrepancy-class';

/**
 * True when this directive is a calendar double-booking winner even if `discrepancyClass`
 * or discovery metadata was dropped before artifact generation (production leak path).
 */
export function directiveLooksLikeScheduleConflict(directive: ConvictionDirective): boolean {
  if (effectiveDiscrepancyClassForGates(directive) === 'schedule_conflict') return true;
  const haystack = `${directive.directive}\n${directive.reason ?? ''}`.toLowerCase();
  if (/\boverlapping events on \d{4}-\d{2}-\d{2}\b/.test(haystack)) return true;
  if (/\boverlapping calendar commitments\b/.test(haystack)) return true;
  const topCandidates = directive.generationLog?.candidateDiscovery?.topCandidates ?? [];
  if (topCandidates.length === 1) {
    const top = topCandidates[0];
    const id = typeof top?.id === 'string' ? top.id : '';
    if (id.startsWith('discrepancy_conflict_')) return true;
  }
  return false;
}

/**
 * Outbound-email / chat disguised as a document — not acceptable for schedule_conflict
 * write_document (use a decision/resolution note for the calendar owner instead).
 */
export function scheduleConflictArtifactIsMessageShaped(artifactBody: string): boolean {
  const b = artifactBody;
  if (/\bMESSAGE TO\b/i.test(b)) return true;
  if (/^\s*(?:to|TO)\s*:\s*\S/m.test(b)) return true;
  if (/\n(?:to|TO)\s+[A-Z][a-z]+\s*\((?:SMS|text|email|chat)\)/i.test(b)) return true;
  if (/\bsubject\s*:\s*.+/i.test(b) && /\b(dear|hi|hello)\b/i.test(b)) return true;
  if (/(?:^|\n)\s*(?:Hi|Hello|Hey|Dear)\s+[A-Z][^\n]{0,60},/m.test(b)) return true;
  if (/(?:^|\n)\s*To\s+[A-Z][^\n]{0,60}$/m.test(b)) return true;
  if (/(?:^|\n)\s*(?:Thanks|Best|Regards|Sincerely|Cheers)\s*[,\-–—]/m.test(b)) return true;
  // Salutation-led outbound lines (not section headers)
  if (/(?:^|\n)\s*(?:Hi|Hello|Hey|Dear)\s+[A-Za-z][^\n]{0,40}[—–-]\s*I\b/m.test(b)) return true;
  return false;
}

const SCHEDULE_CONFLICT_SECTION_PATTERNS = {
  situation: [/^##\s*Situation\s*$/im],
  conflict: [/^##\s*(Conflicting commitments or risk|Conflict|Risk)\s*$/im],
  recommendation: [/^##\s*(Recommendation\s*\/\s*decision|Recommendation|Decision)\s*$/im],
  owner: [/^##\s*(Owner\s*\/\s*next step|Owner|Next step|Next steps)\s*$/im],
  timing: [/^##\s*(Timing\s*\/\s*deadline|Timing|Deadline)\s*$/im],
};

function hasRequiredSections(artifactBody: string): boolean {
  return Object.values(SCHEDULE_CONFLICT_SECTION_PATTERNS).every((patterns) =>
    patterns.some((pattern) => pattern.test(artifactBody)),
  );
}

/**
 * Minimum structure for a believable calendar-conflict resolution note (grounded decision doc).
 * Fails closed when the body looks like a message or lacks enough structure.
 */
export function scheduleConflictArtifactHasResolutionShape(artifactBody: string): boolean {
  if (scheduleConflictArtifactIsMessageShaped(artifactBody)) return false;
  if (!hasRequiredSections(artifactBody)) return false;

  const lower = artifactBody.toLowerCase();
  const hasTimingAnchor =
    /\d{4}-\d{2}-\d{2}|\bdeadline\b|\bby (?:eod|cob|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|tonight|end of day)\b/i.test(
      lower,
    );
  return hasTimingAnchor;
}

/**
 * schedule_conflict write_document must be a grounded resolution/decision note — not
 * owner-facing chore checklists, planning memo scaffolds, or outbound message copy.
 */
export function scheduleConflictArtifactIsOwnerProcedure(artifactBody: string): boolean {
  const b = artifactBody;
  // Numbered owner steps: "1." / "1)" / "1]" at line start
  if (/(?:^|\n)\s*\d+[\).\]]\s+/m.test(b)) return true;
  if (/^\s*\d+\.\s/m.test(b)) return true;

  const ownerInstruction =
    /\bopen (your )?calendar\b|\bclick (the )?event\b|\bupdate the (lower-priority )?event\b|\bdecline the (other )?event\b|\breschedule the (other )?event\b|\bdecide which\b|\bwithin \d+ (minute|hour)\b|\bstep \d\b|\bblock \d+\b|\bgo to your calendar\b|\bcheck your schedule\b/i;

  if (ownerInstruction.test(b)) return true;

  // Discrepancy-detector / memo language that asks the owner to plan — not sendable work
  if (/\bwhich takes priority\b/i.test(b)) return true;
  if (/\bhow will you communicate\b/i.test(b)) return true;

  // Planning / memo scaffolding for the calendar owner (not outbound copy)
  if (/\bexecution notes:/i.test(b) || /\bhere'?s what you (should|need to)\b/i.test(b)) return true;
  if (/\bobjective:/i.test(b) && /\bexecution notes:/i.test(b)) return true;

  return false;
}
