import type { ScoredLoop } from './scorer';
import type { ActionType } from './types';
import { assessLowValueEventInvite } from './low-value-event-invite';

export type ArtifactTasteFamily =
  | 'interview_role_fit_packet'
  | 'admin_deadline_decision_packet'
  | 'calendar_conflict_brief'
  | 'review_only_follow_up_draft'
  | 'relationship_risk_silence'
  | 'other_grounded_artifact';

export type PositiveWinnerTier = 'tier_1' | 'tier_2' | 'tier_3' | 'tier_4';

export interface ArtifactTasteExample {
  id: string;
  family: ArtifactTasteFamily;
  polarity: 'good' | 'bad';
  label: string;
  teaches: string;
  failureClass?: string;
}

export interface ArtifactTasteSelection {
  family: ArtifactTasteFamily;
  good: ArtifactTasteExample[];
  bad: ArtifactTasteExample[];
  promptGuidance: string;
}

export interface CandidateArtifactabilityReceipt {
  candidate_id: string;
  title: string;
  action_type: ActionType;
  artifact_family: ArtifactTasteFamily;
  tier: PositiveWinnerTier;
  artifactable: boolean;
  required_fields: string[];
  source_fact_count: number;
  source_facts: string[];
  newest_source_at: string | null;
  currentness_days: number | null;
  blockers: string[];
  model_risk_flags: string[];
  taste_family_match: ArtifactTasteFamily;
}

export interface PositiveWinnerContractReceipt {
  selected_candidate_id: string | null;
  selected_tier: PositiveWinnerTier | null;
  selected_family: ArtifactTasteFamily | null;
  viable_tier_1_or_2_count: number;
  tier_3_blocked_by_positive_candidate: boolean;
  verdict: 'positive_candidate_selected' | 'no_viable_positive_candidate' | 'all_candidates_blocked';
  reason: string;
}

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const COMMAND_CENTER_RE =
  /\b(interview|phone screen|panel|recruitment|role[-\s]?fit|job|offer|reference|background check|cwu|esb|mas3|meds|providerone|hca|dshs|calendar|conflict|overlap|deadline|payment|benefit|benefits|claim|appeal|admin|invoice|forms?|document|packet)\b/i;
const INTERVIEW_RE =
  /\b(interview|phone screen|panel|screening|recruitment|role[-\s]?fit|job[-\s]?fit|cwu|esb|mas3|meds|providerone|hca|dshs|webex|care coordinator|benefits technician)\b/i;
const ADMIN_RE =
  /\b(deadline|payment|benefit|benefits|admin|notice|appeal|claim|invoice|waiver|permit|forms?|paperwork|documents?|decision packet|due\b|cutoff)\b/i;
const CALENDAR_RE =
  /\b(calendar|conflict|overlap|double[-\s]?book|reschedul|schedule|slot|same window|time block|availability)\b/i;
const RELATIONSHIP_SILENCE_RE =
  /\b(relationship risk|relationship status|silence|silent|decay|reconnect|gone quiet|not replied|no reply|has not replied|days? since|fading connection)\b/i;
const GENERIC_PREP_RE =
  /\b(generic|prepare|prep checklist|practice|star answers?|star framework|review (?:the )?(?:website|notes)|questions to ask|dress code|keep an eye|monitor inbox|checking in)\b/i;
const TRANSACTIONAL_SENDER_RE =
  /\b(?:onboarding|no[-_]?reply|noreply|notification|notifications|support|alerts?|updates?)@(?:resend\.dev|resend\.com|accounts\.google\.com|microsoft\.com|stripe\.com|github\.com|linkedin\.com|slack\.com)\b/i;
const STALE_STATUS_WITHOUT_ARTIFACT_RE =
  /\b(no activity since|silent \d+ days?|last seen \d+ days?|stopped|fading connection|relationship at risk|\b\d+\s+days ago\b|30[–-]90d ago)\b/i;
const CURRENT_ARTIFACT_ANCHOR_RE =
  /\b(due in \d+d|due today|due tomorrow|deadline closing|today|tomorrow|this week|scheduled|calendar|conflict|overlap|by end of day|2026-05-(?:0[5-9]|[12]\d|3[01]))\b/i;

