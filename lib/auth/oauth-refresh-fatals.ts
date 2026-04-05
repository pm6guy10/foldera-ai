/**
 * Detect OAuth refresh failures that mean the user must complete a new browser
 * consent/login — continuing to retry the same refresh_token will not recover.
 */

/** Google token endpoint / client library — revoked refresh, password change, etc. */
export function isGoogleRefreshFatalError(errorCode: string, errorDescription: string): boolean {
  const code = String(errorCode || '').toLowerCase().trim();
  if (code === 'invalid_grant') return true;
  const desc = String(errorDescription || '').toLowerCase();
  if (desc.includes('invalid_grant')) return true;
  if (desc.includes('token has been expired or revoked')) return true;
  return false;
}

/**
 * Microsoft token endpoint JSON: `error`, optional `error_description`.
 * Fatal = refresh is dead; soft-disconnect user_tokens so UI shows Connect and cron stops.
 */
export function isMicrosoftRefreshFatalError(errorCode: string, errorDescription: string): boolean {
  const code = String(errorCode || '').toLowerCase().trim();
  const desc = String(errorDescription || '').toLowerCase();

  if (code === 'invalid_grant') return true;
  if (code === 'interaction_required') return true;
  if (code === 'consent_required') return true;
  if (code === 'login_required') return true;

  // Azure AD STS strings often appear only in error_description
  if (desc.includes('aadsts70008')) return true; // refresh token expired (hours limit)
  if (desc.includes('aadsts700082')) return true; // refresh invalidated / revoked
  if (desc.includes('aadsts50173')) return true; // password changed
  if (desc.includes('aadsts50076')) return true; // MFA / strong auth required
  if (desc.includes('aadsts65001')) return true; // consent / admin approval
  if (desc.includes('aadsts700016')) return true; // bad app / misconfigured (reauth)
  if (desc.includes('invalid_grant')) return true;

  return false;
}
