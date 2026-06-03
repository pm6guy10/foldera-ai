# Foldera Product Operating System

## Authority status

`CURRENT_CONTROL`.

This file controls Foldera's product roadmap, phase order, backlog lanes, business path, enterprise-readiness path, proof gates, owner-burden protection, and next-seam recommendation.

It does not replace `FOLDERA_NORTH_STAR_LOCK.md`. The North Star Lock remains product doctrine control. This file translates that doctrine into executable repo sequencing.

Enforcement:

- Required file: `FOLDERA_PRODUCT_OPERATING_SYSTEM.md`.
- Source-truth gate: `npm run gate:command` verifies this artifact exists and contains the required roadmap/phase/backlog/enterprise sections.
- Continuity gate: `npm run gate:continuity` verifies source-truth files agree on the active issue and authority map.
- PR receipt: any product, business, UX, runtime, roadmap, or source-truth direction PR must cite this file when direction or phase order is implicated.

## 1. Executive verdict

Foldera is a Workday Presence Layer.

Core model:

- state
- connectors
- triggers
- one intervention

Core promise:

- one trusted next move, or safe silence

Foldera is not pilot-ready until Brandon is no longer the router. A path that needs Brandon to repeatedly decide which stale doc, issue, agent output, mock, runtime log, or proof gap matters has failed operationally.

Foldera becomes enterprise-ready only after proof, trust, auditability, admin controls, connector reliability, support posture, and safe claims exist. Enterprise-ready is not a 1-3 week claim. The near-term goal is repo-directed execution plus demo/proof loop, not enterprise posture.

The purpose of this artifact is to make the repo carry the vision. Future Codex sessions should not need Brandon to restate what Foldera is, what it is not, what phase the product is in, or what should happen next.

Enforcement:

- `FOLDERA_NORTH_STAR_LOCK.md` controls product doctrine.
- This file controls phase and backlog sequencing.
- `ACTIVE_HANDOFF.md` and `FOLDERA_BUILD_ORDER.yaml` control the current active seam.
- PR receipt must state the phase advanced and whether this file was updated, cited, or unchanged with reason.

## 2. The holy-crap moment

Foldera notices the thread, commitment, blocker, timing shift, or workday state change the user would otherwise have had to rediscover manually, then gives one grounded next move or stays silent safely.

The payoff is not "you have a dashboard." The payoff is "Foldera found the re-entry point before I reopened five tools and rebuilt the context myself."

Foldera is not:

- a dashboard
- an inbox summary
- a chatbot
- a task list
- a generic productivity assistant
- surveillance
- connector theater

Enforcement:

- Product non-goals in this file are checked by PR scope review.
- Public claim expansion requires a future issue that cites this file and names the proof gate advanced.
- Dashboard, chatbot-first, task-list, inbox-summary, or surveillance drift is forbidden unless this file and the active issue are explicitly changed.

## 3. Core product loop

1. Read source-shaped evidence.
2. Preserve workday state.
3. Detect a meaningful discrepancy, trigger, blocker, timing shift, or next-action gap.
4. Select at most one intervention.
5. Generate the Right Now payload.
6. Show one trusted next move or safe silence.
7. Let the user respond with one click.
8. Mutate state.
9. Preserve source trail and audit trail.
10. Stay quiet until a justified trigger exists.

Enforcement:

- Right Now and workday-state changes must preserve `state + connectors + triggers + one intervention`.
- Source-backed state work must preserve safe `source_trail[]`.
- Product/runtime PR proof must match the affected path; build or docs alone are not product proof.

## 4. Current repo state

Completed work:

- PR #153 / issue #151 source-backed selector is complete.
- PR #158 / issue #156 North Star Lock is complete and `FOLDERA_NORTH_STAR_LOCK.md` is current product doctrine control.
- PR #161 / issue #159 first-10 evidence tracker exists.
- PR #162 post-#159 source-truth realignment is complete.

Parked work:

- Issue #140 / PR #142 remains parked rail-only and externally blocked.
- PR #142 must not become source-truth selection, product brain, connector platform, dashboard, landing, growth, or roadmap work.

Ledger-only work:

- Issue #136 remains the standing Codex Run Ledger only.

Owner-rejected work:

- Manual first-10 evidence remains proof doctrine but is owner-rejected as the primary executable path.
- Placeholder tracker rows are not evidence.
- Repo source truth must not remain blocked on a path Brandon will not execute as the operating system.

Stale/reference docs:

