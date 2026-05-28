# Source Of Truth Map

Last updated: 2026-05-28 PT

Issue #80 owns this authority ledger.

## Purpose

This file is Foldera's repo-control authority ledger.

It governs how operators, reviewers, and coding agents decide what controls work in this repository.

It is not product doctrine. Issue #48 and `FOLDERA_OPERATING_SYSTEM.md` control product doctrine. This file controls repo authority, conflict resolution, stale-doc containment, and proof expectations.

## Canonical Boot Sequence

For any Foldera task, use this order:

1. Read `ACTIVE_HANDOFF.md`.
2. Read `FOLDERA_LAUNCH_ROADMAP.md`.
3. Read the active issue named by `ACTIVE_HANDOFF.md`.
4. Read issue #48 for product doctrine.
5. Read relevant execution/proof docs only for the active seam.
6. Check latest open PRs and recent merged PRs when repo/deploy truth matters.
7. Use Vercel/Supabase only when the seam requires live/runtime truth.

## Authority Classes

| Class | Definition |
| --- | --- |
| `CURRENT_CONTROL` | Current command state that may actively direct work in this repo right now. |
| `EXECUTION_CONTRACT` | Operator or agent execution rules that define how work must be performed and reported. |
| `PROOF_GATE` | Verification truth that decides whether a seam is actually proven. |
| `REFERENCE_ONLY` | Useful context that may inform work, but must never select the active seam or override current control. |
| `HISTORICAL_ARCHIVE` | Historical material retained for receipts or archaeology only; not valid for current execution decisions. |
| `STALE_REMOVE_OR_ARCHIVE` | Known stale artifact that must not control work and should be regenerated, removed, or archived when the owning seam authorizes it. |

## Conflict Resolution

When sources disagree, use this order:

1. Explicit GitHub source truth plus `ACTIVE_HANDOFF.md` beat chat memory, local branch history, and old receipts.
2. The active issue named by `ACTIVE_HANDOFF.md` beats backlog, audit, and reference documents.
3. Issue #48 plus `FOLDERA_OPERATING_SYSTEM.md` beat older product-spec framing.
4. Gate, CI, and browser or runtime proof beat prose claims.
5. Stale, archived, or reference-only files cannot control implementation even if they contain detailed instructions.
6. If a rule is not enforced by a gate, CI check, required file, or test, treat it as guidance until enforcement exists.

## Authority Ledger

