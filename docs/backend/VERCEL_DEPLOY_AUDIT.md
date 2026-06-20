# Vercel Deploy & Configuration — Master Audit #445, Pass 9

> Status: written 2026-06-20. Forensic pass over the deploy surface — `vercel.json`,
> `next.config.mjs`, cron/runtime config, security headers, redirects, caching. No
> paid calls. Verdict: **`PASS`** (config is healthy; three observations recorded,
> one routed to a guarded cleanup task).

---

## TL;DR

The Vercel/Next deploy config is well-formed and defense-conscious: a strict
**Content-Security-Policy** plus `X-Frame-Options: DENY`, `nosniff`, a sane
`Referrer-Policy`, and `frame-ancestors 'none'` / `object-src 'none'` ship on every
route (`vercel.json`); the single scheduled cron (`morning-pipeline`, 11:00 UTC)
and all four pipeline routes declare explicit `maxDuration`; redirects collapse the
marketing aliases (`/try`, `/signup`, `/request-access`) to `/start`; HTML and
session-JSON caching headers are correct; Sentry is wired via `withSentryConfig`.
Header definitions are cleanly **split, not duplicated** — security headers live in
`vercel.json`, cache/robots headers in `next.config.mjs`.

---

## What's verified healthy

| Area | Finding |
|---|---|
| Security headers | CSP (default-src 'self', `frame-ancestors 'none'`, `object-src 'none'`, `upgrade-insecure-requests`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-XSS-Protection`. Applied to `/(.*)`. |
| Cron | One scheduled cron (`/api/cron/morning-pipeline` `0 11 * * *`) — matches the documented single-cron design; it sequentially invokes nightly-ops → daily-brief → daily-maintenance. |
| Function duration | `maxDuration` set everywhere: morning-pipeline 300, daily-brief 300, nightly-ops 60, daily-maintenance 60. `dynamic = 'force-dynamic'` on the orchestrator. |
| Redirects | `/try`, `/try/:path*`, `/signup`, `/request-access` → `/start`; `/api/try/analyze` → `/status`. Marketing aliases boundary-redirect cleanly (e2e-asserted). |
| Caching | `/` and `/pricing`: `public, max-age=0, must-revalidate` (fresh shell after deploy); `/api/integrations/*`: `private, max-age=20, swr=40`; `/try/*`: `X-Robots-Tag: noindex`. |
| Header layering | Security (vercel.json) vs cache/robots (next.config) — complementary, **no conflict/duplication**. |
| Observability hook | `withSentryConfig` present (detail → Pass 11). |

---

## Observations (recorded)

- **O-9.1 — legacy `/try` page + API shadowed by redirects.** `app/try/page.tsx`
  (the old "analyze" page) and `app/api/try/analyze/route.ts` are both unreachable
  via HTTP because `next.config.mjs` redirects `/try*` → `/start` and
  `/api/try/analyze` → `/status`. They are not cleanly deletable in this pass: the
  nav links (`LandingPage`, `NavPublic`, `BlogFooter`) and several e2e/visual tests
  (`public-routes.spec.ts`, `mobile-visual-qa.spec.ts`, `public-screenshots.spec.ts`)
  intentionally exercise the `/try → /start` boundary, and the analyze route still
  has a budget-governor unit test. **Routed to a guarded cleanup task** (delete the
  shadowed page/API with the e2e suite as the regression guard) rather than removed
  blind here.

- **O-9.2 — CSP allows `'unsafe-inline'` and `'unsafe-eval'` in `script-src`.**
  This is the common Next.js tradeoff (framework inline bootstrap + some libs). It
  is not a blocker, but the hardening path is nonce/`strict-dynamic`-based CSP if a
  future pass wants to tighten it. Recorded, not changed.

- **O-9.3 — `maxDuration = 300` assumes a Pro plan.** 300s exceeds the Hobby-tier
  60s function ceiling; if the project is on Hobby, Vercel caps it. The value is
  correct for Pro and harmless if capped (the pipeline stages also carry their own
  60s/300s budgets). **Owner-side dashboard fact to confirm** — not code-fixable.

---

## Proof

- `vercel.json` + `next.config.mjs` read end-to-end; cron `maxDuration` confirmed on
  all four pipeline routes.
- Header layering checked: zero security-header duplication between the two files.
- No code change in this pass (config is healthy; `/try` cleanup deferred to a
  guarded task).