export const ARTIFACT_TASTE_EXAMPLES: ArtifactTasteExample[] = [
  {
    id: 'good_es_benefits_role_fit_packet',
    family: 'interview_role_fit_packet',
    polarity: 'good',
    label: 'Finished role-fit packet',
    teaches:
      'Turn interview, recruitment, resume, and system facts into a finished answer Brandon can use as-is.',
  },
  {
    id: 'good_providerone_accuracy_answer',
    family: 'interview_role_fit_packet',
    polarity: 'good',
    label: 'Grounded ProviderOne answer',
    teaches:
      'Use source facts to produce a concrete first-person answer without inventing unproven system experience.',
  },
  {
    id: 'good_chc_bridge_decision',
    family: 'admin_deadline_decision_packet',
    polarity: 'good',
    label: 'Decision brief with next action',
    teaches:
      'Name the decision, criterion, trigger, and next action when admin/job options compete for time.',
  },
  {
    id: 'good_schedule_conflict_resolution_message',
    family: 'calendar_conflict_brief',
    polarity: 'good',
    label: 'Specific conflict resolution',
    teaches:
      'Use concrete calendar facts to resolve an overlap with exact options, not a reminder.',
  },
  {
    id: 'good_reference_prebrief_don',
    family: 'review_only_follow_up_draft',
    polarity: 'good',
    label: 'Grounded follow-up draft',
    teaches:
      'Draft only when the recipient, thread, and ask are grounded by source facts.',
  },
  {
    id: 'bad_interview_star_homework_packet',
    family: 'interview_role_fit_packet',
    polarity: 'bad',
    label: 'STAR homework instead of finished work',
    teaches:
      'Avoid prep checklists, research reminders, and generic coaching when the artifact should be usable today.',
    failureClass: 'generic_coaching',
  },
  {
    id: 'bad_resend_onboarding_decision_pressure',
    family: 'relationship_risk_silence',
    polarity: 'bad',
    label: 'Transactional sender pretending to be a relationship',
    teaches:
      'Do not turn onboarding, notification, or transactional senders into relationship-risk decision pressure.',
    failureClass: 'transactional_sender_decision_pressure',
  },
  {
    id: 'bad_tomorrow_reminder',
    family: 'calendar_conflict_brief',
    polarity: 'bad',
    label: 'Reminder-only artifact',
    teaches:
      'A stale or obvious reminder is not a command-center artifact.',
    failureClass: 'reminder_only',
  },
  {
    id: 'bad_generic_follow_up_darlene',
    family: 'review_only_follow_up_draft',
    polarity: 'bad',
    label: 'Generic check-in',
    teaches:
      'A follow-up must have a concrete grounded ask, not only checking in.',
    failureClass: 'only_follow_up_check_in_or_monitor',
  },
  {
    id: 'bad_vague_risk',
    family: 'other_grounded_artifact',
    polarity: 'bad',
    label: 'Vague risk note',
    teaches:
      'Do not select risk/silence when it cannot name a decision, deadline, or artifact-worthy output.',
    failureClass: 'no_concrete_outcome',
  },
];

function compactText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function candidateTasteSearchText(candidate: ScoredLoop): string {
  return [
    candidate.title,
    candidate.content,
    candidate.relationshipContext ?? '',
    candidate.entityName ?? '',
    candidate.discrepancyClass ?? '',
    candidate.matchedGoal?.text ?? '',
    ...(candidate.relatedSignals ?? []),
    ...(candidate.sourceSignals ?? []).map((signal) =>
      [signal.summary, signal.source, signal.occurredAt].filter(Boolean).join(' '),
    ),
    candidate.trigger?.baseline_state ?? '',
    candidate.trigger?.current_state ?? '',
    candidate.trigger?.delta ?? '',
    candidate.trigger?.why_now ?? '',
  ].map(compactText).join(' ');
}

export function inferArtifactTasteFamily(input: {
  actionType: ActionType;
  title?: string;
  content?: string;
  text?: string;
}): ArtifactTasteFamily {
  const text = [input.title ?? '', input.content ?? '', input.text ?? ''].join(' ');
  if (INTERVIEW_RE.test(text)) return 'interview_role_fit_packet';
  if (CALENDAR_RE.test(text)) return 'calendar_conflict_brief';
  if (ADMIN_RE.test(text)) return 'admin_deadline_decision_packet';
  if (RELATIONSHIP_SILENCE_RE.test(text)) return 'relationship_risk_silence';
  if (input.actionType === 'send_message') return 'review_only_follow_up_draft';
  return 'other_grounded_artifact';
}

