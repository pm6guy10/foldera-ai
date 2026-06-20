# ACTIVE HANDOFF - FOLDERA

## DON'T FORGET — read first, every boot

1. **Value is the only score.** Foldera exists to produce one act the user wouldn't have done. Green CI, audits, clean code, merged PRs are *hygiene* — not value.
2. **Safe silence beats a fake card.** Never manufacture a verdict; quiet on weak evidence. The Scout obeys this too: no opportunity worth surfacing → stay quiet.
3. **No "done" without live product proof.** Build/tests/CI green is necessary, never sufficient.
4. **Don't make Brandon the router/tester/merger.** Pick the highest-leverage move, do it end-to-end, bring the result + reasoning.
5. **Scout is additive and never auto-sends.** It proposes finished, review-gated artifacts. The Workday Presence Layer stays the always-on default; every `SCOUT_*` flag defaults off.

Keep this cockpit short and value-first. Completed-issue history lives in `SESSION_HISTORY.md` + git, never here.

## Boot

1. Read this file. 2. Read the active issue (#486). 3. Check issue #136 for recent INTERRUPT receipts.

## Active command gate

`ACTIVE_SEAM_STATE.json` is the machine-readable control plane.

Issue #486 is the active SCOUT seam.

Constraint everywhere: NO paid API calls and NO production mutation without explicit owner authorization — prove in the harness.

## Current slice:

**SCOUT lane (#486) — butler → scout.** Owner brainstorm (2026-06-20) named the missing half of the Guardian Vision (Bible Part II-B): a proactive Scout that treats the whole Google Drive as a *searchable* brain (today it is read but never searched), has *real* web access (today's enrichment is recalled-from-memory, not real), and proactively surfaces opportunities with finished, review-gated artifacts (e.g. a matching role + tailored resume + cover letter built from Drive). Built additively behind feature flags; the presence-layer default is untouched.

**Stages 0–1 merged via PR #487, inert behind flags, zero behavior change.** Stage 0: Bible Part V; flags (`SCOUT_ENABLED`/`SCOUT_RAG_ENABLED`/`SCOUT_WEB_ENABLED`, default off); migration `20260620120000_scout_drive_chunks.sql` (**applied to prod Supabase 2026-06-20**; `scout_drive_chunks`+`scout_drive_index_state`+`match_scout_chunks` RPC live, pgvector 0.8.0 re-installed — it had been dropped by `20260318040049`). Stage 1: shared Drive extractor (`lib/sync/drive-extract.ts`; `google-sync.ts` delegates, butler path unchanged), `lib/scout/{chunker,embeddings,retrieval,drive-index}.ts`, `app/api/cron/scout/index-drive/route.ts`. Proof: full vitest 1984 + gate + typecheck + lint(0) + build green; 16 mocked Scout tests, no paid calls.

**Verified facts:** pgvector already enabled; no Anthropic embeddings API → Voyage `voyage-3.5` (1024-dim); real web access ships natively (`web_search_20260209`/`web_search_20250305`) in the Claude API — no separate vendor; model split = Haiku 4.5 for bulk extraction, Sonnet 4.6 for the scout loop.

## Next exact move

1. ~~Owner — review PR #487~~ **DONE** (merged 2026-06-20).
2. **ACTIVATE Stage 1 — remaining owner-console steps (cannot run from the secret-less agent sandbox):** ✅ prod migration applied; ⛔ set `VOYAGE_API_KEY` + `SCOUT_ENABLED=true` + `SCOUT_RAG_ENABLED=true` in Vercel production env, then trigger `GET /api/cron/scout/index-drive` (CRON_SECRET bearer) for the paid first-index cycle. Secrets/billing are owner-gated (AGENTS.md); the agent has no Voyage key, CRON_SECRET, or Vercel env-write tool.
3. **Stage 2 — BUILT (PR #488), inert behind flags, zero behavior change.** `lib/scout/web-search.ts` does REAL web access via the native `web_search_20250305` tool (basic variant — researcher runs on Haiku 4.5; `web_search_20260209` needs Sonnet 4.6+), with `pause_turn` resume. `researcher.ts` Pass 2 uses it when `SCOUT_WEB_ENABLED` (else the existing recall-from-memory path, untouched), and feeds `retrieveDriveContext()` into the insight as `drive_context` when `SCOUT_RAG_ENABLED`; `generator.ts` surfaces both `EXTERNAL_CONTEXT` + `DRIVE_CONTEXT` in the brief prompt. Both gates also require `isPaidLlmAllowed()`. Proof: vitest **1990** (+6 mocked web-search tests, no paid calls) + gate + typecheck + lint(0) + build green. Activation = the same Stage-1 owner steps (Voyage key + `SCOUT_*` flags in Vercel); web search additionally needs `ALLOW_PAID_LLM`/prod-paid gate on.
4. **Stage 3 — BUILT (this branch), inert behind flags, zero behavior change.** `lib/scout/scout-loop.ts` is the proactive loop: `runScoutLoop()` infers a goal from `tkg_goals` → real web search (Stage 2 `searchWebForEnrichment`, reused) → Drive materials (Stage 1 `retrieveDriveContext`, reused) → a Sonnet 4.6 writer grounds a finished, **review-gated** artifact proposal. Doctrine held: master-gated by `isScoutEnabled()` + `isPaidLlmAllowed()` (fully no-ops otherwise, no paid call on empty context); **safe silence** (no web/Drive context, low confidence < 60, introspection leak, or writer says nothing worth surfacing → returns `[]`); **never auto-sends** — it only returns proposals. Proof: 11 new mocked scout-loop tests (no paid calls) + typecheck + lint(0) + gate + build green.
5. **Stage 4 — BUILT (this branch), inert behind flags, zero behavior change.** Phone-first delivery of the Stage 3 proposals. New flag `isScoutDeliveryEnabled()` (`SCOUT_DELIVERY_ENABLED`, requires the Scout master flag; default off). `lib/scout/sms.ts` is the Twilio SMS adapter (test-safe by default; live only on Vercel prod with all `TWILIO_*` secrets — owner-gated). `lib/scout/delivery.ts` fans proposals out phone-first: an SMS *nudge* (headline + deep link, never the artifact) first, then Slack + email carry the full review-gated artifact; each channel self-skips when its owner-gated target env is unset. `app/api/cron/scout/deliver/route.ts` runs the loop → delivery, owner-triggered (CRON_SECRET bearer; not a scheduled cron). Doctrine held: **never auto-sends** to a third party (only notifies the owner on their own rails). Proof: 19 new mocked tests (delivery + sms, no paid/network calls) + scout suite 52 + typecheck + lint(0) + gate:continuity + build. Activation (owner-gated): `TWILIO_*` + `SCOUT_DELIVERY_ENABLED` + `SCOUT_DELIVERY_SMS_TO`/`SCOUT_DELIVERY_EMAIL_TO` (reuses `FOLDERA_SLACK_SELF_CHANNEL_ID`), atop the Stage 1-3 Voyage/`SCOUT_*`/`ALLOW_PAID_LLM` flags.
6. **Stage 5 (same seam, next):** hardening — budgets, dedup, delta re-index, fixture tests. PWA + Web Push delivery later.

Full staged design: GitHub issue #486 and the approved session plan. Stage 5 (hardening) follows on the same seam.

## Product doctrine

Foldera is a Workday Presence Layer (the always-on default) plus, additively, a flag-gated Proactive Scout lane (Bible Part V). No dashboard / task-manager / inbox-summary / chatbot / surveillance drift; no auto-send. `FOLDERA_MASTER_BIBLE.md` carries doctrine; `AGENTS.md` is the agent contract.

## GitHub writeback contract

- GitHub writeback before stop is mandatory. GitHub source truth beats chat memory; if work isn't written to GitHub, the transaction is incomplete.
- Before stopping, post one terminal receipt: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- Update `ACTIVE_HANDOFF.md` when the seam / proof / next move / blocker changes; `FOLDERA_BUILD_ORDER.yaml` when the active issue changes.
