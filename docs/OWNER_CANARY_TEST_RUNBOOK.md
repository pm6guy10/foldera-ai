# Owner Canary Test Runbook

Purpose: let Brandon validate Microsoft OAuth and source sync with a b-kapp Outlook/Hotmail account without counting that account as real non-owner beta proof.

## Guardrails

- This is owner-controlled connector canary proof only.
- Canary accounts must be listed in `OWNER_CANARY_USER_IDS` before their connector status is used as canary evidence.
- `OWNER_CANARY_USER_IDS` is a comma- or space-separated list of Supabase auth user UUIDs.
- Canary accounts must never be logged as real non-owner beta proof.
- Do not run paid generation.
- Do not send outbound email.
- Do not touch Stripe.
- Do not change schema.
- Do not fabricate auth users, token rows, source rows, artifacts, or history.

## Setup

1. Sign in through the normal product flow using the b-kapp Outlook/Hotmail canary account.
2. Capture that account's Supabase auth user ID through a read-only operator lookup.
3. Add the UUID to `OWNER_CANARY_USER_IDS` in the production environment, preserving any existing UUIDs.
4. Redeploy or wait until the environment value is active.
5. Run `npm run gate:status` and confirm release status still requires a real external tester.

## Microsoft Canary Steps

1. From `/start`, `/login`, or dashboard Sources, connect Microsoft with the b-kapp Outlook/Hotmail account.
2. Verify the dashboard or `/api/integrations/status` shows Microsoft connected, reconnect-required, stale, or another honest source status for that same canary user.
3. If a safe free sync path is already available, run it only far enough to confirm source status. Do not trigger paid generation.
4. Verify the canary user reaches one honest state: connected source, stale source, reconnect-needed, no-safe-move, or waiting/needs-input.
5. Verify any dashboard state shown for the canary does not expose Brandon private data outside the authenticated owner-controlled session.
6. If a source-backed move appears, verify save, skip, approve, and history locally without sending outbound email.
7. If no source-backed move appears, record the honest state and source trail only. Do not convert canary evidence into beta proof.

## Required Proof After Canary

Run:

```bash
npm run health
npm run gate:status
npm run gate:frontend
npm run build
npm run lint
```

Expected truth:

- `NON_OWNER_DEPTH` excludes `OWNER_USER_ID`, `TEST_USER_ID`, and every UUID in `OWNER_CANARY_USER_IDS`.
- `npm run gate:status` cannot pass real non-owner beta from the b-kapp Outlook/Hotmail canary.
- Real beta still requires a separate non-Brandon account that is not owner-controlled, not synthetic, and not listed in `OWNER_CANARY_USER_IDS`.

Stop when this is true:

```text
PROVEN - Brandon-controlled Outlook/Hotmail can test Microsoft connection without counting as real beta.
```
