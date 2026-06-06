# Source Of Truth Map

Last updated: 2026-06-06 PT

Issue #80 owns this authority ledger. Issue #113 extends enforcement for source-truth closeout and agent governance drift.

## Purpose

This file is Foldera's repo-control authority ledger.

It governs how operators, reviewers, and coding agents decide what controls work in this repository.

It is not product doctrine. Issue #48, `FOLDERA_NORTH_STAR_LOCK.md`, and `FOLDERA_PRODUCT_OPERATING_SYSTEM.md` carry product doctrine, while `FOLDERA_OPERATING_SYSTEM.md` and `FOLDERA_LAUNCH_ROADMAP.md` are shims. This file controls repo authority, conflict resolution, stale-doc containment, and proof expectations.

Current product-direction split:

- `FOLDERA_NORTH_STAR_LOCK.md` controls product doctrine.
- `FOLDERA_PRODUCT_OPERATING_SYSTEM.md` controls roadmap, phase order, backlog lanes, business roadmap, enterprise path, owner-burden rule, and next-seam recommendation.
- `FOLDERA_MASTER_BIBLE.md` is the canonical master-bible reference authority promoted by PR #191.
- `FOLDERA_OPERATING_SYSTEM.md` and `FOLDERA_LAUNCH_ROADMAP.md` are shim files that point at the canonical control chain.
- `FOLDERA_EXECUTION_QUEUE.yaml` is inactive/reference-only until a future explicit activation issue reopens it, and its historical supreme-authority language is neutralized in-file.
- `FOLDERA_PRODUCT_SPEC_NEXT.md`, `FOLDERA_GITHUB_ISSUE_PR_PLAN.md`, `FOLDERA_BUILD_SPEC.md`, `FOLDERA_CAPABILITY_MAP.md`, `FOLDERA_QUEUE_GENERATION_RULES.md`, and `FOLDERA_EXECUTION_QUEUE_NEXT_DRAFT.yaml` are the bundled executable planning-layer artifacts for the locked revenue ladder; they are reference-draft material, not a second authority tower.
- GitHub issue #181 / PR #191 is the single promotion path for that master-bible execution-layer bundle.
- GitHub issue #192 is the completed source-truth closeout issue that aligned the handoff and build-order files around the merged Master Bible.
- GitHub issue #196 is the completed source-truth cleanup issue retained for receipt history.
- GitHub issue #198 / PR #198 restored issue #194 as active control after the cleanup sweep.
- GitHub issue #194 / PR #201 completed the first money-loop verdict-loop seam and returned the repo to a no-active-seam state.
- GitHub issue #181 / PR #190 is superseded by PR #191 and must not be treated as a competing authority.
- GitHub issue #179 `Rung 3: prove deterministic work-packet fixture loop` is completed by PR #180.
- GitHub issue #175 `Rung 2: audit current schema and choose first evidence lane` is completed by PR #177.
- `docs/RUNG_2_SCHEMA_EVIDENCE_LANE_AUDIT.md` is the issue #175 read-only audit artifact that selected the deterministic work-packet fixture lane for the completed issue #179 seam.
- GitHub issue #173 `Promote first executable MVP rung from Master Synthesis` is completed/superseded by PR #174.
- `FOLDERA_MASTER_SYNTHESIS_DRAFT.md` is `REFERENCE_DRAFT`: build-bible-ready source material only, not implementation authority.
- GitHub issue #170 `Foldera Master Synthesis Lock Pass - customer, deliverable, build spec, and issue ladder` is completed/superseded by PR #172.
- GitHub issue #166 `Repo Intake Governor v0 - classify owner input into repo truth` is completed/superseded as the active seam by PR #167.
- GitHub issue #165 `Open Threads - Foldera Owner Whiteboard` is the raw-input inbox. Open Threads captures raw thoughts; it does not authorize implementation.
- `docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md` remains proof doctrine/reference; placeholder rows are not evidence.
- `FOLDERA_LAUNCH_ROADMAP.md` is a shim to the canonical control chain.

## Final Cleanup Classification

This ledger is the final cleanup view for old guidance files. It is the authoritative classification for the archive/delete sweep.

