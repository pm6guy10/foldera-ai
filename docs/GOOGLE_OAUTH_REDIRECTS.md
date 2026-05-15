# Google OAuth Redirect URIs

Foldera uses two separate Google OAuth callback paths:

- NextAuth sign-in: `/api/auth/callback/google`
- Standalone Google connector: `/api/google/callback`

Both paths must be registered for both production hosts. If any are missing from the Google Cloud Console OAuth client, Google can return `redirect_uri_mismatch` before Foldera receives the callback.

## Production

Register all four production redirect URIs:

- `https://www.foldera.ai/api/auth/callback/google`
- `https://foldera.ai/api/auth/callback/google`
- `https://www.foldera.ai/api/google/callback`
- `https://foldera.ai/api/google/callback`

`www.foldera.ai` is the canonical app host, but `foldera.ai` must stay registered because provider callbacks and preview/manual tests can originate from either host before app normalization.

## Local

For local Google OAuth testing, register the matching localhost callbacks on a separate development OAuth client:

- `http://localhost:3000/api/auth/callback/google`
- `http://localhost:3000/api/google/callback`

If a local test runs on another port, register that exact origin and both callback paths for the dev client before testing OAuth in a browser.

## Boundaries

- `/api/auth/callback/google` is the NextAuth Google sign-in callback.
- `/api/google/callback` is the standalone Google connector callback reached from `/api/google/connect`.
- `/api/microsoft/connect` and `/api/microsoft/callback` are Microsoft connector paths and are not Google Cloud redirect URIs.
- Updating this document or proving `/api/google/connect` / `/api/microsoft/connect` redirects does not clear GATE_9_REAL_NON_OWNER_BETA.
- `GATE_9_REAL_NON_OWNER_BETA` still requires exactly one real non-owner account to sign in and connect Google or Microsoft through the normal production provider flow. No fake users, rows, tokens, owner canaries, or mock harness output count.

## Manual External Step

The Google Cloud Console update is manual and external to this repo. After changing provider configuration there, rerun the production sign-in/connect flow with a real account that is allowed to authorize the Foldera OAuth client.
