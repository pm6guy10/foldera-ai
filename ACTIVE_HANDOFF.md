# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-06-17 UTC (issue #378 COMPLETE — landing amber overhaul merged; between rungs)

## Boot

1. Read this file.
2. Read the next active issue (see below).
3. Check issue #136 for recent INTERRUPT receipts.

## Active command gate

ACTIVE_SEAM_STATE.json is the machine-readable control plane.
Active implementation seam is issue #391 — fire the grounded workday-presence guardian on the daily schedule. Live-data diagnosis (2026-06-18): the grounded receipt writer `insertTriggerReceipt` (`action_source='workday_presence_trigger'`, evidence from the real lapsing commitment) has fired **0 times** in prod; the 5 `workday_presence` rows are hollow loop-close receipts (`insertPresenceReceipt`, `evidence:[]`). `maybeRunWorkdayPresenceTriggerRunnerForUser` runs only from event-driven sync routes + unscheduled crons; the one scheduled Vercel cron (`morning-pipeline`) never calls it. Owner has 26 active lapsing commitments. The one act: wire the existing owner-targeted `/api/cron/workday-presence-trigger-runner` in as a 4th `morning-pipeline` stage. Proof: a `workday_presence_trigger` receipt with non-empty evidence + the owner Slack ping. NO new detector/brain.
**LIVE (production `8fd766b`):** #382 frontend overhaul — PRs #383–#389 (amber cohesion + Bricolage type + tokens; premium footer/pricing; show-don't-tell landing+content; pixel-polish: amber brand glyph, one-focal-point hierarchy, de-blurred float, 1240 layout, Slack-forward hero) + PR #390 owner self-review system (`docs/BRANDON.md` avatar + `docs/EXPERT_PANEL.md` + Bible Part IV ritual) + ~29MB dead-image hygiene. #382 stays OPEN for optional polish.
**Next after #391:** recolor legacy `app/favicon.ico`/`public/favicon.png` (still cyan); triage 44 stale unmerged remote branches + 24 skipped tests; widen the guardian to non-owner.

Issue #378 is COMPLETE — design system locked (PR #379, `1230c13`) then full landing overhaul to it: warm amber/gold on warm near-black, real product window (chrome + left rail + evidence rows w/ real source logos), 8 real official brand SVGs in `public/logos/`, stats row, honest enterprise strip (no SOC 2 claim), orchestrated framer-motion, mobile hamburger sheet. Tokens scoped to a `.ld` layer in `app/globals.css` so the dashboard palette is untouched. Merged via PR #380 (`40b687a`). Proof: build + lint + gate:continuity + public-routes + landing-hero-visual-qa 54/54; flawless 1440+390.
Issue #376 is COMPLETE — landing raised to product-window hero + motion (Linear/Vercel tier); merged via PR #377 (`b1bc061`).
Issue #374 is COMPLETE — removed the visible BuildMarker deploy-SHA badge from all pages; merged via PR #375 (`2e8c7b2`).
Issue #372 is COMPLETE — landing de-block to editorial; merged via PR #373 (`891d24f`).
Issue #370 is COMPLETE — first landing dark/cyan elevation; merged via PR #371 (`64e0e1e`).
Issue #364/#366 is COMPLETE — heartbeat moved off capped GitHub Actions to a free external cron (PRs #365/#366 via #367); owner must create the external cron job for live firing.
Issue #361 is COMPLETE — commitment-lapsing bridge + 15-min GitHub Actions schedule merged via PR #362 (`d19a4bf`); discovered non-functional in production post-merge, see #364.
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

None — between rungs. #378 (design system + full amber landing overhaul) merged via PR #380 (`40b687a`). Awaiting the owner's next chosen seam.

## Next exact move

1. Owner names the next seam (or pick from the backlog/ladder). Until then `active_issue: none` is the valid between-rungs control-plane form.
2. Standing follow-up candidates (NOT started, not yet authorized): (a) migrate the rest of the app (dashboard) from cyan to the amber system — amber is currently landing-scoped only via the `.ld` layer; `tailwind.config.js` accent is still cyan. (b) Optionally warm the `foldera-glyph.svg` mark, which reads slightly teal beside amber.
3. Any further landing pass must stay OBVIOUSLY better, not incremental, and keep §12 of `docs/DESIGN_SYSTEM.md` green.

Open owner items (not active seams): (1) configure the free external cron for the workday-presence heartbeat (#364 code shipped, owner must create the cron job for live firing); (2) landing polish is an open standing goal — owner wants each pass obviously better, not incremental.

Current production truth: `Last known main SHA: d8a788f` (frontend overhaul #382 phases 1/2a/3 live via PRs #383/#384/#385; whole-app amber + Bricolage type system + premium footer + premium /pricing). #382 remains OPEN for the remaining phases.

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
