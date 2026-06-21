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

1. Read this file. 2. Read the active issue (#496). 3. Check issue #136 for recent INTERRUPT receipts.

## Active command gate

`ACTIVE_SEAM_STATE.json` is the machine-readable control plane.

Issue #496 is the active LANDING seam.

Constraint everywhere: NO paid API calls and NO production mutation without explicit owner authorization — prove in the harness. Scout seam #494 is PAUSED (not abandoned) for this owner-directed UI pass; resume it once #496 lands.

## Current slice:

**LANDING design pass (#496) — sharpen hierarchy + a connected how-it-works flow.** Promoted to the active seam at owner request (2026-06-21), pausing the Scout seam (#494) as the active one. Owner-directed landing-page craft pass under the binding bar in `docs/DESIGN_SYSTEM.md`, on the dedicated branch `claude/landing-page-design-fixes-wub5aj`. Lead surface: `components/foldera/LandingPage.tsx` via the token-driven `.ld` layer.

- Hero trust line → icon pill badges (Consent-first / No surveillance / Quiet by design).
- Stats → framed with an eyebrow + display heading and per-stat amber accent ticks.
- How it works → floating numbers replaced with a connected flow (numbered dots on a gradient thread, final "then quiet" step accented).
- Latent-bug fix: Tailwind bare opacity modifiers on `var()` colors (e.g. `accent/60`) resolve to transparent here, so new decorative elements use inline `color-mix()`.

Preserves every landing `data-testid`, the asserted copy, the section order, and the CTA href contract. **NOT in scope:** dashboard, `app/api/**`, Stripe, DB migrations, secrets, new public-facing claim terms, auto-send, or any section-order / `data-testid` / asserted-copy removal.

## Next exact move

1. **Owner review** of the #496 landing draft PR against owner taste + the `docs/DESIGN_SYSTEM.md` §12 quality bar.
2. **CI:** the standard Playwright landing lane (`public-routes` + `landing-hero-visual-qa` + `landing-mobile-sections`) runs on CI — the sandbox's Playwright browser CDN is blocked by network egress, so the contract was verified here with a cached Chromium build (section order, locked copy, CTA hrefs → /start, zero horizontal overflow at 390/768/1440).
3. **On merge:** repoint the control plane back to **#494** and resume owner-gated Scout activation (`BLOCKED_WITH_EXACT_RECEIPT`: `VOYAGE_API_KEY`, `SCOUT_*`/`ALLOW_PAID_LLM` flags, `CRON_SECRET` cron triggers, `ENCRYPTION_KEY_LEGACY` decrypt).

Full design: issue #496 (landing) + `docs/DESIGN_SYSTEM.md` (binding bar). Scout context: #494 (+ #486 umbrella, #492 compass, #481 go/no-go).

## Product doctrine

Foldera is a Workday Presence Layer (the always-on default) plus, additively, a flag-gated Proactive Scout lane (Bible Part V). No dashboard / task-manager / inbox-summary / chatbot / surveillance drift; no auto-send. `FOLDERA_MASTER_BIBLE.md` carries doctrine; `AGENTS.md` is the agent contract.

## GitHub writeback contract

- GitHub writeback before stop is mandatory. GitHub source truth beats chat memory; if work isn't written to GitHub, the transaction is incomplete.
- Before stopping, post one terminal receipt: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- Update `ACTIVE_HANDOFF.md` when the seam / proof / next move / blocker changes; `FOLDERA_BUILD_ORDER.yaml` when the active issue changes.
