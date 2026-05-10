import type { GenerationCandidateSource, ActionType } from './types';

type CandidateTriggerShape = {
  baseline_state?: string | null;
  current_state?: string | null;
  delta?: string | null;
  why_now?: string | null;
} | null | undefined;

export interface LowValueEventInviteInput {
  title: string;
  content: string;
  suggestedActionType: ActionType;
  matchedGoalText?: string | null;
  relatedSignals?: string[];
  sourceSignals?: GenerationCandidateSource[];
  relationshipContext?: string | null;
  entityName?: string | null;
  trigger?: CandidateTriggerShape;
}

export interface LowValueEventInviteAssessment {
  isEventInvite: boolean;
  isLowValueInvite: boolean;
  hasDirectDependency: boolean;
  hasExplicitIntentOrAcceptance: boolean;
  hasProtectedConsequence: boolean;
  contextSmart: boolean;
  changesNextMove: boolean;
  sourceAuthority: 'trusted_or_operational' | 'spam_or_promotional' | 'unknown_or_mixed';
  shouldSuppressSilently: boolean;
  suppressionReceipt: {
    reason: 'low_authority_event_invite';
    source_authority: 'spam_or_promotional';
    user_visible: false;
    action_taken: 'suppressed_or_archived_if_allowed';
  } | null;
  reason: string | null;
}

const EVENT_INVITE_RE =
  /\b(?:webinar|virtual event|conference|summit|workshop|developer platform|platform event|platform update|info session|event invite|invitation|save your seat|join us for)\b/i;
const EVENT_ACTION_RE =
  /\b(?:attend|decline|rsvp|register|register now|save your seat|join us|accepted invite|confirmed attendance)\b/i;
const PROTECTED_ADMIN_RE =
  /\b(?:interview|phone screen|panel|recruiter|hiring|offer|benefit|benefits|coverage|claim|appeal|legal|court|hearing|invoice|payment|overpayment|waiver|medical|health|doctor|therapy|treatment|surgery|account access|password reset|mfa|security alert|identity verification)\b/i;
const DIRECT_DEPENDENCY_VERB_RE =
  /\b(?:depends on|dependent on|blocked by|blocking|unlocks?|required for|needed for|prerequisite for|before (?:we|you|the team) can|product decision depends|roadmap decision depends|customer decision depends)\b/i;
const DIRECT_DEPENDENCY_OBJECT_RE =
  /\b(?:customer|client|revenue|paid user|sale|sales|contract|proposal|integration|api|migration|roadmap|launch|ship|shipping|release|implementation|product decision|roadmap decision)\b/i;
