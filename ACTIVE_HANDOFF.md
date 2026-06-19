# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-06-19 UTC (active seam: #445 Master Audit — passes 0/1/2/3 + D-3 + F-1 merged; shipping gem-surfacing, owner-validation-gated)

## Boot

1. Read this file.
2. Read the next active issue (see below).
3. Check issue #136 for recent INTERRUPT receipts.

## Active command gate

ACTIVE_SEAM_STATE.json is the machine-readable control plane.
Between rungs — `active_issue: none` is the valid control-plane form; the owner names the next seam. The NEXT_SESSION_HARDENING mission (roadmap #420) shipped as four themed PRs: #426 (dead-code deletion), #428 (typecheck — 120 tsc errors to 0), #430 (auth PII tracing gated behind FOLDERA_DEBUG_AUTH), #433 (.env.example completeness + dead skip-branch / TODO cleanup). Batch 5 (Supabase index drop) was evaluated and rejected as WRONG PATH — both indexes are intentionally retained FK-support indexes (#434). Constraint: NO paid API calls — prove in the harness. The live product thread remains the GUARDIAN (workday-presence) — see `FOLDERA_MASTER_BIBLE.md` Part II-B; the one live-readiness blocker stays owner-side (ANTHROPIC_API_KEY in Vercel Production + the free external guardian cron).
**LIVE (production `30fbf13`):** #382 frontend overhaul · #390 owner self-review system (`docs/BRANDON.md` + `docs/EXPERT_PANEL.md` + Bible Part IV) · #391/#393 guardian fires-grounded-and-pings · #394/#395 guardian pings only finished work · #397 (PR #398) brief seeds the matched draft at generation time · #399 (PR #400) commitment-title hygiene (no SYNC: key in the card). #382 stays OPEN for optional polish.
**Standing candidates (NOT started, owner to choose):** OWNER-SIDE — configure the external 15-min cron for guardian cadence (the ongoing firing mechanism; NOT a Vercel daily cron). CODE — recolor legacy cyan favicons (`app/favicon.ico`/`public/favicon.png`, BLOCKED on image tooling — `sharp`/imagemagick absent); triage 46 stale remote branches + skipped tests. Constraint: NO paid API calls to test — prove in the harness.

Issue #394 is COMPLETE — guardian pings only finished work: silent/dismissed payload → no Slack (no noise ping); draftless scored_winner recycles the latest matching daily-brief artifact into a reviewable draft (no new LLM, conservative anti-mismatch guard). Merged via PR #395 (`d235cde`); 13 fixtures + 107/107 suite; runtime proof deferred per owner no-paid directive.
Issue #391 is COMPLETE/REVERTED — wired the guardian into the daily morning-pipeline cron (PR #392) then reverted it (PR #393, `7b573eb`) for conflicting with #369 (no daily cron). Runtime proof obtained instead: first grounded `workday_presence_trigger` receipt (`9695a5c6`, ev_count=1) + live Slack ping via a one-time owner-go fire.
Issue #390 is COMPLETE — owner self-review system: `docs/BRANDON.md` (avatar) + `docs/EXPERT_PANEL.md` (9-expert panel) + Bible Part IV ritual; ~29MB dead-image hygiene. Merged `8fd766b`.
Issue #382 is LIVE (OPEN) — whole-app frontend overhaul to `docs/DESIGN_SYSTEM.md` ($500M tier): PRs #383–#388 + #389 pixel-polish (amber brand glyph — cyan killed; one-focal-point hierarchy; de-blurred float; 1240 layout; Slack-forward hero). Optional polish remains.
Issue #378 is COMPLETE — design system locked (PR #379) + full amber landing overhaul; merged via PR #380 (`40b687a`).
Issue #364/#366 is COMPLETE — heartbeat moved off capped GitHub Actions to a free external cron (PRs #365/#366 via #367); owner must create the external cron job for live firing.
Issue #354 is COMPLETE — auth + state-machine integrity (F-auth/F-card/F-dismiss); PRs #357 (`ba42125`) + #358 (`4b2908b`).
Issue #351 is COMPLETE — money-loop integrity sweep (F1-F5); PRs #352 (`b400c5d`) + #353 (`c238165`).
Issue #348 is COMPLETE — presence receipt insert-error hotfix; PR #349 (`9377546`).
Issue #344 is COMPLETE — workday-presence loop closure for non-owner in browser; PR #346 (`e2f7687`).
Issue #341 is COMPLETE — runtime map + current-path Supabase receipts; PR #343 (`613296d`).
Issue #339 is COMPLETE — frontend auth polish closeout; PR #340 (`a315394`).
Issue #276 is COMPLETE — Command State Resolver v0; PR #279 (`e848d01`), closeout PR #280 (`13581bf`).
Issue #262 is COMPLETE — event-driven trigger runner live; PR #273 (`d6b99f2`).
Issue #244 is COMPLETE — Right Now cards / state-change triggers; PRs #308 (`dddece7`) + #313 (`d2bed9a`).
Issue #136 is COMPLETE — Run Ledger rule installed; PR #319 (`d1291ff`).
`FOLDERA_MASTER_BIBLE.md` is the single doctrine file. `AGENTS.md` is the single agent contract.

## Current slice:

Issue #445 is the active firm-foundation audit seam.

Master Audit (#445) — fix-in-pass. Merged: Pass 0 inventory; Pass 1 RLS `PASS`; Pass 2 database `PASS` + D-3 index; Pass 3 cost `CONCERN`; F-1 CI-on-PRs. **Shipping gem-surfacing** — the product-quality core. Diagnosed why the engine fires daily but delivers nothing: the artifactability taxonomy ranked deadline/calendar reminders as tier_1 "gems" and hardcoded relationship insight to tier_3 + blocked it — **inverted from value**. Fix (`lib/briefing/artifact-taste-pack.ts`): a relationship gem GROUNDED in a real recent two-way thread (≥2 facts ≤14d) is promoted to tier_2 + unblocked; vague/stale stays suppressed. Deterministic proof green (gem-tiering test + 812-test briefing suite + typecheck). **Live/paid validation = OWNER gate** (deploy + 1 generation cycle on credits, confirm gem-not-noise). Doctrine: `docs/GEM_SURFACING.md`.

## Next exact move

1. PR up with deterministic proof; **BLOCKED_WITH_EXACT_RECEIPT** on owner live/paid validation (the brain's voice change needs a real generation run — credits exist, env is owner-side).
2. Owner: deploy, run one daily generation cycle, confirm the surfaced card is a real relationship gem. If noise → tighten grounding (high-value entity / explicit open loop).
3. Then the bigger tune: re-order tiers so insight density beats artifact shape. Constraint: NO paid API calls from here — prove in the harness.

Open owner items (not active seams): (1) configure the free external cron for the workday-presence guardian (code shipped; owner creates the cron job for live cadence); (2) landing polish is an open standing goal — each pass obviously better, not incremental.

Current production truth: `Last known main SHA: d235cde`. Whole-app amber + Bricolage type + premium chrome + show-don't-tell landing (#382, OPEN for polish); owner self-review system live (`docs/BRANDON.md` + `docs/EXPERT_PANEL.md` + Bible Part IV); guardian fires-grounded-and-pings-only-finished-work (#391/#393/#394). gitlab-handbook (1.1GB) moved out of the repo tree → `C:/Users/b-kap/foldera-reference/`.

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
