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

1. Read this file. 2. Read the active issue (#494). 3. Check issue #136 for recent INTERRUPT receipts.

## Active command gate

`ACTIVE_SEAM_STATE.json` is the machine-readable control plane.

Issue #494 is the active SCOUT money-move seam.

Constraint everywhere: NO paid API calls and NO production mutation without explicit owner authorization — prove in the harness.

## Current slice:

**SCOUT money-move (#494) — turn the hands on for ONE real inward loop on REAL data.** The build is DONE and inward (stages 0-5 + inward retarget merged); the hands have never gripped real data (`scout_drive_chunks` empty, deployed flag-OFF). What remains is **owner-gated runtime activation the agent sandbox cannot do** → `BLOCKED_WITH_EXACT_RECEIPT`. Value = frequency of real acts that landed × load removed per act; owner-first is fine if labeled owner-only; no fixtures/hygiene-as-proof.

**Predecessors complete:** connector-freshness #507 merged (PR #508, sha `9bdf478`); LANDING #500 shipped (PR #501). This PR is the control-plane repoint to #494 after #507 auto-closed (a closed active_issue would red the continuity gate).

## Next exact move

Owner-gated activation (the agent sandbox cannot perform these):
1. Vercel prod: set `VOYAGE_API_KEY`, flip `SCOUT_ENABLED`/`SCOUT_RAG_ENABLED`/`SCOUT_WEB_ENABLED`/`ALLOW_PAID_LLM`/`SCOUT_DELIVERY_ENABLED`, redeploy.
2. Confirm `ENCRYPTION_KEY_LEGACY` covers all historical keys (#481) so grounding uses the full corpus.
3. `GET /api/cron/scout/index-drive` (CRON_SECRET) — paid first index → populates `scout_drive_chunks`.
4. `GET /api/cron/scout/deliver` (CRON_SECRET) — one real inward review-gated Slack card.
5. Judge by gut ≥3×/week, labeled owner-only.

Also open (separate): re-consent Google on owner account `e40b7cd8` to restore the sync the non-owner test persona was rotating away (#509).

Full detail: issue #494.

## Product doctrine

Foldera is a Workday Presence Layer (the always-on default) plus, additively, a flag-gated Proactive Scout lane (Bible Part V). No dashboard / task-manager / inbox-summary / chatbot / surveillance drift; no auto-send. `FOLDERA_MASTER_BIBLE.md` carries doctrine; `AGENTS.md` is the agent contract.

## GitHub writeback contract

- GitHub writeback before stop is mandatory. GitHub source truth beats chat memory; if work isn't written to GitHub, the transaction is incomplete.
- Before stopping, post one terminal receipt: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- Update `ACTIVE_HANDOFF.md` when the seam / proof / next move / blocker changes; `FOLDERA_BUILD_ORDER.yaml` when the active issue changes.
