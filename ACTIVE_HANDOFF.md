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

Issue #500 is the active LANDING seam.

Constraint everywhere: NO paid API calls and NO production mutation without explicit owner authorization — prove in the harness.

## Current slice:

**LANDING (#500) — implement the imported Claude-Design "Foldera Landing".** Owner-directed landing pass: replace the public marketing landing with the imported design (dark cyan/magenta presence-layer system; Space Grotesk + Inter + JetBrains Mono). Temporary authorized detour off the Scout seam (#494), mirroring the prior landing pass (#496 → repointed back to #494 after merge). Real auth/route wiring is preserved: primary CTAs → `/start`, Sign in → `/login`, See the demo → `/demo`; `isAuthenticated` contract intact; no dead anchors; no forbidden public-facing claim terms; dashboard palette untouched.

**Scout (#494) is untouched** and resumes after merge: build DONE + inward, flag-OFF in prod, hands never gripped real data; its money-move (one real inward loop on REAL data) stays owner-gated runtime activation (`BLOCKED_WITH_EXACT_RECEIPT`).

## Next exact move

1. Implement the design in `components/foldera/LandingPage.tsx` (lucide-react icons, real `/logos/*.svg`, `/foldera-glyph.svg` mark); add Space Grotesk in `app/layout.js`.
2. Refresh the three coupled landing e2e specs to the new structure/copy, preserving invariants (CTA hrefs → `/start`, no 390px overflow, headline + "The Workday Presence Layer" + footer present).
3. Proof: `npm run gate:continuity && npm run typecheck && npm run lint && npm run build` green; landing e2e green in CI (sandbox has no Playwright browsers); live visual validation owner-side.
4. Open the draft PR on `claude/landing-page-auth-01b7vj` targeting #500; set `ACTIVE_SEAM_STATE.active_pr`.
5. After merge: repoint source truth back from #500 to the Scout seam #494.

Full design: issue #500.

## Product doctrine

Foldera is a Workday Presence Layer (the always-on default) plus, additively, a flag-gated Proactive Scout lane (Bible Part V). No dashboard / task-manager / inbox-summary / chatbot / surveillance drift; no auto-send. `FOLDERA_MASTER_BIBLE.md` carries doctrine; `AGENTS.md` is the agent contract.

## GitHub writeback contract

- GitHub writeback before stop is mandatory. GitHub source truth beats chat memory; if work isn't written to GitHub, the transaction is incomplete.
- Before stopping, post one terminal receipt: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- Update `ACTIVE_HANDOFF.md` when the seam / proof / next move / blocker changes; `FOLDERA_BUILD_ORDER.yaml` when the active issue changes.