| File | Final classification | Canonical pointer / note |
| --- | --- | --- |
| `ACTIVE_HANDOFF.md` | `KEEP_CURRENT_CONTROL` | Current seam and next move. |
| `FOLDERA_BUILD_ORDER.yaml` | `KEEP_CURRENT_CONTROL` | Machine-readable active issue and closeout requirements. |
| `.foldera-contract.json` | `KEEP_CURRENT_CONTROL` | Cleanup contract and allowed-file boundary. |
| `FOLDERA_MASTER_BIBLE.md` | `KEEP_REFERENCE_ONLY` | Canonical master bible reference authority. |
| `FOLDERA_NORTH_STAR_LOCK.md` | `KEEP_CURRENT_CONTROL` | Product doctrine. |
| `FOLDERA_PRODUCT_OPERATING_SYSTEM.md` | `KEEP_CURRENT_CONTROL` | Roadmap, phase order, backlog lanes, and next-seam recommendation. |
| `docs/SOURCE_OF_TRUTH_MAP.md` | `KEEP_CURRENT_CONTROL` | Final cleanup ledger and authority map. |
| `FOLDERA_EXECUTION_QUEUE.yaml` | `KEEP_REFERENCE_ONLY` | Inactive queue retained for archaeology; supreme-authority language is neutralized in-file and a future activation issue is required to re-authorize queue control. |
| `FOLDERA_MASTER_SYNTHESIS_DRAFT.md` | `KEEP_REFERENCE_DRAFT` | Reference draft only, not implementation authority. |
| `FOLDERA_PRODUCT_SPEC_NEXT.md` | `KEEP_REFERENCE_DRAFT` | Executable revenue-ladder product spec draft; not a second authority tower. |
| `FOLDERA_GITHUB_ISSUE_PR_PLAN.md` | `KEEP_REFERENCE_DRAFT` | Executable revenue-ladder issue/PR plan draft; not a second authority tower. |
| `FOLDERA_BUILD_SPEC.md` | `KEEP_REFERENCE_DRAFT` | Draft build spec. |
| `FOLDERA_CAPABILITY_MAP.md` | `KEEP_REFERENCE_DRAFT` | Draft capability map. |
| `FOLDERA_QUEUE_GENERATION_RULES.md` | `KEEP_REFERENCE_DRAFT` | Draft queue-generation rules. |
| `FOLDERA_EXECUTION_QUEUE_NEXT_DRAFT.yaml` | `KEEP_REFERENCE_DRAFT` | Draft queue-only artifact. |
| `FOLDERA_OPERATING_SYSTEM.md` | `SHIM_TO_CANONICAL` | Compatibility shim to the canonical control chain. |
| `FOLDERA_LAUNCH_ROADMAP.md` | `SHIM_TO_CANONICAL` | Historical roadmap shim to the canonical control chain. |
| `FOLDERA_OPERATING_DOCTRINE.md` | `SHIM_TO_CANONICAL` | Historical doctrine shim to the canonical control chain. |
| `FOLDERA_PRODUCT_SPEC.md` | `SHIM_TO_CANONICAL` | Legacy product spec shim. |
| `FOLDERA_PRODUCTION_BACKLOG.md` | `SHIM_TO_CANONICAL` | Legacy backlog shim. |
| `FOLDERA_MASTER_AUDIT.md` | `SHIM_TO_CANONICAL` | Legacy audit shim. |
| `FOLDERA_SHIP_SPEC.md` | `SHIM_TO_CANONICAL` | Legacy ship spec shim. |
| `WHATS_NEXT.md` | `SHIM_TO_CANONICAL` | Legacy status log shim. |
| `AGENTS.md` | `KEEP_EXECUTION_CONTRACT` | Agent execution contract. |
| `CLAUDE.md` | `KEEP_EXECUTION_CONTRACT` | Alternate-agent execution contract. |
| `CODEX_START.md` | `KEEP_EXECUTION_CONTRACT` | Codex boot contract. |
| `GPT.md` | `KEEP_EXECUTION_CONTRACT` | Owner/PM boot contract. |
| `.cursorrules` | `KEEP_EXECUTION_CONTRACT` | Cursor compatibility contract. |
| `.cursor/rules/agent.mdc` | `KEEP_EXECUTION_CONTRACT` | Cursor agent contract. |
| `README.md` | `KEEP_EXECUTION_CONTRACT` | Repo entrypoint and command index. |
| `SYSTEM_RUNBOOK.md` | `KEEP_EXECUTION_CONTRACT` | Operator runbook. |
| `ACCEPTANCE_GATE.md` | `KEEP_EXECUTION_CONTRACT` | Proof gate contract. |
| `CURRENT_STATE.md` | `KEEP_EXECUTION_CONTRACT` | Runtime truth surface. |
| `SESSION_HISTORY.md` | `KEEP_EXECUTION_CONTRACT` | Append-only receipt history. |
| `BRANDON.md` | `KEEP_REFERENCE_ONLY` | Taste / judgment reference. |
| `docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md` | `KEEP_REFERENCE_ONLY` | Proof doctrine reference. |
| `docs/RUNG_2_SCHEMA_EVIDENCE_LANE_AUDIT.md` | `KEEP_REFERENCE_ONLY` | Read-only audit reference. |
| `docs/archive/**` | `ARCHIVE_HISTORICAL` | Archived historical docs only. |

