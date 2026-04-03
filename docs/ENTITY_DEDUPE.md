# Entity duplicate audit and cleanup

**Maps to:** `AUTOMATION_BACKLOG` AZ-15.

Duplicates (e.g. same person under slightly different names) usually come from extraction producing different `name` / `display_name` strings while `findExistingEntityMatches` in [`lib/signals/signal-processor.ts`](../lib/signals/signal-processor.ts) does exact `ilike` on the full normalized name. Merging rows is **destructive** — always backup or run on a branch DB first.

## Read-only audit (Supabase SQL)

**Same email, multiple entities** (`emails` is a `text[]`):

```sql
SELECT user_id, em AS email, COUNT(*) AS cnt, array_agg(id) AS entity_ids
FROM tkg_entities,
     LATERAL unnest(emails) AS em
WHERE name <> 'self'
GROUP BY 1, 2
HAVING COUNT(*) > 1;
```

**Similar display names (manual review):**

```sql
SELECT user_id, display_name, name, id, total_interactions, primary_email
FROM tkg_entities
WHERE name <> 'self'
ORDER BY user_id, lower(display_name);
```

## Cleanup (operator-only)

- Prefer **merging** into the row with higher `total_interactions`, re-pointing foreign keys (`tkg_commitments`, signal `extracted_entities`, etc.), then deleting the duplicate row.
- Do not run bulk deletes without tracing FK references.
- After cleanup, re-run nightly-ops or a small signal batch to confirm scorer behavior.

## Prevention

Email-based match in `upsertEntity` already dedupes when the same `person.email` appears. Name-only aliases remain a known limitation; future work could add cautious fuzzy matching (high false-positive risk for common first names).
