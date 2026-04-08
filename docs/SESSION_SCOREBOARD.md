# Session scoreboard — production truth + test baseline

**Problem this solves:** Without a scoreboard, every session starts from zero: a fix ships, someone says “done,” and nothing **persistent** proves the product moved—only code changed.

**Rule that ends the mud:** A pipeline/product fix is **done** when the **target scoreboard row(s) turn green** (or move the agreed direction) **and** the automated test baseline does not regress—not when the commit lands, not when the build passes, not when the model says “complete.”

---

## Piece 0 — Pipeline truth (`pipeline_runs`)

**Start every session** with a single read of recent pipeline activity (cron heartbeats, per-user scorer funnel, API spend snapshot, Resend delivery):

```bash
npm run scoreboard
```

Requires `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Applies migration `supabase/migrations/20260407120000_pipeline_runs.sql` in production before expecting rows.

**CI:** `.github/workflows/pipeline-cron-heartbeat.yml` runs `npm run check:pipeline-heartbeat` after the daily-brief window to detect missing `daily_brief` `cron_complete` rows.

---

## Piece 1 — Live scoreboard (fill from production)

Run **before** coding and **again** before declaring victory. Use the owner account or set `AUDIT_USER_ID` for another user. Timestamps are UTC unless noted.

**Quick ingest + cursors (script):**

```bash
npm run audit:supabase:sync-fix
```

Requires `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Optional: `AUDIT_USER_ID=<uuid>`.

**Template table (copy into session notes / chat):**

| Check | Right now (fill) | Pass condition |
|-------|------------------|----------------|
| Gmail data fresh | `max(occurred_at)` gmail mail-shaped | Within **25h** of session time |
| Outlook data fresh | `max(occurred_at)` outlook mail-shaped | Within **25h** of session time |
| Cursors current | `user_tokens.last_synced_at` google + microsoft | Reasonably aligned with “today” / not stuck weeks back while mail is flowing |
| Actions 24h | total vs distinct “shape” | Duplicate rate **< 20%** (see SQL below) |
| Top repeated directive | max copies of one hash in window | **No hash > 2 copies** in lookback (tune window with operator) |
| Pending approval | count `pending_approval` | **≥ 1** when product expects a surfaced directive (if zero is intentional, note it) |
| Generation failures | rows with failed generation sentinel | **Zero** rows with `__GENERATION_FAILED__` in stored directive / JSON (see SQL) |

**Green** on ingest + cursors usually means mail plumbing is honest; **red** on actions / duplicates / pending / failures means scoring, generation, or UX loop—pick **one** red row per session.

### Piece 1 snapshot — 2026-04-08 session (baseline before loop-window change)

Filled from production (`user_id` owner `e40b7cd8-4925-42f7-bc99-5022969f1d22`) + `npm run health` + `npm run scoreboard` + Supabase SQL. Timestamps UTC.

| Check | Right now (fill) | Pass condition | Pass? |
|-------|------------------|----------------|-------|
| Gmail data fresh | `2026-04-08 17:06:22+00` max `occurred_at` (mail-shaped) | Within **25h** of session | Yes |
| Outlook data fresh | `2026-04-08 17:15:59+00` | Within **25h** | Yes |
| Cursors current | Google `last_synced_at` `2026-04-08 17:16:54+00`; Microsoft `2026-04-08 17:16:58+00` | Aligned with “today” | Yes |
| Actions 24h | total **11**, distinct hash ≈ **6** → duplicate rate ≈ **45%** | Duplicate rate **< 20%** | **No** |
| Top repeated directive | max **174** copies / one shape (**30d**) | **≤ 2** copies / hash (operator tune) | **No** |
| Pending approval | **1** | **≥ 1** when expecting surfaced directive | Yes |
| Generation failures | **193** rows (7d) with `__GENERATION_FAILED__` in directive or `execution_result` | **Zero** in window | **No** |

**`npm run health` (2026-04-08 11:17 PT):** 0 FAILING; ⚠ repeated directive (max 6 / shape / 24h); ⚠ last generation `do_nothing`.

**`npm run scoreboard`:** latest `daily_brief` `cron_complete` outcome `partial_or_failed`; `nightly_ops` `degraded`.

**AZ-05 `action_type` (all users):** **14d:** `do_nothing` 604, `write_document` 59, `send_message` 51, `research` 5. **7d:** `do_nothing` 276, `write_document` 44, `send_message` 26, `research` 5.

**Pick this session:** **Top repeated directive / duplicate shape** → widen normalized loop window (`GENERATION_LOOP_DETECTION_WINDOW` + `daily-brief-generate` fetch limit) so interleaved rows still trip `GENERATION_LOOP_DETECTED`.