| File / Source | Status | Why It Exists | Who Or What May Rely On It | What It Must Never Control | Enforcement Mechanism |
| --- | --- | --- | --- | --- | --- |
| `ACTIVE_HANDOFF.md` | `CURRENT_CONTROL` | Names the single active seam, current truth, and next exact move. | Every Foldera session, reviewer, and agent boot. | Old roadmap order, unrelated issues, or broad cleanup outside the named seam. | `npm run gate:continuity` requires exactly one active seam line and roadmap/product references. |
| `FOLDERA_LAUNCH_ROADMAP.md` | `CURRENT_CONTROL` | Holds the long-form launch order and continuity policy. | Operators and agents deciding issue order or stop conditions. | Product doctrine by itself, or authority to override the active issue. | `npm run gate:continuity` checks for boot-sequence alignment and roadmap presence. |
| GitHub issue named by `ACTIVE_HANDOFF.md` | `CURRENT_CONTROL` | Defines the one assigned implementation seam. | The current assignee, reviewer, and PR author. | Unassigned side quests, backlog grooming, or unrelated fixes. | Manual boot-sequence read plus PR scope review. |
| GitHub issue #48 | `CURRENT_CONTROL` | Holds the Workday Presence Layer product contract. | Product reviewers, agents, and humans checking launch doctrine. | Historical Brandon-command-center behavior or dashboard/task-list drift. | Boot sequence plus explicit issue reference across control docs. |
| `FOLDERA_OPERATING_SYSTEM.md` | `CURRENT_CONTROL` | Defines Foldera's canonical product worldview. | Humans and agents checking what Foldera is and is not. | Repo execution order by itself, or stale issue selection. | `npm run gate:continuity` verifies boot-sequence alignment; issue #48 remains the doctrine anchor. |
| `docs/SOURCE_OF_TRUTH_MAP.md` | `CURRENT_CONTROL` | Explains repo authority, stale-doc classes, review rules, and proof requirements. | Reviewers, agents, and maintainers validating repo hygiene. | Product doctrine, feature scope expansion, or runtime behavior claims. | This file is required by `npm run gate:continuity`. |
| `CODEX_START.md` | `EXECUTION_CONTRACT` | Defines Codex startup order, gate-first behavior, and live-truth requirements. | Codex operators and agent sessions. | Product doctrine overrides or competing active seam selection. | `npm run gate:continuity` checks canonical boot sequence text. |
| `AGENTS.md` | `EXECUTION_CONTRACT` | Defines repo-specific behavioral rules for coding agents. | Codex and agent runners operating in-repo. | Conflicting boot order, product redefinition, or unrelated issue work. | `npm run gate:continuity` checks canonical boot sequence text. |
| `CLAUDE.md` | `EXECUTION_CONTRACT` | Compatibility operator runbook for alternate agent tooling. | Claude or other non-Codex operators. | Separate source-of-truth hierarchy or seam selection logic. | `npm run gate:continuity` checks canonical boot sequence text. |
| `GPT.md` | `EXECUTION_CONTRACT` | Owner and PM verification contract for GPT-style execution. | GPT operators and reviewers. | A second product doctrine or a different issue wrapper. | `npm run gate:continuity` checks canonical boot sequence text. |
| `SYSTEM_RUNBOOK.md` | `EXECUTION_CONTRACT` | Defines operating plan and tool boundaries. | Humans and agents deciding how to verify or escalate. | Current seam ownership or product direction changes. | `npm run gate:continuity` checks canonical boot sequence text. |
| `README.md` | `EXECUTION_CONTRACT` | Gives the operator-grade repo entrypoint, gates, and scope rules. | New operators, reviewers, and repository readers. | Feature planning, product doctrine override, or stale default framework instructions. | `npm run gate:continuity` rejects default Next.js boilerplate markers. |
| `.github/pull_request_template.md` | `EXECUTION_CONTRACT` | Forces PR receipts to declare issue, proof, scope, and stop condition. | PR authors and reviewers. | Active seam selection outside GitHub issue truth. | File existence checked by `npm run gate:continuity`; reviewers enforce filled receipt sections. |
| `.github/workflows/pr-sentinel.yml` | `EXECUTION_CONTRACT` | Makes continuity enforcement run in CI. | GitHub Actions and reviewers. | Product proof, runtime correctness, or expensive integration validation. | `npm run gate:continuity` confirms PR Sentinel runs the continuity gate. |
| `scripts/continuity-gate.ts` | `EXECUTION_CONTRACT` | Cheap deterministic meta-gate for source-truth continuity. | Local operators and CI. | Product quality proof, browser proof, or live system health by itself. | Invoked by `npm run gate:continuity`. |
| `package.json` | `EXECUTION_CONTRACT` | Exposes the continuity, lint, build, and health commands operators must run. | Humans, CI, and agents executing proof. | Product doctrine, issue selection, or stale-doc classification by itself. | Script presence checked indirectly by `npm run gate:continuity`. |
| `ACCEPTANCE_GATE.md` | `PROOF_GATE` | Defines what proof counts as done at the product level. | Reviewers and agents deciding DONE vs NOT DONE. | Picking the active seam or overriding issue scope. | Top authority marker checked by `npm run gate:continuity`. |
| `CURRENT_STATE.md` | `PROOF_GATE` | Captures current runtime blockers and environment truth. | Operators only when the active seam needs live/runtime state. | Default startup order for every task. | Read by judgment; authority class recorded here. |
| `SESSION_HISTORY.md` | `REFERENCE_ONLY` | Keeps append-only recent receipts. | Humans checking prior outcomes or proof history. | Current command state, next issue, or repo doctrine. | Classification in this ledger; reviewers reject attempts to use it as current control. |
| `BRANDON.md` | `REFERENCE_ONLY` | Preserves product taste and judgment when a seam needs feel decisions. | Humans or agents resolving style/tone questions within scope. | Active seam selection, product doctrine replacement, or broad feature authority. | Classification in this ledger. |
| `FOLDERA_PRODUCT_SPEC.md` | `REFERENCE_ONLY` | Retains older spec detail for historical context. | Operators doing archaeology or comparing older assumptions. | Current doctrine, launch order, or current active work. | Top authority marker checked by `npm run gate:continuity`. |
| `FOLDERA_PRODUCTION_BACKLOG.md` | `REFERENCE_ONLY` | Preserves backlog context and older sequencing notes. | Humans checking historical backlog decisions. | The active seam or launch priority when GitHub and handoff disagree. | Top authority marker checked by `npm run gate:continuity`. |
| `FOLDERA_MASTER_AUDIT.md` | `REFERENCE_ONLY` | Retains audit evidence and earlier findings. | Humans tracing prior evidence. | Current execution or scope selection. | Top authority marker checked by `npm run gate:continuity`. |
| `FOLDERA_SHIP_SPEC.md` | `HISTORICAL_ARCHIVE` | Stores historical launch/spec framing. | Archaeology only. | Present-day launch direction, product doctrine, or implementation scope. | Top authority marker checked by `npm run gate:continuity`. |
| `WHATS_NEXT.md` | `HISTORICAL_ARCHIVE` | Preserves an older status log. | Archaeology only. | Current next move, active seam, or handoff logic. | Top authority marker checked by `npm run gate:continuity`. |
| `.foldera-contract.json` | `STALE_REMOVE_OR_ARCHIVE` | Preserves a stale generated contract until a current controller regenerates it safely. | Reference-only debugging for old issue history. | Any current issue scope, file allowlist, proof requirement, or stop condition. | `npm run gate:continuity` fails if the old issue #62 contract is still treated as active. |

