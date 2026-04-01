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
 * schedule_conflict write_document must be finished outbound copy (messages to others),
 * or a concrete scheduling artifact — not owner-facing procedures, planning notes,
 * or numbered "go do this" instructions.
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
