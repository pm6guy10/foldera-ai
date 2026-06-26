# ACTIVE HANDOFF - FOLDERA

## TL;DR

- **Value reset (owner 2026-06-26):** Foldera is **decision-replacement**, not a task tool. Metric = **trust = the user stops re-checking** (closure, not certainty). Reminders (bills, hotel points) are **junk tier** — silence beats them. First indispensable move = **"finish what I started" (R1):** watch real Drive/Outlook activity, hand back the finished asset he drafted and never shipped.
- **#565 MERGED — decision-closure card footer (override-killer).** Coverage-assurance + continuity quiet lines so the user has permission to stop re-checking. `lib/workday-presence/decision-closure.ts` plumbed state→seed→renderer. Runner-up list deliberately omitted (re-triggers comparison).
- **In flight (this branch):** fix rotted `CURRENT_ARTIFACT_ANCHOR_RE` (month-locked to 2026-05). Narrow latent-bug fix; does NOT alone make a card fire.
- **Next (scoped issue, new chat):** foundation so a real card FIRES — stop ghost apex-goal monopoly (`extractDrift`) + re-ground goal (sign-off), own-activity fuel + Gmail connector (1-of-967, sign-off), restore `pipeline_runs` observability, durable doctrine to Bible. Prior merges: #556/#562/#564/#565.

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
6. **Card IS the act; pool self-cleans.** The card leads with the ready-to-send draft, not homework scaffolding (#556 `send_message`, #564 `write_document` acquisition). Past-due EVENT commitments auto-expire from candidacy at scorer load (#562/#537), overdue actions preserved. Don't reintroduce homework framing or per-row manual suppression.

## Boot

1. Read this file. 2. Read the active issue (#546). 3. Check issue #136 for recent INTERRUPT receipts.

## Active command gate

`ACTIVE_SEAM_STATE.json` is the machine-readable control plane.

Issue #546 is the active LEARNING-AGENTIC-LIFE-SYSTEM seam.

#546 (value cascade) enumerates rungs R1–R6 + goal-inference + expert-panel; R1 (advance what you've started) is the current slice.

Constraint everywhere: NO paid API calls and NO production mutation without explicit owner authorization — prove in the harness.

## Current slice:

**Live proof of write_document acquisition legwork (#546 cascade). #564 merged on main.**

- Code on main: `lib/conviction/acquisition-legwork.ts` + `generateArtifact` acquisition branch. Self-gated on `SCOUT_WEB_ENABLED` + `isPaidLlmAllowed()` — no-ops until flag is on.
- Live pool target: "Book hotel stay using $35.16 OneKeyCash balance" (Supabase id `829b5e13`, risk_score 49, active, unsuppressed).
- Pending: owner sets `SCOUT_ENABLED=true` + `SCOUT_WEB_ENABLED=true` in Vercel Production → next deliver trigger → card should be pick+link, not checklist.

## Next exact move

1. **Owner: set 2 Vercel env vars** — Vercel dashboard → foldera-ai → Settings → Environment Variables → Production: `SCOUT_ENABLED=true`, `SCOUT_WEB_ENABLED=true`. No redeploy needed.
2. **Trigger delivery** — next cron tick or manual `/api/cron/ingest-and-deliver` → hotel-booking card should be a specific pick + OneKeyCash booking link.
3. **Precision meter (Probe 5)** — once live card confirmed; then extend to interview-prep write_document (currently SAFE_SILENT on homework).
4. **Standing (#546):** R2–R6 cascade, goal-inference refresh (keystone), expert-panel/avatars + gap analysis, Gmail sent-mail connector fix (1 vs 967).

## Product doctrine

Foldera is a Workday Presence Layer (the always-on default) plus, additively, a flag-gated Proactive Scout lane (Bible Part V). No dashboard / task-manager / inbox-summary / chatbot / surveillance drift; no auto-send. `FOLDERA_MASTER_BIBLE.md` carries doctrine; `AGENTS.md` is the agent contract.

## GitHub writeback contract

- GitHub writeback before stop is mandatory. GitHub source truth beats chat memory; if work isn't written to GitHub, the transaction is incomplete.
- Before stopping, post one terminal receipt: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- Update `ACTIVE_HANDOFF.md` when the seam / proof / next move / blocker changes; `FOLDERA_BUILD_ORDER.yaml` when the active issue changes.
