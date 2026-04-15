import type { SupabaseClient } from '../db/client';
import { createServerClient } from '../db/client';
import { INTEGRATIONS_SYNC_STALE_MS, MS_14D, MS_30D } from '../config/constants';
import { OWNER_USER_ID } from '../auth/constants';
import type { ConvictionArtifact, ConvictionDirective } from '../briefing/types';
import { isSendWorthy } from '../cron/daily-brief-generate';

export type BetaReadinessVerdict = 'READY' | 'NOT_READY';

export interface BetaReadinessReport {
  target: string;
  user_id: string | null;
  email: string | null;
  user_exists: boolean;
  account_exists: boolean;
  account: null | {
    plan: string | null;
    status: string | null;
    current_period_end: string | null;
  };
  connected_providers: string[];
  providers: Array<{
    provider: string;
    is_connected: boolean;
    auth_valid: boolean;
    needs_reconnect: boolean;
    needs_reauth: boolean;
    required_scopes_present: boolean;
    missing_scopes: string[];
    last_synced_at: string | null;
    sync_recent: boolean;
    sync_email: string | null;
  }>;
  signals: { count_14d: number; count_30d: number; window_days_for_readiness: number };
  latest_directive_exists: boolean;
  latest_directive: null | { id: string; action_type: string | null; status: string | null; generated_at: string | null };
  latest_artifact_exists: boolean;
  latest_artifact_valid: boolean;
  latest_artifact_invalid_reason: string | null;
  verdict: BetaReadinessVerdict;
  blockers: string[];
}

type ProviderRow = {
  provider: string | null;
  email: string | null;
  scopes: string | null;
  last_synced_at: string | null;
  access_token: string | null;
  refresh_token: string | null;
  disconnected_at?: string | null;
  oauth_reauth_required_at?: string | null;
};

const GOOGLE_REQUIRED_SCOPE_HINTS = [
  { needle: 'userinfo.email', label: 'email access' },
  { needle: 'userinfo.profile', label: 'profile access' },
  { needle: 'gmail.readonly', label: 'Gmail read access' },
  { needle: 'gmail.send', label: 'send access' },
  { needle: 'calendar', label: 'Calendar access' },
  { needle: 'drive.readonly', label: 'Drive access' },
];

const MICROSOFT_REQUIRED_SCOPE_HINTS = [
  { needle: 'user.read', label: 'Microsoft profile access' },
  { needle: 'mail.read', label: 'mail read access' },
  { needle: 'mail.send', label: 'mail send access' },
  { needle: 'calendars.read', label: 'calendar access' },
  { needle: 'files.read', label: 'files access' },
  { needle: 'tasks.read', label: 'tasks access' },
  { needle: 'offline_access', label: 'offline refresh access' },
];

