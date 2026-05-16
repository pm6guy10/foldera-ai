# Foldera Release Gates

This is the executable release program for Foldera's gate/rung model.

One command answers the release question:

```bash
npm run gate:status
```

The command prints:

- current gate status
- first failing gate
- proof found
- proof missing
- exact next move
- what not to touch

The gate command is free-proof only. It must not trigger paid generation, outbound email, Stripe actions, schema changes, destructive database actions, fabricated users, or Brandon owner data as beta proof.

## Gate Order

### GATE_0_LIVE_TRUTH

Pass requires:

- GitHub/main SHA known
- Vercel production SHA known
- `/api/health` returns the expected SHA
- `ACTIVE_HANDOFF.md` matches current production truth

Failing this gate means release truth is stale before product proof starts.

### GATE_1_PUBLIC_PRIVATE_BOUNDARY

Pass requires:

- no Brandon, WorkSource, unemployment, benefits, legal, family, medical, or job-search content on public/demo/marketing surfaces
- public demo uses sanitized fictional examples only

Proof currently comes from public-route tests plus sanitized demo fixtures.

### GATE_2_AUTH_ONBOARDING

Pass requires:

- unauthenticated visitor path works
- start/login path works
- no-token onboarding state is clear
- Google and Microsoft connect options are visible

### GATE_3_SOURCE_STATUS

Pass requires a clear user-facing state for:

- no provider
- stale provider
- connected Google
- connected Microsoft
- connected but no fresh signals
- connected with fresh signals

### GATE_4_SELECTION

Pass requires:

- candidates can be listed
- blocked candidates explain why
- winner or no-safe-move is deterministic
- `OWNER_USER_ID`, `TEST_USER_ID`, and `OWNER_CANARY_USER_IDS` are excluded from non-owner proof

### GATE_5_ARTIFACT_OR_CURRENT_MOVE

Pass requires:

- one source-backed move or a clear no-safe-move state
- not generic
- not fake obligation
- not summary-only
- action-ready enough for user evaluation

### GATE_6_SOURCE_TRAIL

Pass requires:

- source trail visible
- labels understandable
- no internal garbage
- no private/public leak

### GATE_7_APPROVAL_HISTORY

Pass requires:

- save works
- skip works
- approve does not send unless an explicit send flag is enabled
- latest/history update correctly
- outcome is recorded

### GATE_8_NON_OWNER_HARNESS

Pass requires mock non-owner coverage for:

- no-token
- stale-token
- fresh-token/no-signals
- fresh-token/no-safe-move
- source-backed-move
- source trail
- save/skip/approve/history

Mock proof must be clearly labeled as mock only.

### GATE_9A_FIRST_RUN_ACTIVATION

Pass requires:

- a real production non-owner account connects Google or Microsoft
- no fake rows
- no `OWNER_USER_ID`
- no `TEST_USER_ID`
- no `OWNER_CANARY_USER_IDS`
- token-only proof does not pass
- welcome-email-only proof does not pass
- unprocessed-signal-only proof does not pass unless the product shows a clear first-run value state
- the user reaches a useful no-paid first-run state with:
  - connected provider
  - signal count
  - newest signal time
  - processed/unprocessed count
  - what Foldera can tell from metadata
  - why no finished move exists
  - what unlocks value next
  - "nothing was sent" truth
  - `Check sources now` or `Connect another source`

This gate proves first-run activation only. It is not full beta success.

### GATE_9_REAL_NON_OWNER_BETA

Pass requires:

- the proven real non-owner connection from GATE_9A
- no fake rows
- no `OWNER_USER_ID`
- no `TEST_USER_ID`
- no `OWNER_CANARY_USER_IDS`
- `GATE_9A_FIRST_RUN_ACTIVATION` is already proven
- user reaches a source-backed move with visible source trail and safe controls, or explicit tester feedback proves the first-run waiting state was understandable and useful
- save/skip/approve/history behavior is safe
- outbound send attempts remain blocked unless an explicit send flag is enabled

Detailed proof checklist: `docs/REAL_NON_OWNER_BETA_PROOF_CHECKLIST.md`.
Owner-controlled Microsoft Outlook/Hotmail canaries are connector proof only. They must stay in `OWNER_CANARY_USER_IDS` and must not clear real non-owner beta.

Until that proof exists, this gate must remain:

```text
STATUS: BLOCKED_EXTERNAL
REASON: First-run activation is useful but is not full beta success.
NEXT_MOVE: Use the proven micro1 non-owner path only after it produces a source-backed action or explicit tester feedback.
DO_NOT_TOUCH: UI polish, Stripe, paid generation, owner-only proof, fake users.
```

## Current Release Truth

As of this controller slice, local and mock proof carries Foldera through GATE_8, and micro1 satisfies the real non-owner connection plus no-paid first-run activation proof for GATE_9A: production auth user, not `OWNER_USER_ID`, not `TEST_USER_ID`, connected Google token, and clear source-readiness state.

The first failing release gate remains GATE_9 because first-run waiting value is not full beta success. The remaining blocker is not user acquisition; it is either:

- source-backed action for micro1 or the same proven non-owner path
- explicit tester feedback that the first-run waiting/readiness state is understandable and useful

Mock harness proof is useful release preparation. It is not beta readiness.
