# Issue #106 Final Hygiene Classification

Date: 2026-05-29 PT
Branch: `codex/issue-106-final-hygiene-clean`

This classification was written before any delete or move action.

## Source Truth Read

- `ACTIVE_HANDOFF.md`
- `FOLDERA_BUILD_ORDER.yaml`
- `FOLDERA_LAUNCH_ROADMAP.md`
- `docs/SOURCE_OF_TRUTH_MAP.md`
- GitHub issue #106
- GitHub issue #102 and PR #104
- GitHub issue #105
- GitHub issue #99
- GitHub issue #84 and PR #95
- GitHub issue #77
- GitHub issue #48

## Inventory Commands

- `git status --short`
- `git ls-files`
- PowerShell equivalent of issue #106 `find . -maxdepth 3 -type f` matching `brain`, `claude`, `receipt`, `proof`, `dump`, `tmp`, `scratch`, `artifact`, `json`, `txt`, `md`, `png`, `jpg`, and `webp`, excluding `.git` and `node_modules`
- `rg -n "\.foldera-contract|foldera-contract|\.playwright-cli|brand-verify-shots|issue-62-homepage|issue-new-home|pr-37-homepage|docs/receipts/pr-47|\.screenshots/visual-hierarchy-strike|page-2026-03-16" -S .`
- `rg -n "screenshots/home-desktop-1440|screenshots/home-mobile-390|home-desktop-1440\.png|home-mobile-390\.png|crispcanvas-storyboard|public/crispcanvas-storyboard|foldera-homepage-final|foldera-hero|foldera-outline|foldera-oauth|Dashboard\.png|Icon Watermark|Primary Logo" -S .`

## Classification Table

| File/folder | Classification | Reason | Action |
| --- | --- | --- | --- |
| `ACTIVE_HANDOFF.md` | `KEEP_AUTHORITY` | Current command-state document; protected by issue #106. | Keep unchanged. |
| `FOLDERA_BUILD_ORDER.yaml` | `KEEP_AUTHORITY` | Machine-readable source-truth order; protected by issue #106. | Keep unchanged. |
| `FOLDERA_LAUNCH_ROADMAP.md` | `KEEP_AUTHORITY` | Current launch roadmap; protected by issue #106. | Keep unchanged. |
| `docs/SOURCE_OF_TRUTH_MAP.md` | `KEEP_AUTHORITY` | Authority ledger and stale-file classification source. | Keep unchanged. |
| `.foldera-contract.json` | `KEEP_TEST_OR_GATE` | Stale generated contract is intentionally tracked and checked by `scripts/continuity-gate.ts`, `scripts/preflight-contract.ts`, and tests. | Keep unchanged. |
| `.claude/launch.json` | `KEEP_REFERENCE` | Tooling configuration, not generated proof output. | Keep unchanged. |
| `.claude/settings.local.json` | `KEEP_REFERENCE` | Tooling configuration, not generated proof output. | Keep unchanged. |
| `CLAUDE.md` | `KEEP_AUTHORITY` | Execution contract listed in the authority ledger. | Keep unchanged. |
| `docs/proofs/issue-102-artifact-classification.md` | `KEEP_CURRENT_PROOF` | Current predecessor proof for issue #102 / PR #104, explicitly required context for #106. | Keep unchanged. |
| `docs/receipts/pr-47/vercel-preview-active.png` | `KEEP_REFERENCE` | Historical PR receipt evidence, retained under `docs/receipts`. | Keep unchanged. |
| `docs/receipts/pr-47/vercel-preview-setup.png` | `KEEP_REFERENCE` | Historical PR receipt evidence, retained under `docs/receipts`. | Keep unchanged. |
| `tests/production/screenshots/**` | `KEEP_TEST_OR_GATE` | Referenced by production Playwright configs, specs, and source-truth receipts; issue #106 forbids deleting tests/gates. | Keep unchanged. |
| `tests/screenshots/**` | `KEEP_TEST_OR_GATE` | Referenced by `tests/e2e/mobile-visual-qa.spec.ts` and historical visual QA receipts. | Keep unchanged. |
| `public/*.png`, `public/dashboard/Dashboard.png`, `public/foldera-*.png` | `KEEP_PRODUCT_CODE` | Public assets are referenced by app code, metadata, OAuth, dashboard, or live pages. | Keep unchanged. |
| `public/crispcanvas-storyboard/**` | `NEEDS_HUMAN_REVIEW` | Public image assets are not referenced by current grep, but issue #106 forbids deleting possible live assets or ambiguous files. | Keep unchanged. |
| `content/blog/*.md` | `KEEP_PRODUCT_CODE` | Marketing content source files, not generated junk for this seam. | Keep unchanged. |
| `docs/archive/**` | `KEEP_REFERENCE` | Already archived historical docs; no broad archive sweep in this issue. | Keep unchanged. |
| `.playwright-cli/page-2026-03-16T22-05-07-431Z.yml` | `DELETE_STALE` | Generated browser snapshot from March; no active reference found. | Delete. |
| `.playwright-cli/page-2026-03-16T22-05-26-202Z.yml` | `DELETE_STALE` | Generated browser snapshot from March; no active reference found. | Delete. |
| `.playwright-cli/page-2026-03-16T22-05-58-035Z.png` | `DELETE_STALE` | Generated browser screenshot from March; no active reference found. | Delete. |
| `.playwright-cli/page-2026-03-16T22-06-46-902Z.yml` | `DELETE_STALE` | Generated browser snapshot from March; no active reference found. | Delete. |
| `.screenshots/visual-hierarchy-strike/home-after-1440.png` | `DELETE_STALE` | Old generated proof screenshot referenced only by `SESSION_HISTORY.md`; not a current proof gate. | Delete. |
| `.screenshots/visual-hierarchy-strike/home-after-390.png` | `DELETE_STALE` | Old generated proof screenshot referenced only by `SESSION_HISTORY.md`; not a current proof gate. | Delete. |
| `brand-verify-shots/blog.png` | `DELETE_STALE` | Old generated brand verification screenshot referenced only by `SESSION_HISTORY.md`. | Delete. |
| `brand-verify-shots/dashboard.png` | `DELETE_STALE` | Old generated brand verification screenshot referenced only by `SESSION_HISTORY.md`. | Delete. |
| `brand-verify-shots/home.png` | `DELETE_STALE` | Old generated brand verification screenshot referenced only by `SESSION_HISTORY.md`. | Delete. |
| `brand-verify-shots/login.png` | `DELETE_STALE` | Old generated brand verification screenshot referenced only by `SESSION_HISTORY.md`. | Delete. |
| `brand-verify-shots/settings.png` | `DELETE_STALE` | Old generated brand verification screenshot referenced only by `SESSION_HISTORY.md`. | Delete. |
| `docs/proofs/issue-62-homepage/landing-desktop.png` | `DELETE_STALE` | Superseded historical homepage proof image; no active reference found. | Delete. |
| `docs/proofs/issue-62-homepage/landing-mobile.png` | `DELETE_STALE` | Superseded historical homepage proof image; no active reference found. | Delete. |
| `docs/proofs/issue-new-home/desktop.png` | `DELETE_STALE` | Superseded historical homepage proof image; no active reference found. | Delete. |
| `docs/proofs/issue-new-home/mobile.png` | `DELETE_STALE` | Superseded historical homepage proof image; no active reference found. | Delete. |
| `docs/proofs/pr-37-homepage/landing-desktop.png` | `DELETE_STALE` | Superseded historical homepage proof image; no active reference found. | Delete. |
| `docs/proofs/pr-37-homepage/landing-mobile.png` | `DELETE_STALE` | Superseded historical homepage proof image; no active reference found. | Delete. |
| `screenshots/home-desktop-1440.png` | `DELETE_STALE` | Generated root screenshot; no active reference found. | Delete. |
| `screenshots/home-mobile-390.png` | `DELETE_STALE` | Generated root screenshot; no active reference found. | Delete. |
| `.screenshots/write-document-journey-1280.png` | `KEEP_TEST_OR_GATE` | `tests/e2e/authenticated-routes.spec.ts` writes to this exact path. | Keep unchanged. |

