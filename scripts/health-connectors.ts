import {
  buildConnectorHealthEntries,
  type ConnectorHealthEntry,
  type ConnectorHealthRow,
} from '../lib/integrations/connector-health';
import { warningCheck, type HealthCheckRow } from './health-checks';
import { MAIL_CURSOR_FRESH_MS } from '../lib/config/constants';

export interface HealthTokenRow extends ConnectorHealthRow {}

export function relAgo(iso: string | null | undefined, now: number): string {
  if (!iso) return 'never';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 'invalid time';
  const diff = now - t;
  if (diff < 0) return '0m ago';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h >= 48) return `${Math.floor(h / 24)}d ago`;
  if (h > 0) return `${h}h ago`;
  return `${m}m ago`;
}

export function isFresh(iso: string | null | undefined, now: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && now - t <= MAIL_CURSOR_FRESH_MS;
}

function hasValue(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.length > 0;
}

function providerName(provider: 'google' | 'microsoft'): string {
  return provider === 'google' ? 'Google' : 'Microsoft';
}

function reconnectDetail(provider: 'google' | 'microsoft', reason: string): string {
  return `${providerName(provider)} mailbox ${reason} - reconnect in Sources`;
}

export function buildMailboxReadinessCheck(
  label: 'Gmail' | 'Outlook',
  provider: 'google' | 'microsoft',
  tokenRows: HealthTokenRow[],
): HealthCheckRow | null {
  const providerRows = tokenRows.filter((row) => row.provider === provider);
  const activeRows = providerRows.filter((row) => row.disconnected_at == null);

  if (providerRows.length === 0 || activeRows.length === 0) {
    const disconnected = providerRows.some((row) => row.disconnected_at != null);
    return warningCheck(
      disconnected ? `${label} reconnect required` : `${label} disconnected`,
      disconnected
        ? reconnectDetail(provider, 'is disconnected')
        : `(no ${providerName(provider)} mailbox connected - reconnect in Sources)`,
    );
  }

  if (activeRows.some((row) => !hasValue(row.access_token))) {
    return warningCheck(
      `${label} reconnect required`,
      reconnectDetail(provider, 'is missing an access token'),
    );
  }

  if (activeRows.some((row) => !hasValue(row.refresh_token))) {
    return warningCheck(
      `${label} reconnect required`,
      reconnectDetail(provider, 'is missing background refresh'),
    );
  }

  return null;
}

export function buildMailboxFreshnessCheck(
  label: 'Gmail' | 'Outlook',
  newestMailOccurredAt: string | null,
  now: number,
): HealthCheckRow {
  const fresh = isFresh(newestMailOccurredAt, now);
  return fresh
    ? warningCheck(`${label} fresh`, relAgo(newestMailOccurredAt, now), 'pass')
    : warningCheck(`${label} stale`, `${relAgo(newestMailOccurredAt, now)} - check sync / ingest`);
}

export function buildMailCursorCheck(tokenRows: HealthTokenRow[], now: number): HealthCheckRow {
  const mailTokens = tokenRows.filter(
    (row) =>
      (row.provider === 'google' || row.provider === 'microsoft') &&
      row.disconnected_at == null &&
      hasValue(row.access_token) &&
      hasValue(row.refresh_token),
  );

  if (mailTokens.length === 0) {
    return warningCheck(
      'Mail cursors unavailable',
      '(no refresh-capable google/microsoft tokens)',
    );
  }

  const stale: string[] = [];
  for (const row of mailTokens) {
    if (!isFresh(row.last_synced_at, now)) {
      stale.push(`${row.provider} ${relAgo(row.last_synced_at, now)}`);
    }
  }

  return stale.length === 0
    ? warningCheck('Mail cursors current', undefined, 'pass')
    : warningCheck('Mail cursors stale', stale.join('; '));
}

function connectorForHealth(
  provider: 'google' | 'microsoft',
  tokenRows: HealthTokenRow[],
  now: number,
): ConnectorHealthEntry | null {
  const providerEntries = buildConnectorHealthEntries(
    tokenRows.filter((row) => row.provider === provider),
    { nowMs: now },
  );
  if (providerEntries.length === 0) return null;

  return (
    providerEntries.find((entry) => entry.is_active) ??
    providerEntries.find((entry) => entry.status === 'reauth_required') ??
    providerEntries[0]
  );
}

export function buildConnectorStatusCheck(
  label: 'Gmail' | 'Outlook',
  provider: 'google' | 'microsoft',
  tokenRows: HealthTokenRow[],
  now: number,
): HealthCheckRow {
  const entry = connectorForHealth(provider, tokenRows, now);
  const providerLabel = providerName(provider);

  if (!entry) {
    return warningCheck(
      `${label} disconnected`,
      `(no ${providerLabel} mailbox connected - reconnect in Sources)`,
    );
  }

  if (entry.status === 'fresh') {
    return warningCheck(
      `${label} fresh`,
      `${relAgo(entry.last_synced_at, now)}${entry.email ? ` · ${entry.email}` : ''}`,
      'pass',
    );
  }

  if (entry.status === 'stale') {
    return warningCheck(
      `${label} stale`,
      `${relAgo(entry.last_synced_at, now)} - ${entry.recommended_action}`,
    );
  }

  if (entry.status === 'reauth_required') {
    return warningCheck(
      `${label} reauth required`,
      `${entry.email ?? providerLabel} - ${entry.recommended_action}`,
    );
  }

  if (entry.status === 'never_synced') {
    return warningCheck(
      `${label} never synced`,
      `${entry.email ?? providerLabel} - ${entry.recommended_action}`,
    );
  }

  return warningCheck(
    `${label} disconnected`,
    `${entry.email ?? providerLabel} - ${entry.recommended_action}`,
  );
}
