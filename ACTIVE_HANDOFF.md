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

1. Read this file. 2. Read the active issue (#507). 3. Check issue #136 for recent INTERRUPT receipts.

## Active command gate

`ACTIVE_SEAM_STATE.json` is the machine-readable control plane.

Issue #507 is the active CONNECTOR-FRESHNESS seam.

Constraint everywhere: NO paid API calls and NO production mutation without explicit owner authorization — prove in the harness.

## Current slice:

**CONNECTOR-FRESHNESS (#507) — fix OneDrive (zero signals ever) + Google Calendar (perpetually stale).** Backend-only fix in `lib/sync/**`, proven against live `tkg_signals`. OneDrive: `microsoft-sync.ts` `syncFiles` used `search(q='')?$filter=…`, which Graph rejects, so it always 400'd to a `/recent` fallback that never backfilled history (`Files.Read` IS granted — re-consent does not fix it). Google Calendar: `google-sync.ts` `syncCalendar` set `timeMax = now`, never looking ahead, so upcoming meetings were never synced. The connector-health stale-source email (the original symptom) is intentionally left untouched — it reported truthfully.

**LANDING (#500) is PAUSED, not abandoned** — its work stays on `claude/landing-hero-constellation` (PR #505). After #507 merges, repoint the control plane back to #500, then the Scout seam #494 (owner-gated runtime activation, `BLOCKED_WITH_EXACT_RECEIPT`).

## Next exact move

1. OneDrive: enumerate the drive via the `delta` endpoint (recursive, paged), filter by modified date client-side, sort newest-first, cap the batch; keep `/recent` as a fallback. (`lib/sync/microsoft-sync.ts`)
2. Google Calendar: add a +14-day lookahead (`timeMax = now + 14d`), mirroring the Microsoft side. (`lib/sync/google-sync.ts`)
3. Proof: `npm run gate:continuity && npm run typecheck && npx vitest run lib/sync/__tests__/{microsoft,google}-sync.test.ts` green. Live backfill is owner-gated runtime proof (`BLOCKED_WITH_EXACT_RECEIPT`).
4. Open the draft PR on `claude/new-session-0r1iqf` targeting #507; set `ACTIVE_SEAM_STATE.active_pr`.
5. After merge: repoint source truth back from #507 to the paused LANDING seam #500, then #494.

Full detail: issue #507.

## Product doctrine

Foldera is a Workday Presence Layer (the always-on default) plus, additively, a flag-gated Proactive Scout lane (Bible Part V). No dashboard / task-manager / inbox-summary / chatbot / surveillance drift; no auto-send. `FOLDERA_MASTER_BIBLE.md` carries doctrine; `AGENTS.md` is the agent contract.

## GitHub writeback contract

- GitHub writeback before stop is mandatory. GitHub source truth beats chat memory; if work isn't written to GitHub, the transaction is incomplete.
- Before stopping, post one terminal receipt: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- Update `ACTIVE_HANDOFF.md` when the seam / proof / next move / blocker changes; `FOLDERA_BUILD_ORDER.yaml` when the active issue changes.
