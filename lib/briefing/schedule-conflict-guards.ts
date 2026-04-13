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
  const top = directive.generationLog?.candidateDiscovery?.topCandidates?.[0];
  const id = typeof top?.id === 'string' ? top.id : '';
  if (id.startsWith('discrepancy_conflict_')) return true;
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
  // Salutation-led outbound lines (not section headers)
  if (/(?:^|\n)\s*(?:Hi|Hello|Hey|Dear)\s+[A-Za-z][^\n]{0,40}[—–-]\s*I\b/m.test(b)) return true;
  return false;
}

/**
 * Minimum structure for a believable calendar-conflict resolution note (grounded decision doc).
 * Fails closed when the body looks like a message or lacks enough structure.
 */
export function scheduleConflictArtifactHasResolutionShape(artifactBody: string): boolean {
  if (scheduleConflictArtifactIsMessageShaped(artifactBody)) return false;
  const lower = artifactBody.toLowerCase();
  const signals = [
    /(?:^|\n)#+\s*(issue|situation|context)\b/im.test(artifactBody) ||
      /^\s*\*\*(issue|situation)\b/im.test(artifactBody),
    /conflict|overlap|double[- ]book|both (events|commitments|blocks)|same (window|slot|time)/i.test(
      lower,
    ),
    /recommend|decision|resolve|priorit|trade[-‐‑–—]?\s*off|which (event|meeting|block|slot)/i.test(
      lower,
    ),
    /owner|next step|accountable|responsible|your call|you (?:confirm|choose|decide)/i.test(lower),
    /\d{4}-\d{2}-\d{2}|\bdeadline\b|\bby (?:eod|cob|monday|friday|tomorrow|tonight|end of day)\b/i.test(
      lower,
    ),
  ];
  return signals.filter(Boolean).length >= 4;
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