## Reviewer Checklist

Before approving an issue PR, answer all of these:

1. Does `ACTIVE_HANDOFF.md` name exactly one seam?
2. Does the PR touch only files allowed by the active issue?
3. Does any changed doc create a competing source of truth?
4. Does `npm run gate:continuity` enforce the claimed continuity rule, or is the rule only prose?
5. Does the PR receipt state what did not change and what remains blocked?
6. If a stale file remains in place, is it clearly classified so it cannot masquerade as current control?

## Forbidden Broad Work

This authority ledger does not authorize:

- product behavior changes
- Slack, OAuth, API-send, or connector implementation work
- backend, auth, Supabase, schema, or Stripe changes
- landing, dashboard, scoring, or conviction changes
- broad cleanup outside the active issue
- archive sweeps, file moves, or deletions unless the active issue explicitly requires them
- a second competing doctrine or hygiene file that duplicates this ledger

## Proof

For issue #80 authority-ledger work, the required proof commands are:

- `npm run gate:continuity`
- `npm run lint`
- `npm run build`
- `npm run health`

Passing prose is not proof. The PR receipt must report the changed-file list, command results, and an explicit statement that no product behavior changed.

## Enforcement Summary

`npm run gate:continuity` is the cheap deterministic continuity backstop. It currently enforces:

- required source-truth files exist
- canonical boot sequence text is aligned across boot docs
- `ACTIVE_HANDOFF.md` names exactly one active seam
- `ACTIVE_HANDOFF.md` still references `FOLDERA_LAUNCH_ROADMAP.md` and issue #48
- stale active-looking docs keep their top authority markers
- `.foldera-contract.json` cannot keep the old issue #62 contract active
- `README.md` cannot regress to default Next.js boilerplate
- PR Sentinel must run the continuity gate

Use this file to decide authority. Use issue #48 and `FOLDERA_OPERATING_SYSTEM.md` to decide what Foldera is. Use the active issue to decide what to change now.
