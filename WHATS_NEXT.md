# WHAT'S NEXT — Updated 2026-04-07

## STATUS: SHIPPED — Full surface audit doc (`docs/FULL_SURFACE_AUDIT_2026-04-07.md`)

**This session:** Point-in-time inventory (14 pages, 56 API routes, crons vs manual, 14 workflows), automation snapshot (health/scoreboard/lint/build/811 vitest/41 CI e2e/61 test:prod, `npm audit`), merged OPEN pointers, gaps (`/dashboard/signals` e2e, Sentry not triaged here). **Commits:** `b830724`, session-log hash fix `6d8396f`. **Ops:** `npm run scoreboard` still fails until `pipeline_runs` migration on linked DB.

## STATUS: SHIPPED — Microsoft To Do: `$top` only (narrowest Graph task query)

**This session:** **`lib/sync/microsoft-sync.ts`** — logs still showed **`ParseUri`** after removing **`$filter`** if production ran the brief with **`$orderby`** (8603b91). **`2ba6584+`** dropped **`$orderby`**. This change drops **`$select`** too — only **`?$top=`** on **`/me/todo/lists/{id}/tasks`**, to shave broker OData parse failures; default payload still has fields we read.

## STATUS: SHIPPED — Scorer rejection validity stopwords + Microsoft To Do sync (no `$filter`)

**This session:** **`lib/briefing/validity-context-entity.ts`** + `filterInvalidContext` wiring — stops bogus `extractPersonNames` tokens (Reference, Complete, From, …) from firing **`rejection_signal_detected`** and killing real candidates. **`lib/sync/microsoft-sync.ts`** — To Do task URL: no **`$filter`** / **`$orderby`** (ParseUri); latest uses **`$top`** only. **Tests:** `validity-context-entity.test.ts`. **After deploy / tonight’s cron:** compare **`stakes_gate_filter`** `passed` vs prior (~8) — if still thin, tune stakes (`no_time_pressure` / `no_real_external_entity`) next, not in this change.

## STATUS: SHIPPED — `npm run health`: `do_nothing` last row warning-only

**This session:** `scripts/health.ts` — latest action `do_nothing` → `⚠`, does not fail CI; `__GENERATION_FAILED__` in `directive_text` stays hard fail. **Commit:** `git log -1 --oneline` on `main`.

## STATUS: SHIPPED — Signal processor: malformed commitment `due` no longer crashes batch

**This session:** `lib/signals/signal-processor.ts` — `insertCommitment` uses `normalizeInteractionTimestamp` for `due_at` so values like `EOD` do not call `toISOString()` on Invalid Date (avoids `signal_processor_batch_failed: Invalid time value` and blocked `INSUFFICIENT_SIGNAL`). **After deploy:** Generate Now / nightly signal processing — logs should not show that batch error; regression tests in `signal-processor.test.ts`.

## STATUS: SHIPPED — `npm run health`: repeated directive warning-only (no CI fail)

**This session:** `scripts/health.ts` — 24h duplicate-shape count prints `⚠` and does not increment `RESULT` / exit code; Supabase query errors for that block still `✗` and fail. **Commit:** `98db89d`.

## STATUS: SHIPPED — `EXTRACTION_DAILY_CAP` raised to $0.25/day

**This session:** `lib/utils/api-tracker.ts` — extraction (`extraction` / `signal_extraction`) daily spend cap **0.05 → 0.25** USD so manual `run-brief` is not blocked at ~$0.06 extraction before generation. **Ops:** apply `20260405000001_directive_ml_moat.sql` when ready — `outcome_label` on `tkg_directive_ml_snapshots` (see `AUTOMATION_BACKLOG`).

## STATUS: SHIPPED — Generate Now bypasses 20h `brief_generation_cycle_cooldown`

**This session:** `lib/cron/daily-brief-generate.ts` — manual `/api/settings/run-brief` (`skipManualCallLimit` + `settings_run_brief` source) and dev brain-receipt no longer hit the 20h pre-signal gate; cron/trigger/daily-generate still throttled. **After deploy:** `POST /api/settings/run-brief` same day as `daily-brief` cron — logs should not show `brief_generation_cycle_cooldown` unless another guard applies.

## STATUS: SHIPPED — Scorer failure memory + stale-date gate + triple-directive loop guard

**This session:** `lib/briefing/scorer-failure-suppression.ts` — scorer drops candidates whose signal/entity/commitment keys appear on recent `do_nothing` / no-send rows (duplicate, usefulness, LLM fail, **stale_date_in_directive**, **GENERATION_LOOP_DETECTED**). Generator blocks **past** ISO / month-day deadlines in `directive_text` (&gt;3d). `runDailyGenerate` — last 3 directives identical after normalization → skip LLM, persist loop row with `loop_suppression_keys` (24h). **Verify after deploy:** `POST /api/settings/run-brief`; confirm new winner is not a stale deadline repeat; operator may still run one-off SQL to skip stuck `pending_approval` rows if needed.