export function selectArtifactTasteExamples(input: {
  actionType: ActionType;
  title?: string;
  content?: string;
  text?: string;
}): ArtifactTasteSelection {
  const family = inferArtifactTasteFamily(input);
  const good = ARTIFACT_TASTE_EXAMPLES
    .filter((example) => example.polarity === 'good' && example.family === family)
    .slice(0, 2);
  const bad = ARTIFACT_TASTE_EXAMPLES
    .filter((example) => example.polarity === 'bad' && (example.family === family || example.family === 'relationship_risk_silence'))
    .slice(0, 2);
  const fallbackGood = ARTIFACT_TASTE_EXAMPLES
    .filter((example) => example.polarity === 'good' && example.family === 'admin_deadline_decision_packet')
    .slice(0, 1);
  const fallbackBad = ARTIFACT_TASTE_EXAMPLES
    .filter((example) => example.polarity === 'bad' && example.family === 'other_grounded_artifact')
    .slice(0, 1);
  const selectedGood = good.length > 0 ? good : fallbackGood;
  const selectedBad = bad.length > 0 ? bad : fallbackBad;

  return {
    family,
    good: selectedGood,
    bad: selectedBad,
    promptGuidance: formatTasteRailsForPrompt({
      family,
      good: selectedGood,
      bad: selectedBad,
    }),
  };
}

export function formatTasteRailsForPrompt(input: {
  family: ArtifactTasteFamily;
  good: ArtifactTasteExample[];
  bad: ArtifactTasteExample[];
}): string {
  const goodLines = input.good.map((example) => `GOOD ${example.id}: ${example.teaches}`);
  const badLines = input.bad.map((example) => `BAD ${example.id}: ${example.teaches}`);
  return [
    `ARTIFACT_TASTE_RAILS (${input.family})`,
    ...goodLines,
    ...badLines,
    'Use these as taste rails, not templates. Do not copy literal names, dates, emails, titles, recruitment numbers, or wording from examples.',
    'The output must be finished work grounded in this candidate\'s source facts.',
  ].join('\n');
}

