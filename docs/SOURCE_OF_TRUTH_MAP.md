# Source Of Truth Map

Last updated: 2026-06-04 PT

Issue #80 owns this authority ledger. Issue #113 extends enforcement for source-truth closeout and agent governance drift.

## Purpose

This file is Foldera's repo-control authority ledger.

It governs how operators, reviewers, and coding agents decide what controls work in this repository.

It is not product doctrine. Issue #48 and `FOLDERA_OPERATING_SYSTEM.md` carry product doctrine, while `FOLDERA_NORTH_STAR_LOCK.md` controls current product doctrine. This file controls repo authority, conflict resolution, stale-doc containment, and proof expectations.

Current product-direction split:

- `FOLDERA_NORTH_STAR_LOCK.md` controls product doctrine.
- `FOLDERA_PRODUCT_OPERATING_SYSTEM.md` controls roadmap, phase order, backlog lanes, business roadmap, enterprise path, owner-burden rule, and next-seam recommendation.
- GitHub issue #175 `Rung 2: audit current schema and choose first evidence lane` controls the active read-only schema/evidence-lane audit seam.
- GitHub issue #173 `Promote first executable MVP rung from Master Synthesis` is completed/superseded by PR #174.
- `FOLDERA_MASTER_SYNTHESIS_DRAFT.md` is `REFERENCE_DRAFT`: build-bible-ready source material only, not implementation authority.
- GitHub issue #170 `Foldera Master Synthesis Lock Pass - customer, deliverable, build spec, and issue ladder` is completed/superseded by PR #172.
- GitHub issue #166 `Repo Intake Governor v0 - classify owner input into repo truth` is completed/superseded as the active seam by PR #167.
- GitHub issue #165 `Open Threads - Foldera Owner Whiteboard` is the raw-input inbox. Open Threads captures raw thoughts; it does not authorize implementation.
- `docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md` remains proof doctrine/reference; placeholder rows are not evidence.
- `FOLDERA_LAUNCH_ROADMAP.md` is historical/reference unless a future GitHub issue explicitly reconciles it.

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
| `FOLDERA_BUILD_ORDER.yaml` | `CURRENT_CONTROL` | Machine-readable active issue, paused issues, source-truth order, terminal states, and closeout requirements. | Agents, reviewers, and gates checking current issue order. | Product doctrine or feature scope by itself. | `npm run gate:continuity` checks active issue parity, closeout values, and next-seam closeout. |
| `FOLDERA_LAUNCH_ROADMAP.md` | `REFERENCE_ONLY` | Preserves historical launch order and continuity policy from earlier rungs. | Operators and agents doing archaeology or checking stale launch assumptions. | Current active seam, product doctrine, roadmap phase order, or next-seam selection unless a future issue reconciles it. | Authority classification here plus active handoff/build-order; `npm run gate:continuity` still checks roadmap presence and boot-sequence alignment. |
| GitHub issue named by `ACTIVE_HANDOFF.md` | `CURRENT_CONTROL` | Defines the one assigned implementation seam. | The current assignee, reviewer, and PR author. | Unassigned side quests, backlog grooming, or unrelated fixes. | Manual boot-sequence read plus PR scope review. |
| GitHub issue #48 | `CURRENT_CONTROL` | Holds the Workday Presence Layer product contract. | Product reviewers, agents, and humans checking launch doctrine. | Historical Brandon-command-center behavior or dashboard/task-list drift. | Boot sequence plus explicit issue reference across control docs. |
| `FOLDERA_OPERATING_SYSTEM.md` | `CURRENT_CONTROL` | Defines Foldera's canonical product worldview. | Humans and agents checking what Foldera is and is not. | Repo execution order by itself, or stale issue selection. | `npm run gate:continuity` verifies boot-sequence alignment; issue #48 remains the doctrine anchor. |
| `FOLDERA_NORTH_STAR_LOCK.md` | `CURRENT_CONTROL` | Reconciles product promise, buyer, pricing, public site, day-one app, runtime brain, Right Now, live rail boundary, issue order, gates, PR traceability, pilot readiness, and Brandon cognitive-load constraints. | Product/business/UX/runtime reviewers, PR authors, and agents when direction is implicated. | A second active issue, product implementation by itself, or permission to widen Slack/live rail, landing, Supabase, Stripe, package, connector, Teams/email/calendar, or dashboard work. | `npm run gate:command` verifies the file exists and required traceability/control language is present; `npm run gate:continuity` verifies the PR template requires North Star citation when direction is implicated. |
| `FOLDERA_PRODUCT_OPERATING_SYSTEM.md` | `CURRENT_CONTROL` | Converts the North Star into roadmap phases, backlog lanes, proof gates, business roadmap, enterprise-readiness path, owner-burden rule, and next-seam recommendation. | Agents, reviewers, and maintainers deciding phase order, allowed next seams, business/enterprise claims, and whether a PR advances the correct rung. | Product doctrine replacement, active seam selection outside GitHub issue truth, product/runtime implementation by itself, or permission to claim enterprise, pilot, or customer proof without the named gate. | `npm run gate:command` verifies the file exists and required phase/backlog/business/enterprise/owner-burden markers are present; PR receipts must cite/update/close it out when direction is implicated. |
| GitHub issue #175 `Rung 2: audit current schema and choose first evidence lane` | `CURRENT_CONTROL` | Defines the active read-only audit seam for current schema/state/evidence support and first evidence-lane selection. | The current assignee, reviewer, PR author, and source-truth gates for issue #175. | Product/runtime/frontend/backend implementation, Supabase migrations or data mutation, Vercel changes, Slack / PR #142, Stripe, connectors, landing/dashboard/auth/backend, fake schema/customer/compliance claims, or starting Rung 3 before audit closeout. | `npm run gate:command`, `npm run gate:continuity`, focused source-truth tests, PR changed-file review, and GitHub receipts. |
| GitHub issue #173 `Promote first executable MVP rung from Master Synthesis` | `REFERENCE_ONLY` | Completed first executable MVP rung promotion retained for receipt history and future routing context. | Agents and reviewers tracing PR #174 or validating why Rung 2 is now active. | Active seam selection, product/runtime work, or reopening first-rung promotion in issue #175. | FOLDERA_BUILD_ORDER.yaml marks issue #173 completed/superseded by PR #174. |
| GitHub issue #170 `Foldera Master Synthesis Lock Pass - customer, deliverable, build spec, and issue ladder` | `REFERENCE_ONLY` | Completed build-bible reference-draft seam retained for receipt history and future routing context. | Agents and reviewers tracing PR #172 or validating why the build bible is now source material. | Active seam selection, product/runtime work, or reopening the Master Synthesis build-bible implementation in issue #173. | FOLDERA_BUILD_ORDER.yaml marks issue #170 completed/superseded by PR #172. |
| `FOLDERA_MASTER_SYNTHESIS_DRAFT.md` | `REFERENCE_DRAFT` | Preserves the Master Synthesis build bible in repo as reference-only source material. | Future source-truth/build-definition issues when explicitly assigned. | Current implementation authority, active seam selection, product/runtime changes, schema migrations, deployment changes, or customer/enterprise claims. | Issue #175 source-truth gate checks `REFERENCE_DRAFT`, `READINESS VERDICT`, `build-bible ready as a reference draft`, and explicit `not implementation authority` language. |
| GitHub issue #166 `Repo Intake Governor v0 - classify owner input into repo truth` | `REFERENCE_ONLY` | Completed Command OS v0 implementation seam retained for receipt history and future routing context. | Agents and reviewers tracing PR #167 or future command-rail context. | Active seam selection, product/runtime work, or reopening Command OS implementation in issue #170. | FOLDERA_BUILD_ORDER.yaml marks issue #166 completed/superseded by PR #167. |
| GitHub issue #165 `Open Threads - Foldera Owner Whiteboard` | `CURRENT_CONTROL` | Provides a durable raw-input inbox for Brandon's raw Foldera thoughts before they become source truth. | Owners and agents capturing unclassified thoughts that must later be routed by Repo Intake Governor. | Implementation authority, active seam selection, duplicate issue creation by itself, labels/projects as authority, or product scope expansion. | Repo Intake Governor fixtures must prove Open Threads is capture-only and never implementation authority. |
| `docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md` | `PROOF_GATE` | Preserves first-10 ICP proof doctrine and customer-evidence taxonomy. | Future customer-proof, pricing, channel, public-claim, and non-owner proof issues when evidence exists. | Active work selection by itself, fake customer evidence, placeholder rows as proof, outreach automation, scraping, paid ads, or product implementation. | Required file and issue #159 scope; source-truth gates check it remains present and subordinate; PR changed-file review blocks treating placeholders as proof. |
| `docs/SOURCE_OF_TRUTH_MAP.md` | `CURRENT_CONTROL` | Explains repo authority, stale-doc classes, review rules, and proof requirements. | Reviewers, agents, and maintainers validating repo hygiene. | Product doctrine, feature scope expansion, or runtime behavior claims. | This file is required by `npm run gate:continuity`. |
| `CODEX_START.md` | `EXECUTION_CONTRACT` | Defines Codex startup order, gate-first behavior, PR workflow, and live-truth requirements. | Codex operators and agent sessions. | Product doctrine overrides or competing active seam selection. | `npm run gate:continuity` checks canonical boot sequence and agent-governance rules. |
| `AGENTS.md` | `EXECUTION_CONTRACT` | Defines repo-specific behavioral rules for coding agents. | Codex and agent runners operating in-repo. | Conflicting boot order, product redefinition, direct-main work, or unrelated issue work. | `npm run gate:continuity` checks canonical boot sequence and agent-governance rules. |
| `CLAUDE.md` | `EXECUTION_CONTRACT` | Compatibility operator runbook for alternate agent tooling. | Claude or other non-Codex operators. | Separate source-of-truth hierarchy, direct-main workflow, or seam selection logic. | `npm run gate:continuity` checks canonical boot sequence and agent-governance rules. |
| `GPT.md` | `EXECUTION_CONTRACT` | Owner and PM verification contract for GPT-style execution. | GPT operators and reviewers. | A second product doctrine, a different issue wrapper, or acceptance of Codex claims without proof. | `npm run gate:continuity` checks canonical boot sequence and agent-governance rules. |
| `.cursorrules` | `EXECUTION_CONTRACT` | Cursor-specific operator shim aligned to the canonical one-seam PR workflow. | Cursor sessions operating in-repo. | Direct-main work, auto-continuation, or stale session habit. | `npm run gate:continuity` checks canonical boot sequence and agent-governance rules. |
| `.cursor/rules/agent.mdc` | `EXECUTION_CONTRACT` | Cursor agent protocol shim aligned to the canonical one-seam PR workflow. | Cursor agent sessions operating in-repo. | Direct-main work, auto-continuation, product doctrine replacement, or bypassing GitHub receipts. | `npm run gate:continuity` checks required governance language and forbidden drift patterns. |
| `SYSTEM_RUNBOOK.md` | `EXECUTION_CONTRACT` | Defines operating plan and tool boundaries. | Humans and agents deciding how to verify or escalate. | Current seam ownership or product direction changes. | `npm run gate:continuity` checks canonical boot sequence text. |
| `README.md` | `EXECUTION_CONTRACT` | Gives the operator-grade repo entrypoint, gates, and scope rules. | New operators, reviewers, and repository readers. | Feature planning, product doctrine override, or stale default framework instructions. | `npm run gate:continuity` rejects default Next.js boilerplate markers. |
| `.github/pull_request_template.md` | `EXECUTION_CONTRACT` | Forces PR receipts to declare issue, proof, scope, stop condition, next seam, and source-truth closeout. | PR authors and reviewers. | Active seam selection outside GitHub issue truth. | `npm run gate:continuity` checks closeout section, required files, allowed closeout values, and next-seam section. |
| `.github/workflows/pr-sentinel.yml` | `EXECUTION_CONTRACT` | Makes continuity enforcement run in CI. | GitHub Actions and reviewers. | Product proof, runtime correctness, or expensive integration validation. | `npm run gate:continuity` confirms PR Sentinel runs the continuity gate. |
| `scripts/continuity-gate.ts` | `EXECUTION_CONTRACT` | Cheap deterministic meta-gate for source-truth continuity and agent-governance drift. | Local operators and CI. | Product quality proof, browser proof, or live system health by itself. | Invoked by `npm run gate:continuity`. |
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
2. Does `FOLDERA_BUILD_ORDER.yaml active_issue` match the handoff seam?
3. Does the PR touch only files allowed by the active issue?
4. Does any changed doc create a competing source of truth?
5. Does `npm run gate:continuity` enforce the claimed continuity rule, or is the rule only prose?
6. Does the PR receipt state what did not change and what remains blocked?
7. Does the PR receipt close out every required source-truth file as `updated`, `unchanged - reason`, or `not applicable - reason`?
8. If a stale file remains in place, is it clearly classified so it cannot masquerade as current control?

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

