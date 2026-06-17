# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-06-17 UTC (Active seam: #368 — zero-config Vercel-cron heartbeat floor; #364/#366 external cron is the primary 15-min path)

## Boot

1. Read this file.
2. Read the next active issue (see below).
3. Check issue #136 for recent INTERRUPT receipts.

## Active command gate

ACTIVE_SEAM_STATE.json is the machine-readable control plane.
Active implementation seam is issue #368 — a zero-config daily heartbeat floor. Live truth (2026-06-17): #364/#366 moved the 15-min heartbeat to a free external cron hitting the Vercel route, but that needs owner setup and `tkg_actions` still shows only 4 synthetic workday_presence rows (last 2026-06-16 03:55 UTC) — the brain has STILL fired zero real interventions despite 127 real lapsing commitments. Fix: chain the existing trigger-runner route into the already-paid, already-running Vercel morning-pipeline cron as a 4th stage, so the runner fires at least daily with no additional owner setup — a floor under #366's external cron, not a replacement. Function-call stage, not a new vercel.json cron entry (hobby one-cron limit holds).

Issue #364/#366 is COMPLETE — heartbeat scheduling moved off capped GitHub Actions to a free external cron; PR #365 (`f173bdc`) removed the dead CRON_SECRET-over-HTTP path, PR #366 removed the dead Actions `schedule:` and shipped the external-cron runbook. Owner must create the external cron job to get 15-min granularity.
Issue #361 is COMPLETE — commitment-lapsing bridge (lib/workday-presence/commitment-bridge.ts) + 15-min GitHub Actions schedule merged via PR #362 (`d19a4bf`); discovered non-functional in production post-merge, see #364/#366/#368.
Issue #354 is COMPLETE — auth + state-machine integrity findings, all 3 (F-auth, F-card, F-dismiss) resolved and tested. PR #357 merged F-auth (`ba42125`); PR #358 merged F-card + F-dismiss (`4b2908b`).
Issue #351 is COMPLETE — money-loop integrity sweep, all 5 findings (F1-F5) resolved and tested. PR #352 merged F1+F4 (`b400c5d`); PR #353 recovered and merged F2/F3/F5 + full test coverage (`c238165`).
Issue #348 is COMPLETE — presence receipt insert-error hotfix; `insertPresenceReceipt` now throws on Supabase insert failure so the money loop cannot report false success. Merged via PR #349 (`9377546`).
Issue #344 is COMPLETE — workday-presence loop closure proven for non-owner user in browser; merged via PR #346 (`e2f7687`).
Issue #341 is COMPLETE — runtime map + current-path Supabase receipts merged via PR #343 (`613296d`); Slack right-now owner-guard and presence-action receipts wired.
Issue #339 is COMPLETE — frontend auth polish closeout merged via PR #340 (`a315394`); dashboard connect anchors now use OAuthConnectButton.
PR #336 is SUPERSEDED — closed without merge; PR #340 is the clean replacement.
PR #338 is COMPLETE — Repo Truth Boot Gate accepts GitHub MCP as valid auth path; merged `bae154e`.
PR #337 is COMPLETE — Stale #330 control-plane cleared; merged `80d3a6b`.
Issue #136 is COMPLETE — Run Ledger rule installed via PR #319 (`d1291ff`).
Issue #321 is COMPLETE — Autonomous Seam Governor installed via PR #322.
Issue #314 is COMPLETE — Slack cockpit merged via PR #318 (`b03e7c4`).
Issue #296 (M1 backend-lock) is COMPLETE — merged via PR #307 (`ecf89dd`); production live.
Issue #284 is COMPLETE — owner-operator pass gaps G1-G7 closed across PRs #286, #287, and #288.
Issue #281 (rung 9) is OWNER_CLOSED — external human-validation gate permanently removed by owner instruction 2026-06-13.
Issue #276 is COMPLETE — Command State Resolver v0 merged via PR #279 (`e848d01`); closeout PR #280 (`13581bf`).
Issue #262 is COMPLETE — event-driven trigger runner live via PR #273 (`d6b99f2`).
Issue #244 is COMPLETE — Right Now cards / state-change triggers. Slice 1 PR #308 `dddece7`; Slice 2 PR #313 `d2bed9a`.
`FOLDERA_MASTER_BIBLE.md` is the single doctrine file. `AGENTS.md` is the single agent contract.

## Current slice:

- Issue #368: chain the trigger-runner into the Vercel morning-pipeline cron as a zero-config daily heartbeat floor (the brain has still fired zero real interventions; #366's external cron needs owner setup that hasn't produced a receipt yet).

## Next exact move

1. (this PR #369) morning-pipeline route adds the trigger-runner as a 4th stage; tests cover order/quiet/error; reconcile control plane. STOP at MERGE READY.
2. After the next daily Vercel morning-pipeline cron run (0 11 * * *), confirm a persisted real commitment_lapsing receipt in tkg_actions; then file the next dead-flag wiring (reply_needed / requires_prep).

Owner actions (out of repo authority) to reach 15-min granularity / first real fire:
- Create the external cron job per #366 runbook (cron-job.org → GET the Vercel route every 15 min with Bearer CRON_SECRET), AND
- Ensure the owner has a saved workday_presence_state (commitment_lapsing only fires when state exists).

Current production truth: `Last known main SHA: f6b02ecd710bb1f9eeb434b708d92ae86a9f1756` (PR #367 merged 2026-06-17; issues #361/#364 closed; issue #368 active via PR #369)

Safety rails unchanged: no outbound sends by default, no paid tests without naming exact cost, acquisition stays quarantined OFF, no fake claims, one intervention max, safe silence is a win, schema changes only via committed+applied+verified migrations.

## Product doctrine

Foldera is a Workday Presence Layer: state + connectors + triggers + one intervention; remembers where the user was, decides when to interrupt, gives one next move, lets the user respond with one click, updates state, stays quiet otherwise. No dashboard/task-manager/inbox-summary/chatbot/surveillance drift. Issue #48 and `FOLDERA_MASTER_BIBLE.md` carry product doctrine.

## GitHub writeback contract

- GitHub writeback before stop is mandatory.
- Chat memory is not source of truth.
- If work was done and not written to GitHub, the transaction is incomplete.
- Before stopping, write one terminal GitHub comment: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- `ACTIVE_HANDOFF.md` must be updated when the active seam, proof status, next seam, or blocker changes.
- `FOLDERA_BUILD_ORDER.yaml` must be updated when the active issue changes.
