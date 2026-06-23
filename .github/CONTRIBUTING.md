# Contributing to Foldera

Foldera runs on a single execution contract. Before any change, read:

1. **`AGENTS.md`** — the agent execution contract (scope, proof, closeout).
2. **`ACTIVE_HANDOFF.md`** — current command state and the next exact move.

## Working agreement

- One change, one clean branch, one PR with the required proof.
- The repo is **allow-by-default minus a hard forbidden set** — see `.foldera-contract.json`. Hard rails (never relaxed without owner sign-off): no Stripe / Scout / `supabase/migrations` / secrets changes, and no auto-send.
- Every scoring/quality-gate change carries a test **plus** a before/after read. No "done" without real product proof.
- Reduce friction by default (see `AGENTS.md` → "Friction Reduction — Standing Authorization").

## Local checks

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

External contributions: open an issue first.
