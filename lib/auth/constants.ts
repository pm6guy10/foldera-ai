// Canonical owner account after the #509 split-brain consolidation (executed 2026-06-22):
// all history (1,200+ actions, 5,700+ signals) was migrated to 2cbc1bab and the old
// e40b7cd8 account is now empty. Owner scripts, the Slack self-loop, winner-truth, and
// beta-readiness all key off this constant, so it must follow the surviving account.
export const OWNER_USER_ID = '2cbc1bab-8e0e-43b0-bf4a-9a0cd6b5d91f';

/**
 * NextAuth `redirect` maps bare `/` to `/dashboard` for OAuth. A query keeps post-logout
 * landing on marketing home from being rewritten to the app shell.
 */
export const SIGN_OUT_CALLBACK_URL = '/?signedOut=1';
