# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-06-18 UTC (#394 guardian-finished-work merged `d235cde`; between rungs)

## Boot

1. Read this file.
2. Read the next active issue (see below).
3. Check issue #136 for recent INTERRUPT receipts.

## Active command gate

ACTIVE_SEAM_STATE.json is the machine-readable control plane.
Issue #397 is the active product seam.
The live product thread is the GUARDIAN (workday-presence): it fires, grounds a real commitment, and pings Slack ONLY when it has a reviewable move — see `FOLDERA_MASTER_BIBLE.md` Part II-B for the full architecture map. #397 widens the guardian's hands: the daily brief seeds the matched draft at generation time (deterministic), retiring the post-hoc fuzzy recycle (#394) for the brief path.
**LIVE (production `d235cde`):** #382 frontend overhaul (PRs #383–#389 incl. pixel-polish) · #390 owner self-review system (`docs/BRANDON.md` avatar + `docs/EXPERT_PANEL.md` panel + Bible Part IV) · #391/#393 guardian fires-grounded-and-pings (daily-cron reverted, honoring #369) · #394/#395 guardian pings only finished work + no-paid recycled draft. #382 stays OPEN for optional polish.
**Standing candidates (NOT started, owner to choose):** OWNER-SIDE — configure the external 15-min cron for guardian cadence (the ongoing firing mechanism; NOT a Vercel daily cron). CODE — have the brief seed the matched draft at generation time (touches the paid generator); clean malformed commitment titles (`SYNC:payment_financial:…`); recolor legacy cyan favicons (`app/favicon.ico`/`public/favicon.png`); triage 44 stale remote branches + 24 skipped tests. Constraint: NO paid API calls to test — prove in the harness.

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

#397 — guardian seeds the matched draft at GENERATION TIME. Owner directive 2026-06-18 ("you pick, take ownership"). The daily brief now seeds `workday_presence_state` (with its draft) at the exact moment it persists a winning directive+artifact to `tkg_actions` — so the draft is grounded to the precise winner, retiring the post-hoc fuzzy 48h recycle (#394) for the brief path (#394 stays as a fallback for other paths). Extracted the seed-mapping into shared `lib/workday-presence/seed-from-directive.ts` (route imports it; behavior byte-identical). Conservative: refuses ungrounded send drafts, PRESERVES an existing snooze. Proven in harness — 16 new fixtures + the seed-from-scorer route suite (proves extraction) + #394 recycle/finished-work suites all green; NO paid calls. Branch `claude/foldera-boot-memory-qlsywu`.

## Next exact move

1. Owner names the next seam (or pick from the standing candidates above). Until then `active_issue: none` is the valid between-rungs control-plane form.
2. The live product thread is the GUARDIAN. Highest-leverage owner-side action: configure the external 15-min cron so the guardian checks on the right cadence (it now only pings finished work). Code-side, the honest next seam is the brief seeding the matched draft at generation time.
3. Constraint reminder: NO paid API calls to test the guardian — prove in the harness. Any landing pass must stay OBVIOUSLY better and keep `docs/DESIGN_SYSTEM.md` §12 green.

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
