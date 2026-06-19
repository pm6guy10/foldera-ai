# Next-Session Hardening Prompt — fix every code-fixable thing, end to end

> Paste the mission below into a fresh Foldera session. It carries every concrete
> finding from the 2026-06-19 repo + Supabase audit (see issue #420) so the new
> session needs zero rediscovery. "One shot" = one session that works the entire
> backlog as a sequence of clean, batched, themed PRs — the continuity gate
> enforces one seam per PR, so respect that; do not cram everything into one commit.

---

## MISSION: Harden the entire Foldera app

You are a senior operator with full ownership. Work the ENTIRE backlog below to
completion in this session, as a sequence of clean, batched, themed PRs.

### BOOT (do this first)
1. Read `ACTIVE_HANDOFF.md`, then `AGENTS.md` (the execution contract), then issue
   **#420** (the operating roadmap — your master punch list).
2. Confirm clean state: `git status`, `npm run gate:continuity`, `npm run build`,
   `npm run lint`. Main should be clean / between-rungs.
3. For EACH batch: open a GitHub issue, branch `claude/<slug>`, scope
   `.foldera-contract.json` + roll the control plane (`ACTIVE_HANDOFF` /
   `ACTIVE_SEAM_STATE` / `FOLDERA_BUILD_ORDER`), implement, prove
   (`gate:continuity` + `build` + `lint` + touched-file `tsc`), open a draft PR,
   mark ready, squash-merge, then roll the control plane back to between-rungs.
   **NO paid LLM/API calls** — prove everything in the harness. Push with
   `git push -u origin <branch>`.

### BATCH 1 — Delete dead code (verified zero-import orphans)
Delete, and update any meta-tests that reference them
(`tests/config/__tests__/component-surface.test.ts`,
`tests/config/__tests__/large-file-splits.test.ts`):
- Components: `components/BuildMarker.tsx`; the dead dashboard cluster
  `components/dashboard/{DashboardArtifactBody,DashboardChromeExtras,DashboardContextRail,DashboardDesktopStage,DashboardMobileLayout,DashboardSecondaryPanel,DashboardWorkspacePanels,DashboardStateCards,DashboardStatsStrip,DocumentCollectionIntakePanel,SignalIcon,SourceNeededBriefCard,conviction-card,foldera-dashboard-pixel-lock,trial-banner}.tsx`;
  `components/foldera/{DailyUtilitySlateCard,EmptyStateCard,MobilePreview,SignalToBriefFlow}.tsx`;
  `components/ui/status-indicator.tsx`.
- App: `app/dashboard/use-dashboard-source-status.ts`, and
  `app/dashboard/dashboard-page-model.tsx` (orphaned once the cluster is gone —
  verify, then remove).
- Lib: `lib/cold-read.ts`, `lib/utils/request-ip.ts`, `lib/utils/retry.ts`
  (dead re-export — also clean `lib/utils/index.ts`), `lib/agents/index.ts`
  (dead barrel).
- Re-verify zero references repo-wide before each delete; `npm run build` stays green.

### BATCH 2 — Type safety (103 tsc errors, all in test files)
- Add a `typecheck` npm script (`tsc --noEmit`) and STOP excluding `tests/` +
  `scripts/` in `tsconfig.json` so regressions get caught.
- Fix the named files first: `lib/__tests__/multi-user-safety.test.ts` (4 — cast
  mocks `as unknown as SupabaseClient`),
  `lib/briefing/__tests__/artifact-decision-enforcement.test.ts` (2).
- Fix the stale import `lib/briefing/__tests__/low-cross-signal-discrepancy.test.ts:3`
  (`GeneratedDirectivePayload` no longer exported — find the renamed type).
- Drive the remaining ~95 to zero (biggest clusters:
  `positive-winner-contract.test.ts` 17, `daily-brief.test.ts` 9,
  `scorer-stale-dated-event-filter.test.ts` 7) — mostly missing fields on
  `ScoreBreakdown` / `GenerationCandidateSource` / `WorkdayPresenceState` /
  `EvidenceItem` fixtures. Goal: `npm run typecheck` clean.

### BATCH 3 — Privacy / logging hygiene
- Gate the verbose auth tracing behind a `FOLDERA_DEBUG_AUTH` flag (do not log
  emails / user IDs in prod): `lib/auth/auth-options.ts:258-325`,
  `lib/auth/supabase-auth-user.ts:24-105`, `app/api/google/callback/route.ts:119`,
  `app/api/microsoft/callback/route.ts:154`.
- Remove debug `console.log('BAD1'/'VALID1'...)` in
  `lib/briefing/__tests__/usefulness-gate.test.ts`.

### BATCH 4 — Config & docs hygiene
- Add missing vars to `.env.example` (secret/required): `SLACK_BOT_TOKEN`,
  `SLACK_SIGNING_SECRET`, `AZURE_AD_TENANT_ID`, `ENCRYPTION_KEY_LEGACY`,
  `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID`, `GITHUB_TOKEN`; document the
  feature flags (`ALLOW_PAID_LLM`, `ALLOW_APPROVAL_EMAIL_SEND`,
  `FOLDERA_SELF_USER_ID`, `FOLDERA_SLACK_SELF_CHANNEL_ID`, etc.).
- Remove the dead `/pricing 404` skip branch at
  `tests/production/smoke.spec.ts:473` (route exists). Resolve or ticket the lone
  real TODO `lib/briefing/conviction-engine.ts:454`.

### BATCH 5 — Supabase (PROPOSE migration; do not apply without owner OK)
- Draft a migration dropping the two unused indexes (`idx_ml_snapshots_user` on
  `tkg_directive_ml_snapshots`, `idx_tkg_goals_entity_id` on `tkg_goals`). Put it
  in a PR for sign-off; do not run against prod.

### OUT OF SCOPE — escalate to the owner; do NOT attempt (and say so clearly)
- **Env vars in Vercel** (`ANTHROPIC_API_KEY` is the one that brings the engine
  alive; also Slack / `CRON_SECRET`) — owner-only.
- **Supabase Auth toggles** (leaked-password protection, MFA) — dashboard, owner-only.
- **Tier 1 selection layer** (commitments have uniform `risk_score=0`) — needs paid
  LLM validation + a cost ceiling. Design only; do not build without explicit budget.
- **Pruning ~50 stale remote branches** — no in-env delete path; owner / GitHub UI.

### DONE WHEN
`npm run typecheck` is clean, no dead orphans remain, no auth PII in prod logs,
`.env.example` is complete, `gate:continuity` + `build` + `lint` green, every
batch merged, control plane rolled to between-rungs, and #420 updated with what
shipped vs. what's owner-gated. Report a final scorecard.

---

## The catch worth saying plainly

This makes the **codebase** spotless — but a spotless codebase still produces
nothing until the owner sets **`ANTHROPIC_API_KEY` in Vercel Production** (the one
thing no prompt can do). The engine is otherwise wired: daily generation produces
the artifact, and the free event-driven trigger (#421) surfaces it the moment the
owner opens the app. Set that env var and the loop is live end to end.
