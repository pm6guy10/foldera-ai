import { createServerClient } from '@/lib/db/client';
import { renderPlaintextEmailHtml, sendResendEmail } from '@/lib/email/resend';

const HEALTH_ALERT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

interface ConnectorHealthFlag {
  provider: 'google' | 'microsoft';
  sourceKey: 'google_calendar' | 'google_drive' | 'onedrive';
  sourceLabel: 'Google Calendar' | 'Google Drive' | 'OneDrive';
}

interface UserTokenRow {
  user_id: string;
  provider: 'google' | 'microsoft';
  email: string | null;
  last_health_alert_at: string | null;
}

export interface ConnectorHealthResult {
  ok: boolean;
  checked_users: number;
  alerts_sent: number;
  flagged_sources: number;
  skipped_recent_alerts: number;
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
    const flags: ConnectorHealthFlag[] = [];
    if ((signalCounts.google_calendar ?? 0) === 0) {
      flags.push({
        provider: 'google',
        sourceKey: 'google_calendar',
        sourceLabel: 'Google Calendar',
      });
    }
    if ((signalCounts.google_drive ?? 0) === 0) {
      flags.push({
        provider: 'google',
        sourceKey: 'google_drive',
        sourceLabel: 'Google Drive',
      });
    }
    return flags;
  }

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
    .select('user_id, provider, email, last_health_alert_at');

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
  if (rows.length === 0) {
    return {
      ok: true,
      checked_users: 0,
      alerts_sent: 0,
      flagged_sources: 0,
      skipped_recent_alerts: 0,
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
      const body = `${flag.sourceLabel} has been connected but hasn't synced data in 7 days. Try disconnecting and reconnecting from Settings.`;
      const result = await sendResendEmail({
        from: 'Foldera <brief@foldera.ai>',
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
  };
}