No file was deleted in this sweep; none were proven `DELETE_IF_UNREFERENCED` and non-required.

## Canonical Boot Sequence

For any Foldera task, use this order:

1. Read `ACTIVE_HANDOFF.md`.
2. Read `FOLDERA_EXECUTION_QUEUE.yaml` when `ACTIVE_HANDOFF.md` says execution is queue-controlled.
3. Read `FOLDERA_LAUNCH_ROADMAP.md`.
4. Read the active issue named by `ACTIVE_HANDOFF.md` when the active seam is issue-controlled.
5. Read issue #48 for product doctrine.
6. Read relevant execution/proof docs only for the active seam.
7. Check latest open PRs and recent merged PRs when repo/deploy truth matters.
8. Use Vercel/Supabase only when the seam requires live/runtime truth.

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
2. When `ACTIVE_HANDOFF.md` declares queue-controlled execution, `FOLDERA_EXECUTION_QUEUE.yaml` beats issue-by-issue routing for task selection.
3. The active issue named by `ACTIVE_HANDOFF.md` beats backlog, audit, and reference documents when the seam is issue-controlled.
4. Issue #48 plus `FOLDERA_NORTH_STAR_LOCK.md` and `FOLDERA_PRODUCT_OPERATING_SYSTEM.md` beat older product-spec framing.
5. Gate, CI, and browser or runtime proof beat prose claims.
6. Stale, archived, or reference-only files cannot control implementation even if they contain detailed instructions.
7. If a rule is not enforced by a gate, CI check, required file, or test, treat it as guidance until enforcement exists.

## Authority Ledger

