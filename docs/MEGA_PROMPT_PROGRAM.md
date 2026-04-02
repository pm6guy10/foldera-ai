# MEGA_PROMPT_PROGRAM — Sequenced execution

**North star:** Gate 4 live receipt (real `send_message` Approve with mailbox connected + `execution_result.sent_via` logged) and green `npm run test:prod` after deploys. See [REVENUE_PROOF.md](../REVENUE_PROOF.md) and [FOLDERA_PRODUCT_SPEC.md](../FOLDERA_PRODUCT_SPEC.md) § 1.1.

**Operator index (dashboards, no-email debug, Gate 4):** [MASTER_PUNCHLIST.md](./MASTER_PUNCHLIST.md).

**Rules:** One Cursor session = one row below. Follow [AGENTS.md](../AGENTS.md) (single task, commit only task files, `SESSION_HISTORY.md` + push). Do not `git add -A` unrelated screenshots or audit artifacts.

---

## Phase 0.5 — Local auth + brain hammer (for mega prompt)

Insert **after** mega prompt Phase 0, **before** Phase 1 baseline.

If `tests/local/` does not exist or is missing documented scripts (`README.md`, `setup-auth-localhost.ts`, `run-brain-receipt.ts`), **create or restore in that session** before any brain-quality work:

1. Add [tests/local/README.md](../tests/local/README.md) documenting: `.env.local` requirements, `ALLOW_DEV_ROUTES=true`, `npm run test:local:setup` (Playwright writes gitignored `auth-state-owner.json`), `LOCAL_BASE_URL` for non-default ports, and `npm run test:local:brain-receipt`.
2. Add `tests/local/setup-auth-localhost.ts` — sign in at `/login`, wait for `/dashboard`, write storage state to `tests/local/auth-state-owner.json`.
3. Add `tests/local/run-brain-receipt.ts` — load storage state, `POST` `/api/dev/brain-receipt`, print JSON (optional `--screenshot`).
4. Wire [package.json](../package.json): `test:local:setup`, `test:local:brain-receipt`.
5. Ensure `.gitignore` ignores `tests/local/auth-state-owner.json`.

If `tests/local/` **already exists** (this repo does), skip creation; run `npm run test:local:setup` to refresh cookies when brain-receipt returns 401.

**Do not** rely on hand-pasted `next-auth.session-token` in `curl` unless scripts are blocked; prefer Playwright-written storage state.

---

## Session queue

| Session | Goal | Primary evidence | Spec / mega anchor |
|--------|------|------------------|-------------------|
| **S0** | Add this file + link from mega prompt / AGENTS if desired | File on `main` | Meta |
| **S1** | Baseline — `npm run build`, `npx vitest run`, `npx playwright test tests/e2e/`, `npm run test:prod` if `tests/production/auth-state.json` valid | Counts in **Baseline record** below | Mega Phase 1 |
| **S2** | Local brain — `ALLOW_DEV_ROUTES=true` + `npm run test:local:brain-receipt` after `test:local:setup` if needed | JSON + quality note in **S2 record** below | Mega Phase 2 |
| **S3** | Brain fix (only if S2 fails product bar) — one change in `generator.ts` / `scorer.ts` / `context-builder.ts` + tests | Before/after brain-receipt; vitest green | Mega 2C |
| **S4** | Gate 4 operator receipt — approve one real `send_message`; log ids in REVENUE_PROOF | **S4 operator checklist** below | [REVENUE_PROOF.md](../REVENUE_PROOF.md) |
| **S5** | Public UX — `/`, `/login`, `/start`, `/pricing`, `/blog`, legal, `/try` | E2E public specs + manual pass | Mega Phase 3 |
| **S6** | App UX — `/dashboard`, `/dashboard/settings`, `/onboard` | `tests/e2e/` + mobile | Mega Phase 3 |
| **S7** | Pipeline trace — nightly-ops → daily-brief → health-check → approve; fix only dead ends / silent catches | Short note in spec or here | Mega Phase 4 |
| **S8** | Test hygiene vs S1 baseline + tests for S5–S6 bugs | Counts ≥ S1 | Mega Phase 5 |
| **S9** | Doc sync — FOLDERA_PRODUCT_SPEC, AUTOMATION_BACKLOG, SESSION_HISTORY, FOLDERA_MASTER_AUDIT (touched rows only) | Dated lines | Mega Phase 6 |

