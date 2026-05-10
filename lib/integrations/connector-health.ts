import { createServerClient } from '../db/client';
import {
  INTEGRATIONS_SYNC_STALE_MS,
  MAIL_CURSOR_FRESH_MS,
} from '../config/constants';

export type ConnectorHealthStatus =
  | 'fresh'
  | 'stale'
  | 'disconnected'
  | 'reauth_required'
  | 'never_synced';

export interface ConnectorHealthRow {
  provider: string | null;
  email: string | null;
  last_synced_at: string | null;
  scopes?: string | null;
  access_token?: string | null;
  expires_at?: number | null;
  refresh_token?: string | null;
  disconnected_at?: string | null;
  oauth_reauth_required_at?: string | null;
}

export interface ConnectorHealthInstruction {
  provider: string;
  email: string | null;
  status: ConnectorHealthStatus;
  last_synced_at: string | null;
  recommended_action: string;
}

export interface ConnectorHealthEntry extends ConnectorHealthInstruction {
  ui_provider: string;
  age_hours: number | null;
  is_active: boolean;
  has_access_token: boolean;
  has_refresh_token: boolean;
  missing_scopes: string[];
  needs_reauth: boolean;
  needs_reconnect: boolean;
  needs_sync: boolean;
  sync_stale: boolean;
}

export interface ConnectorHealthSummary {
  providers: ConnectorHealthEntry[];
  instructions: ConnectorHealthInstruction[];
  counts: Record<ConnectorHealthStatus, number>;
  generation_gate: {
    level: 'ok' | 'warn' | 'block';
    reason: string;
    recommended_actions: string[];
  };
}

const GOOGLE_REQUIRED_SCOPE_HINTS = [
  { needles: ['userinfo.email', 'email'], label: 'email access' },
  { needles: ['userinfo.profile', 'profile'], label: 'profile access' },
  { needles: ['gmail.readonly'], label: 'Gmail read access' },
  { needles: ['gmail.send'], label: 'send access' },
  { needles: ['calendar'], label: 'Calendar access' },
  { needles: ['drive.readonly'], label: 'Drive access' },
];

const MICROSOFT_REQUIRED_SCOPE_HINTS = [
  { needles: ['user.read'], label: 'Microsoft profile access' },
  { needles: ['mail.read'], label: 'mail read access' },
  { needles: ['mail.send'], label: 'mail send access' },
  { needles: ['calendars.read'], label: 'calendar access' },
  { needles: ['files.read'], label: 'files access' },
  { needles: ['tasks.read'], label: 'tasks access' },
  { needles: ['offline_access'], label: 'offline refresh access' },
];

function providerLabel(provider: string): string {
  return provider === 'microsoft' ? 'Microsoft' : 'Google';
}

export function toUiConnectorProvider(provider: string | null | undefined): string {
  return provider === 'microsoft' ? 'azure_ad' : String(provider ?? '').trim().toLowerCase();
}

function normalizeConnectorProvider(provider: string | null | undefined): string {
  const normalized = String(provider ?? '').trim().toLowerCase();
  if (normalized === 'azure_ad' || normalized === 'azure-ad') return 'microsoft';
  return normalized;
}

function hasValue(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeScopes(scopes: unknown): string[] {
  return typeof scopes === 'string'
    ? scopes
        .split(/\s+/)
        .map((scope) => scope.trim().toLowerCase())
        .filter(Boolean)
    : [];
}

export function missingScopeLabels(
  provider: string,
  scopes: unknown,
  options?: { hasRefreshToken?: boolean },
): string[] {
  const granted = normalizeScopes(scopes);
  const hints =
    normalizeConnectorProvider(provider) === 'microsoft'
      ? MICROSOFT_REQUIRED_SCOPE_HINTS
      : GOOGLE_REQUIRED_SCOPE_HINTS;

  return hints
    .filter(({ needles }) => {
      if (
        normalizeConnectorProvider(provider) === 'microsoft' &&
        needles.includes('offline_access') &&
        options?.hasRefreshToken
      ) {
        return false;
      }
      return !needles.some((needle) =>
        granted.some((scope) => scope === needle || scope.includes(needle)),
      );
    })
    .map(({ label }) => label);
}

function ageHours(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, Math.round((nowMs - ts) / (1000 * 60 * 60)));
}

