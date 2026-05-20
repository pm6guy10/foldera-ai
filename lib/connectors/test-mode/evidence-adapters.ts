import type { WorkdayPresenceTriggerContext } from '@/lib/workday-presence/triggers';

export type SimulatedGmailEvent = {
  kind: 'gmail';
  message_id: string;
  thread_id: string;
  from: string;
  subject: string;
  snippet: string;
  received_at_iso: string;
  reply_needed?: boolean;
  is_noise?: boolean;
};

export type SimulatedCalendarEvent = {
  kind: 'calendar';
  event_id: string;
  title: string;
  starts_at_iso: string;
  requires_prep: boolean;
  prep_move?: string;
  is_noise?: boolean;
};

export type SimulatedSlackEvent = {
  kind: 'slack';
  event_id: string;
  thread_id: string;
  summary: string;
  reply_needed?: boolean;
  changed?: boolean;
  is_noise?: boolean;
};

export type SimulatedConnectorEvidenceEvent =
  | SimulatedGmailEvent
  | SimulatedCalendarEvent
  | SimulatedSlackEvent;

export type ConnectorEvidenceNormalizationResult = {
  contexts: WorkdayPresenceTriggerContext[];
  ignored: Array<{ kind: SimulatedConnectorEvidenceEvent['kind']; reason: string }>;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeSummary(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function ignore(kind: SimulatedConnectorEvidenceEvent['kind'], reason: string) {
  return { kind, reason };
}

export function normalizeSimulatedConnectorEvidenceIntoTriggerContexts(
  events: SimulatedConnectorEvidenceEvent[],
): ConnectorEvidenceNormalizationResult {
  const contexts: WorkdayPresenceTriggerContext[] = [];
  const ignored: ConnectorEvidenceNormalizationResult['ignored'] = [];

  for (const event of events) {
    if (event.is_noise) {
      ignored.push(ignore(event.kind, 'noise: flagged is_noise'));
      continue;
    }

    if (event.kind === 'calendar') {
      if (!isNonEmptyString(event.title)) {
        ignored.push(ignore('calendar', 'noise: missing title'));
        continue;
      }
      if (!isNonEmptyString(event.starts_at_iso)) {
        ignored.push(ignore('calendar', 'noise: missing starts_at_iso'));
        continue;
      }
      if (!event.requires_prep) {
        ignored.push(ignore('calendar', 'noise: requires_prep=false'));
        continue;
      }
      contexts.push({
        trigger_type: 'pre_meeting',
        event: {
          title: normalizeSummary(event.title),
          starts_at_iso: event.starts_at_iso,
          requires_prep: true,
          prep_move: isNonEmptyString(event.prep_move) ? event.prep_move.trim() : undefined,
        },
      });
      continue;
    }

    if (event.kind === 'gmail') {
      if (!isNonEmptyString(event.thread_id)) {
        ignored.push(ignore('gmail', 'noise: missing thread_id'));
        continue;
      }
      if (!isNonEmptyString(event.subject) && !isNonEmptyString(event.snippet)) {
        ignored.push(ignore('gmail', 'noise: missing subject/snippet'));
        continue;
      }
      const replyNeeded = event.reply_needed === true;
      if (!replyNeeded) {
        ignored.push(ignore('gmail', 'noise: reply_needed=false'));
        continue;
      }
      const summary = normalizeSummary(
        isNonEmptyString(event.subject) ? event.subject : event.snippet,
      );
      contexts.push({
        trigger_type: 'mention_reply_needed',
        signal: {
          source: 'email',
          thread_id: event.thread_id.trim(),
          summary,
          reply_needed: true,
        },
      });
      continue;
    }

    // slack
    if (!isNonEmptyString(event.thread_id)) {
      ignored.push(ignore('slack', 'noise: missing thread_id'));
      continue;
    }
    if (!isNonEmptyString(event.summary)) {
      ignored.push(ignore('slack', 'noise: missing summary'));
      continue;
    }

    const normalizedSummary = normalizeSummary(event.summary);
    const replyNeeded = event.reply_needed === true;
    const changed = event.changed === true;

    if (replyNeeded) {
      contexts.push({
        trigger_type: 'mention_reply_needed',
        signal: {
          source: 'slack',
          thread_id: event.thread_id.trim(),
          summary: normalizedSummary,
          reply_needed: true,
        },
      });
      continue;
    }

    if (changed) {
      contexts.push({
        trigger_type: 'waiting_on_changed',
        changed: {
          thread_id: event.thread_id.trim(),
          summary: normalizedSummary,
        },
      });
      continue;
    }

    ignored.push(ignore('slack', 'noise: neither reply_needed nor changed'));
  }

  return { contexts, ignored };
}

export type ConnectorEvidenceInterventionSelection = {
  selected: WorkdayPresenceTriggerContext | null;
  ignored: ConnectorEvidenceNormalizationResult['ignored'];
  candidate_count: number;
  reason: string;
};

function contextPriority(context: WorkdayPresenceTriggerContext): number {
  if (context.trigger_type === 'mention_reply_needed') return 3;
  if (context.trigger_type === 'waiting_on_changed') return 2;
  if (context.trigger_type === 'pre_meeting') return 1;
  return 0;
}

function contextDedupKey(context: WorkdayPresenceTriggerContext): string {
  if (context.trigger_type === 'mention_reply_needed') {
    return `mention_reply_needed:${context.signal.source}:${context.signal.thread_id}`;
  }
  if (context.trigger_type === 'waiting_on_changed') {
    return `waiting_on_changed:${context.changed.thread_id}`;
  }
  if (context.trigger_type === 'pre_meeting') {
    return `pre_meeting:${context.event.starts_at_iso}:${context.event.title}`;
  }
  return `other:${(context as unknown as { trigger_type?: string }).trigger_type ?? 'unknown'}`;
}

export function selectSingleInterventionFromConnectorEvidence(
  events: SimulatedConnectorEvidenceEvent[],
): ConnectorEvidenceInterventionSelection {
  const normalized = normalizeSimulatedConnectorEvidenceIntoTriggerContexts(events);
  const candidateCount = normalized.contexts.length;
  if (candidateCount === 0) {
    return {
      selected: null,
      ignored: normalized.ignored,
      candidate_count: 0,
      reason: 'quiet: no actionable connector evidence contexts',
    };
  }

  const seen = new Set<string>();
  const unique = normalized.contexts.filter((context) => {
    const key = contextDedupKey(context);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  unique.sort((a, b) => contextPriority(b) - contextPriority(a));
  const selected = unique[0] ?? null;

  return {
    selected,
    ignored: normalized.ignored,
    candidate_count: candidateCount,
    reason:
      unique.length === 1
        ? 'selected: single actionable context'
        : 'selected: multiple signals collapsed into one intervention',
  };
}

