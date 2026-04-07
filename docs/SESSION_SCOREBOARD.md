# Session scoreboard — production truth + test baseline

**Problem this solves:** Without a scoreboard, every session starts from zero: a fix ships, someone says “done,” and nothing **persistent** proves the product moved—only code changed.

**Rule that ends the mud:** A pipeline/product fix is **done** when the **target scoreboard row(s) turn green** (or move the agreed direction) **and** the automated test baseline does not regress—not when the commit lands, not when the build passes, not when the model says “complete.”

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