function buildRecommendedAction(input: {
  provider: string;
  status: ConnectorHealthStatus;
  missingScopes: string[];
}): string {
  const label = providerLabel(input.provider);
  if (input.status === 'fresh') {
    return `No action needed. ${label} is fresh enough for generation.`;
  }
  if (input.status === 'stale') {
    return `Refresh ${label} before the next generation if newer mail or calendar updates should be present.`;
  }
  if (input.status === 'disconnected') {
    return `Connect ${label} before trusting this source in Foldera.`;
  }
  if (input.status === 'never_synced') {
    return `Wait for the first ${label} sync to finish, or reconnect if it never starts.`;
  }
  if (input.missingScopes.length > 0) {
    return `Reconnect ${label} to restore ${formatMissingScopes(input.missingScopes)} before the next generation.`;
  }
  return `Reconnect ${label} to restore background sync before the next generation.`;
}

function formatMissingScopes(scopes: string[]): string {
  if (scopes.length === 0) return 'the required permissions';
  if (scopes.length === 1) return scopes[0];
  if (scopes.length === 2) return `${scopes[0]} and ${scopes[1]}`;
  return `${scopes.slice(0, -1).join(', ')}, and ${scopes[scopes.length - 1]}`;
}

export function buildConnectorHealthEntries(
  rows: ConnectorHealthRow[],
  options: { nowMs?: number } = {},
): ConnectorHealthEntry[] {
  const nowMs = options.nowMs ?? Date.now();

  return rows.map((row) => {
    const provider = normalizeConnectorProvider(row.provider);
    const uiProvider = toUiConnectorProvider(provider);
    const hasAccessToken = hasValue(row.access_token);
    const hasRefreshToken = hasValue(row.refresh_token);
    const needsReauth = hasValue(row.oauth_reauth_required_at);
    const missingScopes = hasAccessToken
      ? missingScopeLabels(provider, row.scopes, { hasRefreshToken })
      : [];
    const disconnected =
      hasValue(row.disconnected_at) || (!hasAccessToken && !hasRefreshToken && !needsReauth);
    const needsReconnect = !needsReauth && hasAccessToken && (!hasRefreshToken || missingScopes.length > 0);
    const isActive = hasAccessToken && !hasValue(row.disconnected_at);
    const age = ageHours(row.last_synced_at, nowMs);
    const lastSyncMs = row.last_synced_at ? new Date(row.last_synced_at).getTime() : Number.NaN;
    const hasValidLastSync = Number.isFinite(lastSyncMs);
    const isStale = hasValidLastSync && nowMs - lastSyncMs > MAIL_CURSOR_FRESH_MS;

    let status: ConnectorHealthStatus;
    if (disconnected) {
      status = 'disconnected';
    } else if (needsReauth || needsReconnect) {
      status = 'reauth_required';
    } else if (!row.last_synced_at) {
      status = 'never_synced';
    } else if (isStale) {
      status = 'stale';
    } else {
      status = 'fresh';
    }

    return {
      provider,
      ui_provider: uiProvider,
      email: row.email ?? null,
      status,
      last_synced_at: row.last_synced_at ?? null,
      recommended_action: buildRecommendedAction({
        provider,
        status,
        missingScopes,
      }),
      age_hours: age,
      is_active: isActive,
      has_access_token: hasAccessToken,
      has_refresh_token: hasRefreshToken,
      missing_scopes: missingScopes,
      needs_reauth: needsReauth,
      needs_reconnect: needsReconnect,
      needs_sync: status === 'stale',
      sync_stale:
        status === 'stale' &&
        hasValidLastSync &&
        nowMs - lastSyncMs > INTEGRATIONS_SYNC_STALE_MS,
    };
  });
}

