# CLAUDE.md — Pointer

`AGENTS.md` is the execution contract for this repo. Read it and follow it.
`README.md` covers how to run and deploy; `VISION.md` covers what Foldera is.

Claude-specific notes:

- This is a Windows machine. Never use heredoc (`<<EOF`) in bash; use the Write/Edit tools for file creation.
- Use worktrees under `.claude/worktrees/` for parallel work; one clean branch per issue.
- Before opening a PR: `npm run build`, `npm run lint`, `npm run test`.