function normalizeScopes(scopes: unknown): string[] {
  return typeof scopes === 'string'
    ? scopes
        .split(/\s+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    : [];
}

function missingScopeLabels(provider: 'google' | 'microsoft', scopes: unknown): string[] {
  const granted = normalizeScopes(scopes);
  const hints = provider === 'microsoft' ? MICROSOFT_REQUIRED_SCOPE_HINTS : GOOGLE_REQUIRED_SCOPE_HINTS;
  return hints
    .filter(({ needle }) => !granted.some((scope) => scope.includes(needle)))
    .map(({ label }) => label);
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

async function resolveAuthUserIdByEmail(supabase: SupabaseClient, email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  try {
    const { data, error } = await supabase.rpc('get_auth_user_id_by_email', {
      lookup_email: normalized,
    });
    if (error) return null;
    return typeof data === 'string' && data.length > 0 ? data : null;
  } catch {
    return null;
  }
}

function providerDisplay(provider: string): string {
  if (provider === 'google') return 'google';
  if (provider === 'microsoft') return 'microsoft';
  return provider || 'unknown';
}

function artifactFromActionRow(row: any): Record<string, unknown> | null {
  if (row?.artifact && typeof row.artifact === 'object') return row.artifact as Record<string, unknown>;
  const executionResult = row?.execution_result && typeof row.execution_result === 'object'
    ? (row.execution_result as Record<string, unknown>)
    : null;
  if (!executionResult) return null;
  if (executionResult.artifact && typeof executionResult.artifact === 'object') return executionResult.artifact as Record<string, unknown>;
  if (executionResult.embeddedArtifact && typeof executionResult.embeddedArtifact === 'object') return executionResult.embeddedArtifact as Record<string, unknown>;
  return null;
}

export async function buildBetaReadinessReport(
  target: string,
  options?: { supabase?: SupabaseClient },
): Promise<BetaReadinessReport> {
  const supabase = options?.supabase ?? createServerClient();
  const blockers: string[] = [];
  const ident = target.trim();

  // 1. user exists
  let userId: string | null = null;
  if (ident.includes('@')) {
    userId = await resolveAuthUserIdByEmail(supabase, ident);
  } else if (isUuidLike(ident)) {
    userId = ident;
  } else {
    blockers.push('invalid_identifier (expected UUID user id or email)');
  }

  let authUser: any = null;
  if (userId) {
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (!error && data?.user) authUser = data.user;
  }
  const userExists = Boolean(authUser?.id);
  if (!userExists) blockers.push('user_missing');

  if (!userExists) {
    return {
      target: ident,
      user_id: null,
      email: null,
      user_exists: false,
      account_exists: false,
      account: null,
      connected_providers: [],
      providers: [],
      signals: { count_14d: 0, count_30d: 0, window_days_for_readiness: 30 },
      latest_directive_exists: false,
      latest_directive: null,
      latest_artifact_exists: false,
      latest_artifact_valid: false,
      latest_artifact_invalid_reason: null,
      verdict: 'NOT_READY',
      blockers,
    };
  }

  // 2. account exists
  const { data: subRow, error: subErr } = await supabase
    .from('user_subscriptions')
    .select('user_id, plan, status, current_period_end')
    .eq('user_id', String(authUser.id))
    .maybeSingle();
  if (subErr) blockers.push(`account_lookup_failed (${subErr.message})`);
  const accountExists = Boolean(subRow?.user_id);
  if (!accountExists) blockers.push('account_missing (no user_subscriptions row)');

  // 3-5. providers connected + auth/scopes status + last sync timestamps
  const { data: tokenRows, error: tokenErr } = await supabase
    .from('user_tokens')
    .select('provider, email, last_synced_at, scopes, access_token, refresh_token, disconnected_at, oauth_reauth_required_at')
    .eq('user_id', String(authUser.id))
    .or('disconnected_at.is.null,oauth_reauth_required_at.not.is.null');
  if (tokenErr) blockers.push(`provider_lookup_failed (${tokenErr.message})`);

  const providers: BetaReadinessReport['providers'] = [];
  const nowMs = Date.now();
  for (const row of (tokenRows ?? []) as ProviderRow[]) {
    const provider = row.provider ?? 'unknown';
    const hasToken = typeof row.access_token === 'string' && row.access_token.length > 0;
    const hasRefresh = typeof row.refresh_token === 'string' && row.refresh_token.length > 0;
    const disconnected = typeof row.disconnected_at === 'string' && row.disconnected_at.length > 0;
    const reauthRequired = typeof row.oauth_reauth_required_at === 'string' && row.oauth_reauth_required_at.length > 0;

    const isConnected = hasToken && !disconnected;
    const needsReconnect = hasToken && !hasRefresh;
    const authValid = isConnected && hasRefresh && !reauthRequired;

    const missingScopes =
      provider === 'microsoft'
        ? missingScopeLabels('microsoft', row.scopes)
        : provider === 'google'
          ? missingScopeLabels('google', row.scopes)
          : [];
    const requiredScopesPresent = authValid && missingScopes.length === 0;

    const lastSyncedAt = row.last_synced_at ?? null;
    const lastSyncMs = lastSyncedAt ? new Date(lastSyncedAt).getTime() : 0;
    const syncRecent = authValid && lastSyncMs > 0 && nowMs - lastSyncMs <= INTEGRATIONS_SYNC_STALE_MS;

    providers.push({
      provider,
      is_connected: isConnected,
      auth_valid: authValid,
      needs_reconnect: needsReconnect,
      needs_reauth: reauthRequired,
      required_scopes_present: requiredScopesPresent,
      missing_scopes: missingScopes,
      last_synced_at: lastSyncedAt,
      sync_recent: syncRecent,
      sync_email: row.email ?? null,
    });
  }

  const connectedProviders = providers.filter((p) => p.is_connected).map((p) => providerDisplay(p.provider));
  if (connectedProviders.length === 0) blockers.push('no_connected_provider');

  const providerMeetsReadiness = providers.some(
    (p) => p.is_connected && p.auth_valid && p.required_scopes_present && p.sync_recent,
  );
  if (providers.length > 0 && !providers.some((p) => p.is_connected && p.auth_valid)) {
    blockers.push('provider_auth_invalid (no connected provider with valid refresh/auth)');
  }
  if (providers.some((p) => p.is_connected && p.auth_valid && !p.required_scopes_present)) {
    blockers.push('provider_missing_scopes');
  }
  if (providers.some((p) => p.is_connected && p.auth_valid && p.required_scopes_present && !p.sync_recent)) {
    blockers.push('no_recent_sync (all connected providers stale or missing last_synced_at)');
  }

  // 6. recent signals count (processed=true)
  const cutoff14 = new Date(nowMs - MS_14D).toISOString();
  const cutoff30 = new Date(nowMs - MS_30D).toISOString();
  const [{ count: count14 }, { count: count30 }] = await Promise.all([
    supabase
      .from('tkg_signals')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', String(authUser.id))
      .eq('processed', true)
      .gte('occurred_at', cutoff14),
    supabase
      .from('tkg_signals')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', String(authUser.id))
      .eq('processed', true)
      .gte('occurred_at', cutoff30),
  ]);
  const recentSignalsCount30d = count30 ?? 0;
  if (recentSignalsCount30d <= 0) blockers.push('no_recent_signals_30d');

  // 7-9. latest directive + artifact + artifact validation
  const { data: latestAction, error: actionErr } = await supabase
    .from('tkg_actions')
    .select('id, directive_text, action_type, confidence, reason, evidence, status, generated_at, artifact, execution_result')
    .eq('user_id', String(authUser.id))
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (actionErr) blockers.push(`latest_directive_lookup_failed (${actionErr.message})`);

  const actionRow = latestAction as Record<string, unknown> | null;
  const latestDirectiveExists = Boolean(actionRow?.id);
  if (!latestDirectiveExists) blockers.push('no_directive (no tkg_actions rows)');

  const latestArtifact = artifactFromActionRow(actionRow);
  const latestArtifactExists = Boolean(latestArtifact);
  if (latestDirectiveExists && !latestArtifactExists) blockers.push('no_artifact (latest directive missing artifact payload)');

  let latestArtifactValid = false;
  let latestArtifactInvalidReason: string | null = null;

  const executionResult =
    actionRow?.execution_result && typeof actionRow.execution_result === 'object'
      ? (actionRow.execution_result as Record<string, unknown>)
      : null;
  const generationLog =
    executionResult?.generation_log && typeof executionResult.generation_log === 'object'
      ? (executionResult.generation_log as Record<string, unknown>)
      : undefined;

  const userEmails = new Set<string>();
  if (typeof authUser.email === 'string' && authUser.email.length > 0) userEmails.add(authUser.email.toLowerCase());
  for (const p of providers) {
    if (typeof p.sync_email === 'string' && p.sync_email.length > 0) userEmails.add(p.sync_email.toLowerCase());
  }

  if (latestDirectiveExists && latestArtifactExists && actionRow) {
    const directive: ConvictionDirective = {
      directive: String(actionRow.directive_text ?? ''),
      action_type: (actionRow.action_type as any),
      confidence: typeof actionRow.confidence === 'number' ? (actionRow.confidence as number) : 0,
      reason: String(actionRow.reason ?? ''),
      evidence: Array.isArray(actionRow.evidence) ? (actionRow.evidence as any) : [],
      ...(generationLog ? { generationLog: generationLog as any } : {}),
    };

    const artifact = latestArtifact as unknown as ConvictionArtifact;
    const verdict = isSendWorthy(directive, artifact, userEmails);
    latestArtifactValid = verdict.worthy === true;
    latestArtifactInvalidReason = verdict.worthy ? null : verdict.reason;
    if (!latestArtifactValid) blockers.push(`artifact_invalid (${latestArtifactInvalidReason ?? 'unknown'})`);
  }

  // Final readiness rules (explicit)
  const ready =
    userExists &&
    accountExists &&
    providerMeetsReadiness &&
    (recentSignalsCount30d > 0) &&
    latestDirectiveExists &&
    latestArtifactExists &&
    latestArtifactValid;

  if (String(authUser.id) === OWNER_USER_ID) {
    blockers.push('warning_target_is_owner_user (spec asked for non-Brandon)');
  }

  return {
    target: ident,
    user_id: String(authUser.id),
    email: authUser.email ?? null,
    user_exists: userExists,
    account_exists: accountExists,
    account: subRow ? {
      plan: (subRow as any).plan ?? null,
      status: (subRow as any).status ?? null,
      current_period_end: (subRow as any).current_period_end ?? null,
    } : null,
    connected_providers: connectedProviders,
    providers,
    signals: {
      count_14d: count14 ?? 0,
      count_30d: count30 ?? 0,
      window_days_for_readiness: 30,
    },
    latest_directive_exists: latestDirectiveExists,
    latest_directive: latestDirectiveExists ? {
      id: String(actionRow?.id ?? ''),
      action_type: (actionRow as any)?.action_type ?? null,
      status: (actionRow as any)?.status ?? null,
      generated_at: (actionRow as any)?.generated_at ?? null,
    } : null,
    latest_artifact_exists: latestArtifactExists,
    latest_artifact_valid: latestArtifactValid,
    latest_artifact_invalid_reason: latestArtifactInvalidReason,
    verdict: ready ? 'READY' : 'NOT_READY',
    blockers: blockers.filter(Boolean),
  };
}
