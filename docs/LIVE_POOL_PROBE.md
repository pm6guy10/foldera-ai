# LIVE POOL PROBE — paste-and-run (no schema rediscovery)

**Purpose:** End the per-session ritual of re-guessing column names and re-deriving
the candidate pool. Every verdict-calibration session needs the same three answers:
*what's the last cron outcome, what's blocking it, and what are the top live
candidates.* This file is the canned, schema-correct way to get them in one shot via
the Supabase MCP (`mcp__Supabase__execute_sql`).

- **Project ID:** `neydszeamsflpghtrhue`
- **Owner account (`OWNER_USER_ID`):** `2cbc1bab-8e0e-43b0-bf4a-9a0cd6b5d91f`
  (canonical post-#509 consolidation; defined in `lib/auth/constants.ts`)

> The SessionStart hook **cannot** run these (no Supabase creds in the agent sandbox).
> They run through the Supabase MCP, which the agent has. Paste them directly.

---

## Schema gotchas (the columns we kept getting wrong)

**`tkg_commitments`** — active work/promise pool
- category column is **`category`** (NOT `commitment_type`)
- no `entity_id`, no `title` — parties are **`promisor_id`** / **`promisee_id`** (uuid),
  description is **`description`**
- suppression: **`suppressed_at`** (timestamptz, NULL = live) + **`suppressed_reason`** (text)
- dates: **`due_at`**, **`implied_due_at`**, **`made_at`**; status: **`status`** (`active`/`fulfilled`/…)
- **`thread_id`** is frequently NULL — do not assume a join to signals works

**`tkg_signals`** — raw inbound (email/calendar/drive)
- **no `metadata` column.** Body is **`content`** and it is **ENCRYPTED** — do not try to read it.
  Use **`author`**, **`recipients`** (array), **`type`**, **`source`**, **`occurred_at`**,
  **`processed`** (bool), **`extracted_commitments`** (array), **`extracted_entities`** (array)
- type is **`type`** (NOT `signal_type`); e.g. `email_received`, `calendar_event`, `file_modified`

**`pipeline_runs`** — per-cron funnel trace
- **`outcome`** (text), **`blocked_gate`** (text), **`gate_funnel`** (jsonb), **`winner_action_type`**,
  **`winner_confidence`**, **`candidates_evaluated`**, **`created_at`**
- **no `winner_trace`, no `artifact_type`** columns
- `gate_funnel` jsonb holds `filter_stages[]`, `stakes_killed[]`, `discrepancy_candidates_preview[]`

**`tkg_entities`** — `name`, `primary_email`, `emails` (array), `trust_class`,
`last_interaction`, `total_interactions` (NOT `email`, `last_contact_at`, `contact_count`)

**`tkg_goals`** — goal text is **`goal_text`** (NOT `text`); `priority`, `category`

---

## Probe 1 — last 3 cron runs + what blocked them

```sql
SELECT created_at, outcome, blocked_gate, winner_action_type, candidates_evaluated,
       gate_funnel->'discrepancy_candidates_preview' AS top_candidates
FROM pipeline_runs
WHERE user_id = '2cbc1bab-8e0e-43b0-bf4a-9a0cd6b5d91f'
ORDER BY created_at DESC
LIMIT 3;
```

## Probe 2 — the LIVE candidate pool (post-suppression, what could actually win)

```sql
SELECT id, description, category, risk_score, status, due_at, implied_due_at, trust_class, created_at
FROM tkg_commitments
WHERE user_id = '2cbc1bab-8e0e-43b0-bf4a-9a0cd6b5d91f'
  AND status = 'active'
  AND suppressed_at IS NULL
  AND risk_score >= 30
ORDER BY risk_score DESC NULLS LAST, created_at DESC
LIMIT 20;
```

## Probe 3 — pool health one-liner (is silence honest or is a gate broken?)

```sql
SELECT
  COUNT(*) FILTER (WHERE status='active' AND suppressed_at IS NULL)                                    AS active_unsuppressed,
  COUNT(*) FILTER (WHERE status='active' AND suppressed_at IS NULL AND trust_class='trusted')          AS trusted,
  COUNT(*) FILTER (WHERE status='active' AND suppressed_at IS NULL AND risk_score>=50)                 AS high_risk,
  COUNT(*) FILTER (WHERE status='active' AND suppressed_at IS NULL
                   AND updated_at >= NOW() - INTERVAL '14 days')                                        AS fresh_14d,
  COUNT(*) FILTER (WHERE suppressed_at IS NOT NULL)                                                     AS suppressed_total
FROM tkg_commitments
WHERE user_id = '2cbc1bab-8e0e-43b0-bf4a-9a0cd6b5d91f';
```

## Probe 4 — recent inbound senders (is fresh PROFESSIONAL signal arriving?)

```sql
SELECT type, source, author, occurred_at, processed
FROM tkg_signals
WHERE user_id = '2cbc1bab-8e0e-43b0-bf4a-9a0cd6b5d91f'
  AND type = 'email_received'
  AND occurred_at >= NOW() - INTERVAL '3 days'
ORDER BY occurred_at DESC
LIMIT 25;
```
(`author` is plaintext even though `content` is encrypted — judge professional vs.
marketing/gig from the sender domain.)

---

## Manual suppression (authorized last-resort — proven 2026-06-23)

Owner-confirmed zombie/garbage commitments may be suppressed directly. This is NOT a
billing/auth/auto-send rail, so it does not need re-authorization each time — but only
suppress what the **owner has confirmed** is stale/unrecognized/done.

```sql
UPDATE tkg_commitments
SET suppressed_at = NOW(),
    suppressed_reason = 'user_confirmed_<stale|unrecognized|fulfilled>: <one-line why>'
WHERE user_id = '2cbc1bab-8e0e-43b0-bf4a-9a0cd6b5d91f'
  AND id IN ('<uuid>', '<uuid>');
```

## Doctrine reminder (so the next session doesn't panic-loosen a gate)

- **SAFE_SILENCE is a valid SUCCESS** when the pool genuinely has no high-quality
  candidate. Run Probe 3: if `fresh_14d` is low and `trusted`/`high_risk` are weak,
  silence is correct — do NOT loosen a gate to force a card.
- The recurring root cause is **zombie commitments with no expiry** (issue #537), not
  the gates. Fix structurally there; don't re-diagnose from scratch.