| File / Source | Status | Why It Exists | Who Or What May Rely On It | What It Must Never Control | Enforcement Mechanism |
| --- | --- | --- | --- | --- | --- |
| `ACTIVE_HANDOFF.md` | `CURRENT_CONTROL` | Names the single active seam, current truth, and next exact move. | Every Foldera session, reviewer, and agent boot. | Old roadmap order, unrelated issues, or broad cleanup outside the named seam. | `npm run gate:continuity` requires exactly one active seam line and roadmap/product references. |
| `FOLDERA_BUILD_ORDER.yaml` | `CURRENT_CONTROL` | Machine-readable active issue, paused issues, source-truth order, terminal states, and closeout requirements. | Agents, reviewers, and gates checking current issue order. | Product doctrine or feature scope by itself. | `npm run gate:continuity` checks active issue parity, closeout values, and next-seam closeout. |
| `FOLDERA_MASTER_BIBLE.md` | `REFERENCE_ONLY` | Canonical master bible for Foldera's product, money path, build order, forbidden work, proof rules, and Codex loop. | Future source-truth/build-definition issues when explicitly assigned. | Active seam selection, product/runtime implementation, queue activation, or unsupported customer claims. | Source-truth gates and PR receipts must treat it as reference authority, not live control. |
| `FOLDERA_EXECUTION_QUEUE.yaml` | `REFERENCE_ONLY` | Inactive deterministic queue artifact retained for archaeology; its historical supreme-authority language is neutralized in-file and future activation requires an explicit issue. | Agents and reviewers tracing prior Holy Crap MVP queue state. | Current seam selection, active task routing, or queue activation by implication. | Queue state is reviewed only when a future issue explicitly reactivates it. |
| `FOLDERA_LAUNCH_ROADMAP.md` | `SHIM_TO_CANONICAL` | Preserves historical launch order as a shim to the canonical control chain. | Operators and agents checking old links. | Current active seam, product doctrine, roadmap phase order, or next-seam selection. | Authority classification here plus active handoff/build-order; `npm run gate:continuity` still checks roadmap presence and boot-sequence alignment. |
| GitHub issue named by `ACTIVE_HANDOFF.md` | `CURRENT_CONTROL` | Defines the one assigned implementation seam. | The current assignee, reviewer, and PR author. | Unassigned side quests, backlog grooming, or unrelated fixes. | Manual boot-sequence read plus PR scope review. |
| GitHub issue #192 | `REFERENCE_ONLY` | Completed source-truth closeout seam retained for receipt history and future routing context. | Agents and reviewers tracing PR #193 or validating why the Master Bible closeout finished. | Active seam selection, queue activation, or product/runtime implementation. | FOLDERA_BUILD_ORDER.yaml marks issue #192 closed/completed by PR #193. |
| GitHub issue #196 | `REFERENCE_ONLY` | Completed source-truth cleanup issue retained for receipt history. | Agents and reviewers tracing PR #197 or validating why the cleanup finished. | Active seam selection, queue activation, or product/runtime implementation. | FOLDERA_BUILD_ORDER.yaml marks issue #196 closed/completed by PR #197. |
| GitHub issue #198 | `REFERENCE_ONLY` | The closeout PR that restored issue #194 as the active first money-loop implementation seam. | Agents and reviewers tracing PR #198 or validating why issue #194 became active again. | Active seam selection, queue activation, or product/runtime implementation by itself. | FOLDERA_BUILD_ORDER.yaml marks issue #198 closed/completed by PR #198. |
| GitHub issue #194 | `REFERENCE_ONLY` | Completed first money-loop verdict-loop seam retained for receipt history. | Agents and reviewers tracing PR #201 or validating why the verdict loop closed. | Active seam selection, queue activation, or product/runtime implementation. | FOLDERA_BUILD_ORDER.yaml marks issue #194 closed/completed by PR #201. |
| GitHub issue #48 | `CURRENT_CONTROL` | Holds the Workday Presence Layer product contract. | Product reviewers, agents, and humans checking launch doctrine. | Historical Brandon-command-center behavior or dashboard/task-list drift. | Boot sequence plus explicit issue reference across control docs. |
| `FOLDERA_OPERATING_SYSTEM.md` | `SHIM_TO_CANONICAL` | Compatibility shim to the canonical control chain. | Humans and agents checking old links. | Repo execution order by itself, or stale issue selection. | `npm run gate:continuity` verifies boot-sequence alignment; issue #48 remains the doctrine anchor. |
| `FOLDERA_NORTH_STAR_LOCK.md` | `CURRENT_CONTROL` | Reconciles product promise, buyer, pricing, public site, day-one app, runtime brain, Right Now, live rail boundary, issue order, gates, PR traceability, pilot readiness, and Brandon cognitive-load constraints. | Product/business/UX/runtime reviewers, PR authors, and agents when direction is implicated. | A second active issue, product implementation by itself, or permission to widen Slack/live rail, landing, Supabase, Stripe, package, connector, Teams/email/calendar, or dashboard work. | `npm run gate:command` verifies the file exists and required traceability/control language is present; `npm run gate:continuity` verifies the PR template requires North Star citation when direction is implicated. |
| `FOLDERA_PRODUCT_OPERATING_SYSTEM.md` | `CURRENT_CONTROL` | Converts the North Star into roadmap phases, backlog lanes, proof gates, business roadmap, enterprise-readiness path, owner-burden rule, and next-seam recommendation. | Agents, reviewers, and maintainers deciding phase order, allowed next seams, business/enterprise claims, and whether a PR advances the correct rung. | Product doctrine replacement, active seam selection outside GitHub issue truth, product/runtime implementation by itself, or permission to claim enterprise, pilot, or customer proof without the named gate. | `npm run gate:command` verifies the file exists and required phase/backlog/business/enterprise/owner-burden markers are present; PR receipts must cite/update/close it out when direction is implicated. |
| `FOLDERA_PRODUCT_SPEC_NEXT.md` | `REFERENCE_ONLY` | Executable revenue-ladder product spec derived from the master bible. | Future product-spec promotion issues. | Active implementation authority or product/runtime changes by itself. | Source-truth gates and PR receipts must treat it as draft planning, not live control. |
| `FOLDERA_GITHUB_ISSUE_PR_PLAN.md` | `REFERENCE_ONLY` | Paste-ready GitHub issue/PR plan that turns the master bible into the locked revenue ladder. | Future issue-planning or PR-promotion issues. | Active seam selection, product/runtime implementation, or queue advancement by itself. | Source-truth gates and PR receipts must treat it as planning authority only. |
| `FOLDERA_BUILD_SPEC.md` | `REFERENCE_ONLY` | Build-spec companion that frames the next executable layer from the master bible. | Future build-definition issues. | Active implementation authority, runtime claims, or queue control by itself. | Source-truth gates and PR receipts must treat it as a draft build spec. |
| `FOLDERA_CAPABILITY_MAP.md` | `REFERENCE_ONLY` | Maps repo capabilities to the planned execution bundle and its boundaries. | Future planning and promotion issues. | Active seam selection or runtime/product claims by itself. | Source-truth gates and PR receipts must treat it as reference planning only. |
| `FOLDERA_QUEUE_GENERATION_RULES.md` | `REFERENCE_ONLY` | Defines how the next-draft queue is generated from the master bible bundle. | Future queue-generation or promotion issues. | Active queue routing or task activation by itself. | Source-truth gates and PR receipts must treat it as queue-generation guidance only. |
| `FOLDERA_EXECUTION_QUEUE_NEXT_DRAFT.yaml` | `REFERENCE_ONLY` | Holds the next-draft queue that maps the master bible bundle into a future queue-controlled shape without activating it. | Future queue-promotion issues. | Current execution authority, task activation, or product/runtime implementation. | Source-truth gates and PR receipts must treat it as draft queue material only. |
| GitHub issue #179 `Rung 3: prove deterministic work-packet fixture loop` | `REFERENCE_ONLY` | Completed deterministic TEST_MODE proof seam retained for receipt history and queue provenance. | Agents and reviewers tracing PR #180 or validating why queue-controlled execution became safe. | Current seam selection, queue advancement, or permission to start Task 006. | FOLDERA_BUILD_ORDER.yaml and `FOLDERA_EXECUTION_QUEUE.yaml` keep issue #179 completed and subordinate to queue authority. |
| GitHub issue #175 `Rung 2: audit current schema and choose first evidence lane` | `REFERENCE_ONLY` | Completed read-only audit seam retained for receipt history and future routing context. | Agents and reviewers tracing PR #177 or validating why issue #179 was selected. | Active seam selection, product/runtime/schema work, or reopening Rung 2 audit in queue-controlled execution. | FOLDERA_BUILD_ORDER.yaml marks issue #175 closed/completed by PR #177. |
| `docs/RUNG_2_SCHEMA_EVIDENCE_LANE_AUDIT.md` | `REFERENCE_ONLY` | Maps repo support that selected the deterministic work-packet fixture lane before queue-controlled execution began. | Reviewers checking why the queue starts from the Marcus deterministic lane. | Current queue advancement, product/runtime/schema implementation, live Slack proof, production persistence claims, non-owner proof, pilot readiness, enterprise readiness, or compliance claims. | Source-truth gates may validate the artifact exists, but queue authority lives in `FOLDERA_EXECUTION_QUEUE.yaml`. |
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
| `FOLDERA_PRODUCT_SPEC.md` | `SHIM_TO_CANONICAL` | Legacy product spec shim. | Operators checking old links. | Current doctrine, launch order, or current active work. | Top authority marker checked by `npm run gate:continuity`. |
| `FOLDERA_PRODUCTION_BACKLOG.md` | `SHIM_TO_CANONICAL` | Legacy backlog shim. | Humans checking old links. | The active seam or launch priority when GitHub and handoff disagree. | Top authority marker checked by `npm run gate:continuity`. |
| `FOLDERA_MASTER_AUDIT.md` | `SHIM_TO_CANONICAL` | Legacy audit shim. | Humans checking old links. | Current execution or scope selection. | Top authority marker checked by `npm run gate:continuity`. |
| `FOLDERA_SHIP_SPEC.md` | `SHIM_TO_CANONICAL` | Legacy ship spec shim. | Archaeology only. | Present-day launch direction, product doctrine, or implementation scope. | Top authority marker checked by `npm run gate:continuity`. |
| `WHATS_NEXT.md` | `SHIM_TO_CANONICAL` | Legacy status log shim. | Archaeology only. | Current next move, active seam, or handoff logic. | Top authority marker checked by `npm run gate:continuity`. |
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

Use this file to decide authority. Use issue #48, `FOLDERA_NORTH_STAR_LOCK.md`, and `FOLDERA_PRODUCT_OPERATING_SYSTEM.md` to decide what Foldera is. Use `FOLDERA_PRODUCT_OPERATING_SYSTEM.md` to decide roadmap phase, backlog lane, business path, enterprise path, and next-seam recommendation. Use the active issue to decide what to change now.