- Older command-center, daily-brief, artifact-wedge, launch, GTM, backlog, and enterprise audit docs may inform context, but they cannot select active work.
- `FOLDERA_LAUNCH_ROADMAP.md` is historical/reference for launch continuity unless a future issue reconciles it.

Unsafe claims:

- No enterprise readiness claim.
- No SOC2, HIPAA, compliance, or procurement-readiness claim.
- No unsupported Slack, Teams, email, calendar, connector breadth, automation, pricing, scale, or non-owner proof claim.

Source-truth contradiction reconciled:

- The first-10 tracker still protects against fake proof.
- Manual first-10 collection is no longer the only executable next move.
- The next executable seam is Repo Intake Governor v0 because it reduces Brandon as router while preserving proof discipline.

Enforcement:

- `ACTIVE_HANDOFF.md` names issue #163 as the active source-truth seam.
- `FOLDERA_BUILD_ORDER.yaml active_issue` is issue #163 during this seam.
- `.foldera-contract.json` limits allowed files to docs/source-truth/gate surfaces.
- `npm run gate:command` rejects stale active issue or missing Product Operating System sections.

## 5. Product non-goals

Foldera must not become:

- dashboard/task-manager drift
- generic AI assistant
- chatbot-first UI
- inbox summary
- fake enterprise readiness
- fake SOC2, HIPAA, or compliance claims
- connector expansion theater
- broad workflow automation suite
- manual Brandon routing
- public claim expansion without proof
- pricing or billing before payment intent
- enterprise posture before trust, admin, audit, support, connector reliability, and safe claims exist

Enforcement:

- PR changed-file review and `.foldera-contract.json` block forbidden surfaces for this issue.
- Future claims require a named phase, proof gate, and active GitHub issue.
- `docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md` placeholders cannot unlock product, pricing, channel, scale, or enterprise claims.

## 6. Phase ladder from today to enterprise-ready

