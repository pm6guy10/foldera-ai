export const CURRENT_WORKDAY_PRESENCE_ACTION_SOURCES = new Set([
  'workday_presence',
  'workday_presence_trigger',
]);

type CurrentRuntimeReceiptRow = {
  action_source?: unknown;
  execution_result?: unknown;
};

function readActionSource(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isCurrentWorkdayPresenceReceipt(
  row: CurrentRuntimeReceiptRow | null | undefined,
): boolean {
  const actionSource = readActionSource(row?.action_source);
  return actionSource !== null && CURRENT_WORKDAY_PRESENCE_ACTION_SOURCES.has(actionSource);
}

export function countCurrentWorkdayPresenceReceipts(
  rows: CurrentRuntimeReceiptRow[],
): number {
  return rows.filter((row) => isCurrentWorkdayPresenceReceipt(row)).length;
}
