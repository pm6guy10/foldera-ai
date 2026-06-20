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

**Stage 0 (this PR) — foundation, zero behavior change:** additive Bible Part V (Proactive Scout Lane); feature flags in `lib/config/prelaunch-spend.ts` (`SCOUT_ENABLED`, `SCOUT_RAG_ENABLED`, `SCOUT_WEB_ENABLED`, default off); embeddings schema migration `supabase/migrations/20260620120000_scout_drive_chunks.sql` (`scout_drive_chunks` vector(1024) + `scout_drive_index_state` + `match_scout_chunks` RPC) — committed, **not yet applied**. `.foldera-contract.json` widened to the Scout surface.

**Verified facts:** pgvector already enabled; no Anthropic embeddings API → Voyage `voyage-3.5` (1024-dim); real web access ships natively (`web_search_20260209`/`web_search_20250305`) in the Claude API — no separate vendor; model split = Haiku 4.5 for bulk extraction, Sonnet 4.6 for the scout loop.

## Next exact move

1. **Stage 0:** land as a draft PR; prove `gate:continuity` + `typecheck` + `build` green; owner reviews.
2. **Owner-gated before Stage 1:** authorize `VOYAGE_API_KEY`, apply `20260620120000_scout_drive_chunks.sql` to production Supabase, approve any paid/embeddings validation cycle. These are not agent self-unblocks (AGENTS.md).
3. **Stage 1 (same seam):** `lib/sync/drive-extract.ts` (shared extractor), `lib/scout/drive-index.ts` (full crawl), `chunker.ts`, `embeddings.ts` (Voyage), `retrieval.ts` (`retrieveDriveContext`), `app/api/cron/scout/index-drive/route.ts`.

Full staged design: GitHub issue #486 and the approved session plan. Stages 2–5 (real web swap, scout loop, phone-first delivery, hardening) follow on the same seam.

## Product doctrine

Foldera is a Workday Presence Layer (the always-on default) plus, additively, a flag-gated Proactive Scout lane (Bible Part V). No dashboard / task-manager / inbox-summary / chatbot / surveillance drift; no auto-send. `FOLDERA_MASTER_BIBLE.md` carries doctrine; `AGENTS.md` is the agent contract.

## GitHub writeback contract

- GitHub writeback before stop is mandatory. GitHub source truth beats chat memory; if work isn't written to GitHub, the transaction is incomplete.
- Before stopping, post one terminal receipt: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- Update `ACTIVE_HANDOFF.md` when the seam / proof / next move / blocker changes; `FOLDERA_BUILD_ORDER.yaml` when the active issue changes.
