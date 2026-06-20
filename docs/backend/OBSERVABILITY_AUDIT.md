# Observability & Logging — Master Audit #445, Pass 11

> Status: written 2026-06-20. Forensic pass over the observability surface —
> structured logging, error reporting (Sentry), PII discipline in logs, durable
> receipts, and env-secret exposure. No paid calls. Verdict: **`PASS`** (two
> observations recorded; no leak, no code change required).

---

## TL;DR

Observability is sound and privacy-preserving. The structured logger
(`lib/utils/structured-logger.ts`) emits queryable JSON lines and **hashes the
userId** (`sha256`, 12 chars) so **no raw user identifier reaches the logs**. Sentry
is properly wired via the modern Next.js pattern (`instrumentation.ts` +
`instrumentation-client.ts`, DSN from env — not the deprecated `sentry.*.config`
files, which is why `ls sentry*.*` is empty). Durable truth lives in append-only
`tkg_actions` receipts (established in Passes 2/5), not just ephemeral logs. The
hot scoring path is **proven metadata-only** by dedicated egress tests. No `.env`
file with real secrets is git-tracked.

---

## Kill-question scorecard (Observability / SRE + Trust §9 PII rail)

| Kill-question | Verdict | Evidence |
|---|---|---|
| Can we see what happened — structured, queryable events? | **PASS** | `logStructuredEvent` → JSON `{timestamp, event, user_id_hash, artifact_type, generation_status, ...details}`; levels info/warn/error. |
| Is raw PII kept out of logs? | **PASS** | `hashUserId` (sha256/12) — never the raw id; egress tests prove the scoring hot path reads `tkg_signals` **metadata-only**, not raw body/content. |
| Are errors actually reported (not just console)? | **PASS** | Sentry initialized via `instrumentation.ts` + `instrumentation-client.ts`; `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY*` in env; `withSentryConfig` in `next.config.mjs`. |
| Durable receipt trail beyond logs? | **PASS** | Append-only `tkg_actions` receipts reconstruct before-state/verdict/response/after-state (Pass 2/5). `app/api/dev/ops-health` exposes a health read. |
| Any secrets committed to the repo? | **PASS** | `git ls-files` → only `.env.example` + `.env.local.example` (templates). All real env files (`.env.local`, `.env.production.truth`, `.env.vercel.production`, `.env.pr142.preview*`) are gitignored. |

---

## Observations (recorded, not blockers)

- **O-11.1 — `details` payloads are caller-sanitized, not logger-sanitized.**
  `logStructuredEvent` hashes the userId but does **not** recursively scrub the
  free-form `details` object (208 call sites). Discipline therefore relies on
  callers passing only safe metadata (ids, reasons, categories, counts) — which the
  spot-checked hot paths do (e.g. `daily-brief-send` logs `reasons`/`category`/
  `action_id`, never raw email/body), and the egress tests guard the scoring path.
  **No leak found.** A future hardening is a small redaction helper or an
  assertion-lint that flags raw `email`/`body`/`subject`/`content` keys in `details`.

- **O-11.2 — stale local env clutter (local-only).** Several
  `.env.pr142.preview*` / `.env.production.truth` files sit in the repo root. They
  are **gitignored (never committed)**, so this is pure local hygiene — the owner
  can `rm` them; nothing to fix in-repo.

---

## Proof

- `scorer-metadata-egress.test.ts` + `cross-source-life-context-egress.test.ts` →
  **2 passed** (hot path stays metadata-only; no raw life-context egress).
- `structured-logger.ts` read: userId hashed; no raw-id field emitted.
- Sentry init files present; `git ls-files | grep .env` → only the two templates.
- No code change in this pass.
