# Source Of Truth Map

Last updated: 2026-06-10 PT (issue #240 — Governance Collapse v1)

This is the keep-list ledger. Everything not listed here is reference, archive, or git history — never authority.

## Keep-list

| File | Role |
| --- | --- |
| `ACTIVE_HANDOFF.md` | Current command state and next exact move. The first thing every session reads. |
| Active GitHub issue | The one implementation seam. Named by `ACTIVE_HANDOFF.md`. |
| `FOLDERA_BUILD_ORDER.yaml` | Machine-readable active issue, launch ladder, closeout requirements. |
| `.foldera-contract.json` | Machine-readable allowed/forbidden file boundary for the active seam. |
| `FOLDERA_MASTER_BIBLE.md` | Product doctrine, north star, and product operating system (reference authority, merged by #240). |
| `AGENTS.md` | The single agent execution contract. `CLAUDE.md`, `.cursorrules`, `.cursor/rules/agent.mdc` are pointers to it. |
| `README.md` | Repo entrypoint and local commands. |
| `SESSION_HISTORY.md` / `LESSONS_LEARNED.md` | Append-only history. Never current control. |
| `docs/SOURCE_OF_TRUTH_MAP.md` | This ledger. |

## Conflict rule

`ACTIVE_HANDOFF.md` plus the active GitHub issue beat everything else. Gate/CI/runtime proof beats prose. Archived and deleted files cannot control work; git history is the archive.

## Anti-regrowth rule

A new governance rule may only be added by editing an existing keep-list file, never by creating a new file. `npm run gate:continuity` enforces this mechanically by capping the root markdown file count.

## Enforcement

`npm run gate:continuity` (also run by PR Sentinel in CI) checks: keep-list files exist, root markdown count is bounded, `ACTIVE_HANDOFF.md` names exactly one seam and stays <= 80 lines, handoff/build-order/contract agree on the active issue, and the PR template keeps the source-truth closeout section.
