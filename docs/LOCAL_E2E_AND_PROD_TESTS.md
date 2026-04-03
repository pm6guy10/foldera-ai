# Local E2E vs production Playwright — harness contract

## Problem

`tests/production/smoke.spec.ts` (and related specs) use **`storageState`** aimed at **`https://www.foldera.ai`** (see `playwright.prod.config.ts`). They assert authenticated dashboard, `/api/conviction/latest`, Generate Now, etc. **against production**.

Root **`playwright.config.ts`** sets **`testIgnore`** for **`tests/production/**`** and **`tests/audit/**`**. Prefer **`npm run test:local:e2e`** (alias of `playwright test`) so the harness is explicit. Do not expect localhost cookies to satisfy production-smoke assertions; sessions on `localhost:3000` are unrelated to production JWT cookies.

This mismatch produced many duplicate **NEEDS_REVIEW** lines in [FOLDERA_MASTER_AUDIT.md](../FOLDERA_MASTER_AUDIT.md) (same root cause).

## Canonical commands

| Goal | Command | Notes |
|------|---------|--------|
| **Merge-blocking local gate (no prod, mocked APIs)** | `npm run test:ci:e2e` | `playwright.ci.config.ts` — `public-routes`, `authenticated-routes`, `flow-routes` only |
| **Full local app E2E (real server, broader)** | `npm run build` then **`npm run test:local:e2e`** or `npx playwright test tests/e2e/` | Root `playwright.config.ts` ignores `tests/production/**` and `tests/audit/**`. If `:3000` busy: `PLAYWRIGHT_WEB_PORT=3011` and match `NEXTAUTH_URL` to `http://127.0.0.1:3011` |
| **Production / real auth** | `npm run test:prod` | Requires fresh `tests/production/auth-state.json` — `npm run test:prod:setup` |
| **Weekly audit artifact** | `npm run test:audit` | Production crawl + report; CI: `.github/workflows/weekly-audit.yml` |

## Do not

- Do **not** treat failing **local** omnibus runs that include **`tests/production/smoke.spec.ts`** without production storage state as regressions in dashboard code.
- Do **not** commit `tests/production/auth-state.json` (gitignored); refresh before expiry (~30 days).

## Owner

**AZ-01** in [AUTOMATION_BACKLOG.md](../AUTOMATION_BACKLOG.md). Linked from [docs/AZ_AUDIT_2026-04.md](./AZ_AUDIT_2026-04.md).
