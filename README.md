# Foldera

Foldera is a Workday Presence Layer: state + connectors + triggers + one intervention, quiet otherwise.

## Start Here

1. Read `ACTIVE_HANDOFF.md` — current command state and next exact move.
2. Read the active GitHub issue it names.

`AGENTS.md` is the single agent execution contract. `FOLDERA_MASTER_BIBLE.md` carries product doctrine. `docs/SOURCE_OF_TRUTH_MAP.md` is the keep-list ledger — everything not on it is reference or archive.

## Local Commands

```bash
npm run health
npm run gate:continuity
npm run lint
npm run build
```

Run only the proof that matches the active issue. No paid/model-backed routes, outbound sends, schema changes, or live provider actions unless the active issue requires them and Brandon approves.

## Delivery Contract

One assigned GitHub issue. One clean branch or worktree. One pull request with the required proof. Source-truth closeout and a GitHub receipt before stop.