function sourceFactsFor(candidate: ScoredLoop): string[] {
  const seen = new Set<string>();
  const facts = [
    ...(candidate.sourceSignals ?? []).map((signal) =>
      [signal.summary, signal.source].filter(Boolean).join(' - '),
    ),
    ...(candidate.relatedSignals ?? []),
    candidate.matchedGoal?.text ?? '',
    candidate.relationshipContext ?? '',
  ]
    .map((fact) => fact.trim())
    .filter(Boolean)
    .filter((fact) => {
      const normalized = fact.toLowerCase().replace(/\s+/g, ' ').trim();
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
  return facts.slice(0, 8);
}

function requiredFieldsFor(family: ArtifactTasteFamily, actionType: ActionType): string[] {
  if (family === 'interview_role_fit_packet') {
    return ['current interview/job anchor', 'role/system facts', 'finished answer or decision language'];
  }
  if (family === 'admin_deadline_decision_packet') {
    return ['decision/deadline', 'stakes', 'next action'];
  }
  if (family === 'calendar_conflict_brief') {
    return ['conflicting event or slot', 'time window', 'resolution option'];
  }
  if (actionType === 'send_message' || family === 'review_only_follow_up_draft') {
    return ['grounded recipient', 'thread context', 'specific ask'];
  }
  return ['source facts', 'concrete output shape'];
}

function newestSourceDate(candidate: ScoredLoop): { iso: string | null; ageDays: number | null } {
  const signalDates = (candidate.sourceSignals ?? [])
    .map((signal) => signal.occurredAt)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter((value) => !Number.isNaN(value));
  if (signalDates.length === 0) {
    return { iso: null, ageDays: null };
  }
  const newest = Math.max(...signalDates);
  return {
    iso: new Date(newest).toISOString(),
    ageDays: Math.floor((Date.now() - newest) / (1000 * 60 * 60 * 24)),
  };
}

function tierFor(family: ArtifactTasteFamily, sourceFactCount: number): PositiveWinnerTier {
  if (
    family === 'interview_role_fit_packet' ||
    family === 'admin_deadline_decision_packet' ||
    family === 'calendar_conflict_brief'
  ) {
    return 'tier_1';
  }
  if (family === 'review_only_follow_up_draft') return 'tier_2';
  if (family === 'relationship_risk_silence') return 'tier_3';
  return sourceFactCount > 0 ? 'tier_2' : 'tier_4';
}

export function evaluateCandidateArtifactability(
  candidate: ScoredLoop,
  options: { now?: Date } = {},
): CandidateArtifactabilityReceipt {
  const searchText = candidateTasteSearchText(candidate);
  const taste = selectArtifactTasteExamples({
    actionType: candidate.suggestedActionType,
    title: candidate.title,
    content: candidate.content,
    text: searchText,
  });
  const facts = sourceFactsFor(candidate);
  const currentness = newestSourceDate(candidate);
  const nowMs = options.now?.getTime() ?? Date.now();
  const currentnessDays = currentness.iso
    ? Math.floor((nowMs - new Date(currentness.iso).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const requiredFields = requiredFieldsFor(taste.family, candidate.suggestedActionType);
  const blockers: string[] = [];
  const modelRiskFlags: string[] = [];
  const emailHits = searchText.match(EMAIL_RE) ?? [];
  const lowValueEventInvite = assessLowValueEventInvite({
    title: candidate.title,
    content: candidate.content,
    suggestedActionType: candidate.suggestedActionType,
    matchedGoalText: candidate.matchedGoal?.text ?? null,
    relatedSignals: candidate.relatedSignals ?? [],
    sourceSignals: candidate.sourceSignals ?? [],
    relationshipContext: candidate.relationshipContext ?? null,
    entityName: candidate.entityName ?? null,
    trigger: candidate.trigger,
  });

  if (facts.length === 0) blockers.push('missing_source_facts');
  if (lowValueEventInvite.reason) blockers.push(lowValueEventInvite.reason);
  if (TRANSACTIONAL_SENDER_RE.test(searchText)) blockers.push('transactional_sender_candidate');
  if (taste.family === 'relationship_risk_silence' && !COMMAND_CENTER_RE.test(searchText)) {
    blockers.push('relationship_silence_without_command_center_artifact');
  }
  if (candidate.suggestedActionType === 'send_message' && emailHits.length === 0) {
    blockers.push('missing_grounded_recipient_for_send_message');
  }
  if (typeof currentnessDays === 'number' && currentnessDays > 14) {
    blockers.push('stale_evidence_over_14d');
  }
  if (
    (tierFor(taste.family, facts.length) === 'tier_1' || tierFor(taste.family, facts.length) === 'tier_2') &&
    currentnessDays == null &&
    STALE_STATUS_WITHOUT_ARTIFACT_RE.test(searchText) &&
    !CURRENT_ARTIFACT_ANCHOR_RE.test(searchText)
  ) {
    blockers.push('stale_status_without_current_artifact_facts');
  }
  if (GENERIC_PREP_RE.test(searchText)) {
    blockers.push('generic_prep_shape_risk');
    modelRiskFlags.push('generic_prep_shape_risk');
  }
  if (
    taste.family === 'other_grounded_artifact' &&
    currentnessDays == null &&
    !CURRENT_ARTIFACT_ANCHOR_RE.test(searchText)
  ) {
    blockers.push('missing_current_artifact_anchor');
  }
  if (taste.family === 'interview_role_fit_packet' && facts.length < 2) {
    blockers.push('missing_role_fit_source_bundle');
  }
  if (
    taste.family === 'calendar_conflict_brief' &&
    /\bno matching calendar block\b/i.test(searchText) &&
    /\bkeyword overlap\b[\s\S]{0,40}\bonly 0\b/i.test(searchText)
  ) {
    blockers.push('missing_schedule_resolution_context');
  }

  const tier = tierFor(taste.family, facts.length);
  const artifactable = blockers.length === 0 && tier !== 'tier_4';

  return {
    candidate_id: candidate.id,
    title: candidate.title,
    action_type: candidate.suggestedActionType,
    artifact_family: taste.family,
    tier,
    artifactable,
    required_fields: requiredFields,
    source_fact_count: facts.length,
    source_facts: facts,
    newest_source_at: currentness.iso,
    currentness_days: currentnessDays,
    blockers,
    model_risk_flags: modelRiskFlags,
    taste_family_match: taste.family,
  };
}
