# WHAT'S NEXT — Updated 2026-04-06

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
