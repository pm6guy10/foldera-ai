# Foldera

Foldera is a Workday Presence Layer: state + connectors + triggers + one intervention, quiet otherwise.

## Source Truth

Start every repo task from the current control chain:

1. `ACTIVE_HANDOFF.md`
2. `FOLDERA_LAUNCH_ROADMAP.md`
3. the active GitHub issue named by `ACTIVE_HANDOFF.md`
4. issue #48 for product doctrine
5. relevant execution/proof docs only for the active seam

`docs/SOURCE_OF_TRUTH_MAP.md` classifies the root doctrine, execution, proof, reference, archive, and stale files.

## Local Commands

```bash
npm run health
npm run gate:continuity
npm run lint
npm run build
```

Run only the proof that matches the active issue. Do not use paid/model-backed routes, outbound sends, schema changes, or live provider actions unless the active issue explicitly requires them and Brandon approves the step.

## Delivery Contract

- One assigned GitHub issue.
- One clean branch or worktree.
- One pull request.
- Required proof in the PR.
- Stop after proof is reported unless the active issue explicitly requires merge/deploy follow-through.

Do not broaden into Slack/OAuth/API/send work, backend/auth/Supabase/schema/Stripe changes, landing/dashboard work, or stale-doc cleanup unless the active issue says so.
