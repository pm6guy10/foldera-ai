import { createServerClient } from '@/lib/db/client';
import { renderPlaintextEmailHtml, sendResendEmail } from '@/lib/email/resend';

const HEALTH_ALERT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

interface ConnectorHealthFlag {
  provider: 'google' | 'microsoft';
  sourceKey: 'google_calendar' | 'drive' | 'onedrive';
  sourceLabel: 'Google Calendar' | 'Google Drive' | 'OneDrive';
}

interface UserTokenRow {
  user_id: string;
  provider: 'google' | 'microsoft';
  email: string | null;
  last_health_alert_at: string | null;
  expires_at: number | null;
  access_token: string | null;
  refresh_token: string | null;
  disconnected_at: string | null;
}

/** Non-secret OAuth row summary for cron logs / system_health (no tokens). */
export interface OAuthTokenExpiryDiagnostic {
  user_id: string;
  provider: string;
  connector_email: string | null;
  has_access_token: boolean;
  has_refresh_token: boolean;
  disconnected_at: string | null;
  expires_at_iso: string | null;
  /**
   * True when stored access `expires_at` is in the past (JWT expired at rest).
   * Refresh may still succeed on the next API call — this flags visibility, not definitive auth failure.
   */
  access_expired_at_rest: boolean;
}

export interface ConnectorHealthResult {
  ok: boolean;
  checked_users: number;
  alerts_sent: number;
  flagged_sources: number;
  skipped_recent_alerts: number;
  /** Surfaces token expiry / missing access so zero-signal syncs are diagnosable on the next cron. */
  oauth_token_diagnostics?: {
    rows: OAuthTokenExpiryDiagnostic[];
    expired_access_at_rest: number;
    missing_access_not_disconnected: number;
  };
  error?: string;
}

function shouldSendHealthAlert(lastHealthAlertAt: string | null): boolean {
  if (!lastHealthAlertAt) {
    return true;
  }

  return Date.now() - new Date(lastHealthAlertAt).getTime() > HEALTH_ALERT_WINDOW_MS;
}

function buildFlagsForRow(row: UserTokenRow, signalCounts: Record<string, number>): ConnectorHealthFlag[] {
  if (row.provider === 'google') {
    // Only flag calendar/drive if Gmail IS actively syncing (gmail > 0).
    // If Gmail is also 0, the whole Google connection is inactive — don't
    // alert about secondary scopes when the primary isn't working either.
    const gmailCount = signalCounts.gmail ?? 0;
    if (gmailCount === 0) return [];

    const flags: ConnectorHealthFlag[] = [];
    if ((signalCounts.google_calendar ?? 0) === 0) {
      flags.push({
        provider: 'google',
        sourceKey: 'google_calendar',
        sourceLabel: 'Google Calendar',
      });
    }
    if ((signalCounts.drive ?? 0) === 0) {
      flags.push({
        provider: 'google',
        sourceKey: 'drive',
        sourceLabel: 'Google Drive',
      });
    }
    return flags;
  }

  // Only flag OneDrive if Outlook mail IS actively syncing (outlook > 0).
  const outlookCount = signalCounts.outlook ?? 0;
  if (outlookCount === 0) return [];

  if ((signalCounts.onedrive ?? 0) === 0) {
    return [{
      provider: 'microsoft',
      sourceKey: 'onedrive',
      sourceLabel: 'OneDrive',
    }];
  }

  return [];
}

