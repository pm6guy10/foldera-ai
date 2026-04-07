# Generator eval artifacts

- **[baseline-sample.md](./baseline-sample.md)** — Frozen sample of 10 latest `tkg_actions` for the owner user (SQL + narrative). **Before picture** for prompt work.
- **[rubric.md](./rubric.md)** — Lightweight 5-dimension 0–2 rubric to score baseline vs future runs.
- **[PROMPT_REBUILD_BACKLOG.md](./PROMPT_REBUILD_BACKLOG.md)** — Deferred phases (layered prompts, evidence/anomaly, model env, ship loop). **Do not start** until baseline is scored with the rubric.

Re-export baseline after major pipeline changes: rerun the SQL in `baseline-sample.md` and replace the results section (keep query + preamble pattern).
