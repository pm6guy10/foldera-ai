# ACTIVE HANDOFF - FOLDERA

## DON'T FORGET — read first, every boot

1. **Value is the only score.** Foldera exists to produce one act the user wouldn't have done. Green CI, audits, clean code, merged PRs are *hygiene* — not value.
2. **Safe silence beats a fake card.** Never manufacture a verdict; quiet on weak evidence. The Scout obeys this too: no opportunity worth surfacing → stay quiet.
3. **No "done" without live product proof.** Build/tests/CI green is necessary, never sufficient.
4. **Don't make Brandon the router/tester/merger.** Pick the highest-leverage move, do it end-to-end, bring the result + reasoning.
5. **Scout is additive and never auto-sends.** It proposes finished, review-gated artifacts. The Workday Presence Layer stays the always-on default; every `SCOUT_*` flag defaults off.
6. **The Guardian looks inward, not outward.** Watch the user's *own* world (the thread they're about to drop, the reply owed, the deadline in their files) and reduce load. Do **not** fish the open web for external "opportunities" to send them on — that is tone-deaf (2026-06-20). A fixture/sample card must never be posted to a real channel as if real. See issue #492.

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
5. **Stage 4 — MERGED (PR #490, 2026-06-20), inert behind flags.** Delivery of the Stage 3 proposals via `lib/scout/delivery.ts` + `app/api/cron/scout/deliver/route.ts` (owner-triggered, CRON_SECRET bearer; not a scheduled cron), flag `isScoutDeliveryEnabled()` (`SCOUT_DELIVERY_ENABLED`; default off). Never auto-sends to a third party.
6. **Stage 5 — BUILT (this branch), inert behind flags, zero behavior change.** Owner decision (2026-06-20): delivery is **Slack-first, NO texts** — the Twilio/SMS rail (`lib/scout/sms.ts`) is removed; `delivery.ts` now fans out Slack (full review-gated card) + email (opt-in fallback), each self-skipping when unset. **Scout retargeted to the Guardian frame** (`lib/scout/scout-loop.ts`): writer/goal-query/artifact types moved off job-hunting ("cover letter/application/outreach") to the single **highest-consequence, money-moving move** (funding/grant/RFP, deadline/filing, policy/regulatory change, intro worth making, ripe decision), ranked by stakes + timing — the executive-function guardian, not a cover-letter bot. **Proof contract tightened** (AGENTS.md Proof Doctrine + `.foldera-contract.json`): every Scout phase needs **real product proof — a live Slack card — or NO PASS**; hygiene alone never passes. Proof: scout suite 46 + typecheck + lint(0) + gate:continuity + build. Live app-adapter path stays owner-gated (`SCOUT_DELIVERY_ENABLED` + `FOLDERA_SLACK_SELF_CHANNEL_ID` already in prod + Stage 1-3 flags, then trigger the deliver route).
7. **Stage 5 — MERGED (PR #491, 2026-06-20, `0a276ce`).** Slack-first delivery + Twilio/SMS removed + proof-contract tightened (real Slack card every phase or NO PASS).
8. **Inward retarget finished in CODE (this branch, `-iod794`).** #491 retargeted the Scout's *words* but left the *mechanism* outward: the deployed `lib/scout/scout-loop.ts` still fished the open web for funding/grants/RFPs/openings. **Live evidence (the owner's own `#foldera-self-loop`, 2026-06-20):** two outside-in cards landed — a **$181M grant chase** and a **Watershed platform-engineer cover letter with fabricated credentials** ("8 years building platforms / p99 latency 60%" — not supported by the owner's real files) — the exact tone-deaf failure #492/#481 condemn. This branch aligns the code to the merged doctrine: the writer / web-query / artifact framing now watches the person's **own world** (commitments owed, replies due, deadlines/filings in their own files), never hunts external opportunities, and never invents credentials/experience. Proof: scout suite **47** (+ new inward-frame assertion) + typecheck + lint(0) + gate:continuity + build. Scout stays flag-OFF, so this is doctrine-alignment of inert code.
9. **Compass — issue #492 (DO NOT RUN).** Stop adding brain/breadth; turn the hands on for ONE real loop on REAL data until "can't-live-without-it 3×/week." Compass, not a seam; promote explicitly before any work.

Full staged design: GitHub issue #486. The real next direction (when promoted) is #492's §3 — one real act, one real source, one real loop — not Stage 6 breadth. **The §3 money-move is owner-gated** — verified live 2026-06-20: `tkg_signals` bodies are encrypted (no decrypt key in the sandbox), `scout_drive_chunks` is empty (the paid Drive index has never run), and the Vercel MCP exposes no env-write tool, so the agent cannot flip `VOYAGE_API_KEY` / `SCOUT_*` / `ALLOW_PAID_LLM` or ground an act on the real (encrypted) inward threads.

## Product doctrine

Foldera is a Workday Presence Layer (the always-on default) plus, additively, a flag-gated Proactive Scout lane (Bible Part V). No dashboard / task-manager / inbox-summary / chatbot / surveillance drift; no auto-send. `FOLDERA_MASTER_BIBLE.md` carries doctrine; `AGENTS.md` is the agent contract.

## GitHub writeback contract

- GitHub writeback before stop is mandatory. GitHub source truth beats chat memory; if work isn't written to GitHub, the transaction is incomplete.
- Before stopping, post one terminal receipt: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- Update `ACTIVE_HANDOFF.md` when the seam / proof / next move / blocker changes; `FOLDERA_BUILD_ORDER.yaml` when the active issue changes.