export function buildConnectorHealthSummary(
  providers: ConnectorHealthEntry[],
): ConnectorHealthSummary {
  const counts: Record<ConnectorHealthStatus, number> = {
    fresh: 0,
    stale: 0,
    disconnected: 0,
    reauth_required: 0,
    never_synced: 0,
  };

  for (const provider of providers) {
    counts[provider.status] += 1;
  }

  const freshActiveProviders = providers.filter(
    (provider) => provider.is_active && provider.status === 'fresh',
  );
  const providersNeedingAttention = providers.filter(
    (provider) => provider.status !== 'fresh',
  );

  let generationGate: ConnectorHealthSummary['generation_gate'];
  if (providers.length === 0) {
    generationGate = {
      level: 'block',
      reason: 'No active connector is available for generation.',
      recommended_actions: [
        'Connect Google or Microsoft before relying on Foldera generation.',
      ],
    };
  } else if (providersNeedingAttention.length === 0) {
    generationGate = {
      level: 'ok',
      reason: 'All active connectors are fresh enough for generation.',
      recommended_actions: [],
    };
  } else if (freshActiveProviders.length > 0) {
    generationGate = {
      level: 'warn',
      reason:
        'At least one active connector is stale or needs attention, but another active connector is still fresh.',
      recommended_actions: providersNeedingAttention.map((provider) => provider.recommended_action),
    };
  } else {
    generationGate = {
      level: 'block',
      reason: 'No active connector is fresh enough for generation.',
      recommended_actions: providersNeedingAttention.map((provider) => provider.recommended_action),
    };
  }

  return {
    providers,
    instructions: providers.map((provider) => ({
      provider: provider.provider,
      email: provider.email,
      status: provider.status,
      last_synced_at: provider.last_synced_at,
      recommended_action: provider.recommended_action,
    })),
    counts,
    generation_gate: generationGate,
  };
}

function supabaseErrorText(err: unknown): string {
  if (err == null) return '';
  if (typeof err === 'string') return err;
  if (err instanceof Error) {
    const e = err as Error & { details?: string; hint?: string; code?: string };
    return [e.message, e.details, e.hint, e.code].filter(Boolean).join(' | ');
  }
  if (typeof err === 'object') {
    const o = err as Record<string, unknown>;
    const parts = [o.message, o.details, o.hint, o.code].filter((x) => typeof x === 'string') as string[];
    try {
      return `${parts.join(' | ')} | ${JSON.stringify(err)}`;
    } catch {
      return parts.join(' | ');
    }
  }
  return String(err);
}

function postgresErrorCode(err: unknown): string {
  if (err == null || typeof err !== 'object') return '';
  const code = (err as Record<string, unknown>).code;
  return typeof code === 'string' ? code : '';
}

function isOauthReauthColumnMissing(err: unknown): boolean {
  const text = supabaseErrorText(err);
  if (/oauth_reauth_required_at/i.test(text)) return true;
  if (postgresErrorCode(err) === '42703' && /oauth_reauth/i.test(text)) return true;
  return false;
}

type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        or: (clause: string) => Promise<{ data: ConnectorHealthRow[] | null; error: unknown }>;
        is?: (column: string, value: null) => Promise<{ data: ConnectorHealthRow[] | null; error: unknown }>;
      };
    };
  };
};

export async function loadConnectorHealthRows(options: {
  userId: string;
  supabase?: SupabaseLike;
}): Promise<{ rows: ConnectorHealthRow[]; legacyReauthShape: boolean }> {
  const supabase = options.supabase ?? (createServerClient() as unknown as SupabaseLike);

  const modern = await supabase
    .from('user_tokens')
      .select(
        'provider, email, last_synced_at, scopes, access_token, expires_at, refresh_token, disconnected_at, oauth_reauth_required_at',
      )
    .eq('user_id', options.userId)
    .or('disconnected_at.is.null,oauth_reauth_required_at.not.is.null');

  if (modern.error && isOauthReauthColumnMissing(modern.error)) {
    const legacy = await supabase
      .from('user_tokens')
      .select(
        'provider, email, last_synced_at, scopes, access_token, expires_at, refresh_token, disconnected_at',
      )
      .eq('user_id', options.userId)
      .is?.('disconnected_at', null);
    if (!legacy || legacy.error) {
      throw legacy?.error ?? modern.error;
    }
    return {
      rows: legacy.data ?? [],
      legacyReauthShape: true,
    };
  }

  if (modern.error) {
    throw modern.error;
  }

  return {
    rows: modern.data ?? [],
    legacyReauthShape: false,
  };
}

export async function getConnectorHealthSummary(options: {
  userId: string;
  supabase?: SupabaseLike;
  nowMs?: number;
}): Promise<ConnectorHealthSummary> {
  const { rows } = await loadConnectorHealthRows({
    userId: options.userId,
    supabase: options.supabase,
  });
  return buildConnectorHealthSummary(
    buildConnectorHealthEntries(rows, { nowMs: options.nowMs }),
  );
}
