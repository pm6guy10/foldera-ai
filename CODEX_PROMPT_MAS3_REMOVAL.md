# Codex Prompt — MAS3 Constraint Removal

Fire this prompt the day the MAS3 hiring window resolves (hired OR rejected).
Copy the block below verbatim into a Claude Code session.

---

```
Read lib/briefing/pinned-constraints.ts in full.

The MAS3 hiring window has resolved. Remove the time-bound constraints:

1. Delete the entire STALE_CONSULTING_ERA_PATTERNS array (lines approx 79–85).
2. Delete the entire OWNER_MAS3_CONSTRAINTS object (lines approx 87–162).
3. In getPinnedConstraints(), return null unconditionally (remove the owner check).
4. Remove the unused OWNER_USER_ID import if nothing else references it.
5. Keep GLOBAL_CANDIDATE_PATTERNS, GLOBAL_DIRECTIVE_PATTERNS, and all exported functions untouched.
6. Run: npx vitest run lib/briefing/__tests__/
7. Run: npm run build
8. Both must pass with no errors before committing.

Commit message:
  feat: retire MAS3 pinned constraints — window resolved

Do not add new constraints. Do not change any other file.
```

---

## What this removes

| Constant | Purpose |
|---|---|
| `STALE_CONSULTING_ERA_PATTERNS` | Suppresses references to Kapp Advisory, Bloomreach, Justworks, etc. |
| `OWNER_MAS3_CONSTRAINTS` | Pins MAS3 as primary lane; blocks consulting/fractional/FPA3 directives |
| `getPinnedConstraints() owner branch` | Routes owner to MAS3 constraints |

After removal, the generator falls back to DB-driven goal weighting only.
No user-facing behavior changes — the brief pipeline continues normally.