| Phase | Purpose | Entry condition | Allowed work | Forbidden work | Proof required | Exit condition | Likely GitHub issue class | Must not claim yet | False advance | Owner-burden impact |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Phase 0: Product Operating System / source-truth reconciliation | Make repo truth carry the product vision and next-seam logic. | PR #162 merged and source truth is blocked on manual first-10 evidence. | This artifact, source-truth files, authority map, gates/tests if needed. | Product/runtime implementation, Slack, landing, Supabase, Stripe, connectors, outreach, customer data. | `npm run gate:command`, `npm run gate:continuity`, `npm run lint`, `git diff --check`. | One Product Operating System PR is open, contradiction reconciled, one next seam named. | SOURCE_TRUTH_ROADMAP_RECONCILIATION. | Pilot-ready, enterprise-ready, customer proof, product shipped. | Treating docs as product proof. | Repo selects next seam instead of Brandon re-explaining it. |
| Phase 1: Repo Intake Governor / command rail | Convert messy inputs into one bounded GitHub issue or a no-action receipt. | Phase 0 merged or accepted. | Issue/PR intake classifier, command rail docs/gates, issue templates if needed. | Runtime product build, Slack rail, frontend, connector expansion, outreach automation. | Deterministic fixtures: pasted input -> classification -> existing issue/new issue/no-action -> source-truth result. | Repo can route GPT/Codex/Figma/Lovable/business-plan findings without Brandon as relay. | REPO_INTAKE_GOVERNOR. | Product feature success, customer demand, live integration proof. | A human still deciding every input by hand. | Reduces Brandon routing load directly. |
| Phase 2: Deterministic owner-safe demo loop | Prove one owner-safe Right Now loop without paid/model/live-rail risk. | Repo Intake Governor exists and points to one demo seam. | Fixture-driven Right Now proof, source trail, one-click response, state mutation, safe silence. | Fake customer proof, live Slack claims, broad dashboard, paid generation by default. | Fixture signals -> workday state -> Right Now card -> response -> mutated state and audit trail. | A demo loop can be replayed without Brandon narrating internals. | DETERMINISTIC_DEMO_LOOP. | Non-owner proof, pilot-ready, enterprise-ready. | A mock-only loop counted as market proof. | Gives Brandon a bounded demo path instead of ad hoc demos. |
| Phase 3: Non-owner proof loop | Prove value with someone who is not Brandon or a reserved test/canary user. | Deterministic demo loop works and proof path is safe. | One real non-owner flow, source-status truth, waiting/no-safe state or source-backed move, feedback. | Synthetic users as beta proof, owner canary as proof, outbound email by default, paid runs without approval. | Real non-owner connects source and reaches clear state or source-backed move with source trail and safe controls. | Non-owner value is proved, rejected, or narrowed. | FIRST_NON_OWNER_PROOF_LOOP. | Repeatable channel, pricing, enterprise readiness. | Owner-only proof classified as customer proof. | Moves proof burden out of Brandon-only narration. |
| Phase 4: First paid or pilot-intent proof | Test willingness to pay only after first value is credible. | Non-owner proof or explicit payment-intent evidence exists. | Manual payment intent, pilot-honest pricing notes, narrow pricing proof. | Stripe buildout by default, public revenue claims, enterprise claims, paid ads. | Receipt for paid-pilot interest, first paid customer, or rejected payment intent. | Pricing/pilot direction is proved, rejected, or blocked. | PRICING_PROOF or PAID_PILOT_INTENT. | Scaled revenue, enterprise procurement readiness. | Building billing before payment intent. | Stops pricing work from becoming founder vibes. |
| Phase 5: Connector/source-trail reliability | Make source-backed moves reliable across allowed connected sources. | Proof shows source-backed value matters and a connector/source gap blocks repeatability. | Narrow connector freshness, source trail, readback, reliability gates. | Connector breadth theater, Teams/email/calendar expansion without proof, raw private content leaks. | Freshness/readback/source-trail tests plus live/runtime proof where the seam requires it. | Connector/source trail reliability is repeatable enough for next proof stage. | CONNECTOR_SOURCE_TRAIL_RELIABILITY. | Broad connector support, enterprise-ready integrations. | Adding connectors because they sound impressive. | Reduces manual source checking. |
| Phase 6: Trust, privacy, auditability, admin controls | Build the controls required before serious pilots or organizations. | Non-owner proof and reliability identify trust/admin requirements. | Audit log, privacy controls, source trails, org/account model, roles/permissions if needed, support/incident posture docs. | Fake SOC2/HIPAA, legal claims without evidence, broad admin panels as core value. | Deterministic trust/admin tests, audit trail proof, support/incident runbook proof. | Trust/admin posture is truthful enough for controlled pilots. | TRUST_ADMIN_AUDITABILITY. | Enterprise-ready, certified compliance. | Compliance theater. | Reduces Brandon as support and trust explainer. |
| Phase 7: Enterprise readiness | Prepare for enterprise only after repeatable proof and trust foundation exist. | Repeatable non-owner/pilot proof, source reliability, trust/admin/audit/support posture. | Enterprise-readiness audit, procurement-safe claims, support SLAs if true, legal/compliance posture appropriate to actual claims. | Enterprise claims before controls, fake certifications, unsupported connector breadth. | Full readiness checklist with evidence, not aspiration. | Foldera may claim enterprise readiness only for proved surfaces. | ENTERPRISE_READINESS. | Anything not proven by the checklist. | Time-boxed docs called readiness. | Brandon no longer hand-waves trust posture. |

## 7. Product backlog lanes

