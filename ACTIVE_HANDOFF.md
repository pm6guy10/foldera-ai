# ACTIVE HANDOFF - FOLDERA

## DON'T FORGET — read first, every boot

1. **Value is the only score.** Foldera exists to produce one act the user wouldn't have done. Green CI, audits, clean code, merged PRs are *hygiene* — not value.
2. **Safe silence beats a fake card.** Never manufacture a verdict; quiet on weak evidence. The Scout obeys this too: no opportunity worth surfacing → stay quiet.
3. **No "done" without live product proof.** Build/tests/CI green is necessary, never sufficient.
4. **Don't make Brandon the router/tester/merger.** Pick the highest-leverage move, do it end-to-end, bring the result + reasoning.
5. **Scout is additive and never auto-sends.** It proposes finished, review-gated artifacts. The Workday Presence Layer stays the always-on default; every `SCOUT_*` flag defaults off.
6. **The Guardian looks inward, not outward.** Watch the user's *own* world (the thread they're about to drop, the reply owed, the deadline in their files) and reduce load. Do **not** fish the open web for external "opportunities" — that is tone-deaf. A fixture/sample card must never be posted to a real channel as if real. See issues #492 / #494 / #481.

Keep this cockpit short and value-first. Completed-issue history lives in `SESSION_HISTORY.md` + git, never here.

## Boot

1. Read this file. 2. Read the active issue (#514). 3. Check issue #136 for recent INTERRUPT receipts.

## Active command gate

`ACTIVE_SEAM_STATE.json` is the machine-readable control plane.

Issue #514 is the active CONNECTOR-DEPTH seam.

Constraint everywhere: NO paid API calls and NO production mutation without explicit owner authorization — prove in the harness.

## Current slice:

**CONNECTOR DEPTH (#514) — Google Drive deep backfill.** `lib/sync/google-sync.ts:syncDrive` only pulled files *modified within the lookback window* (1y on first sync, then incremental), so old documents were never indexed and already-synced accounts never deepened. Live: owner `2cbc1bab` drive = 186 signals, 7 in 14d, while mail is live. Fix mirrors the OneDrive intent (#507): enumerate the whole Drive newest-first with **no `modifiedTime` floor** (cap `DRIVE_MAX_FILES`), **skip files already stored by `content_hash`** (self-heals existing accounts, no re-download), and **bound new files per run** (`DRIVE_MAX_NEW_PER_RUN`) so a big backfill spreads across runs. Backend-only; no schema change, no new sign-in surface, no auto-send.

**Already done (identity seam, fully landed):** link-guard (PR #512); Google-sole-sign-in + Microsoft-as-source (PR #513); account consolidation EXECUTED `e40b7cd8` → `2cbc1bab` (#509) — the Google-login account holds all history, both syncing tokens, and the paid Stripe sub.

**Predecessors merged:** #511 (PRs #512/#513), #507 (PR #508), LANDING #500 (PR #501), repoint (PR #510).

## Next exact move

1. Land #514 (this PR): rewrite `syncDrive` to deep-enumerate + skip-known + per-run cap; add `buildDriveBackfillQuery`; update the google-sync test.
2. Proof: `npm run gate:continuity && npm run typecheck && npx vitest run lib/sync/__tests__/google-sync.test.ts`.
3. Open PR on `claude/drive-backfill-514` targeting #514.
4. Owner: after merge, let the nightly full sync run (or trigger it) and re-check Drive freshness (count climbs past 186). Optional next: same enumeration for OneDrive (#507); Scout #494 activation.

Full detail: issue #514.

## Product doctrine

Foldera is a Workday Presence Layer (the always-on default) plus, additively, a flag-gated Proactive Scout lane (Bible Part V). No dashboard / task-manager / inbox-summary / chatbot / surveillance drift; no auto-send. `FOLDERA_MASTER_BIBLE.md` carries doctrine; `AGENTS.md` is the agent contract.

## GitHub writeback contract

- GitHub writeback before stop is mandatory. GitHub source truth beats chat memory; if work isn't written to GitHub, the transaction is incomplete.
- Before stopping, post one terminal receipt: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- Update `ACTIVE_HANDOFF.md` when the seam / proof / next move / blocker changes; `FOLDERA_BUILD_ORDER.yaml` when the active issue changes.
