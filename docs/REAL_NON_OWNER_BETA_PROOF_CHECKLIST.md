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

## Required Proof Steps

1. Confirm the tester can sign in.
2. Confirm Google or Microsoft connection succeeds after provider consent.
3. Confirm production proof excludes `OWNER_USER_ID`, `TEST_USER_ID`, and `OWNER_CANARY_USER_IDS`.
4. Confirm source status/readback after connection.
5. Confirm Foldera shows either one source-backed move or one clear waiting/no-safe-move state.
6. Confirm the source trail is visible and supports the shown move or waiting state.
7. Confirm approve/save/skip controls behave safely and do not send outbound email unless an explicit send flag is enabled.
8. Confirm latest/history readback records the result.

## Stop/Fail Conditions

- Stop if the only connected account is Brandon/owner.
- Stop if the only connected account is `TEST_USER_ID`.
- Stop if the only connected account is listed in `OWNER_CANARY_USER_IDS`.
- Stop if proof requires fabricated database rows.
- Stop if source connection requires credentials or provider consent Brandon cannot supply in-product.
- Stop if the tester reaches a confusing or contradictory state after connection.
- Stop if latest, dashboard, source trail, controls, or history disagree.
- Stop if any proof path would send outbound email, charge Stripe, run paid generation, mutate schema, or use fake beta evidence without explicit approval.

## Passing Condition

The gate passes only when one real non-owner account connects Google or Microsoft in production, reaches a clear source-backed move or waiting/no-safe-move state, sees a supporting source trail, and can save, skip, or approve safely with history/readback proof.
