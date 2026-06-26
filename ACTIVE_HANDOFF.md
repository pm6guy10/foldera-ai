# ACTIVE HANDOFF - FOLDERA

## TL;DR

- **Card IS the act — now for `write_document` too (this branch).** Acquisition/purchase/prep moves (the Nathaniel-birthday checklist) do the real lookup and hand the FINISHED act — the chosen thing + a grounded link — instead of homework. `lib/conviction/acquisition-legwork.ts` + a branch in `generateArtifact`; never fabricates a link (degrades to the decisive brief). Harness-proven (9 tests incl. live `evaluateBottomGate`); typecheck/lint green.
- **Self-gated, no blind loosening:** the lookup is `searchWebForEnrichment`, which no-ops unless `SCOUT_WEB_ENABLED` + `isPaidLlmAllowed()`. Prod behaviour unchanged until the flag is flipped.
- **Prior merges:** #556 (reply card IS the draft, Approve & Send, no auto-send); #562 (past-due `attend_participate` events auto-expire from candidacy, overdue actions preserved). #555 baseline (event-driven Outlook push, budget durable, Micro1 excluded).
- **Next:** owner flips `SCOUT_WEB_ENABLED` for live proof on a real acquisition commitment (paid web search) → precision meter (Probe 5). Standing #546: R2–R6 cascade, goal-inference refresh, Gmail connector (1 vs 967).

## DON'T FORGET — read first, every boot

1. **Value is the only score.** Foldera exists to produce one act the user wouldn't have done. Green CI, audits, clean code, merged PRs are *hygiene* — not value.
2. **Learning agentic life-system — proactive, instant, value-cascade.** Foldera lurks/watches/learns the user's *own* world and ships the next real act they'd never have asked for — opportunity-finder, not CBT nag. Walk the cascade until something clears a real bar: **R1 advance what you started** (sent mail, open drafts, in-flight projects) → owed replies → inbound-ask→finished prep → goal moves → relationship → outward Scout (a rung, sign-off-gated). Instant/event-driven, not a daily cron. Never fabricate to fill silence; a due-date nag is NOT an act. See `FOLDERA_MASTER_BIBLE.md` → "Learning Agentic Life-System" (owner thesis 2026-06-24).
3. **No "done" without live product proof.** Build/tests/CI green is necessary, never sufficient.
4. **Don't make Brandon the router/tester/merger.** Pick the highest-leverage move, do it end-to-end, bring the result + reasoning.
5. **Scout is additive and never auto-sends.** The Workday Presence Layer stays the always-on default; every `SCOUT_*` flag defaults off.
6. **The Guardian looks inward, not outward.** Watch the user's *own* world. A fixture/sample card must never be posted to a real channel as if real. See issues #492 / #494 / #481.
7. **Reduce friction by default, every session.** Standing owner directive: cut process friction and cruft proactively without re-asking. Hard safety rails still need sign-off. See `AGENTS.md` → "Friction Reduction — Standing Authorization".

Keep this cockpit short and value-first. Completed-issue history lives in `docs/archive/SESSION_HISTORY.md` + git, never here.

## SETTLED — do not relitigate

These are decided. Do not re-derive, re-probe, or re-propose the dead alternative.

