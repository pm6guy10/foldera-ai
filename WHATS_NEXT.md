# WHAT'S NEXT — Updated 2026-04-10

## STATUS: SHIPPED — Hunt `send_message` recipient allowlist is winning-thread peers only (relationshipContext cannot expand it)

**This session:** `lib/briefing/generator.ts` `buildStructuredContext` + `collectHuntSendMessageToValidationIssues`; tests `hunt-recipient-grounding.test.ts`; live receipt script `scripts/verify-hunt-allowlist-receipt.ts`. **After push:** `GET /api/health` SHA; next real hunt generation should fail validation / downgrade if thread has no eligible external peer (e.g. noreply-only).

## STATUS: SHIPPED — Scorer prefers mail-anchored commitments; drops calendar + Claude chat from signal candidate pool

**This session:** `scorer-candidate-sources.ts` + `scoreOpenLoops` — see `SESSION_HISTORY.md` 2026-04-10. **After push:** `GET /api/health` SHA; optional **`npm run test:prod`**; **`npm run scoreboard`** if chasing `do_nothing` / backlog.

## STATUS: SHIPPED — Prod readiness punch list (OAuth DDL verified + integrations 42703 fallback + scoreboard snapshot)

**This session:** MCP confirmed **`oauth_reauth_required_at`** on production (migration already applied); **`/api/integrations/status`** treats **42703** + **`oauth_reauth`** in error text as missing-column path; **SESSION_SCOREBOARD** snapshot (**591** unprocessed signals, dry-run scoreboard rows); **AUTOMATION_BACKLOG** OPEN for paid-cron bracket receipt; **REVENUE_PROOF** operator nudge for Stripe + second user. **After push:** `GET /api/health` SHA; when turning off **`CRON_DAILY_BRIEF_PIPELINE_DRY_RUN`**, add new scoreboard snapshot + close OPEN item with real LLM validation evidence.

## STATUS: READY TO SHIP — Pipeline winner DB fields + peek script + bracket `deadline`/`topic` + `?` strips passive gates

**This session:** `pipeline_runs.raw_extras` → **`winner_candidate_id`**, **`winner_decision_reason`**; **`npm run peek:pipeline-winner`**; bracket slot list no longer treats **`deadline`** / **`topic`** as template placeholders; **`send_message`** artifact with **`?`** drops passive + obvious-first-layer decision issues. **After push:** `GET /api/health` SHA; **`npm run test:prod`**; operator **Generate with AI** or dry run — confirm new rows and peek output align; stale skipped rows may still show old **`bracket placeholder`** until refreshed.

## STATUS: SHIPPED — Bracket guards + decision gates (subject line + unreplied-thread outreach)

**This session:** `hasBracketTemplatePlaceholder` — no `subject` slot word; named caps templates only; `send_message` `?` = explicit ask; time/pressure patterns for “last N days” / “no replies”. **After deploy:** paid **Generate with AI** — confirm fewer `artifact.subject contains bracket placeholder` + `decision_enforcement:missing_*` strings in `pipeline_runs` / skipped rows.

## STATUS: SHIPPED — Golden path: bracket placeholder validation (paid Generate no longer false-fails on real names in titles)

**This session:** `lib/briefing/bracket-placeholder.ts` + `validateGeneratedArtifact` uses `hasBracketTemplatePlaceholder` instead of `\[[A-Z][a-zA-Z\s]*\]` (which matched `[Nicole Vreeland]`-style titles). **After deploy:** Settings → **Generate with AI** → confirm `spend_policy.paid_llm_effective` and `pipeline_runs` / dashboard move past `artifact.title contains bracket placeholder text`; judge artifact specificity (holy-crap bar). **`npm run scoreboard`** should show fewer `generation_failed_sentinel` rows for that failure mode.

## STATUS: SHIPPED — Deploy workflow: Hobby quota + Git lag (preflight wait + quota success if Git READY)

