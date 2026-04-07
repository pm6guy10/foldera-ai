# Baseline sample — `tkg_actions` (owner)

1. **Export date:** 2026-04-07 (session export).
2. **User:** `e40b7cd8-4925-42f7-bc99-5022969f1d22` (owner).
3. **Query:** 10 most recent rows by **`generated_at` DESC** (table uses `generated_at`, not `created_at`).
4. **Artifact body path:** `execution_result.artifact.body` if present, else `execution_result.artifact.content` (first 500 characters of whichever is non-null).
5. **Purpose:** Baseline **before** generator prompt work — any rewrite should beat this on a repeatable rubric ([rubric.md](./rubric.md)).

## SQL (replay)

```sql
SELECT id, generated_at, status, action_type, directive_text,
  LEFT(COALESCE(execution_result->'artifact'->>'body', execution_result->'artifact'->>'content', ''), 500) AS artifact_body_500,
  execution_result->>'anomaly_identification' AS anomaly_identification,
  LENGTH(COALESCE(directive_text, '')) AS directive_text_len,
  LENGTH(COALESCE(execution_result->'artifact'->>'body', execution_result->'artifact'->>'content', '')) AS artifact_full_len
FROM tkg_actions
WHERE user_id = 'e40b7cd8-4925-42f7-bc99-5022969f1d22'::uuid
ORDER BY generated_at DESC
LIMIT 10;
```

## Rows (newest first)

### 1. `af7072f3-ccdc-4f40-b582-e3debc26ab60`

- **generated_at:** 2026-04-07 12:06:52.34+00
- **status:** pending_approval
- **action_type:** send_message
- **directive_text_len:** 110
- **directive_text:** Send a decision request that secures one accountable owner and a committed answer by 5:00 PM PT on 2026-03-27.
- **artifact_full_len:** 195
- **artifact body (first 500 chars):**

```
Can you confirm the decision and name one accountable owner by 5:00 PM PT on 2026-03-27.?

Consequence: if unresolved by 5:00 PM PT on 2026-03-27, timeline slips and dependent work stays blocked.
```

- **anomaly_identification:** *(null)*

### 2. `a4917bb6-aa50-4690-9fb8-dceac9fe2eaa`

- **generated_at:** 2026-04-07 12:06:25.686+00
- **status:** skipped
- **action_type:** do_nothing
- **directive_text_len:** 133
- **directive_text:** Brandon Kapp has 5 interactions with the Department of Veterans Affairs; last contact was April 10, 2026 — three days ahead of today.
- **artifact_full_len:** 0
- **artifact body (first 500 chars):** *(empty)*
- **anomaly_identification:** Brandon Kapp has 5 interactions with the Department of Veterans Affairs but his last contact was April 10, 2026 - three days in the future from today's date of April 7, 2026.

### 3. `d3890745-a3d8-4d50-97f9-bf98fffc3827`

- **generated_at:** 2026-04-07 02:29:41.849+00
- **status:** skipped
- **action_type:** do_nothing
- **directive_text_len:** 247
- **directive_text:** All 2 candidates blocked: "deadline appears across 4 contacts: nicole vreeland, michael, aya healthcare" → locked_contact_in_artifact:Nicole Vreeland | "6 inbound emails from same sender in 30 days — zero replies synced" → duplicate_100pct_similar
- **artifact_full_len:** 0
- **artifact body:** *(empty)*
- **anomaly_identification:** *(null)*

### 4. `fe66c2b4-c66a-4445-9d9c-acc6011595f7`

- **generated_at:** 2026-04-07 02:29:40.567+00
- **status:** skipped
- **action_type:** send_message
- **directive_text / artifact:** Same directive_text_len (110), artifact_full_len (195), and artifact body text as row **1**.
- **anomaly_identification:** *(null)*

### 5. `346e3849-efba-459f-b61d-bef544ab0544`

- **generated_at:** 2026-04-07 02:27:23.81+00
- **status:** skipped
- **action_type:** do_nothing
- **directive_text_len:** 373
- **directive_text:** All 2 candidates blocked: "deadline appears across 4 contacts: nicole vreeland, michael, aya healthcare" → llm_failed:Generation validation failed: discrepancy_finished_work:triage_or_chore_list — produce copy-paste-ready replies or one finished document; no chore checklists | "6 inbound emails from same sender in 30 days — zero replies synced" → duplicate_100pct_similar
- **artifact_full_len:** 0
- **artifact body:** *(empty)*
- **anomaly_identification:** *(null)*

### 6. `7c3a1c8b-4d31-43bf-b27a-e31713faebb4`

- **generated_at:** 2026-04-07 02:27:03.4+00
- **status:** skipped
- **action_type:** send_message
- **directive_text / artifact:** Same as row **1** (110 / 195 / same body).
- **anomaly_identification:** *(null)*

### 7. `b54bf607-d888-4280-b033-a4a03c17e154`

- **generated_at:** 2026-04-07 02:21:59.361+00
- **status:** skipped
- **action_type:** do_nothing
- **directive_text:** Same as row **3** (247 chars).
- **artifact:** *(empty)*
- **anomaly_identification:** *(null)*

### 8. `6651117a-465c-4e58-8d56-31c36f6998d5`

- **generated_at:** 2026-04-07 02:21:48.748+00
- **status:** skipped
- **action_type:** send_message
- **directive_text / artifact:** Same as row **1**.
- **anomaly_identification:** *(null)*

### 9. `a6e6f003-a410-4a1a-afa9-52e05cc6df64`

- **generated_at:** 2026-04-07 02:19:22.531+00
- **status:** skipped
- **action_type:** do_nothing
- **directive_text_len:** 205
- **directive_text:** All 2 candidates blocked: "Fading connection: cheryl anderson" → locked_contact_in_artifact:Cheryl Anderson | "6 inbound emails from same sender in 30 days — zero replies synced" → duplicate_100pct_similar
- **artifact_full_len:** 0
- **artifact body:** *(empty)*
- **anomaly_identification:** *(null)*

### 10. `5fd47811-d4ce-4df7-81f5-8e51f905694d`

- **generated_at:** 2026-04-07 02:19:02.637+00
- **status:** skipped
- **action_type:** send_message
- **directive_text / artifact:** Same as row **1**.
- **anomaly_identification:** *(null)*

## Quick read

- **Repeated `send_message` artifact:** Same directive and ~195-char body appears for multiple rows (cron/generate retries or multiple pipeline attempts). Body opens with **"Can you confirm"** — conflicts with generator `SEND_MESSAGE_ARTIFACT_RULES` (“Can you confirm as an opener” is disallowed), suggesting validation drift or a different code path.
- **`do_nothing` rows:** Often **no artifact body**; some carry **block reasons** in `directive_text` (locked contact, duplicate, LLM validation).
- **`anomaly_identification`:** Populated on at least one skipped row (VA / future-date anomaly); null on most `send_message` rows in this sample.
