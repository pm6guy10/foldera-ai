# Prompt rebuild backlog (after baseline + rubric)

**Prerequisite:** [baseline-sample.md](./baseline-sample.md) exists and at least one pass of [rubric.md](./rubric.md) is recorded so prompt changes have something to beat.

Do **not** treat this as a single mega-prompt for Cursor Agent; execute in small sessions.

| Phase | Intent |
| ----- | ------ |
| **1** | Layer prompts (L0–L3), explicit precedence, align system vs user contradictions with `validateGeneratedArtifact` / cross-signal anchors in [`lib/briefing/generator.ts`](../../lib/briefing/generator.ts) |
| **2** | Evidence window (e.g. recipient-short signal cap), anomaly pass truncation or removal — gated on eval |
| **3** | Env-driven writer/researcher model for cost vs quality experiments |
| **4** | Ship loop: `npm run build`, vitest, `npm run test:ci:e2e`, production receipt, `FOLDERA_PRODUCT_SPEC.md` + `SESSION_HISTORY.md` |

**Deferred:** Large mechanical split of `generator.ts` for its own sake (P1 hygiene per `WHATS_NEXT.md`).

**Success:** Rubric scores improve on comparable rows; production approve/skip stable without grounding/banned-phrase regressions.
