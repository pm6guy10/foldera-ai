import type { RepeatedDirectiveHealthSummary } from '../lib/cron/duplicate-truth';

export type HealthCheckGroup = 'blocking' | 'warning';
export type HealthCheckStatus = 'pass' | 'warn' | 'fail';

export interface HealthCheckRow {
  group: HealthCheckGroup;
  status: HealthCheckStatus;
  line: string;
}

function iconForStatus(status: HealthCheckStatus): string {
  switch (status) {
    case 'fail':
      return '✗';
    case 'warn':
      return '⚠';
    default:
      return '✓';
  }
}

export function formatHealthLine(label: string, detail?: string, status: HealthCheckStatus = 'pass') {
  const prefix = `${iconForStatus(status)} ${label.padEnd(20)}`;
  return detail ? `${prefix} ${detail}` : prefix.trimEnd();
}

export function blockingCheck(
  label: string,
  ok: boolean,
  okDetail?: string,
  failDetail?: string,
): HealthCheckRow {
  return {
    group: 'blocking',
    status: ok ? 'pass' : 'fail',
    line: formatHealthLine(label, ok ? okDetail : failDetail, ok ? 'pass' : 'fail'),
  };
}

export function warningCheck(
  label: string,
  detail?: string,
  status: Exclude<HealthCheckStatus, 'fail'> = 'warn',
): HealthCheckRow {
  return {
    group: 'warning',
    status,
    line: formatHealthLine(label, detail, status),
  };
}

export function countBlockingFailures(checks: HealthCheckRow[]): number {
  return checks.filter((check) => check.group === 'blocking' && check.status === 'fail').length;
}

export function buildRepeatedDirectiveCheck(
  repeated: RepeatedDirectiveHealthSummary,
  relAgoText: (iso: string | null | undefined) => string,
): HealthCheckRow {
  if (repeated.status === 'clear') {
    return blockingCheck('No repeated directive', true);
  }

  if (repeated.status === 'historical_backlog') {
    return warningCheck(
      'Duplicate backlog',
      repeated.latestRowProtectedDuplicateBlock
        ? `max ${repeated.maxCopies} copies of one shape in 24h; latest run protected with no_send_persisted`
        : `max ${repeated.maxCopies} copies of one shape in 24h; latest persisted copy ${relAgoText(repeated.dominantLatestGeneratedAt)}`,
    );
  }

  return blockingCheck(
    'Repeated directive',
    false,
    undefined,
    `max ${repeated.maxCopies} copies of one shape in 24h; latest persisted copy ${relAgoText(repeated.dominantLatestGeneratedAt)}`,
  );
}
