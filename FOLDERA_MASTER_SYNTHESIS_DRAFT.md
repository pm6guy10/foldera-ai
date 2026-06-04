# READINESS VERDICT - NOT BUILD-READY YET

Authority status: `REFERENCE_DRAFT`.

This draft is not yet sufficient to build from. This pass only places it under repo control and defines the required lock-pass acceptance standard.

Do not treat this document as implementation authority, a completed build bible, a schema contract, a deployment plan, a customer-proof record, a pricing launch approval, or permission to change product/runtime systems.

Current source-truth chain:

- `ACTIVE_HANDOFF.md` and `FOLDERA_BUILD_ORDER.yaml` name issue #170 as the one active seam.
- `.foldera-contract.json` limits this seam to source-truth build-definition work.
- `FOLDERA_NORTH_STAR_LOCK.md` remains product doctrine control.
- `FOLDERA_PRODUCT_OPERATING_SYSTEM.md` remains roadmap, phase, backlog, business, enterprise, and owner-burden control.
- `docs/SOURCE_OF_TRUTH_MAP.md` classifies this file as `REFERENCE_DRAFT`.
- Issue #166 / PR #167 completed the Repo Intake Governor Command OS v0 and is no longer the active seam.
- Issue #165 remains capture-only.
- Issue #140 / PR #142 remains parked rail-only.
- Issue #136 remains ledger-only.

## Current Draft Status

The Master Synthesis manuscript is valuable as source material because it captures product doctrine, business intent, build-order instincts, and the repeated failure mode: Foldera ideas scatter unless the business plan, product deliverable, successful-build definition, and issue ladder are locked hard enough.

It is not build-ready because it does not yet fully define the concrete customer deliverable, the first self-serve paid path, the current repo inventory, the current/future data model, the implementation-grade architecture, or the numbered issue/PR ladder at sufficient depth for a new operator to execute without Brandon rerouting.

This file is intentionally a reference draft now. The next pass must convert it into the repo-contained business-plan-to-build-plan bridge.

# REQUIRED NEXT PASS

The next pass must upgrade this draft into the hit-by-a-bus build bible. A competent technical/product operator with repo access and no Brandon context must be able to read the source-truth chain plus this document and answer what Foldera is, who it serves, what the customer buys, what exists now, what is missing, how the product works, and what issue/PR ladder builds it without tribal knowledge.

The required next pass must cover:

- customer / ICP
- buyer
- $29/month self-serve deliverable
- first user journey
- current repo inventory
- what exists
- what is missing
- React / Next / Tailwind frontend responsibilities
- backend/API responsibilities
- runtime brain
- signal flow
- Supabase current/future schema
- Vercel configuration map
- GitHub workflow
- issue/PR ladder
- proof gates
- money-readiness threshold
- forbidden work
- stop conditions

## Lock-Pass Acceptance Standard

The upgraded build bible is acceptable only if it distinguishes current repo truth from future required design.

It must not invent fake completed schemas, deployments, connectors, customers, compliance, enterprise readiness, Slack proof, payment proof, or non-owner demand.

It must define a self-serve-oriented money path rather than a founder-operated white-glove path. The $29/month standard must explain what infrastructure exists before a user can reasonably pay: account/workspace, one source/evidence lane, persistent workday state, Right Now / Today's Answer loop, one-click response, action receipt, source trail, trust/privacy boundary, payment or early-access path, and proof gates.

It must define the issue/PR ladder in bounded rungs. Each rung must name the files it may touch, the proof it must run, the claims it may and may not make, and the stop condition before the next rung begins.

## Forbidden In This Pass

- Do not implement product/runtime code.
- Do not run Supabase migrations.
- Do not change Vercel.
- Do not touch Slack / PR #142.
- Do not touch Stripe.
- Do not add connectors.
- Do not touch landing/dashboard/auth/backend.
- Do not do broad cleanup.
- Do not make fake SOC2, HIPAA, compliance, enterprise, customer, connector, revenue, or pilot-readiness claims.

## Stop Condition

Issue #170 stops when this draft is under repo control as `REFERENCE_DRAFT`, source-truth files activate issue #170 as the one seam, gates pass, the PR receipt is posted, the issue #136 ledger receipt is posted, and no product/runtime implementation has started.
