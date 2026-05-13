# ACTIVE HANDOFF — FOLDERA

Last updated: 2026-05-13 11:23 PT
Last known production SHA: 4b964ab
Last completed code commit: 4b964ab
Current slice: Promise-chain rung 2 repeatable WorkSourceWA winner
Current mode: Stop after this first-rung fix; do not continue into UI, controller, paid proof, or artifact polish.

## Current product truth

- Health is non-blocking: Gmail fresh, Outlook fresh, mail cursors current, and last generation is `write_document`.
- Production has selected-move artifact `8aca653a-f0a1-46e9-9af4-323c5cee539b` as `pending_approval` `write_document`, title `WorkSourceWA account activity closeout`, `brief_origin=selected_move_generate`.
- Latest/history readback for that row was previously production-proven; this slice did not touch UI or readback code.
- First broken promise-chain rung was `FINDS WHAT MATTERS`: valid pending discrepancy cards with `blocked_by: []` were being learned as noisy blocked patterns, so the current WorkSourceWA class could be selected once and then vetoed on replay.
- `winner:autopsy` now selects the WorkSourceWA Tier 1 `admin_deadline_decision_packet` again with fresh providers, `graph_drift: []`, and no `action_needed`.
- Small 90-day rolling-window behavioral graph aging is ignored only when no newer signal exists and 14/30-day counts remain stable; genuinely stale graph state still blocks.

## Verified proof

- health: PASS `npm run health` -> `RESULT: 0 FAILING`, last generation `write_document`.
- selector autopsy: PASS `npm run winner:autopsy` -> `current_winner.verdict=selected`, WorkSourceWA Tier 1 `admin_deadline_decision_packet`, no future findings.
- focused regressions: PASS `npx vitest run lib/briefing/__tests__/discrepancy-card-frame.test.ts --reporter=verbose` (`10/10`).
- graph proof: PASS `npx vitest run lib/signals/__tests__/behavioral-graph.test.ts --reporter=verbose` (`4/4`).
- acceptance-path proof: PASS selected-move generation/artifact/latest-history/daily-value/execute tests (`46/46`) across the focused files run this slice.
- build/lint: PASS `npm run build`; PASS `npm run lint`.
- read-only production DB proof: row `8aca653a...` remains `pending_approval`, `write_document`, title `WorkSourceWA account activity closeout`, source refs `3`, `paid_flag=false`.
- production deploy truth: PASS Vercel deployment `dpl_GSE4Nuj5P8aoiTiRkUGt6n7QSpKa` is READY for commit `4b964abdc4acbb20604ef9c359f165db6286019f`.
- production SHA: PASS `https://www.foldera.ai/api/health` -> `4b964abdc4acbb20604ef9c359f165db6286019f`.

## Remaining defects in current slice

- None for rung 2 repeatable selection.
- The artifact can still be cleaner and more "holy crap", but that is the next rung and was intentionally not touched.

## Next exact move

1. Stop.
2. Do not continue into artifact polish, UI, controller, paid generation, or source-trail cleanup unless Brandon explicitly asks.

## Do not touch yet

- paid generation without explicit approval
- outbound email without explicit approval
- Stripe charge
- schema migration or destructive DB action
- landing page, demo/marketing UI, dashboard polish
- controller/meta unless proof-blocking
- fake non-owner accounts or fabricated production data

## External blockers

- `BL-015`: waiting on explicit paid/model-backed owner money-shot proof.
- `BL-003` and `BL-005`: waiting on paid model quota/access before fresh approved production proof.
- `BL-006`: waiting on one real connected non-owner account.
- `BL-011`: waiting on the next natural daily-send passive proof window.

## Stop condition

Stop now: the first broken promise-chain rung is committed, pushed, and production SHA is verified.