## STATUS: SHIPPED — Mail cursor self-heal (`CURSOR_REWOUND`)

**This session:** `lib/sync/mail-cursor-heal.ts` rewinds `user_tokens.last_synced_at` to `max(occurred_at)` for `gmail`/`outlook` when incremental mail sync inserted **0** rows but the cursor is **>24h** ahead of the graph (`MAIL_CURSOR_HEAL_GAP_MS`). Wired from `syncGoogle` / `syncMicrosoft`. **Dry proof:** `npx vitest run lib/sync/__tests__/mail-cursor-heal.test.ts`. **After deploy:** watch Vercel nightly-ops / sync logs for `CURSOR_REWOUND`; raise gap constant if healthy low-mail users rewind too often.

## STATUS: SHIPPED — Gmail incremental `after:` yyyy/mm/dd + hunt `selfEmails` + settings mail-graph stale banner

**Prior session:** `lib/sync/gmail-query.ts` fixes empty Gmail incremental `messages.list` (epoch `after:` → UTC date). `runHuntAnomalies` + `buildAvoidanceObservations` skip “you didn’t reply” when From/author is the user’s mailbox (auth + `user_tokens`) or product noise domains. `/api/integrations/status` + Settings amber banner when newest processed mail signal is &gt;7d (`INTEGRATIONS_MAIL_GRAPH_STALE_MS`). **After deploy:** Sync now → process signals → Generate Now; confirm top candidate is a real external thread.

## STATUS: SHIPPED — Self-inbound behavioral_pattern fix + OAuth expiry in `connector_health` stage

**Latest ship:** Inbound avoidance counts use **`entityMatchesInboundSender`** (From/author only when present) so the user's name on **To:** does not fake "received from" that contact; legacy snippets without From still use `contentHitsEntity`.

**Prior ship:** Scorer `selfEmails` = auth + `user_tokens` (Google/Microsoft); discrepancy PATTERN 1/2 exclude self entities and self-authored inbound (`author` / `From:`). `checkConnectorHealth` logs `connector_health_oauth_token_expiry` and returns `oauth_token_diagnostics` on nightly-ops (no secrets). After deploy: confirm Vercel cron JSON shows the new event when any row has expired `expires_at` or missing `access_token` without soft-disconnect.

## STATUS: SHIPPED — `FOLDERA_DRY_RUN` + scorer top-2 candidate cap (local cost / burn reduction)

**Latest ship:** Set `FOLDERA_DRY_RUN=true` in `.env.local` to skip Anthropic on directive generation (synthetic fixture after scoring). Vitest clears the env so mocks still run. Scorer passes at most **2** candidates into generator fallback (was 5/3).

## STATUS: SHIPPED — Generator hotfix `2483b2a` / `a390927` (evidence guard, email `content` mirror)

**Latest ship:** Persistence validation no longer throws when `directive.evidence` is missing; email artifacts get `content` = `body` on persist; no-send rows use `reason` instead of literal `__GENERATION_FAILED__` in `directive_text`. After Vercel **Ready**, spot-check `pending_approval` email rows: `execution_result->'artifact'->>'content'` non-null.

## PRIOR — Hunt layer + two-pass gen + currency/thin gates (verify deploy)

**Latest ship:** verify `git log -1 --oneline` on `main` — **hunt anomalies** (`lib/briefing/hunt-anomalies.ts`) + scorer **999** injection + generator **anomaly_identification** / **ungrounded_currency** / **thin_entry_phrase** post-LLM. After Vercel **Ready**, operator: `POST /api/settings/run-brief` × N — confirm `execution_result.anomaly_identification` (non–dry-run) and scorer log `hunt_query_counts` / injection, or document all-zero hunt counts.

**Prior — Gate 4 depth:** `fix(generator): 1500c signal snippets, 15 surgical_raw_facts; AGENTS debug-first line` (`a64766a` area). Spot-check commitment-backed directives for verbatim amounts/dates in context.

**Prior — ML moat:** migration `20260405000001_directive_ml_moat.sql`; nightly-ops stage `ml_global_priors`; apply DDL in Supabase before expecting non-empty priors.

**Generator diagnostician (April 5, 2026):** `SYSTEM_PROMPT` hardening + per-run `DIAGNOSTIC_LENS` from `matched_goal_category` + vague-`mechanism` validation retries. Monitor: generator retry rate and `causal_diagnosis:vague_mechanism_*` validation failures in logs after deploy.

**Prior:** Avoidance transactional filter + discrepancy finished-work gates — avoidance inbound counts skip automated From/domain heuristics; discrepancy prompts + triage gate + brain-receipt `finished_work_gate` for discrepancy/insight.

**Prior:** `fix: connector sync freshness, Gmail junk exclusion, junk skip extraction` (OAuth Google `prompt: 'consent'`, Gmail spam/promo exclusion, mail-primary `last_synced_at`, nightly `sync_staleness`, token refresh JSON logs, junk skips LLM).

