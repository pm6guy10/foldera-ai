# CLAUDE.md — Pointer Contract

`AGENTS.md` is the single agent execution contract for this repo. Read it and follow it exactly.

Boot sequence for any Foldera task:

1. Read `C:\Users\b-kap\.claude\projects\C--Users-b-kap-foldera-ai\memory\MEMORY.md` (session memory — cross-session facts, feedback, and project state).
2. Read `ACTIVE_HANDOFF.md`.
3. Read the active issue it names.

Claude-specific notes:

- This is a Windows machine. Never use heredoc (`<<EOF`) in bash; use the Write/Edit tools for file creation.
- Use worktrees under `.claude/worktrees/` for parallel work; one clean branch per issue.
- Run `npm run gate:continuity` before opening a PR; it is the single deterministic governance gate.
- A new governance rule may only be added by editing an existing keep-list file (see `AGENTS.md`), never by creating a new file.
- Friction reduction is standing authorization (see `AGENTS.md` → "Friction Reduction — Standing Authorization"): every session cuts process friction and cruft by default, without re-asking — only the hard safety rails require sign-off.
