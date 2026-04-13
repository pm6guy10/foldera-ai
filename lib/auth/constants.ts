export const OWNER_USER_ID = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';

/**
 * NextAuth `redirect` maps bare `/` to `/dashboard` for OAuth. A query keeps post-logout
 * landing on marketing home from being rewritten to the app shell.
 */
export const SIGN_OUT_CALLBACK_URL = '/?signedOut=1';