For source-truth / authority-ledger work, the required proof commands are:

- `npm run gate:continuity`
- `npm run lint`
- `npm run build`

Passing prose is not proof. The PR receipt must report the changed-file list, command results, source-truth closeout, and an explicit statement that no product behavior changed.

## Enforcement Summary

`npm run gate:continuity` is the cheap deterministic continuity backstop. It currently enforces:

- required source-truth files exist
- canonical boot sequence text is aligned across boot docs
- `ACTIVE_HANDOFF.md` names exactly one active seam
- `ACTIVE_HANDOFF.md` active issue matches `FOLDERA_BUILD_ORDER.yaml active_issue`
- `FOLDERA_BUILD_ORDER.yaml` includes source-truth closeout requirements
- `.github/pull_request_template.md` includes required source-truth closeout rows, closeout values, and next-seam section
- product/business/UX/runtime PRs must cite `FOLDERA_NORTH_STAR_LOCK.md` when direction is implicated
- agent governance docs include one-seam / PR-flow / source-truth closeout doctrine
- agent governance docs do not contain known direct-main or auto-continuation drift phrases
- `ACTIVE_HANDOFF.md` still references `FOLDERA_LAUNCH_ROADMAP.md` and issue #48
- stale active-looking docs keep their top authority markers
- `.foldera-contract.json` cannot keep the old issue #62 contract active
- `README.md` cannot regress to default Next.js boilerplate
- PR Sentinel must run the continuity gate

Use this file to decide authority. Use issue #48, `FOLDERA_OPERATING_SYSTEM.md`, and `FOLDERA_NORTH_STAR_LOCK.md` to decide what Foldera is. Use `FOLDERA_PRODUCT_OPERATING_SYSTEM.md` to decide roadmap phase, backlog lane, business path, enterprise path, and next-seam recommendation. Use the active issue to decide what to change now.