1. **Delivery is push/event-driven, not a scheduled cron.** Provider push (Microsoft Graph change-notifications → `/api/webhooks/graph`; Gmail watch is phase 2) fires the card the instant data changes — the change is the clock. `deliverWorkdayPresence` (`lib/workday-presence/deliver-now.ts`) is the single seed→trigger pipeline ALL callers use. The `vercel.json` crons are a Hobby-throttled fallback heartbeat + subscription-renewer only; never "wait for the cron". Old `daily-brief-generate` RETIRED (#548). **Push architecture MERGED #555.**
2. **Owner = `2cbc1bab`.** `FOLDERA_SELF_USER_ID` is canonical owner resolution everywhere; `INGEST_USER_ID` is legacy fallback only (fixed in #553). Old account `e40b7cd8` is empty post-#509.
3. **`SAFE_SILENCE` is a valid SUCCESS.** Never loosen a gate to force a card.
4. **Live-pool schema + probes live in `docs/LIVE_POOL_PROBE.md`.** Don't re-derive columns or re-pull the pool to "see what the brain has" — it's already canned.
5. **Budget phantom cap fixed (#555).** `api_budget_check_and_reserve` reconciles to real `api_usage` ledger on every call (durable, not a one-time reset). Micro1 eval agent (`398a8c82` / `zz933@expert.micro1.ai`) permanently excluded via `isExcludedPipelineUser`.
6. **Card IS the act; pool self-cleans.** The card leads with the ready-to-send draft, not homework scaffolding (#556, `send_message` only so far). Past-due EVENT commitments auto-expire from candidacy at scorer load (#562/#537), overdue actions preserved. Don't reintroduce homework framing or per-row manual suppression.

## Boot

1. Read this file. 2. Read the active issue (#546). 3. Check issue #136 for recent INTERRUPT receipts.

## Active command gate

`ACTIVE_SEAM_STATE.json` is the machine-readable control plane.

Issue #546 is the active LEARNING-AGENTIC-LIFE-SYSTEM seam.

#546 (value cascade) enumerates rungs R1–R6 + goal-inference + expert-panel; R1 (advance what you've started) is the current slice.

Constraint everywhere: NO paid API calls and NO production mutation without explicit owner authorization — prove in the harness.

## Current slice:

**Card IS the act for `write_document` — acquisition legwork (#546 cascade). Branch `claude/card-is-act-write-document-7xsol8`.**

- **The fix:** `lib/conviction/acquisition-legwork.ts` (`isAcquisitionDirective` / `buildAcquisitionSearchQuery` / `buildAcquisitionArtifactFromSearch`) + a new branch in `generateArtifact` (`lib/conviction/artifact-generator.ts`). A purchase/prep/booking `write_document` move does the real lookup and returns the chosen thing + a grounded link, shaped to clear `evaluateBottomGate` — not a "decide → buy → wrap → confirm" checklist.
- **Rails honoured:** the lookup is `searchWebForEnrichment` (Anthropic web_search), which self-gates on `SCOUT_WEB_ENABLED` + `isPaidLlmAllowed()` → returns null when off, so prod is unchanged until the owner enables it. The link is only ever taken from the real result; no link grounded ⇒ return null ⇒ fall through to the decisive brief (never fabricate "buy here", never homework).
- **Rendering:** unchanged — `formatDraftLedText` already routes any reviewable draft to the finished-object card, so the `write_document` draft renders inline (locked by a new `message.test.ts` case). The disease was the CONTENT, not the render.
- Verified: 9 acquisition tests (incl. live `evaluateBottomGate` pass + degrade-not-fabricate) + workday-presence/conviction/cron suites green; typecheck + lint clean.
- Open: live proof needs the owner to flip `SCOUT_WEB_ENABLED` (paid web search); then #546 R2–R6.

## Next exact move

1. **Live proof of acquisition legwork.** One genuine owner action: enable `SCOUT_WEB_ENABLED` (paid web-search lane — `searchWebForEnrichment` no-ops without it). Then run a real acquisition commitment through the deliver path → the card should be a finished pick + link, not a checklist → click → `responded_to_slack_ts` → precision meter (Probe 5). Until then the legwork is proven only in the harness.
2. **Then keep extending `write_document`:** prep classes that still go SAFE_SILENT on homework (interview prep) should hand a finished act, not silence — owner: "it's not that valuable to always be quiet."
3. **Standing (#546):** R2–R6 cascade, goal-inference refresh (keystone), expert-panel/avatars + gap analysis, Gmail sent-mail connector fix (1 vs 967).

## Product doctrine

Foldera is a Workday Presence Layer (the always-on default) plus, additively, a flag-gated Proactive Scout lane (Bible Part V). No dashboard / task-manager / inbox-summary / chatbot / surveillance drift; no auto-send. `FOLDERA_MASTER_BIBLE.md` carries doctrine; `AGENTS.md` is the agent contract.

## GitHub writeback contract

- GitHub writeback before stop is mandatory. GitHub source truth beats chat memory; if work isn't written to GitHub, the transaction is incomplete.
- Before stopping, post one terminal receipt: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- Update `ACTIVE_HANDOFF.md` when the seam / proof / next move / blocker changes; `FOLDERA_BUILD_ORDER.yaml` when the active issue changes.
