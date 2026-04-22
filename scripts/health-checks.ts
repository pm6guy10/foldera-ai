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

/**
 * GitHub Actions sets `CI=true`. In that environment we still run the same
 * production queries, but "Repeated directive" (a data-state signal from
 * daily-generate) must not block merges that do not touch that pipeline — it
 * produced repeated red `Health Gate` runs on doc-only and unrelated pushes.
 * Set `HEALTH_STRICT_PRODUCTION=1` (e.g. repo secret on the `health` job) to
 * restore fail-on-duplicate in CI. Local `npm run health` (no `CI`) stays strict.
 */
export function isHealthCiRelaxedMode(): boolean {
  return process.env.CI === 'true' && process.env.HEALTH_STRICT_PRODUCTION !== '1';
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