const EXPLICIT_INTENT_RE =
  /\b(?:plan to attend|will attend|going to attend|want to attend|accepted invite|invite accepted|rsvp(?:'d)? yes|tentatively accepted|already registered|registered already|confirmed attendance|already on (?:the )?calendar|calendar hold confirmed)\b/i;
const NEGATIVE_CALENDAR_GAP_RE =
  /\b(?:no matching calendar block|no calendar block|rsvp still pending|invite still pending|keyword overlap with commitment was only 0)\b/i;
const PROMOTIONAL_EVENT_RE =
  /\b(?:newsletter|promotional|promotion|community update|platform update|platform event|developer platform|event invite|invitation|virtual event|save your seat|register now|join us for|watch the replay|recording available|unsubscribe|manage subscriptions|marketing)\b/i;
const PROMOTIONAL_SENDER_RE =
  /\b(?:notify|notifications?|newsletter|newsletters|updates?|mailer|marketing|promotions?|events?|community|hello|team|noreply|no-reply|donotreply)@[a-z0-9.-]+\.[a-z]{2,}\b/i;
const SPAM_FOLDER_RE =
  /\b(?:spam|junk|promotions?|promotional tab|bulk mail|newsletter tab)\b/i;

function compactText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function buildContextText(input: LowValueEventInviteInput): string {
  return [
    input.title,
    input.content,
    input.relationshipContext ?? '',
    input.entityName ?? '',
    ...(input.relatedSignals ?? []),
    ...(input.sourceSignals ?? []).map((signal) =>
      [signal.summary, signal.source, signal.occurredAt].filter(Boolean).join(' '),
    ),
    input.trigger?.baseline_state ?? '',
    input.trigger?.current_state ?? '',
    input.trigger?.delta ?? '',
    input.trigger?.why_now ?? '',
  ]
    .map(compactText)
    .join(' ');
}

export function assessLowValueEventInvite(input: LowValueEventInviteInput): LowValueEventInviteAssessment {
  const contextText = buildContextText(input);
  const goalText = compactText(input.matchedGoalText);
  const combined = `${contextText} ${goalText}`.trim();

  const looksLikeEventInvite =
    (EVENT_INVITE_RE.test(combined) || (EVENT_ACTION_RE.test(combined) && /\b(?:event|webinar|conference|workshop|platform|session|summit|invite|invitation)\b/i.test(combined)))
    && !/\b(?:interview|phone screen|panel interview|medical appointment|court hearing)\b/i.test(combined);

  if (!looksLikeEventInvite) {
    return {
      isEventInvite: false,
      isLowValueInvite: false,
      hasDirectDependency: false,
      hasExplicitIntentOrAcceptance: false,
      hasProtectedConsequence: false,
      contextSmart: false,
      changesNextMove: false,
      sourceAuthority: 'unknown_or_mixed',
      shouldSuppressSilently: false,
      suppressionReceipt: null,
      reason: null,
    };
  }

  const hasProtectedConsequence = PROTECTED_ADMIN_RE.test(combined);
  const hasExplicitIntentOrAcceptance =
    !NEGATIVE_CALENDAR_GAP_RE.test(combined) && EXPLICIT_INTENT_RE.test(combined);
  const hasDirectDependency =
    DIRECT_DEPENDENCY_VERB_RE.test(contextText) && DIRECT_DEPENDENCY_OBJECT_RE.test(`${contextText} ${goalText}`);
  const contextSmart = goalText.trim().length > 0 || compactText(input.relationshipContext).trim().length > 0;
  const changesNextMove =
    hasProtectedConsequence ||
    hasExplicitIntentOrAcceptance ||
    hasDirectDependency;
  const sourceAuthority: LowValueEventInviteAssessment['sourceAuthority'] =
    PROMOTIONAL_EVENT_RE.test(combined) || PROMOTIONAL_SENDER_RE.test(combined) || SPAM_FOLDER_RE.test(combined)
      ? 'spam_or_promotional'
      : /\b(?:invoice|payment|benefit|claim|appeal|deadline|interview|recruiter|manager|client|customer|contract|proposal|approval|security alert)\b/i.test(combined)
        ? 'trusted_or_operational'
        : 'unknown_or_mixed';
  const isLowValueInvite =
    looksLikeEventInvite &&
    !hasProtectedConsequence &&
    !hasExplicitIntentOrAcceptance &&
    !hasDirectDependency;
  const shouldSuppressSilently =
    isLowValueInvite &&
    !changesNextMove &&
    sourceAuthority === 'spam_or_promotional';

  return {
    isEventInvite: looksLikeEventInvite,
    isLowValueInvite,
    hasDirectDependency,
    hasExplicitIntentOrAcceptance,
    hasProtectedConsequence,
    contextSmart,
    changesNextMove,
    sourceAuthority,
    shouldSuppressSilently,
    suppressionReceipt: shouldSuppressSilently
      ? {
          reason: 'low_authority_event_invite',
          source_authority: 'spam_or_promotional',
          user_visible: false,
          action_taken: 'suppressed_or_archived_if_allowed',
        }
      : null,
    reason: isLowValueInvite ? 'low_value_event_invite_without_dependency' : null,
  };
}