| Lane | Why it matters | Earliest phase | Forbidden premature work | Proof gate | Related docs/issues/PRs | Eventually unlocks | Claim still forbidden until then |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Source truth / command rail | Keeps agents on one seam and makes repo truth executable. | Phase 0 | Product/runtime work before source truth is aligned. | `gate:command`, `gate:continuity`, PR receipt. | ACTIVE_HANDOFF, FOLDERA_BUILD_ORDER, #136, #156, #159, #163. | Repo-directed execution. | Product success. |
| Repo Intake Governor | Routes messy inputs into one issue, existing surface, or no-action state. | Phase 1 | Implementing every pasted idea, broad cleanup, dashboard work. | Intake fixtures plus source-truth gate. | North Star Lock intake/command rail, #163. | Brandon no longer router. | Customer proof. |
| Ingestion / connectors | Supplies source-shaped evidence. | Phase 5 unless a narrower proof seam requires earlier fixture work. | New connector breadth, Teams/email/calendar expansion, scraping. | Connector freshness/readback proof. | #140 rail boundary, source-backed selector #151. | More reliable source evidence. | Broad connector support. |
| Source-backed state | Turns source-shaped rows into safe workday state. | Phase 2 | Raw private content, full inline recompute, mutation of source tables. | Focused selector/state tests and source-trail proof. | #151 / PR #153. | Source-backed Right Now moves. | Live connector breadth. |
| Discrepancy / trigger engine | Decides when interruption is justified. | Phase 2 | Notification noise, task-list generation, surveillance framing. | Trigger fixtures and safe-silence tests. | North Star runtime path. | Timely interventions. | Proactive automation claims. |
| Right Now card | Shows one trusted next move. | Phase 2 | Dashboard summary, multiple-task slate unless a future phase proves it. | Payload/card fixture and UI proof if user-facing. | #131, #151, #140 boundary. | Demoable intervention. | Live Slack proof. |
| One-click response loop | Lets user answer without opening another workflow. | Phase 2 | Broad workflow automation, hidden sends. | Done/Stuck/Break smaller/Snooze state proof. | #131 completed deterministic loop. | Low-friction state update. | External send claims. |
| State mutation | Preserves the user's answer and next state. | Phase 2 | Mutating unrelated source tables, raw private state. | Before/after state receipt and audit trail. | Workday Presence state models. | Durable workday continuity. | Enterprise auditability. |
| Evidence/source trail | Makes each move grounded and inspectable. | Phase 2 | Raw private content in receipts/public surfaces. | Source-trail preservation tests. | #151 source_trail. | Trustworthy explanation. | Compliance readiness. |
| Audit log | Makes decisions reviewable. | Phase 6 | Compliance theater before use-case proof. | Audit entry readback and retention proof. | Acceptance/quality gates. | Trust/admin posture. | SOC2/HIPAA. |
| Trust/privacy controls | Keeps the product safe and truthful. | Phase 6 | Fake privacy/compliance claims, broad settings panels. | Privacy/control tests and user-safe copy review. | North Star privacy doctrine. | Pilot trust. | Enterprise readiness. |
| Admin/org readiness | Needed only when more than one real organization/user path exists. | Phase 6 | Org model before proof, broad admin dashboards. | Roles/permissions/org tests if implemented. | Enterprise audit docs. | Team/account pilots. | Enterprise procurement. |
| Billing/pricing only after proof | Prevents Stripe and pricing from outrunning value. | Phase 4 | Stripe before payment intent, pricing claims before first value. | Payment-intent or paid-pilot receipt. | REVENUE_PROOF reference. | Paid pilot direction. | Repeatable revenue. |
| Public site / positioning only after safe claims | Public copy must lag proof. | Phase 3 or later depending on claim. | Unsupported enterprise, connector, Slack, Teams, email, calendar, automation claims. | Claim-control review and user-facing proof. | North Star public-site lock, first-10 tracker. | Safer acquisition copy. | Claims not proved by phase. |

## 8. Business roadmap

Business direction:

1. Pilot-honest positioning first.
2. First value before paywall pressure.
3. First non-owner proof before scale.
4. First payment intent before Stripe/buildout.
5. Repeatable channel only after repeated proof.
6. Enterprise only after trust, auditability, admin, support, repeatable proof, connector reliability, and safe claims exist.
7. Public copy must lag proof, not lead proof.

Forbidden business claims:

- unsupported enterprise readiness
- unsupported SOC2, HIPAA, compliance, or procurement readiness
- unsupported Teams/email/calendar/Slack/live connector breadth
- unsupported automation
- unsupported repeatable channel
- unsupported scale narrative
- pricing pressure before payment intent

Enforcement:

- `docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md` remains proof doctrine/reference.
- Placeholder tracker rows are not demand.
- Future pricing, GTM, public-site, connector, or enterprise PRs must cite this file and name the phase and proof gate advanced.

## 9. Enterprise-ready definition

Enterprise-ready is a future phase requiring all of the following:

- repeatable non-owner proof
- source-trail reliability
- privacy controls
- audit log
- admin controls
- org/account model
- permissions/roles if needed
- support posture
- incident/recovery posture
- safe public claims
- legal/compliance posture appropriate to claims
- no fake SOC2/HIPAA claims
- no unsupported connector claims

Enterprise-ready is not a 1-3 week claim.

The near-term goal is repo-directed execution plus demo/proof loop, not enterprise posture.

Enforcement:

- Enterprise claims are forbidden until Phase 7 entry conditions and proof exist.
- Any enterprise-readiness PR must cite this section and include checklist evidence.
- Docs-only enterprise language without proof must be classified as reference, audit, or future posture, not readiness.

## 10. Owner-burden rule

Brandon may provide vision, constraints, rejection, and taste.

The repo must convert those into source-truth state.

Future work must not require Brandon to repeatedly route stale docs, Codex outputs, Figma/Lovable outputs, issue states, runtime logs, proof gaps, or next seams.