---

## Baseline record (S1)

_Update after each S1 run. Do not delete prior rows; append dated entry._

| Date (UTC) | build | vitest (pass/fail) | playwright tests/e2e | test:prod | Notes |
|------------|-------|---------------------|----------------------|-----------|-------|
| 2026-04-02 | pass | 596 passed | 67 passed, 4 skipped | 60 passed, 1 flaky (`audit` /blog crawl) | E2E: `$env:CI='true'; $env:PLAYWRIGHT_WEB_PORT='3011'` after clean `npm run build` (avoids :3000 conflict + stale `.next`). Default port 3000 unchanged when env unset. Auth cookie: `lib/auth/auth-options.ts` skips `.foldera.ai` session cookie domain unless `VERCEL` — fixes local `next start` + Playwright on 127.0.0.1 when `NEXTAUTH_URL` is public https. |

**Windows:** Use PowerShell equivalents for `tail`/`tee` if needed. Vitest: add `--exclude ".claude/worktrees/**"` if worktree tests pollute.

**Alternate port:** If `EADDRINUSE` on 3000, run `Remove-Item -Recurse -Force .next; npm run build` then Playwright with `$env:PLAYWRIGHT_WEB_PORT='3011'` (and `$env:CI='true'` for a fresh `next start`).

---

## S2 record — Local brain quality

_Quality bar (from REVENUE_PROOF):_ artifact names a real person, references actual thread, non-obvious cross-signal where applicable, concrete proposal; user could Approve and outside world changes.

| Date (UTC) | exit code | winner summary | artifact type | Pass/Fail vs bar | Notes |
|------------|-----------|----------------|---------------|------------------|-------|
| 2026-04-02 | 1 (skipped) | — | — | — | **Plan execution:** `auth-state-owner.json` absent (interactive `npm run test:local:setup` requires headful owner login). With dev + `ALLOW_DEV_ROUTES=true`, run setup then `npm run test:local:brain-receipt`; append row with exit 0 + JSON when done. S3 only if S2 fails quality bar. |

---

## S4 operator checklist (Brandon — cannot be automated)

1. Production: mailbox connected (Google or Microsoft).
2. Open daily brief or dashboard; Approve a real **`send_message`** directive (not a dry run).
3. In Supabase or logs: confirm `tkg_actions.status` = `executed` and `execution_result.sent_via` is `gmail` or `outlook` (or `resend` if fallback).
4. Fill [REVENUE_PROOF.md](../REVENUE_PROOF.md) **Gate 4 live receipt** table: `tkg_actions.id`, date, `sent_via`.

**Program S4 status:** _2026-04-02: First Gate 4 table row filled from production DB (historical Resend). Second row + explicit `sent_via` still operator-pending._

---

## Cursor paste template

```text
PROGRAM SESSION Sx from docs/MEGA_PROMPT_PROGRAM.md.
Single outcome: [one line from session queue table].
Read FOLDERA_PRODUCT_SPEC.md section [x.x] and REVENUE_PROOF.md if relevant.
Follow AGENTS.md: one task, commit only changed task files, SESSION_HISTORY + push.
Verification: [npm run build / npx vitest run / npx playwright test tests/e2e/ / npm run test:prod as listed].
```

---

## Operator checklist (ongoing)

- [ ] Gate 4 live receipt in REVENUE_PROOF (S4)
- [ ] Stripe checkout + webhook row proof when testing billing
- [ ] `npm run test:prod:setup` when `tests/production/auth-state.json` missing or Playwright auth suites skip
- [ ] `npm run test:local:setup` when local brain-receipt returns 401

---

## Related docs

- [CLAUDE.md](../CLAUDE.md) — gates, env, prod E2E
- [AGENTS.md](../AGENTS.md) — modes, session log, push rules
- [AUTOMATION_BACKLOG.md](../AUTOMATION_BACKLOG.md) — operator-only GTM items