**Prior:** `c0ffdc4` — `write_document` anti-padding + `LOCKED_CONTACTS` in system + user prompt from `tkg_constraints` (multi-entity trust).

**Prior:** `fab7c5e` — SYSTEM_PROMPT good/bad `write_document` examples + thin-evidence rule (filled-in data beats templates).

## OUTCOME (what you have now)

| Layer | What changed | Why it matters |
|-------|----------------|----------------|
| **Scoring + gates** | `4a75257` discrepancy alignment, drain, explicit-ask relaxation | Pipeline stops looping on the same blocked candidate |
| **Health** | `13add85` `system_health` + verdict API + owner email footer + auto-drain | Failures become machine-readable; you stop guessing |
| **Generator** | Diagnostician prompt + `DIAGNOSTIC_LENS` + vague-mechanism gate | Cross-signal bar + domain lens + fewer generic “busy/prioritize” mechanisms |
| **Ops** | Ingest route, UI critic push-trigger killed, locked_contact normalization | Less noise, fewer false blocks |

## Generator eval baseline (April 7, 2026)

- **Before picture:** [docs/eval/baseline-sample.md](docs/eval/baseline-sample.md) + rubric [docs/eval/rubric.md](docs/eval/rubric.md). Score the 10 rows before changing prompts; deferred rebuild phases: [docs/eval/PROMPT_REBUILD_BACKLOG.md](docs/eval/PROMPT_REBUILD_BACKLOG.md).

## RIGHT NOW (pick one; ~15 min total)

1. **Vercel:** Confirm latest deploy **Ready** for `fab7c5e` on `main`.
2. **`npm run test:prod`** — only if `tests/production/auth-state.json` is fresh (~30d).
3. **Supabase:** If `system_health` migration not applied yet, run `20260404000002_create_system_health.sql` (or `db push`) — otherwise verdict rows fail silently.

## AFTER THAT (ordered)

1. **Prove write_document quality:** After deploy, owner session + `POST /api/dev/brain-receipt` (or Generate Now). If winner is `write_document`, artifact should list **real names/dates/status** — not “each item needs: date, impact, owner.”
2. **Manual nightly-ops** once — confirm `system_health` insert + no errors in function logs.
3. **Morning email** — confirm owner-only health line in footer (non-owners unchanged).
4. **Let cron run** — watch for new winners; if `INFINITE_LOOP`, drain runs automatically — spot-check logs once.

## PM PLAN — what you do vs what the repo does

**You only (cannot automate):**

- Approve/skip real directives in inbox (Gate 5 / revenue proof).
- Refresh prod Playwright auth when tests skip (`npm run test:prod:setup`).
- Apply DB migrations in Supabase when alerted.
- Stripe / Resend / OAuth “connector” proof when you want GTM receipts updated.

**Cursor / agents (next best slices):**

- **Living graph v1 shipped:** Monitor structured log `living_graph_applied` and `patterns.attention` growth; no DB migration required (JSONB subkey). Tune `REINFORCE_*` / decay if ordering swings too hard.
- **AZ-24 continuation:** Drive down `do_nothing` + legacy `research` share — more scorer/generator paths that still emit `research` or thin outcomes.
- **Post-`fab7c5e` regression guard:** One vitest or pipeline test that rejects template-shaped `write_document` bodies (optional; only if flakes stay low).
- **Dashboard:** Surface `GET /api/health/verdict` in settings or a small widget (spec-tied).

**Defer (do not start until above is green):**

- Big scorer/generator file splits (P1 hygiene, not blocking product promise).
- Next major version bumps (ESLint 9, etc.) — blocked by Next 14 peer set.

## GATE STATUS (live)

| Gate | Status | Last evidence |
|------|--------|---------------|
| Gate 1: Signal ingestion | GREEN | Claude export ingested 2026-04-03, claude_conversation source |
| Gate 2: Processing | YELLOW | Backlog clearing nightly |
| Gate 3: Generation | GREEN | Decision enforcement + `fab7c5e` document quality examples |
| Gate 4: Send | GREEN | Discrepancy gate alignment + explicit-ask patterns `4a75257` |
| Gate 5: Approve | — | Human only |

## PIPELINE HEALTH (live numbers from system_health)

`SELECT failure_class, signals_synced, candidates_evaluated, winner_action_type, winner_confidence, same_candidate_streak FROM system_health WHERE user_id = 'e40b7cd8-4925-42f7-bc99-5022969f1d22' ORDER BY created_at DESC LIMIT 1;`

## BLOCKED BY

Nothing in code. **Operator:** migration applied + deploy Ready + optional prod smoke.

## DO NOT TOUCH

- `isDiscrepancyWithRecipient` variable is gone — do not re-introduce it
- `isDiscrepancyCandidate` is now the single gate guard for both send_message and write_document
- `persistNoSendOutcome` must always include `original_candidate` metadata — scorer and health system depend on it
- `system_health` table insert must not be in the main request path (fire-and-forget in nightly-ops)