### Piece 1 end — 2026-04-08 post-deploy (`3996bbd` / `dpl_GjJhuzoo8R7MvgD3JAZ7pU2Fsw6g`)

Re-ran immediately after Vercel **READY** + `GET /api/health` `revision.git_sha_short=3996bbd`. **Victory (target row):** not yet — max repeated shape **30d** still **174** copies (historical rows unchanged until new generations roll). **AZ-05:** 14d unchanged vs baseline (`do_nothing` 604, …); **7d** `do_nothing` **269** (was **276** at baseline — within rolling-window noise, not claimed as product win).

| Check | End state | Notes |
|-------|-----------|--------|
| `npm run health` (11:30 PT) | 0 FAILING | Same ⚠ as baseline |
| `npm run scoreboard` | unchanged rows | Still `partial_or_failed` / `degraded` |
| `npm run test:prod` | **61 passed** | No regression |
| Top repeated hash (30d, owner) | **174** | Same as baseline — monitor after next `daily-generate` cycles |

---

## Piece 2 — Automated test baseline (repo truth)

**Start of session (before edits):**

1. Run the **same suite you will run at the end** (do not change the command between start and end).
2. Minimum for merge safety (see `CLAUDE.md`): `npm run lint`, `npm run build`, `npx vitest run --exclude ".claude/worktrees/**"`, `npm run test:ci:e2e` (use `PLAYWRIGHT_WEB_PORT` if `:3000` is busy).
3. When `tests/production/auth-state.json` is fresh: `npm run test:prod` against **www.foldera.ai**.

Record pass/fail counts or save the log snippet.

**End of session:**

1. Re-run the **scoreboard** (table above) and compare to start.
2. Re-run the **same** test command(s). Any test that **passed** at start and **fails** at end = session failed; fix or revert before push.

**Victory:** Target scoreboard row(s) moved to pass **and** tests ≥ baseline (no new failures).

---

## Piece 3 — The ritual (every session)

1. **Start:** Fill the scoreboard + record test baseline (~minutes, not hours). Stop arguing from memory—paste the table with real values.
2. **Pick one red row** (highest impact). Do not try to turn the whole board green in one session unless the task explicitly says so.
3. **End:** Scoreboard again + same tests. If the chosen row did not move, the session did not finish—regardless of narrative.

---

## SQL helpers (Supabase SQL editor; replace `:user_id`)

**Newest mail `occurred_at` by source (mail-shaped):**

```sql
SELECT source, max(occurred_at) AS newest_occurred
FROM tkg_signals
WHERE user_id = :user_id
  AND source IN ('gmail', 'outlook')
  AND type IN ('email_received', 'email_sent')
GROUP BY source;
```

**Actions last 24h — total vs rough distinct (directive body prefix hash):**

```sql
SELECT
  count(*) AS total_24h,
  count(DISTINCT md5(left(coalesce(directive_text, ''), 200))) AS distinct_approx
FROM tkg_actions
WHERE user_id = :user_id
  AND generated_at > now() - interval '24 hours';
```

Duplicate rate ≈ `1 - (distinct_approx / nullif(total_24h, 0))`. Tune hash width if needed.

**Top repeated directive shapes (e.g. last 30d):**

```sql
SELECT md5(left(coalesce(directive_text, ''), 400)) AS h,
       count(*) AS copies,
       min(generated_at) AS first_at,
       max(generated_at) AS last_at
FROM tkg_actions
WHERE user_id = :user_id
  AND generated_at > now() - interval '30 days'
GROUP BY 1
ORDER BY copies DESC
LIMIT 10;
```

**Pending approval:**

```sql
SELECT count(*) AS pending
FROM tkg_actions
WHERE user_id = :user_id
  AND status = 'pending_approval';
```

**Generation sentinel (adjust if you store failure only in `execution_result` JSON):**

```sql
SELECT id, generated_at, status, left(directive_text, 80) AS snippet
FROM tkg_actions
WHERE user_id = :user_id
  AND (
    directive_text ILIKE '%__GENERATION_FAILED__%'
    OR execution_result::text ILIKE '%__GENERATION_FAILED__%'
  )
ORDER BY generated_at DESC
LIMIT 20;
```

---

## Related docs

- Mail path checklist: [`docs/ops/sync-mail-sql-audit.sql`](ops/sync-mail-sql-audit.sql)
- Prod vs local Playwright: [`LOCAL_E2E_AND_PROD_TESTS.md`](LOCAL_E2E_AND_PROD_TESTS.md)
