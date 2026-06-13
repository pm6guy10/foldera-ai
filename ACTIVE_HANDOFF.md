# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-06-13 PT (issue #301 control-plane + hidden-op wiring COMPLETE; active seam: NONE — data moat initialization pending; production SHA f29cd80a89cc45deca3ef2d03d1dcc22c8c27a8d.)

## Boot

1. Read this file.
2. Read the active issue it names.

## Active command gate

ACTIVE_SEAM_STATE.json is the machine-readable control plane.
Issue #301 is COMPLETE — control-plane truth ledger + hidden-op Slack wiring merged PR #305 (f29cd80).
Issue #281 (rung 9) is OWNER_CLOSED — external human-validation gate permanently removed by owner instruction 2026-06-13. This rung will never be a stop condition again.
Issue #276 is COMPLETE — Command State Resolver v0 merged via PR #279 (`e848d01`); closeout PR #280 (`13581bf`).
Issue #262 is COMPLETE — event-driven trigger runner live (PR #273, `d6b99f2`).
`FOLDERA_MASTER_BIBLE.md` is the single doctrine file. `AGENTS.md` is the single agent contract.
One active seam only.

**Active seam: NONE (pending next priority).**
Data moat initialization ready. Guardian moment live: hidden-op detector fires Slack pings on buried high-consequence signals. Next: one-click receipt wiring (signal → act → outcome tuple logging).

## Current slice:

Data moat initialization: wire the `Got it` button on the hidden-op Slack card to log signal → act → outcome tuples to Supabase. No active seam declared yet — pending owner priority.

Current production truth: `Last known production SHA: f29cd80a89cc45deca3ef2d03d1dcc22c8c27a8d`

Archive: the M1 loop-health notes below remain as historical context only.

Safety rails unchanged: no outbound sends by default, no paid tests without naming exact cost, acquisition stays quarantined OFF, no fake claims, one intervention max, safe silence is a win, schema changes only via committed+applied+verified migrations.

## #276 closeout record

Command State Resolver v0: `lib/workday-presence/command-state-resolver.ts` — four verdicts (`MERGE_READY`, `FIX_FIRST`, `WAIT`, `CLEAR`), conservative precedence, weak truth collapses to CLEAR. Proof: 19/19 contract tests · 66/66 suite · all gates · CI green. Receipt: https://github.com/pm6guy10/foldera-ai/issues/276#issuecomment-4694521189

## Product doctrine

Foldera is a Workday Presence Layer: state + connectors + triggers + one intervention; remembers where the user was, decides when to interrupt, gives one next move, lets the user respond with one click, updates state, stays quiet otherwise. No dashboard/task-manager/inbox-summary/chatbot/surveillance drift. Issue #48 and `FOLDERA_MASTER_BIBLE.md` carry product doctrine.

## GitHub writeback contract

- GitHub writeback before stop is mandatory.
- Chat memory is not source of truth.
- If work was done and not written to GitHub, the transaction is incomplete.
- Before stopping, write one terminal GitHub comment: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- `ACTIVE_HANDOFF.md` must be updated when the active seam, proof status, next seam, or blocker changes.
- `FOLDERA_BUILD_ORDER.yaml` must be updated when the active issue changes.

## Guardian Vision Lock (2026-06-13 — DO NOT REGRESS)

Owner mandate written into `FOLDERA_MASTER_BIBLE.md` PART II-B and II-C. Any session that drifts back to "build another scoring module" or "add a new classifier" without a runtime consumer is violating the Brain-Without-Hands Law (AGENTS.md). Snap back here.

**The vision in one sentence:** Foldera is the Facebook pixel inverted — total-context care, not total-context extraction. The magic moment is "how did it know?" not "here are your top 5 items."

**The data moat:** signal→act→outcome tuples at scale teach Foldera what buried signals matter to what persona, when, and how to deliver them. Average-person signals (family, health, money, community) vs. professional signals (GitHub noise, Slack loops, project artifacts) calibrate differently. The crowd makes every user's experience better. That feedback loop is the moat — not the connector count, not the scoring formula.

**The next move law:** Wire one real act onto something already surfaced. The Slack loop is live and proven (owner-only). Widen that thread — don't start a new brain.

## Next exact move

Wire the `Got it` button on the hidden-op Slack card to log signal → act → outcome tuples to Supabase (data moat initialization). No active seam declared until owner priority issued.

## #301 closeout record

Control-plane truth ledger + hidden-op Slack wiring: `ACTIVE_SEAM_STATE.json` machine-readable ledger + `.foldera-contract.json` governance gate + `detectHiddenOps` wired into `runWorkdayPresenceTriggerRunner`. Guardian moment live: buried high-consequence signals (score ≥ 50) fire Slack pings when normal path is quiet. Proof: PR #305 (f29cd80) merged; 5/5 unit tests · `npm run gate:continuity` pass · all CI ✓. Receipt: https://github.com/pm6guy10/foldera-ai/pull/305#issuecomment-4699691553

## Prior closeout records (condensed; GitHub receipts + git history are the archive)

- #259 (rung 7): mechanical non-owner pipe proof — receipt https://github.com/pm6guy10/foldera-ai/issues/259#issuecomment-4692374168
- #249: scored winner beats recency, enforced in `selectSourceBackedRightNowState` — PR #257 (`ac8b15e`); receipt https://github.com/pm6guy10/foldera-ai/issues/249#issuecomment-4686122101
- #226 (rung 6): Gmail + Microsoft sign-in + Slack self-loop scored winner — PR #256; receipt https://github.com/pm6guy10/foldera-ai/issues/226#issuecomment-4685107461