## Planned Actions

- Delete only files classified `DELETE_STALE`.
- Move no files; no `MOVE_TO_ARCHIVE` candidate was safe enough to move without creating archive churn.
- Update `.gitignore` for generated browser/screenshot junk: `.playwright-cli/`, `.screenshots/`, `brand-verify-shots/`, and `screenshots/`.
- Leave product behavior, tests, gates, live assets, backend, auth, Supabase, Stripe, Slack, scoring, and #99 untouched.

## Actions Taken

Deleted:

- `.playwright-cli/page-2026-03-16T22-05-07-431Z.yml`
- `.playwright-cli/page-2026-03-16T22-05-26-202Z.yml`
- `.playwright-cli/page-2026-03-16T22-05-58-035Z.png`
- `.playwright-cli/page-2026-03-16T22-06-46-902Z.yml`
- `.screenshots/visual-hierarchy-strike/home-after-1440.png`
- `.screenshots/visual-hierarchy-strike/home-after-390.png`
- `brand-verify-shots/blog.png`
- `brand-verify-shots/dashboard.png`
- `brand-verify-shots/home.png`
- `brand-verify-shots/login.png`
- `brand-verify-shots/settings.png`
- `docs/proofs/issue-62-homepage/landing-desktop.png`
- `docs/proofs/issue-62-homepage/landing-mobile.png`
- `docs/proofs/issue-new-home/desktop.png`
- `docs/proofs/issue-new-home/mobile.png`
- `docs/proofs/pr-37-homepage/landing-desktop.png`
- `docs/proofs/pr-37-homepage/landing-mobile.png`
- `screenshots/home-desktop-1440.png`
- `screenshots/home-mobile-390.png`

Moved:

- None.

Intentionally kept:

- All authority docs.
- `.foldera-contract.json`, because current gates and tests still inspect it.
- `docs/proofs/issue-102-artifact-classification.md`, because issue #106 requires issue #102 / PR #104 context.
- `docs/receipts/pr-47/**`, because those are historical receipt assets.
- `tests/production/screenshots/**` and `tests/screenshots/**`, because current Playwright specs write or rely on those locations.
- Public assets under `public/**`, including ambiguous `public/crispcanvas-storyboard/**`.

## Proof Attempted

- `git status --short`: completed and showed only the staged issue #106 hygiene set.
- `npm run gate:continuity`: blocked, `npm` is not installed in this shell.
- `npm run lint`: blocked, `npm` is not installed in this shell.
- `npm run build`: blocked, `npm` is not installed in this shell.

Exact npm blocker:

```text
npm : The term 'npm' is not recognized as the name of a cmdlet, function, script file, or operable program.
```

Remaining blocker:

- Required npm-based proof needs an npm-enabled environment or CI. No product behavior was changed.
