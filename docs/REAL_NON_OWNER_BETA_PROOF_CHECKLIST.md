# Real Non-Owner Beta Proof Checklist

Purpose: prove Foldera's first real non-owner beta loop without using Brandon owner data, reserved test users, fabricated rows, or mock harness output.

## Required Tester

- One real non-owner account signs in.
- The account is not `OWNER_USER_ID`.
- The account is not `TEST_USER_ID`.
- The account is not listed in `OWNER_CANARY_USER_IDS`.
- The account connects Google or Microsoft only through the normal login and provider consent flow.

## Forbidden Proof

- No fabricated auth users.
- No fabricated `user_tokens`.
- No fabricated source rows.
- No copied Brandon/owner data.
- No mock harness rows counted as beta proof.
- No owner-only run counted as beta proof.
- No Brandon-controlled Outlook/Hotmail canary account counted as beta proof.
- No token-only proof counted as beta proof.
- No welcome-email-only proof counted as beta proof.
- No unprocessed-signal-only proof counted as beta proof.

## Required Proof Steps

1. Confirm the tester can sign in.
2. Confirm Google or Microsoft connection succeeds after provider consent.
3. Confirm production proof excludes `OWNER_USER_ID`, `TEST_USER_ID`, and `OWNER_CANARY_USER_IDS`.
4. Confirm source status/readback after connection.
5. Confirm `GATE_9A_FIRST_RUN_ACTIVATION`: first-run readiness shows connected source, signal count, newest signal time, processed/unprocessed count, what Foldera can tell from metadata, exact reason no finished move exists, what unlocks value next, and "nothing was sent" truth.
6. Confirm Foldera shows either one source-backed move or one clear waiting/no-safe-move state. A low-data waiting state proves first-run activation only, not full beta success.
7. Confirm the source trail is visible and supports the shown move or waiting state.
8. Confirm approve/save/skip controls behave safely and do not send outbound email unless an explicit send flag is enabled.
9. Confirm latest/history readback records the result.

## Stop/Fail Conditions

- Stop if the only connected account is Brandon/owner.
- Stop if the only connected account is `TEST_USER_ID`.
- Stop if the only connected account is listed in `OWNER_CANARY_USER_IDS`.
- Stop if proof requires fabricated database rows.
- Stop if source connection requires credentials or provider consent Brandon cannot supply in-product.
- Stop if the tester reaches a confusing or contradictory state after connection.
- Stop if the tester has only a token row, a welcome email, or only unprocessed signals without a clear first-run readiness state.
- Stop if latest, dashboard, source trail, controls, or history disagree.
- Stop if any proof path would send outbound email, charge Stripe, run paid generation, mutate schema, or use fake beta evidence without explicit approval.

## Passing Condition

`GATE_9A_FIRST_RUN_ACTIVATION` passes when one real non-owner account connects Google or Microsoft in production and reaches a clear no-paid first-run waiting/no-safe state with source counts, newest signal time, processed/unprocessed counts, metadata explanation, no-finished-move reason, next unlock, "nothing was sent" truth, and `Check sources now` or `Connect another source`.

`GATE_9_REAL_NON_OWNER_BETA` passes only after that real non-owner reaches a source-backed move with source trail and safe controls/history, or explicit tester feedback proves the waiting state is understandable and useful. Do not call GATE_9A full beta success.
