# Pull Request Receipt

Closes #240.

## Receipt summary

- Active issue: #240 — Governance Collapse v1
- Next authorized move: merge this PR, then reactivate issue #226 (rung 6 owner-path readiness)
- Forbidden work touched: NO (no app/, lib/, components/, pages/, supabase/, sql/ changes)
- Proof run: gate:continuity PASS; full vitest suite 230 files / 1692 tests PASS; lint PASS; build PASS; pre-push e2e smoke PASS
- Checks passed: YES (local); GitHub CI pending on this PR
- Terminal state: MERGE READY pending CI
- Source-truth closeout status: complete (see below)
- Stop condition: stop after merge + GitHub receipt on #240

## What changed

- **Gate rewrite**: `scripts/continuity-gate.ts` now enforces structure only — keep-list files exist, root markdown count <= 8 (mechanical anti-regrowth rule), one active seam, handoff/build-order/contract parity, PR template closeout. `scripts/source-truth-check.ts` delegates to it; the hardcoded issue-history assertions (including the pin of active_issue=226) are gone.
- **Doctrine consolidation**: `FOLDERA_NORTH_STAR_LOCK.md` and `FOLDERA_PRODUCT_OPERATING_SYSTEM.md` merged verbatim into `FOLDERA_MASTER_BIBLE.md` as Parts II and III. One doctrine file.
- **Agent contract consolidation**: CLAUDE.md operational rules, ACCEPTANCE_GATE proof doctrine, and SYSTEM_RUNBOOK boundaries merged into `AGENTS.md`. `CLAUDE.md`, `.cursorrules`, `.cursor/rules/agent.mdc` are now thin pointers. `CODEX_START.md` and `GPT.md` deleted.
- **Deleted (git history is the archive)**: all 8 SHIM_TO_CANONICAL files, `CODEX_PROMPT_MAS3_REMOVAL.md`, `CURRENT_STATE.md`, `controller-autopilot.ts` + its test + npm script.
- **Archived to docs/archive/**: 19 reference drafts, audits, and old queue files.
- **Boot sequence**: 7 steps -> 2 (read ACTIVE_HANDOFF.md, read the active issue).
- **Root markdown count**: ~40 -> 7.
- **Hygiene**: brand PNGs moved to `public/brand/`, SEO batch PDF removed; `output/`, `audit-output/`, `artifacts/` were already gitignored and untracked.

## What did not change

No product behavior changed. No app, lib, component, page, schema, auth, Slack, or Stripe code was touched. Issue #226 (rung 6) remains the next product seam, paused, with rung 7 still forbidden until #226 is proven. `FOLDERA_MASTER_BIBLE.md` cited for direction: doctrine content was moved, not altered.

## Proof run

- `npm run gate:continuity` — PASS
- `npx vitest run` (full suite, mirrors CI) — 230 files, 1692 tests, PASS
- `npm run lint` — PASS
- `npm run build` — PASS
- pre-push hooks (preflight contract, e2e assertion lint, build, public-routes smoke) — PASS

## Next seam

- Next seam: issue #226 — rung 6 owner-path readiness (sign-in + Slack self-loop)
- Status: named

## Source-truth closeout

- `ACTIVE_HANDOFF.md`: updated
- `FOLDERA_BUILD_ORDER.yaml`: updated
- `docs/SOURCE_OF_TRUTH_MAP.md`: updated

🤖 Generated with [Claude Code](https://claude.com/claude-code)
