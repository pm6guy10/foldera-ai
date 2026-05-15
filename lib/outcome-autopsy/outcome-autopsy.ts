import type { SupabaseClient } from '@supabase/supabase-js';

import { decryptWithStatus } from '@/lib/encryption';

export type SignalClassification =
  | 'positive_momentum'
  | 'negative_momentum'
  | 'risk_created'
  | 'risk_avoided'
  | 'conversion_signal'
  | 'outcome_confirmed';

export type AutopsyGoalRow = {
  id: string;
  goal_text: string;
  goal_category?: string | null;
  status?: string | null;
  priority?: number | null;
  confidence?: number | null;
  source?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type AutopsyActionRow = {
  id: string;
  directive_text: string;
  action_type?: string | null;
  status?: string | null;
  generated_at?: string | null;
  approved_at?: string | null;
  executed_at?: string | null;
  feedback_weight?: number | null;
  outcome_closed?: boolean | null;
  reason?: string | null;
  evidence?: unknown;
  execution_result?: Record<string, unknown> | null;
  artifact?: Record<string, unknown> | null;
};

export type AutopsyCommitmentRow = {
  id: string;
  description: string;
  category?: string | null;
  status?: string | null;
  made_at?: string | null;
  due_at?: string | null;
  source?: string | null;
  source_id?: string | null;
  source_context?: string | null;
  resolution?: Record<string, unknown> | null;
  risk_score?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type AutopsySignalRow = {
  id: string;
  source?: string | null;
  source_id?: string | null;
  type?: string | null;
  author?: string | null;
  recipients?: string[] | null;
  occurred_at?: string | null;
  created_at?: string | null;
  extracted_commitments?: string[] | null;
  extracted_entities?: string[] | null;
  outcome_label?: string | null;
  content?: string | null;
};

export type AutopsyFeedbackRow = {
  id: string;
  feedback_type?: string | null;
  was_accurate?: boolean | null;
  was_important?: boolean | null;
  user_action?: string | null;
  rating?: number | null;
  notes?: string | null;
  created_at?: string | null;
};

export type AutopsyPatternMetricRow = {
  id: string;
  pattern_hash?: string | null;
  category?: string | null;
  domain?: string | null;
  total_activations?: number | null;
  successful_outcomes?: number | null;
  failed_outcomes?: number | null;
};

export type AutopsyEntityRow = {
  id: string;
  name?: string | null;
  display_name?: string | null;
  primary_email?: string | null;
  company?: string | null;
  role?: string | null;
  total_interactions?: number | null;
  last_interaction?: string | null;
  trust_class?: string | null;
};

export type OutcomeAutopsyInput = {
  goals: AutopsyGoalRow[];
  actions: AutopsyActionRow[];
  commitments: AutopsyCommitmentRow[];
  signals: AutopsySignalRow[];
  feedback: AutopsyFeedbackRow[];
  patternMetrics: AutopsyPatternMetricRow[];
  entities: AutopsyEntityRow[];
};

export type OutcomeAutopsyTimelineItem = {
  id: string;
  kind: 'goal' | 'signal' | 'action' | 'commitment' | 'feedback' | 'pattern' | 'seed_context';
  occurred_at: string;
  title: string;
  detail: string;
  classifications: SignalClassification[];
  strength: 'strong_signal' | 'generic_event';
  source_ref: string;
};

export type OutcomeAutopsySignalSummary = {
  id: string;
  label: string;
  occurred_at: string;
  classification: SignalClassification;
  why_strong: string;
  source_ref: string;
};

export type OutcomeAutopsyActionSummary = {
  id: string;
  label: string;
  occurred_at: string;
  why_decisive: string;
};

export type OutcomeAutopsyDetail = {
  label: string;
  value: string;
};

export type OutcomeAutopsyEvidenceItem = {
  id: string;
  label: string;
  type: string;
  sensitivity: 'public' | 'personal_confidential' | 'third_party_sensitive' | 'synthetic_summary';
  strength: 'very_high' | 'high' | 'medium' | 'low';
  why_it_mattered: string;
  source_ref: string;
};

export type OutcomeAutopsyArtifact = {
  generated_at: string;
  source: 'stored_tkg_rows';
  query: string | null;
  gold_standard_seed?: {
    label: string;
    context_source: 'user_provided_seed_context';
    privacy_policy: string;
  };
  goal: {
    id: string | null;
    text: string;
    status: string;
  };
  final_outcome: string;
  outcome_details?: OutcomeAutopsyDetail[];
  causality: {
    label: 'Inferred, not proven' | 'Confirmed by user';
    explanation: string;
  };
  timeline: OutcomeAutopsyTimelineItem[];
  strongest_positive_signals: OutcomeAutopsySignalSummary[];
  strongest_risks: string[];
  decisive_actions: OutcomeAutopsyActionSummary[];
  high_signal_artifacts?: OutcomeAutopsyEvidenceItem[];
  evidence_vs_inference?: {
    proven: string[];
    inferred: string[];
    not_used_as_proof: string[];
  };
  what_worked: string[];
  what_to_repeat: string[];
  what_to_avoid_next_time: string[];
  future_roles_to_prioritize?: string[];
  future_roles_to_skip?: string[];
  generic_events: OutcomeAutopsySignalSummary[];
  reusable_playbook: {
    title: string;
    steps: string[];
  };
};

type BuildOptions = {
  query?: string | null;
  now?: string;
};

const DEFAULT_QUERY = 'CWU Access Specialist';
const NON_DECISIVE_ACTION_RE =
  /\b(nothing cleared the bar|no safe|output blocked|quality gate|do[_\s-]?nothing|skipped)\b/;
const STOP_WORDS = new Set([
  'and',
  'for',
  'the',
  'with',
  'role',
  'job',
  'work',
  'from',
  'that',
  'this',
  'into',
]);

function compact(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(compact).filter(Boolean).join(' ');
  if (typeof value === 'object') return Object.values(value).map(compact).filter(Boolean).join(' ');
  return '';
}

function normalize(value: unknown): string {
  return compact(value).toLowerCase();
}

function termsFor(query: string | null | undefined): string[] {
  return Array.from(
    new Set(
      normalize(query ?? DEFAULT_QUERY)
        .split(/[^a-z0-9]+/i)
        .map((term) => term.trim())
        .filter((term) => term.length > 2 && !STOP_WORDS.has(term)),
    ),
  );
}

type MatchContext = {
  query: string;
  terms: string[];
  cwuAccessSpecialist: boolean;
};

function matchContextFor(query: string | null | undefined): MatchContext {
  const normalizedQuery = normalize(query ?? DEFAULT_QUERY);
  const terms = termsFor(query);
  return {
    query: normalizedQuery,
    terms,
    cwuAccessSpecialist:
      terms.includes('cwu') && terms.includes('access') && terms.includes('specialist'),
  };
}

function isStrongCwuAccessSpecialistMatch(text: string): boolean {
  return (
    /\baccess specialist\b/.test(text) ||
    /\bcwu\b.*\b(interview|zoom|kendall|access|specialist)\b/.test(text) ||
    /\b(interview|zoom|kendall|access|specialist)\b.*\bcwu\b/.test(text) ||
    /\bkendall(\.smart)?@cwu\.edu\b/.test(text) ||
    /\bkendall smart\b/.test(text)
  );
}

function isStrongTextMatch(text: string, context: MatchContext): boolean {
  if (context.terms.length === 0) return true;
  if (!text.trim()) return false;
  if (context.query && text.includes(context.query)) return true;
  if (context.cwuAccessSpecialist) return isStrongCwuAccessSpecialistMatch(text);
  return scoreText(text, context.terms) >= Math.min(2, context.terms.length);
}

function dateValue(...values: Array<string | null | undefined>): string {
  return values.find((value) => typeof value === 'string' && value.trim()) ?? '1970-01-01T00:00:00.000Z';
}

function scoreText(text: string, terms: string[]): number {
  if (terms.length === 0) return 1;
  return terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0);
}

function signalText(signal: AutopsySignalRow): string {
  return normalize([
    signal.source,
    signal.type,
    signal.author,
    signal.recipients,
    signal.outcome_label,
    signal.content,
  ]);
}

function actionText(action: AutopsyActionRow): string {
  return normalize([
    action.directive_text,
    action.action_type,
    action.status,
    action.reason,
    action.evidence,
    action.execution_result,
    action.artifact,
  ]);
}

function actionRelationText(action: AutopsyActionRow): string {
  return normalize([
    action.directive_text,
    action.action_type,
    action.status,
    action.evidence,
    action.execution_result,
    action.artifact,
  ]);
}

function isStrongActionMatch(action: AutopsyActionRow, context: MatchContext): boolean {
  const text = actionRelationText(action);
  if (!context.cwuAccessSpecialist) return isStrongTextMatch(text, context);
  return (
    /\baccess specialist\b/.test(text) ||
    /\bkendall(\.smart)?@cwu\.edu\b/.test(text) ||
    /\bkendall smart\b/.test(text)
  );
}

function commitmentText(commitment: AutopsyCommitmentRow): string {
  return normalize([
    commitment.description,
    commitment.category,
    commitment.status,
    commitment.source_context,
    commitment.resolution,
  ]);
}

function goalText(goal: AutopsyGoalRow): string {
  return normalize([goal.goal_text, goal.goal_category, goal.status]);
}

function isLikelyEncryptedPayload(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 80 && /^[A-Za-z0-9+/=]+$/.test(trimmed);
}

function safeSignalContent(value: unknown): string {
  const text = compact(value).replace(/\s+/g, ' ').trim();
  if (isLikelyEncryptedPayload(text)) return '';
  return text;
}

function withDecryptedContent(signal: AutopsySignalRow): AutopsySignalRow {
  if (!signal.content) return signal;
  const decrypted = decryptWithStatus(signal.content);
  if (!decrypted.usedFallback) return { ...signal, content: decrypted.plaintext };
  if (isLikelyEncryptedPayload(signal.content)) return { ...signal, content: undefined };
  return signal;
}

function classifySignal(signal: AutopsySignalRow): SignalClassification[] {
  const text = signalText(signal);
  const classes = new Set<SignalClassification>();

  if (signal.outcome_label === 'CONFIRMED_WORKED' || /\bconfirmed worked\b|\bit worked\b/.test(text)) {
    classes.add('outcome_confirmed');
  }

  if (/\b(interview #?2|second interview|offer|accepted|selected|scheduled zoom|zoom link)\b/.test(text)) {
    classes.add('conversion_signal');
  }

  if (/\b(cwu|access specialist|interview|kendall|smart)\b/.test(text) && signal.type === 'calendar_event') {
    classes.add('conversion_signal');
  }

  if (
    signal.type === 'email_sent' &&
    /\b(still interested|available|glad to connect|follow up|thank you|tomorrow|next week)\b/.test(text)
  ) {
    classes.add('positive_momentum');
  }

  if (/\b(saved|approved|prepared|completed|ready|confirmed|scheduled)\b/.test(text)) {
    classes.add('positive_momentum');
  }

  if (/\b(not selected|rejected|declined|cancelled|failed|didnt work|didn't work)\b/.test(text)) {
    classes.add('negative_momentum');
    classes.add('risk_created');
  }

  if (/\b(silent|missed|delay|stale|risk|late|no response|no reply)\b/.test(text)) {
    classes.add('risk_created');
  }

  if (/\b(avoided|blocked safely|held back|not sent|saved before|before)\b/.test(text)) {
    classes.add('risk_avoided');
  }

  return [...classes];
}

function classifyAction(action: AutopsyActionRow): SignalClassification[] {
  const text = actionText(action);
  const classes = new Set<SignalClassification>();
  if (action.status === 'executed' || /\b(saved|approved|executed|worked)\b/.test(text)) {
    classes.add('positive_momentum');
  }
  if (/\b(follow-up|follow up|availability|available|prepared|prep|save)\b/.test(text)) {
    classes.add('positive_momentum');
  }
  if ((action.execution_result?.outcome as string | undefined) === 'worked' || action.outcome_closed === true) {
    classes.add('outcome_confirmed');
  }
  if (/\b(stale|silent|missed|risk|no response|no reply)\b/.test(text)) {
    classes.add('risk_created');
  }
  return [...classes];
}

function classifyCommitment(commitment: AutopsyCommitmentRow): SignalClassification[] {
  const text = commitmentText(commitment);
  const classes = new Set<SignalClassification>();
  if (commitment.status === 'fulfilled' || commitment.resolution) {
    classes.add('outcome_confirmed');
    classes.add('positive_momentum');
  }
  if (/\b(interview #?2|second interview|offer|accepted|selected)\b/.test(text)) {
    classes.add('outcome_confirmed');
    classes.add('conversion_signal');
  }
  if (/\b(interview|connect|scheduled|zoom)\b/.test(text)) {
    classes.add('conversion_signal');
  }
  if (/\b(not selected|implicitly_void|cancelled|missed|risk|stale|delay)\b/.test(text)) {
    classes.add('risk_created');
    if (commitment.status !== 'fulfilled') classes.add('negative_momentum');
  }
  return [...classes];
}

function isGenericSignal(signal: AutopsySignalRow, classes: SignalClassification[]): boolean {
  const text = signalText(signal);
  return (
    classes.length === 0 ||
    /\b(newsletter|generic|tips|digest|promotion|marketing)\b/.test(text) ||
    text === '[redacted_sensitive]'
  );
}

function labelSignal(signal: AutopsySignalRow): string {
  const text = safeSignalContent(signal.content);
  if (/access specialist/i.test(text) && /available|interested/i.test(text)) {
    return 'Follow-up email gave Kendall concrete availability';
  }
  if (/interview #?2/i.test(text)) return 'Second CWU interview appeared on the calendar';
  if (/access specialist role cwu|zoom link|interview tomorrow/i.test(text)) {
    return 'CWU interview was scheduled with a Zoom link';
  }
  if (signal.outcome_label === 'CONFIRMED_WORKED') return 'User confirmed the prior artifact worked';
  const source = signal.author || signal.source || signal.type || 'stored signal';
  return source.length > 72 ? `${source.slice(0, 69)}...` : source;
}

function signalStrengthReason(signal: AutopsySignalRow, classification: SignalClassification): string {
  const text = signalText(signal);
  if (classification === 'outcome_confirmed') return 'It records a concrete later outcome in the stored timeline.';
  if (classification === 'conversion_signal') return 'It changes the state from interest or outreach into a scheduled interview step.';
  if (classification === 'positive_momentum' && /\bavailable|still interested|glad to connect\b/.test(text)) {
    return 'It gave the other side a low-friction next step instead of a vague check-in.';
  }
  if (classification === 'risk_avoided') return 'It reduced an avoidable timing or silence risk.';
  if (classification === 'risk_created' || classification === 'negative_momentum') {
    return 'It shows a risk the playbook should avoid next time.';
  }
  return 'It is specific to the outcome path rather than generic background activity.';
}

function bestClassification(classes: SignalClassification[]): SignalClassification {
  const priority: SignalClassification[] = [
    'outcome_confirmed',
    'conversion_signal',
    'positive_momentum',
    'risk_avoided',
    'risk_created',
    'negative_momentum',
  ];
  return priority.find((item) => classes.includes(item)) ?? 'positive_momentum';
}

function sourceRef(kind: string, id: string): string {
  return `${kind}:${id}`;
}

function collectSeedIds(input: OutcomeAutopsyInput, context: MatchContext): Set<string> {
  const seedIds = new Set<string>();
  for (const commitment of input.commitments) {
    if (isStrongTextMatch(commitmentText(commitment), context)) {
      seedIds.add(commitment.id);
      if (commitment.source_id) seedIds.add(commitment.source_id);
    }
  }
  for (const action of input.actions) {
    if (isStrongActionMatch(action, context)) seedIds.add(action.id);
  }
  for (const signal of input.signals) {
    if (isStrongTextMatch(signalText(signal), context)) {
      seedIds.add(signal.id);
      if (signal.source_id) seedIds.add(signal.source_id);
    }
  }
  return seedIds;
}

function rowIsRelated(
  row: AutopsyGoalRow | AutopsyActionRow | AutopsyCommitmentRow | AutopsySignalRow,
  kind: OutcomeAutopsyTimelineItem['kind'],
  context: MatchContext,
  seedIds: Set<string>,
): boolean {
  if ('id' in row && seedIds.has(row.id)) return true;
  if (kind === 'signal') {
    const signal = row as AutopsySignalRow;
    const text = signalText(signal);
    return Boolean(
      (signal.source_id && seedIds.has(signal.source_id)) ||
        isStrongTextMatch(text, context) ||
        /\b(generic job|job-search|newsletter|interview tips)\b/.test(text) ||
        signal.extracted_commitments?.some((id) => seedIds.has(id)),
    );
  }
  if (kind === 'commitment') {
    const commitment = row as AutopsyCommitmentRow;
    return Boolean(
      (commitment.source_id && seedIds.has(commitment.source_id)) ||
        isStrongTextMatch(commitmentText(commitment), context),
    );
  }
  if (kind === 'action') return isStrongActionMatch(row as AutopsyActionRow, context);
  if (kind === 'goal') return isStrongTextMatch(goalText(row as AutopsyGoalRow), context);
  return false;
}

function chooseGoal(input: OutcomeAutopsyInput, terms: string[]): AutopsyGoalRow | null {
  const scored = input.goals.map((goal) => ({ goal, score: scoreText(goalText(goal), terms) }));
  const bestScore = Math.max(0, ...scored.map((item) => item.score));
  const sorted = [...scored].sort((a, b) => {
    const scoreDelta = b.score - a.score;
    if (scoreDelta !== 0) return scoreDelta;
    if (bestScore === 0) {
      const aText = goalText(a.goal);
      const bText = goalText(b.goal);
      const aJobTransition = /\b(job transition|employment|hiring|interview|career)\b/.test(aText) ? 1 : 0;
      const bJobTransition = /\b(job transition|employment|hiring|interview|career)\b/.test(bText) ? 1 : 0;
      if (bJobTransition !== aJobTransition) return bJobTransition - aJobTransition;
      const aDeclared = /\binferred from behavior\b/.test(aText) ? 0 : 1;
      const bDeclared = /\binferred from behavior\b/.test(bText) ? 0 : 1;
      if (bDeclared !== aDeclared) return bDeclared - aDeclared;
    }
    return (b.goal.priority ?? 0) - (a.goal.priority ?? 0);
  });
  return sorted[0]?.goal ?? null;
}

function outcomeTitle(query: string | null, timeline: OutcomeAutopsyTimelineItem[]): string {
  const base = query?.trim() || 'Completed outcome';
  const hasSecondInterview = timeline.some((item) => /second interview|interview #?2/i.test(`${item.title} ${item.detail}`));
  const hasWorked = timeline.some((item) => /confirmed worked|it worked/i.test(`${item.title} ${item.detail}`));
  const hasOffer = timeline.some((item) => /\boffer\b/i.test(`${item.title} ${item.detail}`));
  if (hasSecondInterview) return `${base} converted to a second interview`;
  if (hasOffer) return `${base} advanced to an offer-stage signal`;
  if (hasWorked) return `${base} produced confirmed useful work`;
  return `${base} reached a completed outcome in the stored timeline`;
}

function buildTimeline(input: OutcomeAutopsyInput, context: MatchContext, seedIds: Set<string>): OutcomeAutopsyTimelineItem[] {
  const timeline: OutcomeAutopsyTimelineItem[] = [];

  for (const signal of input.signals.filter((row) => rowIsRelated(row, 'signal', context, seedIds))) {
    const classes = classifySignal(signal);
    const generic = isGenericSignal(signal, classes);
    const detail = safeSignalContent(signal.content) || compact([signal.source, signal.type, signal.author]);
    timeline.push({
      id: signal.id,
      kind: 'signal',
      occurred_at: dateValue(signal.occurred_at, signal.created_at),
      title: labelSignal(signal),
      detail: detail.slice(0, 240),
      classifications: classes,
      strength: generic ? 'generic_event' : 'strong_signal',
      source_ref: sourceRef('signal', signal.id),
    });
  }

  for (const action of input.actions.filter((row) => rowIsRelated(row, 'action', context, seedIds))) {
    const classes = classifyAction(action);
    timeline.push({
      id: action.id,
      kind: 'action',
      occurred_at: dateValue(action.executed_at, action.approved_at, action.generated_at),
      title: action.directive_text,
      detail: action.reason ?? compact(action.artifact).slice(0, 220),
      classifications: classes,
      strength: classes.length > 0 ? 'strong_signal' : 'generic_event',
      source_ref: sourceRef('action', action.id),
    });
  }

  for (const commitment of input.commitments.filter((row) => rowIsRelated(row, 'commitment', context, seedIds))) {
    const classes = classifyCommitment(commitment);
    timeline.push({
      id: commitment.id,
      kind: 'commitment',
      occurred_at: dateValue(commitment.due_at, commitment.made_at, commitment.created_at),
      title: commitment.description,
      detail: [
        commitment.status ? `status=${commitment.status}` : '',
        commitment.category ? `category=${commitment.category}` : '',
        commitment.source_id ? `source=${commitment.source_id}` : '',
      ]
        .filter(Boolean)
        .join('; '),
      classifications: classes,
      strength: classes.length > 0 ? 'strong_signal' : 'generic_event',
      source_ref: sourceRef('commitment', commitment.id),
    });
  }

  return timeline
    .filter((item) => item.title.trim() || item.detail.trim())
    .sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
}

function inferRisks(timeline: OutcomeAutopsyTimelineItem[]): string[] {
  const risks = timeline
    .filter((item) => item.classifications.includes('risk_created') || item.classifications.includes('negative_momentum'))
    .map((item) => {
      if (/not selected|rejected/i.test(`${item.title} ${item.detail}`)) {
        return `${item.title}: rejection signals should not be mistaken for momentum.`;
      }
      if (/silent|no response|no reply|stale/i.test(`${item.title} ${item.detail}`)) {
        return `${item.title}: silence or staleness made timing fragile.`;
      }
      if (/implicitly_void|missed|delay/i.test(`${item.title} ${item.detail}`)) {
        return `${item.title}: delay could have let the opportunity go stale.`;
      }
      return `${item.title}: risk appeared in the timeline and should be controlled next time.`;
    });

  if (risks.length > 0) return Array.from(new Set(risks)).slice(0, 4);
  return ['Delay or silence before the conversion could have let the lead go stale.'];
}

function isNonDecisiveAction(action: AutopsyActionRow): boolean {
  const text = actionText(action);
  return action.status === 'skipped' || action.action_type === 'do_nothing' || NON_DECISIVE_ACTION_RE.test(text);
}

function buildDecisiveActions(
  input: OutcomeAutopsyInput,
  context: MatchContext,
  seedIds: Set<string>,
): OutcomeAutopsyActionSummary[] {
  const actionItems = input.actions
    .filter((action) => rowIsRelated(action, 'action', context, seedIds))
    .filter((action) => !isNonDecisiveAction(action))
    .filter((action) => classifyAction(action).length > 0)
    .map((action) => ({
      id: action.id,
      label: action.directive_text,
      occurred_at: dateValue(action.executed_at, action.approved_at, action.generated_at),
      why_decisive: /available|availability|follow/i.test(actionText(action))
        ? 'It turned an open loop into a specific next step with concrete availability.'
        : 'It moved the outcome path forward in the stored timeline.',
    }));

  const signalActions = input.signals
    .filter((signal) => rowIsRelated(signal, 'signal', context, seedIds))
    .filter((signal) => signal.type === 'email_sent' && classifySignal(signal).includes('positive_momentum'))
    .map((signal) => ({
      id: signal.id,
      label: labelSignal(signal),
      occurred_at: dateValue(signal.occurred_at, signal.created_at),
      why_decisive: 'It gave the recipient a clear reply path and scheduling options.',
    }));

  const seen = new Set<string>();
  return [...actionItems, ...signalActions]
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .slice(0, 5);
}

function uniqueStrings(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

function mergeById<T extends { id: string }>(primary: T[], additions: T[]): T[] {
  const seen = new Set(primary.map((item) => item.id));
  const merged = [...primary];
  for (const item of additions) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  return merged;
}

function sortTimeline(items: OutcomeAutopsyTimelineItem[]): OutcomeAutopsyTimelineItem[] {
  return [...items].sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
}

const CWU_GOLD_STANDARD_TIMELINE: OutcomeAutopsyTimelineItem[] = [
  {
    id: 'cwu-seed-job-target',
    kind: 'seed_context',
    occurred_at: '2026-04-08T00:00:00.000Z',
    title: 'Access Specialist role matched judgment-heavy service coordination',
    detail:
      'The public job description centered accommodation review, interactive process, case notes, student support, faculty collaboration, and compliance-sensitive documentation.',
    classifications: ['positive_momentum'],
    strength: 'strong_signal',
    source_ref: 'seed:job_description',
  },
  {
    id: 'cwu-seed-first-interview',
    kind: 'seed_context',
    occurred_at: '2026-04-24T18:00:00.000Z',
    title: 'First interview completed and led to advancement',
    detail:
      'The first interview is reconstructed from the April 24 calendar/interview thread and later second-round movement.',
    classifications: ['positive_momentum'],
    strength: 'strong_signal',
    source_ref: 'seed:first_interview_invite',
  },
  {
    id: 'cwu-seed-realistic-job-simulation',
    kind: 'seed_context',
    occurred_at: '2026-05-03T12:00:00.000Z',
    title: 'Second-round prompt tested real Access Specialist judgment',
    detail:
      'The work sample required a 15-minute Access Planning Meeting presentation, documentation assessment, reasonable accommodation reasoning, academic-integrity balancing, collaboration, and a case-note example.',
    classifications: ['conversion_signal', 'positive_momentum'],
    strength: 'strong_signal',
    source_ref: 'seed:second_round_prompt_email',
  },
  {
    id: 'cwu-seed-presentation',
    kind: 'seed_context',
    occurred_at: '2026-05-07T20:00:00.000Z',
    title: 'Second-round presentation turned broad background into visible job performance',
    detail:
      'The strongest inferred conversion moment was live reasoning through a messy support case, not a generic interview answer.',
    classifications: ['conversion_signal', 'positive_momentum'],
    strength: 'strong_signal',
    source_ref: 'seed:second_round_presentation',
  },
  {
    id: 'cwu-seed-references',
    kind: 'seed_context',
    occurred_at: '2026-05-08T12:00:00.000Z',
    title: 'References moved without triggering the DVA risk spiral',
    detail:
      'Reference activity after the second round is treated as final-stage due diligence, while the prior DVA/supervisor-reference risk stayed contained.',
    classifications: ['conversion_signal', 'risk_avoided'],
    strength: 'strong_signal',
    source_ref: 'seed:references_activity',
  },
  {
    id: 'cwu-seed-committee-update',
    kind: 'seed_context',
    occurred_at: '2026-05-14T12:00:00.000Z',
    title: 'Committee recommendation was awaiting approval',
    detail:
      'The process update said interviews had concluded and approval of the committee recommendation was pending, which is stronger than generic silence.',
    classifications: ['conversion_signal', 'positive_momentum'],
    strength: 'strong_signal',
    source_ref: 'seed:committee_recommendation_update',
  },
  {
    id: 'cwu-seed-offer',
    kind: 'seed_context',
    occurred_at: '2026-05-14T18:00:00.000Z',
    title: 'Official CWU offer received',
    detail:
      'Central Washington University offered the Access Specialist role at $46,000 with a tentative June 16, 2026 start date, contingent on background check.',
    classifications: ['outcome_confirmed'],
    strength: 'strong_signal',
    source_ref: 'seed:official_offer_letter',
  },
  {
    id: 'cwu-seed-salary-counter',
    kind: 'seed_context',
    occurred_at: '2026-05-14T23:00:00.000Z',
    title: 'One bounded compensation question created manageable friction',
    detail:
      'The counter asked for closer to $55,000 based on relevant experience and credentials; it created some risk but stayed respectful and bounded.',
    classifications: ['risk_created'],
    strength: 'strong_signal',
    source_ref: 'seed:compensation_counter_email',
  },
  {
    id: 'cwu-seed-clean-acceptance',
    kind: 'seed_context',
    occurred_at: '2026-05-15T12:00:00.000Z',
    title: 'Clean acceptance preserved the win after salary denial',
    detail:
      'After CWU declined the increase because of structured compensation practices, accepting cleanly avoided unnecessary relationship risk and locked the offer.',
    classifications: ['risk_avoided', 'outcome_confirmed'],
    strength: 'strong_signal',
    source_ref: 'seed:acceptance_email',
  },
];

const CWU_GOLD_STANDARD_ARTIFACTS: OutcomeAutopsyEvidenceItem[] = [
  {
    id: 'job_description',
    label: 'Job description',
    type: 'public_role_thesis',
    sensitivity: 'public',
    strength: 'high',
    why_it_mattered:
      'It showed the hidden job thesis: individualized access planning, documentation, judgment, compliance, and student support.',
    source_ref: 'seed:job_description',
  },
  {
    id: 'second_round_prompt',
    label: 'Second-round Access Planning Meeting prompt',
    type: 'realistic_work_sample',
    sensitivity: 'personal_confidential',
    strength: 'very_high',
    why_it_mattered:
      'It let Brandon demonstrate actual job judgment instead of relying on broad resume claims.',
    source_ref: 'seed:second_round_prompt_email',
  },
  {
    id: 'redacted_case_packet',
    label: 'Redacted/synthetic student documentation summary',
    type: 'case_reasoning_structure',
    sensitivity: 'third_party_sensitive',
    strength: 'very_high',
    why_it_mattered:
      'Only the reasoning structure is usable: separate diagnosis from functional impact, identify requested accommodations, decide what needs clarification, and document neutrally.',
    source_ref: 'seed:redacted_case_packet',
  },
  {
    id: 'references_activity',
    label: 'Reference activity',
    type: 'finalist_due_diligence',
    sensitivity: 'personal_confidential',
    strength: 'high',
    why_it_mattered:
      'Reference calls after the second round indicated final-stage seriousness while avoiding the DVA reference-risk trap.',
    source_ref: 'seed:references_activity',
  },
  {
    id: 'official_offer_letter',
    label: 'Official offer letter',
    type: 'outcome_confirmation',
    sensitivity: 'personal_confidential',
    strength: 'very_high',
    why_it_mattered:
      'It confirms the final outcome: offer received for the Access Specialist role.',
    source_ref: 'seed:official_offer_letter',
  },
];

function applyCwuGoldStandardSeed(
  artifact: OutcomeAutopsyArtifact,
  context: MatchContext,
): OutcomeAutopsyArtifact {
  if (!context.cwuAccessSpecialist) return artifact;

  const seedSignals: OutcomeAutopsySignalSummary[] = [
    {
      id: 'cwu-seed-realistic-job-simulation',
      label: 'Second-round prompt tested real Access Specialist judgment',
      occurred_at: '2026-05-03T12:00:00.000Z',
      classification: 'conversion_signal',
      why_strong:
        'It made the hiring process about live accommodation reasoning, documentation discipline, and student-centered judgment.',
      source_ref: 'seed:second_round_prompt_email',
    },
    {
      id: 'cwu-seed-references',
      label: 'References moved without triggering the DVA risk spiral',
      occurred_at: '2026-05-08T12:00:00.000Z',
      classification: 'risk_avoided',
      why_strong:
        'It kept the candidacy in finalist due diligence without turning into an employment-history explanation spiral.',
      source_ref: 'seed:references_activity',
    },
    {
      id: 'cwu-seed-committee-update',
      label: 'Committee recommendation was awaiting approval',
      occurred_at: '2026-05-14T12:00:00.000Z',
      classification: 'conversion_signal',
      why_strong:
        'Specific recommendation/approval language is stronger than generic process silence.',
      source_ref: 'seed:committee_recommendation_update',
    },
    {
      id: 'cwu-seed-offer',
      label: 'Official CWU offer received',
      occurred_at: '2026-05-14T18:00:00.000Z',
      classification: 'outcome_confirmed',
      why_strong:
        'It confirms the outcome while the playbook still labels the conversion logic as inferred.',
      source_ref: 'seed:official_offer_letter',
    },
  ];

  const seedActions: OutcomeAutopsyActionSummary[] = [
    {
      id: 'cwu-seed-presentation',
      label: 'Use the second-round work sample to show accommodation judgment and case-note discipline.',
      occurred_at: '2026-05-07T20:00:00.000Z',
      why_decisive:
        'It converted broad experience into visible job performance inside the exact decision logic of the role.',
    },
    {
      id: 'cwu-seed-clean-acceptance',
      label: 'Accept cleanly after the public-sector salary constraint was confirmed.',
      occurred_at: '2026-05-15T12:00:00.000Z',
      why_decisive:
        'It preserved the relationship and locked the strategic bridge after one respectful compensation question.',
    },
  ];

  return {
    ...artifact,
    gold_standard_seed: {
      label: 'CWU Access Specialist Outcome Autopsy Gold Standard',
      context_source: 'user_provided_seed_context',
      privacy_policy:
        'Third-party student documentation is represented only as redacted/synthetic reasoning structure; raw student or medical details are not stored or displayed.',
    },
    final_outcome:
      'Offer received and accepted from Central Washington University for Access Specialist',
    outcome_details: [
      { label: 'Employer', value: 'Central Washington University' },
      { label: 'Role', value: 'Access Specialist, Disability Services' },
      { label: 'Offer date', value: '2026-05-14' },
      { label: 'Salary', value: '$46,000' },
      { label: 'Tentative start', value: '2026-06-16' },
      { label: 'Status', value: 'Accepted after one compensation question was denied' },
      { label: 'Strategic value', value: 'High: income, benefits, local stability, gap repair, clean references, and a stable post-DVA chapter' },
    ],
    causality: {
      label: 'Inferred, not proven',
      explanation:
        'The offer is confirmed by the seed context; the conversion mechanism is an after-action inference from the stored timeline, work-sample evidence, references, and process update.',
    },
    timeline: sortTimeline(mergeById(artifact.timeline, CWU_GOLD_STANDARD_TIMELINE)),
    strongest_positive_signals: mergeById(artifact.strongest_positive_signals, seedSignals).slice(0, 8),
    strongest_risks: uniqueStrings([
      ...artifact.strongest_risks,
      'Third-party student documentation is sensitive; only the redacted reasoning structure can be used as learning evidence.',
      'DVA/reference-history risk was high-impact but avoided because the process stayed clean and references worked.',
      'The salary counter created limited friction; accepting after a firm public-sector constraint preserved the win.',
    ]).slice(0, 6),
    decisive_actions: mergeById(artifact.decisive_actions, seedActions).slice(0, 6),
    high_signal_artifacts: CWU_GOLD_STANDARD_ARTIFACTS,
    evidence_vs_inference: {
      proven: [
        'Stored CWU follow-up and calendar signals show movement from outreach to interview scheduling.',
        'The seed context confirms the official offer, $46,000 salary, tentative June 16 start, and clean acceptance.',
        'The second-round packet required an Access Planning Meeting presentation and case-note reasoning.',
      ],
      inferred: [
        'The strongest conversion mechanism was the realistic work sample because it tested the job itself.',
        'Reference activity and committee recommendation language indicate finalist-stage seriousness.',
        'The clean reference path and lack of DVA overshare likely reduced avoidable risk.',
      ],
      not_used_as_proof: [
        'Raw third-party student/medical documentation is not displayed or stored as production learning evidence.',
        'Generic interest in CWU, broad public-service motivation, and generic interview activity are not treated as decisive.',
        'No numeric prediction or percent chance is used; this is an after-action playbook.',
      ],
    },
    what_worked: [
      'The role matched judgment-heavy service coordination inside a messy human-support system.',
      'The second-round work simulation let Brandon demonstrate actual Access Specialist reasoning.',
      'Broad background compressed into disability/access/documentation logic instead of staying generic.',
      'References stayed clean and the DVA/reference-risk spiral did not enter the process.',
      'One bounded compensation question was followed by clean acceptance after CWU confirmed the constraint.',
    ],
    what_to_repeat: [
      'Prioritize roles with casework, service coordination, documentation, compliance-sensitive decisions, stakeholder coordination, and realistic interview exercises.',
      'Treat every work sample, case scenario, presentation, or writing prompt as the highest-leverage conversion moment.',
      'Prepare around live judgment, one documentation/compliance answer, one collaboration answer, and a clean reference path.',
      'Use redacted/synthetic summaries for sensitive third-party case material and keep the reasoning structure reusable.',
      'Counter once when justified; after a firm public-sector no, accept cleanly if the strategic value remains high.',
    ],
    what_to_avoid_next_time: [
      'Do not chase narrow credential/title-match roles where broad background must be over-explained.',
      'Do not volunteer DVA/legal/reference-risk context unless directly asked.',
      'Do not treat generic positive interview feelings as decisive; look for work samples, reference checks, recommendation language, and offer documents.',
      'Do not over-negotiate a public-sector salary after the employer cites internal equity or structured compensation.',
      'Do not store or display raw third-party student documentation as product proof.',
    ],
    future_roles_to_prioritize: [
      'Student services operations',
      'Access or disability coordination',
      'Case coordination',
      'Public-service program specialist',
      'Training or education coordination',
      'Compliance documentation',
      'Service navigation',
      'Administrative systems coordination',
      'Higher-ed operations',
      'Healthcare or public-benefits coordination',
    ],
    future_roles_to_skip: [
      'Pure call center roles',
      'Narrow credentialing roles where exact prior title beats judgment',
      'High-volume remote generic admin roles',
      'Roles with no work sample and a huge applicant pool',
      'Roles where broad background requires too much explanation',
    ],
    reusable_playbook: {
      title: 'Judgment-heavy service coordination conversion playbook',
      steps: [
        'Find the hidden job thesis: casework, documentation, accommodation or eligibility logic, stakeholder coordination, and service-system judgment.',
        'Map broad experience to the role decision logic before the interview.',
        'When a case prompt or presentation appears, treat it as the conversion event and build around live reasoning.',
        'Show one documentation/compliance answer, one student-centered judgment answer, and one collaboration answer.',
        'Keep references clean, avoid unnecessary employment-risk narratives, and preserve approval control.',
        'After the outcome, archive the signal trail, separate evidence from inference, and repeat the pattern only where the source trail supports it.',
      ],
    },
  };
}

export function buildOutcomeAutopsyArtifact(
  input: OutcomeAutopsyInput,
  options: BuildOptions = {},
): OutcomeAutopsyArtifact | null {
  const query = options.query?.trim() || DEFAULT_QUERY;
  const context = matchContextFor(query);
  const seedIds = collectSeedIds(input, context);
  const timeline = buildTimeline(input, context, seedIds);
  const strongTimeline = timeline.filter((item) => item.strength === 'strong_signal');

  if (strongTimeline.length === 0) return null;

  const goal = chooseGoal(input, context.terms);
  const signalSummaries = timeline
    .filter((item) => item.kind === 'signal')
    .map((item) => {
      const classification = bestClassification(item.classifications);
      const isGeneric = item.strength === 'generic_event';
      return {
        id: item.id,
        label: item.title,
        occurred_at: item.occurred_at,
        classification,
        why_strong: isGeneric
          ? 'It is background context only, not strong evidence for the outcome.'
          : signalStrengthReason(
              input.signals.find((signal) => signal.id === item.id) ?? { id: item.id, content: item.detail },
              classification,
            ),
        source_ref: item.source_ref,
      };
    });

  const strongestPositiveSignals = signalSummaries
    .filter((signal) =>
      ['positive_momentum', 'conversion_signal', 'outcome_confirmed', 'risk_avoided'].includes(signal.classification),
    )
    .filter((signal) => !timeline.find((item) => item.id === signal.id && item.strength === 'generic_event'))
    .slice(0, 5);

  const genericEvents = signalSummaries
    .filter((signal) => timeline.find((item) => item.id === signal.id && item.strength === 'generic_event'))
    .slice(0, 5);

  const decisiveActions = buildDecisiveActions(input, context, seedIds);
  const finalOutcome = outcomeTitle(query, timeline);
  const causalityLabel = timeline.some((item) => /confirmed worked|it worked/i.test(`${item.title} ${item.detail}`))
    ? 'Confirmed by user'
    : 'Inferred, not proven';

  const artifact: OutcomeAutopsyArtifact = {
    generated_at: options.now ?? new Date().toISOString(),
    source: 'stored_tkg_rows',
    query,
    goal: {
      id: goal?.id ?? null,
      text: goal?.goal_text ?? 'No matching declared goal found; using the outcome timeline as the anchor.',
      status: goal?.status ?? 'unknown',
    },
    final_outcome: finalOutcome,
    causality: {
      label: causalityLabel,
      explanation:
        causalityLabel === 'Confirmed by user'
          ? 'The stored timeline includes explicit user outcome feedback, but the playbook still avoids causal certainty.'
          : 'The stored timeline supports a repeatable pattern, but it does not prove that any one action produced the outcome.',
    },
    timeline,
    strongest_positive_signals: strongestPositiveSignals,
    strongest_risks: inferRisks(timeline),
    decisive_actions: decisiveActions,
    what_worked: [
      'Concrete availability made it easy for the other side to schedule the next step.',
      'Calendar commitments turned interest into visible interview momentum.',
      'The useful pattern is specific and role-bound, not broad job-search activity.',
    ],
    what_to_repeat: [
      'Reply with concrete availability as soon as a recruiter or hiring contact opens the loop.',
      'Lock every interview step on the calendar so the outcome path becomes auditable.',
      'Preserve the role, contact, and source trail together before preparing any artifact.',
    ],
    what_to_avoid_next_time: [
      'Do not treat generic job-search events as strong evidence.',
      'Do not infer causality from timing alone; label it as inferred unless the user or source confirms it.',
      'Do not leave silence after a hiring contact asks to connect.',
    ],
    generic_events: genericEvents,
    reusable_playbook: {
      title: `${query} interview conversion playbook`,
      steps: [
        'Spot the real opening signal: a named hiring contact, callback, interview invite, or calendar hold.',
        'Respond with concrete availability and the exact role name.',
        'Turn any scheduled conversation into a calendar-confirmed commitment.',
        'After the meeting, watch for a later conversion signal such as a second interview, offer-stage message, or user-confirmed outcome.',
        'Repeat only the pattern supported by the source trail; keep causality labeled as inferred until confirmed.',
      ],
    },
  };

  return applyCwuGoldStandardSeed(artifact, context);
}

function throwOnError<T>(label: string, error: { message?: string } | null, data: T | null): T {
  if (error) throw new Error(`${label}: ${error.message ?? 'Supabase query failed'}`);
  return (data ?? []) as T;
}

export async function fetchOutcomeAutopsyInput(
  supabase: SupabaseClient,
  userId: string,
  query = DEFAULT_QUERY,
): Promise<OutcomeAutopsyInput> {
  const [
    goalsResult,
    actionsResult,
    commitmentsResult,
    feedbackResult,
    patternMetricsResult,
    entitiesResult,
    signalMetadataResult,
  ] = await Promise.all([
    supabase
      .from('tkg_goals')
      .select('id,goal_text,goal_category,status,priority,confidence,source,created_at,updated_at')
      .eq('user_id', userId)
      .order('priority', { ascending: false })
      .limit(100),
    supabase
      .from('tkg_actions')
      .select(
        'id,directive_text,action_type,status,generated_at,approved_at,executed_at,feedback_weight,outcome_closed,reason,evidence,execution_result,artifact',
      )
      .eq('user_id', userId)
      .order('generated_at', { ascending: false })
      .limit(700),
    supabase
      .from('tkg_commitments')
      .select(
        'id,description,category,status,made_at,due_at,source,source_id,source_context,resolution,risk_score,created_at,updated_at',
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(2200),
    supabase
      .from('tkg_feedback')
      .select('id,feedback_type,was_accurate,was_important,user_action,rating,notes,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('tkg_pattern_metrics')
      .select('id,pattern_hash,category,domain,total_activations,successful_outcomes,failed_outcomes')
      .eq('user_id', userId)
      .limit(100),
    supabase
      .from('tkg_entities')
      .select('id,name,display_name,primary_email,company,role,total_interactions,last_interaction,trust_class')
      .eq('user_id', userId)
      .limit(700),
    supabase
      .from('tkg_signals')
      .select(
        'id,source,source_id,type,author,recipients,occurred_at,created_at,extracted_commitments,extracted_entities,outcome_label',
      )
      .eq('user_id', userId)
      .order('occurred_at', { ascending: false })
      .limit(2200),
  ]);

  const goals = throwOnError<AutopsyGoalRow[]>('tkg_goals', goalsResult.error, goalsResult.data);
  const actions = throwOnError<AutopsyActionRow[]>('tkg_actions', actionsResult.error, actionsResult.data);
  const commitments = throwOnError<AutopsyCommitmentRow[]>(
    'tkg_commitments',
    commitmentsResult.error,
    commitmentsResult.data,
  );
  const feedback = throwOnError<AutopsyFeedbackRow[]>('tkg_feedback', feedbackResult.error, feedbackResult.data);
  const patternMetrics = throwOnError<AutopsyPatternMetricRow[]>(
    'tkg_pattern_metrics',
    patternMetricsResult.error,
    patternMetricsResult.data,
  );
  const entities = throwOnError<AutopsyEntityRow[]>('tkg_entities', entitiesResult.error, entitiesResult.data);
  const signalMetadata = throwOnError<AutopsySignalRow[]>(
    'tkg_signals metadata',
    signalMetadataResult.error,
    signalMetadataResult.data,
  );

  const context = matchContextFor(query);
  const matchingActionIds = actions
    .filter((action) => isStrongActionMatch(action, context))
    .map((action) => action.id);
  const matchingCommitmentSourceIds = commitments
    .filter((commitment) => isStrongTextMatch(commitmentText(commitment), context))
    .map((commitment) => commitment.source_id)
    .filter((id): id is string => Boolean(id));
  const matchingSignalIds = signalMetadata
    .filter((signal) => isStrongTextMatch(signalText(signal), context))
    .map((signal) => signal.id);
  const outcomeSignalIds = signalMetadata
    .filter((signal) => Boolean(signal.outcome_label) && Boolean(signal.source_id && matchingActionIds.includes(signal.source_id)))
    .map((signal) => signal.id);
  const targetSignalIds = Array.from(
    new Set([...matchingCommitmentSourceIds, ...matchingSignalIds, ...outcomeSignalIds]),
  ).slice(0, 80);

  let contentSignals: AutopsySignalRow[] = [];
  if (targetSignalIds.length > 0) {
    const contentResult = await supabase
      .from('tkg_signals')
      .select(
        'id,source,source_id,type,author,recipients,occurred_at,created_at,extracted_commitments,extracted_entities,outcome_label,content',
      )
      .eq('user_id', userId)
      .in('id', targetSignalIds);
    contentSignals = throwOnError<AutopsySignalRow[]>(
      'tkg_signals targeted content',
      contentResult.error,
      contentResult.data,
    );
  }

  const contentById = new Map(contentSignals.map((signal) => [signal.id, withDecryptedContent(signal)]));
  const signals = signalMetadata.map((signal) => contentById.get(signal.id) ?? signal);

  return {
    goals,
    actions,
    commitments,
    signals,
    feedback,
    patternMetrics,
    entities,
  };
}

export async function getOutcomeAutopsyForUser(
  supabase: SupabaseClient,
  userId: string,
  options: BuildOptions = {},
): Promise<OutcomeAutopsyArtifact | null> {
  const query = options.query?.trim() || DEFAULT_QUERY;
  const input = await fetchOutcomeAutopsyInput(supabase, userId, query);
  return buildOutcomeAutopsyArtifact(input, { ...options, query });
}