export async function checkConnectorHealth(): Promise<ConnectorHealthResult> {
  const supabase = createServerClient();
  const sevenDaysAgo = new Date(Date.now() - HEALTH_ALERT_WINDOW_MS).toISOString();

  const { data: tokenRows, error: tokenError } = await supabase
    .from('user_tokens')
    .select(
      'user_id, provider, email, last_health_alert_at, expires_at, access_token, refresh_token, disconnected_at',
    );

  if (tokenError) {
    return {
      ok: false,
      checked_users: 0,
      alerts_sent: 0,
      flagged_sources: 0,
      skipped_recent_alerts: 0,
      error: tokenError.message,
    };
  }

  const rows = (tokenRows ?? []) as UserTokenRow[];
  const nowSec = Math.floor(Date.now() / 1000);
  const oauthRows: OAuthTokenExpiryDiagnostic[] = rows.map((row) => {
    const expSec = typeof row.expires_at === 'number' && Number.isFinite(row.expires_at) ? row.expires_at : null;
    const hasAccess = Boolean(row.access_token);
    const hasRefresh = Boolean(row.refresh_token);
    return {
      user_id: row.user_id,
      provider: row.provider,
      connector_email: row.email,
      has_access_token: hasAccess,
      has_refresh_token: hasRefresh,
      disconnected_at: row.disconnected_at,
      expires_at_iso: expSec != null ? new Date(expSec * 1000).toISOString() : null,
      access_expired_at_rest: expSec != null && expSec < nowSec,
    };
  });
  const expiredAccessAtRest = oauthRows.filter((d) => d.access_expired_at_rest && d.has_access_token).length;
  const missingAccessNotDisconnected = oauthRows.filter((d) => !d.has_access_token && !d.disconnected_at).length;
  const oauthFlagRows = oauthRows.filter(
    (d) =>
      (d.access_expired_at_rest && d.has_access_token) ||
      (!d.has_access_token && !d.disconnected_at),
  );
  console.log(
    JSON.stringify({
      event: 'connector_health_oauth_token_expiry',
      checked_token_rows: oauthRows.length,
      expired_access_at_rest_count: expiredAccessAtRest,
      missing_access_not_disconnected_count: missingAccessNotDisconnected,
      flag_rows: oauthFlagRows,
    }),
  );

  if (rows.length === 0) {
    return {
      ok: true,
      checked_users: 0,
      alerts_sent: 0,
      flagged_sources: 0,
      skipped_recent_alerts: 0,
      oauth_token_diagnostics: {
        rows: [],
        expired_access_at_rest: 0,
        missing_access_not_disconnected: 0,
      },
    };
  }

  const signalCountsByUser = new Map<string, Record<string, number>>();
  const uniqueUserIds = [...new Set(rows.map((row) => row.user_id))];

  for (const userId of uniqueUserIds) {
    const { data: signals, error: signalError } = await supabase
      .from('tkg_signals')
      .select('source')
      .eq('user_id', userId)
      .gte('occurred_at', sevenDaysAgo);

    if (signalError) {
      return {
        ok: false,
        checked_users: signalCountsByUser.size,
        alerts_sent: 0,
        flagged_sources: 0,
        skipped_recent_alerts: 0,
        oauth_token_diagnostics: {
          rows: oauthRows,
          expired_access_at_rest: expiredAccessAtRest,
          missing_access_not_disconnected: missingAccessNotDisconnected,
        },
        error: signalError.message,
      };
    }

    const counts: Record<string, number> = {};
    for (const signal of signals ?? []) {
      const source = signal.source as string;
      counts[source] = (counts[source] ?? 0) + 1;
    }
    signalCountsByUser.set(userId, counts);
  }

  let alertsSent = 0;
  let flaggedSources = 0;
  let skippedRecentAlerts = 0;

  for (const row of rows) {
    const signalCounts = signalCountsByUser.get(row.user_id) ?? {};
    const flags = buildFlagsForRow(row, signalCounts);
    if (flags.length === 0) {
      continue;
    }

    flaggedSources += flags.length;
    if (!row.email) {
      continue;
    }

    if (!shouldSendHealthAlert(row.last_health_alert_at)) {
      skippedRecentAlerts += flags.length;
      continue;
    }

    for (const flag of flags) {
      const providerName = flag.provider === 'google' ? 'Google' : 'Microsoft';
      const body = `${flag.sourceLabel} has been connected but hasn't synced data in 7 days. To enable ${flag.sourceLabel} sync, disconnect and reconnect ${providerName} from Settings to grant the required permissions.`;
      const result = await sendResendEmail({
        to: row.email,
        subject: `Foldera: ${flag.sourceLabel} isn't syncing`,
        text: body,
        html: renderPlaintextEmailHtml(body),
        tags: [
          { name: 'email_type', value: 'connector_health' },
          { name: 'provider', value: flag.provider },
          { name: 'source', value: flag.sourceKey },
          { name: 'user_id', value: row.user_id },
        ],
      });

      const maybeError =
        result && typeof result === 'object' && 'error' in result
          ? (result as { error?: { message?: string } | null }).error
          : null;
      if (maybeError) {
        return {
          ok: false,
          checked_users: uniqueUserIds.length,
          alerts_sent: alertsSent,
          flagged_sources: flaggedSources,
          skipped_recent_alerts: skippedRecentAlerts,
          oauth_token_diagnostics: {
            rows: oauthRows,
            expired_access_at_rest: expiredAccessAtRest,
            missing_access_not_disconnected: missingAccessNotDisconnected,
          },
          error: maybeError.message ?? 'Resend health alert failed',
        };
      }

      alertsSent += 1;
    }

    const { error: updateError } = await supabase
      .from('user_tokens')
      .update({
        last_health_alert_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', row.user_id)
      .eq('provider', row.provider);

    if (updateError) {
      return {
        ok: false,
        checked_users: uniqueUserIds.length,
        alerts_sent: alertsSent,
        flagged_sources: flaggedSources,
        skipped_recent_alerts: skippedRecentAlerts,
        oauth_token_diagnostics: {
          rows: oauthRows,
          expired_access_at_rest: expiredAccessAtRest,
          missing_access_not_disconnected: missingAccessNotDisconnected,
        },
        error: updateError.message,
      };
    }
  }

  return {
    ok: true,
    checked_users: uniqueUserIds.length,
    alerts_sent: alertsSent,
    flagged_sources: flaggedSources,
    skipped_recent_alerts: skippedRecentAlerts,
    oauth_token_diagnostics: {
      rows: oauthRows,
      expired_access_at_rest: expiredAccessAtRest,
      missing_access_not_disconnected: missingAccessNotDisconnected,
    },
  };
}