**This session:** [scripts/ci/vercel-deploy-preflight.py](scripts/ci/vercel-deploy-preflight.py) — **preflight** skips CLI when **READY** matches SHA, **waits** for Git **BUILDING** (bounded), **`check-ready`** after **`api-deployments-free-per-day`** so Actions can stay **green** if Git landed the commit while CLI was blocked ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)). Confirm [`GET /api/health`](https://www.foldera.ai/api/health) `revision.git_sha`. [docs/MASTER_PUNCHLIST.md](docs/MASTER_PUNCHLIST.md).

## STATUS: SHIPPED — Decision-enforcement repair: grounded `directive` (no hardcoded accountable-owner line)

**This session:** Repair path `send_message` dashboard line matches **concrete `explicitAsk`**; validation bans the old boilerplate on any `send_message`. **After deploy:** re-run Generate Now / brain-receipt — new repaired rows should read like `Email partner: Can you confirm…` not “Send a decision request that secures…”. See [docs/eval/rubric.md](docs/eval/rubric.md) **D**.

## STATUS: SHIPPED — `LIFE_CONTEXT_WEAVE` + WORK SHOWN in `SESSION_SCOREBOARD`

**This session:** Commit **`24bcb3e`**; deploy **`dpl_4DPJiAwASktYEAMkbiNkpa8v2ZcH`**; www health SHA **`24bcb3e`**. User prompt mandates a concrete LIFE_CONTEXT detail when that block is present; scoreboard **WORK SHOWN** checklist + SQL. **Next:** owner `Generate Now` or brain-receipt → confirm new row ties to calendar/file/task/chat vs generic copy (`cf7e33be…` baseline).

## STATUS: SHIPPED — Pipeline choreography + `GENERATION_LOOP_DETECTION_WINDOW` = 12

**This session:** Piece 1 baseline + end in `docs/SESSION_SCOREBOARD.md`; loop window **5 → 12**; deploy **`3996bbd`** / `dpl_GjJhuzoo8R7MvgD3JAZ7pU2Fsw6g`; `npm run test:prod` 61. **Victory:** target row (max 30d shape copies) still **174** until cron churn — re-check after `daily-generate` runs.

## STATUS: SHIPPED — Cross-source evidence bundle (`generation_log.evidence_bundle`, LIFE_CONTEXT prompt)

**This session:** Generator merges non-mail life context for every winner (financial: narrower caps + non-mail preserved with payment mail collapse); bucket queries when &lt;3 distinct sources; logs `evidence_bundle_commit` / `winner_signal_evidence_sources`; insight scan no longer emits `research`. **After deploy:** spot-check `tkg_actions.execution_result.generation_log.evidence_bundle` on a fresh row. **Gate 4** still operator-pending.

## Standing rule — production revision (locked in runbooks)

**Canonical “what’s on www”:** **`GET https://www.foldera.ai/api/health`** → **`revision.git_sha`** (full) / **`revision.git_sha_short`** — not git history alone. **Docs-only** pushes (e.g. `759ca8a`, `8964ad8` after `a12db1d`) still produce a deploy; www may show a **newer** SHA than the feature commit — **expected**; always re-read health. Details: [docs/MASTER_PUNCHLIST.md](docs/MASTER_PUNCHLIST.md) **Production vs `main`**, [CLAUDE.md](CLAUDE.md) **Source of truth for what’s live**, [AGENTS.md](AGENTS.md) Vercel MCP bullet, [AUTOMATION_BACKLOG.md](AUTOMATION_BACKLOG.md) **What commit is live on www**.

## STATUS: SHIPPED — Production reconciled (www = `main` + Vercel log check + `test:prod`)

**This session:** `www` had regressed to **`1b605cf`** (legacy health JSON) while `main` was **`3af031e`**. Empty commit **`a12db1d`** re-triggered CI → deploy; polled until `revision.git_sha_short === a12db1d`. **Vercel MCP** `get_runtime_logs` production **error/fatal** 24h → **none**. **`npm run test:prod`** → **61 passed**. **Punchlist:** prod vs `main` alias race playbook. **Evidence:** deployment `dpl_9CTWg6W6rB2t4s2a9QqqqfjkCGWo` READY @ `a12db1d`.

## STATUS: SHIPPED — `/api/health` deploy observability (revision + headers)

**This session:** `lib/config/deploy-revision.ts` — Vercel `VERCEL_GIT_COMMIT_SHA`, `VERCEL_DEPLOYMENT_ID`, `VERCEL_GIT_COMMIT_REF`, `VERCEL_ENV`. `GET /api/health` JSON: **`build`** (7-char SHA or `local`), **`revision`** `{ git_sha, git_sha_short, git_ref, deployment_id, vercel_env }`; headers **`x-foldera-git-sha`**, **`x-foldera-deployment-id`**. CI E2E + prod smoke assertions; punchlist + AGENTS + CLAUDE + spec row. **After deploy:** compare response `revision.git_sha` to `git rev-parse HEAD` on the shipped commit. **Verified:** `npm run health`; lint; build; vitest 862; `test:ci:e2e` 46.

## STATUS: SHIPPED — Sentry transient socket noise (EPIPE / ECONNRESET)

**This session:** Filter client-disconnect stream errors in Sentry (`lib/sentry/transient-socket-errors.ts`); wired in `instrumentation.ts`, `instrumentation-client.ts`; `apiError` skips capture for same class. **Optional:** after Vercel Ready, confirm no new **JAVASCRIPT-NEXTJS-A** / **JAVASCRIPT-NEXTJS-9** events; issues marked resolved in Sentry.

## STATUS: SHIPPED — Runbook: agent verifies (Executor ship contract; no user confirmation punt)

**This session:** `AUTOMATION_BACKLOG.md` — **Executor ship contract** (health, lint, build, vitest, `test:ci:e2e`, post-push Vercel/GitHub, `test:prod` + in-session `test:prod:setup` when possible); **Priority right now** replaces “user checks S0.” `WHATS_NEXT.md` — **Who verifies** row. `docs/AUDIT_REMEDIATION_ROADMAP.md` — triage order + link to ship contract. `AGENTS.md` — **No verification punt.** `CLAUDE.md` — **Done means you tested** + `test:prod:setup` is agent-first; pre-flight step 6. `FOLDERA_PRODUCT_SPEC.md` — pointer to ship contract. `SESSION_HISTORY.md` — S0 wording. OPERATOR section: agent runs deploy/CI checks. **Verified:** `npm run health` (0 failing); `npm run lint`; `npm run build`.

## STATUS: SHIPPED — Pre-launch pipeline spend (settings + cron + generator anomaly)

**This session:** Default production dry-run via `PROD_DEFAULT_PIPELINE_DRY_RUN` + paid opt-in `use_llm` + `ALLOW_PROD_PAID_LLM`; manual run-brief enforces daily/manual caps; `CRON_DAILY_BRIEF_PIPELINE_DRY_RUN`; `FOLDERA_ANOMALY_USE_HAIKU`; settings UI two buttons; `spend_policy` in API JSON. See `CLAUDE.md` env list and `FOLDERA_PRODUCT_SPEC.md` 2026-04-08 bullet. **Ops:** set Vercel envs to match launch intent; optional `npm run test:ci:e2e` / `npm run test:prod` after deploy.

## OUTSTANDING — ranked by severity (source: [AUTOMATION_BACKLOG.md](AUTOMATION_BACKLOG.md) top table)

| Tier | Urgent if… | Top items |
|------|------------|-----------|
| **S0** | Vercel not Ready; prod migration missing vs repo; `npm run health` / `npm run scoreboard` FAIL | Fix before anything else |
| **S1** | Core loop / revenue proof | **AZ-24** pipeline mix; **Gate 4** / **Stripe** ([REVENUE_PROOF.md](REVENUE_PROOF.md)); `ALLOW_EMAIL_SEND` awareness |
| **S2** | CI / monitoring | **AZ-14** prod Playwright auth; Sentry; OPEN `stale_date` / retry monitors; `/login` CI flake |
| **S3** | Polish | AZ-04, 08, 09, 11, 17–19, 21 — [MASTER_PUNCHLIST.md](docs/MASTER_PUNCHLIST.md) |

**Who verifies:** The **agent** runs health, CI e2e, post-push Vercel/GitHub, and `test:prod` when auth state exists — and logs results. **S0** = those checks (or scoreboard/migrations) **failed** and must be fixed first; **S1** = next business priority when S0 gates are green — not “the user should confirm.”

## STATUS: SHIPPED — OAuth re-auth UX, connector-health gating, dashboard visit tracking

**This session:** Migration `20260408180000_oauth_reauth_dashboard_visit.sql` (`oauth_reauth_required_at`, `last_dashboard_visit_at`); fatal OAuth soft-disconnect + `needs_reauth`; dashboard reconnect banner + settings `?reconnect=`; `GET /api/conviction/latest` updates visit timestamp non-blockingly; connector-health 14d lookback + skip email if dashboard visited within 7d; Microsoft sync refresh via `token-store`; removed debug ingest `fetch` from `generator.ts`; CI E2E mocks for integrations + flow-route API stubs. **Production DDL** applied by agent (MCP), not a human follow-up — see `docs/SUPABASE_MIGRATIONS.md`. **Optional:** `npm run test:prod` after Vercel Ready when auth-state is fresh.

## STATUS: SHIPPED — Audit remediation roadmap (canonical doc)

**This session:** [docs/AUDIT_REMEDIATION_ROADMAP.md](docs/AUDIT_REMEDIATION_ROADMAP.md) — full pending program (Phases D–G, AZ table, monitoring, CI flake); links from `AUTOMATION_BACKLOG.md`, `FULL_SURFACE_AUDIT_2026-04-07.md` §Related docs, `AGENTS.md`.

## STATUS: SHIPPED — Settings mail stale banner: ingested mail date (not `processed` only)

**This session:** `GET /api/integrations/status` — `newest_mail_signal_at` / `mail_ingest_looks_stale` no longer filter `tkg_signals.processed=true`. Sync stores mail as `processed=false` until the signal processor runs; the old query could show **Mar 27** while **Last synced** was current. Settings: **Newest mail synced from your inboxes…**. Tests: `app/api/integrations/status/__tests__/route.test.ts`. **If the banner still shows an old date after deploy**, no newer gmail/outlook mail-shaped rows exist — ops rewind / `audit:supabase:sync-fix` per spec.

## STATUS: SHIPPED — Backlog sweep: duplicate cooldown, loop gate (5/≥3), foldera scorer filter, try/terms/privacy CI

**This session:** `skippedRowQualifiesForDuplicateSuppressionCooldown` + `getSuppressedCandidateKeys` (`skip_reason` / `auto_suppression_reason`: duplicate pending, forced fresh); `detectDominantNormalizedDirectiveLoop` + `runDailyGenerate` last-5 / ≥3 match; scorer **`foldera_id_noise`**; `public-routes` e2e for `/try`, `/terms`, `/privacy`; audit matrix Green; `playwright.ci.config` NEXTAUTH_URL vs 127.0.0.1 note; AUTOMATION_BACKLOG CLOSED rows. **Verify after deploy:** `scorer_suppressed_candidate_cooldown`, `scorer_foldera_id_filtered`, `GENERATION_LOOP_DETECTED` log line; `npm run test:prod`.

## STATUS: SHIPPED — Settings header: single “Foldera” accessible name (no “FolderaFoldera”)

**This session:** `/dashboard/settings` center home link used **`aria-label="Foldera"`** plus **`FolderaMark`** `alt="Foldera"` plus a wordmark — linearized copy / some AT stacked them as **FolderaFoldera**. **`FolderaMark`** adds optional **`decorative`** (`alt=""`, `aria-hidden`); settings header uses **`decorative`** + **`sr-only sm:hidden`** + **`hidden sm:inline`** wordmark. **Verify:** VoiceOver/NVDA or select-all on header should announce/show **Foldera** once.

## STATUS: SHIPPED — Gmail incremental `newer_than` + Haiku extraction JSON parse

**This session:** `lib/sync/gmail-query.ts` + `google-sync.ts` — incremental **`messages.list`** uses **`newer_than:`** (min 1h) instead of timezone-sensitive **`after:yyyy/mm/dd`**. `lib/signals/signal-processor.ts` — **`parseSignalExtractionJson`** (balanced array + trailing-comma repair). **Commit:** `6255d01`. **After Vercel Ready:** logs should show **`Gmail incremental q=newer_than:…`**; run **`npm run test:prod`** when convenient.

## STATUS: SHIPPED — Audit remediation roadmap (pipeline + `/dashboard/signals` CI)

**This session:** Signal processor isolation + timestamp hardening; `locked-contact-scan.ts` (user-facing fields + word boundaries); `userFacingStaleDateScanText` + slash ISO stale gate; `usefulness-gate` fixtures updated for expanded stale scan; `authenticated-routes` Sources e2e; audit §6 + matrix row; AUTOMATION_BACKLOG remediation + operator Phase D/E; spec rows. **Verify:** `npm run test:prod` after Vercel Ready; `npm run scoreboard` on linked DB.

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
