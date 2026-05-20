import type { WorkdayPresenceState } from '@/lib/workday-presence/model';
import { evaluateWorkdayPresenceTrigger } from '@/lib/workday-presence/triggers';
import type { WorkdayPresenceTriggerContext } from '@/lib/workday-presence/triggers';
import type { WorkdayPresenceTriggerResult } from '@/lib/workday-presence/triggers';
import {
  selectSingleInterventionFromConnectorEvidence,
  type SimulatedConnectorEvidenceEvent,
} from '@/lib/connectors/test-mode/evidence-adapters';

export type SimulatedConnectorIngestionResult = {
  selected_context: WorkdayPresenceTriggerContext | null;
  trigger_result: WorkdayPresenceTriggerResult | null;
  reason: string;
  candidate_count: number;
  ignored: Array<{ kind: SimulatedConnectorEvidenceEvent['kind']; reason: string }>;
};

export function ingestSimulatedConnectorEvidenceOnce(
  events: SimulatedConnectorEvidenceEvent[],
  state: WorkdayPresenceState | null,
): SimulatedConnectorIngestionResult {
  const selection = selectSingleInterventionFromConnectorEvidence(events);
  if (!selection.selected) {
    return {
      selected_context: null,
      trigger_result: null,
      reason: selection.reason,
      candidate_count: selection.candidate_count,
      ignored: selection.ignored,
    };
  }

  const triggerResult = evaluateWorkdayPresenceTrigger(selection.selected, state);
  return {
    selected_context: selection.selected,
    trigger_result: triggerResult,
    reason: selection.reason,
    candidate_count: selection.candidate_count,
    ignored: selection.ignored,
  };
}

