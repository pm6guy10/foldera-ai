# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-06-11 PT (MS sign-in fixed; live selection-pool audit — pool stale, scoring unbuilt; #226 active)

## Boot

1. Read this file.
2. Read the active issue below.

## Active command gate

Issue #226 is the active rung-6 owner-path-readiness seam.
Rung 6 scope: sign-in reliability + one Slack self-loop end-to-end.
Issue #231 (work-state purity) is COMPLETE — full scope merged in PR #232 (2026-06-09): earned trust (outbound evidence required), work/personal/automated relationship labels, nightly demotion sweep, acquisition agents default OFF.
Rung 5 (issue #220) is COMPLETE — payment path proven live. Rung 7 (non-owner paid loop) remains forbidden until #226 is proven.
`FOLDERA_MASTER_BIBLE.md` is the single doctrine file. `AGENTS.md` is the single agent contract.
One active seam only.

## Current slice:

- Issue #226 proves owner-path readiness. Known facts: Gmail sign-in WORKS for Brandon; Microsoft sign-in FIXED 2026-06-11 (Azure client secret expired + ENCRYPTION_KEY malformed in Vercel — both resolved, receipts in #226 comments). Sign-in sub-proofs 1+2 closed.
- Required proof: (1) Brandon signs in reliably via Gmail AND Microsoft, (2) one Slack self-loop end-to-end surfacing one real next move, (3) durable receipt in GitHub truth.
- Forbidden in this seam: non-owner proof, Stripe changes, schema migrations, new connectors, broad cleanup.

## Product doctrine

Foldera is a Workday Presence Layer: state + connectors + triggers + one intervention; remembers where the user was, decides when to interrupt, gives one next move, lets the user respond with one click, updates state, stays quiet otherwise. No dashboard/task-manager/inbox-summary/chatbot/surveillance drift. Issue #48 and `FOLDERA_MASTER_BIBLE.md` carry product doctrine.

Owner verbiage directive (2026-06-10): cards are "right now" cards, not "morning" cards — interruption is state-change-triggered and as-needed, not once-daily. Verbiage + trigger decoupling is a queued post-#226 seam (needs its own issue), not part of #226.

## GitHub writeback contract

- GitHub writeback before stop is mandatory.
- Chat memory is not source of truth.
- If work was done and not written to GitHub, the transaction is incomplete.
- Before stopping, write one terminal GitHub comment: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- `ACTIVE_HANDOFF.md` must be updated when the active seam, proof status, next seam, or blocker changes.
- `FOLDERA_BUILD_ORDER.yaml` must be updated when the active issue changes.

## Next exact move

Work issue #226: sign-in sub-proofs done (Gmail + Microsoft both working as of 2026-06-11). Next: re-run `node scripts/audit-selection-pool.mjs` after tonight's 2AM Microsoft backfill to settle the pool-freshness fork (see live audit below), then run one Slack self-loop end-to-end at `/slack/test-mode` surfacing the scored winner. Post receipt to #226.

**Proof bar for the Slack self-loop (tightened 2026-06-10):** the surfaced move must be the scored winner from `scoreOpenLoops`, not the recency-picked newest row. A self-loop that surfaces the recency pick is plumbing proof, not product proof.

**LIVE AUDIT 2026-06-11 (truth-pressure gate — supersedes the stale framing above).** Verified against prod, owner pool (active/at_risk, trusted, unsuppressed = 108 rows; the "1,651" was the whole table):
- `risk_score` = 0 on all 108 (1 distinct value) — ranking spine is dead.
- `due_confidence` = 0.5 on all 108 (1 distinct value) — never computed.
- `due_at`: 51/108 have a date, **all 51 in the past** (Dec 22 2025 → Jun 11 2026). **Zero future-dated. Zero due in next 7 days.**
- Recency winner that fires right now: *"Book hotel using $15 OneKeyCash gift before expiration."*
- The prior framing ("picks $21.66 receipt over Project update due EOD Tuesday") is itself stale — **there is no future-dated commitment in the pool at all.** Even a perfect scorer has nothing fresh to rank.
- Likely cause is partly self-healing: Microsoft mail was dark May 21 → Jun 11 (encryption-key bug, fixed 2026-06-11). 3 weeks of Outlook backfills at next 2AM `sync-microsoft` cron.

**Sequencing decision (do NOT skip):** re-run `node scripts/audit-selection-pool.mjs` AFTER tonight's backfill, then fork:
- If `future_due > 0` → #249 is well-posed: compute `risk_score`/`due_confidence` from signals already in the rows.
- If `future_due` still 0 → upstream lifecycle bug (commitments never expire/close); that jumps the queue AHEAD of #249.
Do not tune #249 scoring against the current stale pool — it would prove nothing.

**FORK RESOLVED 2026-06-11 PT (manual backfill, did not wait for 2AM cron).** Diagnosed + fixed a 401 blocking signal processing: the apex `foldera.ai` 307-redirects to `www.foldera.ai`, and Node fetch strips the `Authorization` header on that cross-host hop, so `scripts/process-unprocessed-signals.ts` (base URL from `NEXTAUTH_URL=https://foldera.ai`) arrived unauthenticated. NOT a route-code auth difference — `sync-microsoft` and `process-unprocessed-signals` share the identical `validateCronAuth`; both 200 on www. Narrow fix: script now normalizes apex→www. Drained 285 unprocessed signals (57 batches, remaining=0; +20 commitments, +28 entities). Post-backfill audit: scorable pool 99, **future=1, next7d=1** ("Homeschool meeting with Deanne Varnum" due 2026-06-12) — recency winner now equals soonest-future winner. Per the fork rule, `future_due > 0` → **#249 is well-posed** (compute risk_score/due_confidence from signals in the rows); NOT an upstream lifecycle bug. `risk_score`/`due_confidence` still flat (0 / 0.5) — that is #249's job. MS mail backfill at 2AM will add ~3 weeks more.

After #226 is proven: re-audit → work #249 (right-now winner selection) or the lifecycle fix the audit points to, then open rung 7 (non-owner paid loop).
