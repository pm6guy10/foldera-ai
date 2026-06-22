# AGENTS.md — Execution Contract

One issue → one branch → one PR → done.

- Work one issue at a time on its own branch. Open exactly one PR for it.
- Keep changes scoped to the issue. Don't refactor working code you weren't asked to touch.
- Prove it: `npm run build`, `npm run lint`, and `npm run test` must pass. For UI or
  live-path changes, verify the actual user path, not just green CI.
- No direct commits to `main`. PR review/checks are not optional.
- Read `README.md` for how to run and deploy, and `VISION.md` for what Foldera is.
