export type FirstRunSourceReadinessStatus =
  | 'no_connected_source'
  | 'connected_and_syncing'
  | 'connected_but_no_usable_signals'
  | 'connected_but_not_enough_evidence'
  | 'connected_with_usable_signals';

export type FirstRunSourceReadinessProvider = {
  provider: string;
  label: string;
  is_active: boolean;
  status: string | null;
  last_synced_at: string | null;
  can_check_now: boolean;
};

export type FirstRunSourceReadinessInput = {
  providers: FirstRunSourceReadinessProvider[];
  signal_count: number;
  processed_signal_count: number;
  unprocessed_signal_count: number;
  action_count: number;
  pipeline_run_count: number;
  last_checked_at: string | null;
};

export type FirstRunSourceReadiness = Omit<FirstRunSourceReadinessInput, 'providers'> & {
  status: FirstRunSourceReadinessStatus;
  connected: boolean;
  providers: string[];
  next_check_timing: string;
  headline: string;
  reason: string;
  next_action: string;
  nothing_sent_label: string;
  can_check_now: boolean;
  value_proof_ready: boolean;
};

function clampCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function joinProviderLabels(labels: string[]): string {
  if (labels.length === 0) return 'a source';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

function itemWord(count: number): string {
  return count === 1 ? 'item' : 'items';
}

export function buildFirstRunSourceReadiness(
  input: FirstRunSourceReadinessInput,
): FirstRunSourceReadiness {
  const activeProviders = input.providers.filter((provider) => provider.is_active);
  const providerLabels = activeProviders.map((provider) => provider.label).filter(Boolean);
  const providerLabel = joinProviderLabels(providerLabels);
  const signalCount = clampCount(input.signal_count);
  const processedCount = clampCount(input.processed_signal_count);
  const unprocessedCount = clampCount(input.unprocessed_signal_count);
  const actionCount = clampCount(input.action_count);
  const pipelineRunCount = clampCount(input.pipeline_run_count);
  const canCheckNow = activeProviders.some((provider) => provider.can_check_now);
  const connected = activeProviders.length > 0;
  const anyNeverSynced = activeProviders.some((provider) => provider.status === 'never_synced');

  let status: FirstRunSourceReadinessStatus;
  if (!connected) {
    status = 'no_connected_source';
  } else if (signalCount === 0 && anyNeverSynced) {
    status = 'connected_and_syncing';
  } else if (signalCount === 0) {
    status = 'connected_but_no_usable_signals';
  } else if (processedCount === 0) {
    status = 'connected_but_not_enough_evidence';
  } else {
    status = 'connected_with_usable_signals';
  }

  const nothingSentLabel = actionCount === 0 ? 'Nothing was sent.' : 'Nothing was sent from this readiness state.';
  const nextAction = 'Check again after more mail/calendar activity, or connect another source.';
  const nextCheckTiming = canCheckNow
    ? 'Next check: use Check sources now, or wait for the next scheduled source refresh.'
    : 'Next check: wait for the next scheduled source refresh or reconnect the source.';

  let headline: string;
  let reason: string;

  if (status === 'no_connected_source') {
    headline = 'Foldera needs one connected source before it can prepare a first read.';
    reason = 'No active Google or Microsoft source is connected yet.';
  } else if (status === 'connected_and_syncing') {
    headline = `Foldera connected ${providerLabel} and is checking sources now.`;
    reason = `Foldera has not found usable source items yet: ${processedCount} processed, ${unprocessedCount} waiting.`;
  } else if (status === 'connected_but_no_usable_signals') {
    headline = `Foldera connected ${providerLabel}, but has not found usable source items yet.`;
    reason = `Foldera has 0 source items: ${processedCount} processed, ${unprocessedCount} waiting.`;
  } else if (status === 'connected_but_not_enough_evidence') {
    headline = `Foldera connected ${providerLabel}, but only found ${signalCount} usable ${itemWord(signalCount)} so far.`;
    reason = `Foldera has ${signalCount} source ${itemWord(signalCount)}: ${processedCount} processed, ${unprocessedCount} waiting. That is not enough evidence for a safe move yet.`;
  } else {
    headline = `Foldera connected ${providerLabel} and found ${processedCount} processed source ${itemWord(processedCount)}.`;
    reason = actionCount > 0
      ? `Foldera has processed source evidence and ${actionCount} action ${actionCount === 1 ? 'row' : 'rows'} recorded.`
      : `Foldera has processed source evidence, but no safe action exists yet. Pipeline runs recorded: ${pipelineRunCount}.`;
  }

  return {
    ...input,
    signal_count: signalCount,
    processed_signal_count: processedCount,
    unprocessed_signal_count: unprocessedCount,
    action_count: actionCount,
    pipeline_run_count: pipelineRunCount,
    status,
    connected,
    providers: providerLabels,
    next_check_timing: nextCheckTiming,
    headline,
    reason,
    next_action: nextAction,
    nothing_sent_label: nothingSentLabel,
    can_check_now: canCheckNow,
    value_proof_ready:
      status === 'connected_but_not_enough_evidence' ||
      status === 'connected_but_no_usable_signals' ||
      status === 'connected_with_usable_signals',
  };
}