If Brandon is the only person who can decide the next move, the repo has failed.

Any path that requires Brandon to manually sustain the system must be classified as owner-burden unless it is a bounded proof loop.

Enforcement:

- Repo Intake Governor v0 is the next seam because it directly reduces Brandon routing load.
- Future no-action or blocked states must be recorded in GitHub issue/PR/ledger receipts.
- Source-truth closeout must name the next seam or blocked reason.

## 11. Manual first-10 evidence status

The tracker remains reference/proof doctrine.

Manual first-10 evidence is owner-rejected as the primary operating path.

Do not delete the tracker.

Do not count placeholders as evidence.

Do not let the repo remain blocked on manual first-10 evidence as the only executable next move.

Customer proof is still required before scale, pricing buildout, paid ads, automation, connector claims, or enterprise claims.

Future customer proof must be routed through the phase ladder.

Enforcement:

- `docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md` remains the proof doctrine/reference artifact.
- `ACTIVE_HANDOFF.md` and `FOLDERA_BUILD_ORDER.yaml` must not say manual first-10 evidence is the only safe next move after issue #163.
- The next seam is Repo Intake Governor v0, not product implementation or growth automation.

## 12. Source-truth authority

Authority order:

1. GitHub source truth plus `ACTIVE_HANDOFF.md`.
2. `FOLDERA_BUILD_ORDER.yaml`.
3. Active GitHub issue.
4. Issue #48 and `FOLDERA_OPERATING_SYSTEM.md` for carried product doctrine.
5. `FOLDERA_NORTH_STAR_LOCK.md` for product doctrine control.
6. `FOLDERA_PRODUCT_OPERATING_SYSTEM.md` for roadmap, phase order, backlog lanes, business roadmap, and enterprise path.
7. `docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md` for first-10 proof doctrine/reference.
8. `docs/SOURCE_OF_TRUTH_MAP.md` for authority classification.
9. `FOLDERA_LAUNCH_ROADMAP.md` as historical/reference unless reconciled by a future issue.
10. Historical specs, audits, backlog, and archives as reference only.

Rules:

- Historical docs cannot select active work.
- Future PRs that change product, business, UX, runtime, roadmap, pricing, enterprise, or issue direction must cite this artifact and name the phase advanced.
- If this artifact conflicts with the active issue, stop and reconcile GitHub source truth before coding.

Enforcement:

- `docs/SOURCE_OF_TRUTH_MAP.md` classifies this file as `CURRENT_CONTROL`.
- `npm run gate:command` verifies the required markers.
- PR receipt must report source-truth closeout values.

## 13. Next-seam recommendation

Recommended next GitHub issue after this PR:

Repo Intake Governor v0.

Phase advanced:

- Phase 1: Repo Intake Governor / command rail.

Why this next:

- It reduces Brandon's routing load directly.
- It turns messy inputs from GPT, Codex, Figma, Lovable, business docs, audits, screenshots, runtime logs, and user objections into one bounded GitHub issue, existing issue/PR routing, or no-action receipt.
- It preserves first-10 evidence as proof doctrine without making manual evidence collection the only executable path.
- It beats Slack/frontend/evidence/connector/pricing/enterprise work right now because those lanes still require stronger command routing and proof discipline before implementation.

Allowed files/work for the next seam:

- command/intake rail docs or controller files if the issue scopes them
- issue template or receipt template updates if needed
- focused deterministic fixtures/tests for classification
- source-truth files if active seam or next-seam state changes

Forbidden files/work for the next seam:

- product runtime implementation unless the issue explicitly scopes a deterministic intake controller
- Slack / PR #142
- landing/frontend/dashboard
- Supabase schema/data
- Stripe
- connectors
- Teams/email/calendar
- outreach, scraping, paid ads, or customer data
- fake enterprise/compliance claims

Proof required:

- deterministic fixture: pasted input -> classify -> existing issue, new issue draft, no-action, or blocked state
- source-truth closeout proof
- `npm run gate:command`
- `npm run gate:continuity`
- `npm run lint`
- `git diff --check`

Stop condition:

- one Repo Intake Governor v0 PR is open with proof and receipts
- repo can route a messy input without Brandon manually deciding the target
- no next implementation seam is started automatically

Enforcement:

- This file names exactly one next seam.
- `ACTIVE_HANDOFF.md` and `FOLDERA_BUILD_ORDER.yaml` carry this next-seam recommendation after issue #163.
- Repo Intake Governor implementation must wait for its own controlling GitHub issue.
