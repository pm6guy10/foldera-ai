# READINESS VERDICT

Authority status: `REFERENCE_DRAFT`.

Verdict: build-bible ready as a reference draft. It is not implementation authority, not a schema contract, not a deployment instruction, not a customer-proof record, and not permission to build any product/runtime surface by itself.

This document now answers the hit-by-a-bus question at source-truth depth: a competent technical/product operator with repo access and no Brandon context can understand what Foldera is, who it serves, what the first paid deliverable is, what exists now, what is missing, how the system should work, and what issue/PR ladder moves the repo toward a money-ready MVP.

Use this document to create or evaluate future issues. Do not implement from it directly. Every build rung below still needs its own GitHub issue, branch, file allowlist, proof stack, PR receipt, issue #136 ledger receipt, and stop condition.

Required coverage index:

- hit-by-a-bus build bible
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

Current source-truth chain:

- `ACTIVE_HANDOFF.md` and `FOLDERA_BUILD_ORDER.yaml` name issue #170 as the one active seam.
- `.foldera-contract.json` limits this seam to source-truth build-definition work.
- `FOLDERA_NORTH_STAR_LOCK.md` remains product doctrine control.
- `FOLDERA_PRODUCT_OPERATING_SYSTEM.md` remains roadmap, phase, backlog, business, enterprise, and owner-burden control.
- `docs/SOURCE_OF_TRUTH_MAP.md` classifies this file as `REFERENCE_DRAFT`.
- PR #171 placed this draft under repo control as a reference draft.
- Issue #166 / PR #167 completed the Repo Intake Governor Command OS v0 and is no longer the active seam.
- Issue #165 remains capture-only.
- Issue #140 / PR #142 remains parked rail-only.
- Issue #136 remains ledger-only.

# CUSTOMER / ICP LOCK

First customer:

- A cognitively overloaded professional who loses work context across email, calendar, Slack or equivalent messaging, docs, tasks, files, and notes.
- They have enough active threads that reopening tools to reconstruct "what should I do now?" costs real time and emotional energy.
- They are accountable for follow-through, not just personal organization.
- They need one safe next move or a clear "you are clear right now" verdict, not another dashboard to triage.

Likely early ICP:

- Solo founder, operator, PM, researcher, consultant, executive assistant, agency lead, or overloaded knowledge worker.
- Works across multiple external relationships and async threads.
- Already uses Google or Microsoft work sources, and can consent to a narrow source/evidence lane.
- Has recurring context-collapse moments: forgotten follow-ups, unclear re-entry after meetings, stale commitments, or uncertainty about what changed while away.

Buyer/evaluator:

- For the first $29/month path, the user and buyer are usually the same person.
- The evaluator asks whether Foldera reliably saves cognitive reload time and prevents missed re-entry moments.
- The buyer does not need enterprise procurement, admin controls, SOC2, HIPAA, or broad connector breadth before paying $29/month.

Pain:

- "I know the answer is somewhere in my tools, but I have to reopen everything and rebuild the day."
- "I do not trust generic AI summaries because they cannot prove why a move matters."
- "I need to know whether to do this next, fix this first, or safely stay quiet."

Urgency:

- High when missing one thread, reply, blocker, meeting carry-forward, or commitment has direct cost.
- High when the user repeatedly asks an assistant, agent, or themselves to decide what matters next.
- Low when the user only wants a prettier dashboard, generic task list, or productivity analytics.

Disqualifiers:

- Wants surveillance, screen reading, employee monitoring, or hidden activity tracking.
- Wants broad workflow automation before trusting one source-backed verdict.
- Wants Teams/email/calendar/Slack breadth as a checkbox rather than a narrow proof loop.
- Needs enterprise procurement or compliance claims before value proof.
- Expects Brandon or a founder to manually operate the product as a service.

# $29 SELF-SERVE DELIVERABLE

Plain-language offer:

Foldera keeps your place across one narrow source/evidence lane and gives one trusted verdict: "Do this next," "Fix this first," or "You are clear right now."

What the user gets:

- A self-serve account path.
- A bounded onboarding path that explains what Foldera can and cannot see.
- One source/evidence lane, initially either a real connected source already supported by the repo or a controlled source-shaped evidence path for demo/proof.
- Persistent workday state: current focus, next move, blocker, do-not-touch, waiting-on, last completed step, and source-backed context.
- A Today Answer / Right Now verdict with a source trail.
- One-click response choices that mutate state and create an action receipt.
- Safe silence when no source-backed move is justified.
- A clear no-send boundary: nothing is sent externally without explicit permission and proof for that rail.

What sources are used first:

- Current repo truth supports Google/Microsoft auth and sync surfaces, source-shaped test-mode ingestion, `tkg_*` source-backed rows, and deterministic Workday Presence state modules.
- The first paid offer should start with one source/evidence lane, not all connectors.
- Slack live rail remains parked in PR #142 and cannot be claimed until the live callback proof is complete.

Daily / Right Now output:

- One verdict at a time.
- "Do this next" when the source trail supports a safe next action.
- "Fix this first" when a blocker or prerequisite is the real next move.
- "You are clear right now" when no action is justified.
- No inbox summary, no task slate, no dashboard dump, no chatbot-first answer.

Not included at $29/month:

- Enterprise readiness.
- SOC2, HIPAA, procurement, SSO, admin console, or legal posture claims.
- Broad connector platform.
- Teams/email/calendar/Slack breadth unless individually proved.
- Live Slack claims while PR #142 remains blocked.
- Founder-operated white-glove delivery.
- Custom consulting or manual workflow operation.

Why someone pays:

- They trust the answer because Foldera can show state, source trail, and receipt.
- They save repeated context rebuild cycles.
- They avoid missed re-entry moments.
- The product can say "nothing to do" safely instead of manufacturing work.

# FIRST USER JOURNEY

1. Public promise.
   - User lands on Foldera and sees the Workday Presence Layer promise: Foldera keeps your place and gives one grounded next move.
   - Claims are bounded to current proof. No unsupported Slack, Teams, email, calendar, enterprise, compliance, or automation breadth.

2. Signup / account.
   - User signs in through the existing auth path.
   - Repo truth shows Google and Microsoft account paths exist through NextAuth and related routes.
   - Future paid-ready path must include explicit account/workspace handling and payment or early-access capture.

3. Consent / source boundary.
   - User connects or seeds one allowed source/evidence lane.
   - The UI must explain what is read, what is not read, what is stored, and what is never sent without permission.

4. Source evidence.
   - Source-shaped evidence enters as events or existing `tkg_*` rows.
   - Evidence is normalized into safe state candidates.
   - Raw private content must not leak into public receipts, logs, or source trails.

5. Workday state.
   - Foldera builds or updates workday state: current focus, next move, blocker, do-not-touch, waiting-on, last completed step, source trail, and safe-silence reason.

6. Trigger evaluation.
   - The runtime brain checks whether a discrepancy, blocker, timing shift, reply-needed state, waiting-on change, or user action justifies one intervention.
   - If no trigger is justified, the correct verdict is safe silence / "you are clear right now."

7. Right Now / Today's Answer verdict.
   - User sees one verdict, not a list.
   - The verdict includes a concise why and a source trail that is safe to show.

8. One-click response.
   - User responds with a bounded action such as Done, Stuck, Break smaller, or Snooze where the active surface supports it.
   - The response mutates state and creates an action receipt.

9. Receipt / audit trail.
   - Foldera records what changed, what source trail supported it, and what was not sent.
   - Future paid-ready proof must show before state -> verdict -> user response -> after state -> receipt.

10. Next check.
   - Foldera stays quiet until a justified trigger exists.
   - The user should not become the router, debugger, or project manager for the product loop.

# CURRENT REPO INVENTORY

## Source-truth docs

- EXISTS: `ACTIVE_HANDOFF.md`, `FOLDERA_BUILD_ORDER.yaml`, `.foldera-contract.json`, `FOLDERA_NORTH_STAR_LOCK.md`, `FOLDERA_PRODUCT_OPERATING_SYSTEM.md`, `docs/SOURCE_OF_TRUTH_MAP.md`, `AGENTS.md`, `CODEX_START.md`, `GPT.md`, `CLAUDE.md`, `.github/pull_request_template.md`.
- EXISTS: `docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md` as proof doctrine/reference; placeholders are not evidence.
- REFERENCE_DRAFT: this file.
- STALE / REFERENCE: older launch, backlog, audit, product spec, archive, and historical roadmap docs unless a future issue explicitly revives them.
- FORBIDDEN: using historical docs to select the active seam over GitHub issue truth.

## Runtime brain / state artifacts

- EXISTS: `lib/workday-presence/model.ts`, `actions.ts`, `message.ts`, `triggers.ts`, `presence-loop-receipt.ts`, and `source-backed-state.ts`.
- EXISTS: tests for workday presence model, actions, message, triggers, source-backed state, presence loop receipts, and work-packet state update.
- EXISTS: `lib/work-packets/*` for work packet generation/receipt/transitions/types.
- EXISTS: `lib/briefing/*`, `lib/signals/*`, `lib/source-readiness/*`, and related tests for older/current signal and briefing machinery.
- EXISTS: source-backed selector bridge from `tkg_signals`, `tkg_commitments`, and optional `tkg_actions.evidence` into Workday Presence state per North Star.
- MISSING: a paid-ready end-to-end product proof that a non-owner user can reach one trusted verdict, respond, mutate state, and see a receipt without Brandon narrating.

## UI / app surfaces

- EXISTS: Next.js App Router app with public routes, `/start`, `/pricing`, `/login`, `/onboard`, `/dashboard`, `/status`, `/try` redirect behavior, and public/legal pages.
- EXISTS: dashboard components, demo components, Foldera landing components, and Workday Presence API routes.
- EXISTS: `/app/slack/test-mode` and Slack test-mode UI for deterministic proof.
- PARKED / NOT CLAIMABLE: user-facing surfaces may exist, but current issue #170 does not authorize editing landing, dashboard, auth, backend, or product runtime.
- MISSING: a locked first-user paid journey that is proved end to end from signup/source evidence to trusted verdict and receipt.

## Slack parked rail

- EXISTS: deterministic Slack test-mode routes and modules under `app/api/slack/test-mode/**`, `app/slack/test-mode/**`, and `lib/slack-test-mode/**`.
- PARKED: issue #140 / PR #142 live Slack rail remains externally blocked.
- FORBIDDEN: claiming live Slack proof, patching Slack code, changing Slack app settings, or widening PR #142 from this issue.

## Supabase / data pieces

- EXISTS: `supabase/config.toml` and many migrations.
- EXISTS: migrations for waitlist, integrations, pending actions, billing, user tokens, temporal knowledge graph, `tkg_signals`, `tkg_entities`, `tkg_commitments`, `tkg_actions`, `tkg_goals`, `tkg_briefings`, RLS policies, API usage, system health, pipeline runs, cost events, and related indexes/policies/views.
- EXISTS: Supabase client code under `lib/db/client.ts` and auth/token/subscription code that uses Supabase.
- UNKNOWN: live production schema state is not verified in this pass.
- FORBIDDEN: running migrations, altering schema, changing RLS, or mutating production data in this pass.

## Vercel / deploy assumptions

- EXISTS: `vercel.json` with Next.js framework, security headers, and morning-pipeline cron.
- EXISTS: Next config with Sentry wrapping, redirects from `/try`, `/signup`, and `/request-access` to `/start`, and route headers.
- EXISTS: GitHub workflows for CI, deploy, health, production E2E, PR Sentinel, and cron/agent lanes.
- UNKNOWN: current Vercel environment variable values, preview protection settings, and production runtime health are not verified in this pass.
- FORBIDDEN: changing Vercel settings, env vars, deployment protection, or runtime configuration in this pass.

## GitHub gates / scripts / tests

- EXISTS: `npm run gate:command`, `npm run gate:continuity`, `npm run health`, `npm run lint`, `npm run build`, `npm run gate:repo-intake-governor`, `npm run gate:free-plan`, `npm run gate:frontend`, and many focused test lanes.
- EXISTS: `scripts/source-truth-check.ts`, `scripts/continuity-gate.ts`, preflight scripts, health scripts, repo-intake governor scripts, controller/autopilot scripts, and proof helpers.
- EXISTS: issue #136 standing ledger rule and PR receipt expectations.
- MISSING: a future issue/PR ladder promoted from this reference draft into executable source truth.

# PRODUCT OPERATING MODEL

Foldera model:

- state
- connectors
- triggers
- one intervention

Allowed verdicts:

- Do this next.
- You are clear right now.
- Fix this first.

State:

- current focus
- next move
- blocker
- do-not-touch
- waiting-on
- last completed step
- source trail
- last user response
- safe-silence reason

Connectors / evidence lanes:

- A connector is useful only if it supplies source-shaped evidence for state or trigger evaluation.
- One source/evidence lane proved deeply beats broad connector theater.
- Connected sources must be consented and scoped.

Triggers:

- time / morning anchor
- meeting or calendar context
- reply-needed or mention signal
- waiting-on changed
- blocker detected
- user action
- end-of-day carry-forward
- source freshness or no-safe-state event

One intervention:

- Foldera selects at most one verdict.
- Multiple candidates are internal; the user sees one move or safe silence.
- If confidence or source trail is insufficient, Foldera asks for one irreducible blocker or stays quiet.

Source trail:

- The answer must be grounded by source-shaped evidence.
- Source trail must be redacted/safe and must not expose raw private content unnecessarily.
- The source trail is why the user trusts Foldera is not generic AI output.

No-send boundary:

- Nothing is sent externally without explicit permission.
- Slack/email/external messaging claims require the correct live proof.
- Test-mode or fixture proof must be labeled as such.

Safe silence:

- Safe silence is a product output, not failure.
- "You are clear right now" is valid only when the source trail and trigger evaluation support no action.

Action receipt:

- Every user response that changes state must create a receipt.
- The receipt records what was shown, what the user clicked, what state changed, and what source trail supported it.

State mutation:

- Done means completed or acknowledged.
- Stuck means blocker is now current.
- Break smaller means the next move is decomposed.
- Snooze means timing changes without losing context.

# TECHNICAL ARCHITECTURE MAP

## Frontend responsibilities

- Public pages explain the Workday Presence Layer promise with bounded claims.
- `/start` and login/onboarding surfaces get the user into a source/evidence lane without a sales call.
- Dashboard/app surfaces display the current workday state, source status, trusted verdict, one-click responses, and receipts.
- UI must avoid dashboard/task-list/inbox-summary drift as the core product.
- UI must show no-send and privacy boundaries plainly.
- Future frontend proof must use Playwright or equivalent browser tests when the user-facing path changes.

## Backend/API responsibilities

- Authenticate the user and resolve the user/workspace boundary.
- Manage connector consent, token storage, token refresh, and source freshness.
- Ingest or read source-shaped evidence.
- Normalize evidence into safe internal records.
- Serve workday state and Right Now / Today's Answer payloads.
- Accept one-click responses and mutate state.
- Write action receipts and audit/source trail records.
- Enforce rate limits, auth checks, user isolation, and no raw private egress.

## Runtime brain responsibilities

- Convert source-shaped evidence into workday state candidates.
- Evaluate triggers and safe-silence conditions.
- Select at most one intervention.
- Produce a verdict with a safe source trail.
- Use deterministic fixtures/gates first.
- Use AI/model generation only behind explicit budget, privacy, and proof boundaries.
- Never manufacture customer proof or unsupported claims.

## Database responsibilities

- Store users/workspaces, connector state, source events, normalized evidence, workday state, triggers, interventions, action receipts, audit/source trail, settings, subscriptions or payment state, and system health.
- Enforce RLS/user isolation where user-owned data is present.
- Keep raw private content out of public receipts and unnecessary logs.

## Jobs/workers responsibilities

- Sync consented sources.
- Process unprocessed signals.
- Recompute or refresh source-readiness/state where allowed.
- Run scheduled checks such as morning pipeline only when proof and configuration support it.
- Record pipeline/system health.

## Gates/tests responsibilities

- Source-truth gates decide whether the repo is allowed to work on a seam.
- Unit/fixture tests prove deterministic brain/state behavior.
- Browser tests prove user-facing flows.
- Live/runtime tests prove deployed behavior only when the seam requires it.
- GitHub receipts preserve final truth outside chat.

## AI boundary

- AI is not default proof.
- Paid/model-backed proof is opt-in.
- AI output must not be treated as source truth unless routed through GitHub and gates.
- Deterministic fixtures must cover the product loop before paid/model claims are allowed.

# SIGNAL FLOW

Exact intended flow:

1. source evidence
   - A consented source or controlled fixture yields an event, thread, calendar item, commitment, blocker, or source status.

2. source-shaped event
   - The source is represented with user id, source type, source id, timestamp, safe metadata, content hash or redacted content, and freshness information.

3. normalized evidence
   - The system extracts safe facts: commitment, waiting-on, blocker, reply-needed, timing shift, completed work, stale/no-safe state, or source readiness.

4. workday state
   - Evidence updates current focus, next move, blocker, do-not-touch, waiting-on, last completed step, and source trail.

5. trigger evaluation
   - Trigger logic determines whether intervention is justified now.
   - If not justified, output is safe silence or "You are clear right now."

6. candidate interventions
   - Possible moves are ranked internally.
   - Candidates that lack source trail, violate privacy, require unproved send rails, or create dashboard/task-list drift are rejected.

7. selected verdict
   - Exactly one verdict is selected: Do this next, Fix this first, or You are clear right now.

8. user action
   - User clicks one bounded response or does nothing.

9. state mutation
   - State updates according to the response.
   - The next check uses the mutated state, not the stale prior state.

10. receipt/audit trail
   - The system records before state, verdict, source trail, response, after state, and no-send/external-send status.

11. next check
   - Foldera stays quiet until a new justified trigger exists.

# SUPABASE CURRENT/FUTURE SCHEMA MAP

Do not migrate in this pass.

Current known repo truth:

- `supabase/config.toml` exists.
- Migrations exist for waitlist, integrations, pending actions, risk/context systems, billing, user tokens, temporal knowledge graph, email drafts, Outlook source, goals/actions, feedback, API usage, pattern metrics, signal summaries, system health, pipeline runs, cost events, RLS and security policies.
- The repo references `tkg_signals`, `tkg_entities`, `tkg_commitments`, `tkg_actions`, `tkg_goals`, `tkg_briefings`, `tkg_feedback`, `tkg_pattern_metrics`, `user_tokens`, `user_subscriptions`, `integrations`, `pipeline_runs`, and `cost_events`.
- North Star says the current source-backed Right Now path bridges `tkg_signals`, `tkg_commitments`, and optional `tkg_actions.evidence` into `WorkdayPresenceState`.
- Live production schema state is unknown in this pass because no Supabase inspection or migration was run.

Future required conceptual tables / domains:

- users / workspaces
  - Account, workspace, role, and ownership boundary.
  - For $29/month, a single-user workspace may be enough; enterprise org modeling is future.

- connectors
  - Provider, consent state, freshness, token reference, scopes, last sync, reauth requirement, and disconnect state.

- source_events
  - Raw or semi-raw source-shaped events with redacted metadata, source id, timestamp, hash, and user/workspace id.
  - Must avoid unnecessary raw private content retention.

- normalized_evidence
  - Extracted commitments, blockers, timing shifts, reply-needed states, completed work, no-safe-state evidence, and source readiness.

- workday_state
  - Current focus, next move, blocker, do-not-touch, waiting-on, last completed step, state source, source trail, and freshness.

- triggers
  - Trigger candidates, reason, source evidence ids, schedule, status, suppression, and safe-silence decision.

- interventions
  - Candidate and selected Right Now / Today's Answer verdicts, rejected candidates, reason, and source trail.

- action_receipts
  - User response, before state, after state, selected verdict, mutation, timestamp, and external-send/no-send status.

- audit_source_trail
  - Redacted evidence references, decision trace, model/deterministic boundary, and privacy-safe explanation.

- settings
  - User preferences, notification/snooze settings, source consent choices, no-send defaults, and support boundaries.

RLS expectations:

- User-owned records must be isolated by user/workspace.
- Service-role processing may exist but must not create public access.
- Security definer RPCs must be explicitly scoped.
- Public/anon access to private source/workday data must be denied.

Migration sequencing:

- First document the exact current live schema in a future schema audit issue.
- Then add only the minimum missing table/column set for one source/evidence lane and one verdict loop.
- Then prove RLS and read/write paths before adding payment/public claims.

Must not migrate now:

- No table creation.
- No RLS policy changes.
- No token schema changes.
- No billing schema changes.
- No cleanup of old migrations.

# VERCEL CONFIGURATION MAP

Do not change Vercel in this pass.

Current known repo truth:

- `vercel.json` declares `framework: nextjs`.
- `vercel.json` sets security headers.
- `vercel.json` has a cron for `/api/cron/morning-pipeline`.
- `next.config.mjs` wraps Sentry config, sets server component external packages, redirects `/try`, `/signup`, and `/request-access` to `/start`, and sets cache/robots headers for selected routes.
- GitHub/Vercel preview deployments exist for PRs, but environment and protection settings are not verified in this pass.

Required environment categories:

- App/auth: `NEXTAUTH_URL`, auth secrets, public base URL.
- Supabase: public URL, anon key if used, service role key for server-only paths.
- OAuth: Google client id/secret, Microsoft/Azure client id/secret/tenant and redirect settings.
- Billing: Stripe keys, price ids, webhook secret.
- Email: Resend key and webhook secret if used.
- Observability: Sentry DSN/auth/project config where needed.
- LLM: Anthropic/OpenAI or other model keys only behind paid/model gates.
- Slack: bot token, signing secret, channel/user ids, callback URL only for the parked PR #142/live rail when explicitly assigned.

Preview vs production:

- Preview proves branch behavior but may be protected.
- Production proof is required before public claims that depend on deployed behavior.
- Vercel Preview Deployment Protection can block external webhook providers before app code, as seen in PR #142 ledger evidence.

Protected preview implications:

- A webhook or external provider callback cannot be claimed reachable until the public URL reaches app code.
- For Slack-style proof, public GET to a route should reach the app and return expected method behavior before button POST proof is attempted.

Proof requirements:

- Docs/source-truth changes do not require Vercel mutation.
- User-facing route changes require browser proof.
- Runtime/API changes require route/API proof.
- Live webhook/send claims require deployed live proof and logs.

Unknowns:

- Current production env values.
- Current preview protection policy.
- Current live Supabase schema and data health.
- Current Slack app config.

# GITHUB WORKFLOW / REPO OS

GitHub is the operating system.

Ideas become issues:

- Raw Brandon input goes to issue #165 Open Threads or an existing issue comment unless an active issue explicitly authorizes implementation.
- Repo Intake Governor v0 classifies messy input into one target, no-action, blocked, reference-only, or open-thread capture.
- Labels and projects are visibility, not authority.

Issues become PRs:

- One issue only.
- One branch/worktree.
- One PR.
- No direct edits to `main`.
- File allowlist and forbidden work come from the issue plus source-truth files.

PRs become proof:

- Proof must match the affected path.
- Source-truth seams require command/continuity gates.
- Product/runtime seams require the relevant focused unit, API, browser, deployed, or live proof.
- Build passing alone is never product proof.

Proof updates source truth:

- If active issue, next seam, blocker, or proof status changes, update `ACTIVE_HANDOFF.md` and/or `FOLDERA_BUILD_ORDER.yaml`.
- If authority classification changes, update `docs/SOURCE_OF_TRUTH_MAP.md`.
- If gate expectations change, update focused gate tests.

Issue #136:

- Issue #136 remains the standing Codex Run Ledger only.
- Every run with a PR must post a PR receipt and a ledger receipt.
- Ledger comments are durable GitHub truth; chat is not the final record.

# BUILD LADDER TO MONEY-READY MVP

This ladder is a reference draft. Each rung must be promoted into its own GitHub issue before implementation.

## Rung 0 - Master Synthesis build bible lock

- Issue title: Lock Master Synthesis build bible as reference draft.
- Purpose: Make the business plan, product deliverable, architecture map, schema/config map, and issue ladder repo-contained.
- Allowed files/areas: this file, source-truth closeout files, focused gates/tests if needed.
- Forbidden files/areas: product/runtime/frontend/backend/Slack/Supabase/Stripe/connectors/landing/dashboard/auth code.
- Implementation summary: document only.
- Proof required: `npm run gate:command`, `npm run gate:continuity`, `git diff --check`, focused source-truth tests if changed.
- Stop condition: draft PR open with receipts; no build started.
- Readiness movement: build-definition ready, not demo-ready.

## Rung 1 - Source-truth closeout after build bible

- Issue title: Promote the next executable rung from Master Synthesis.
- Purpose: Convert this reference draft into one active implementation issue without starting a second seam.
- Allowed files/areas: `ACTIVE_HANDOFF.md`, `FOLDERA_BUILD_ORDER.yaml`, `.foldera-contract.json`, `docs/SOURCE_OF_TRUTH_MAP.md`, focused gates/tests.
- Forbidden files/areas: product/runtime code and all implementation surfaces.
- Implementation summary: select exactly one next rung from this ladder and encode it as source truth.
- Proof required: command/continuity gates and focused tests.
- Stop condition: one next issue active; PR and ledger receipts posted.
- Readiness movement: repo-directed execution.

## Rung 2 - Current schema and source-lane audit

- Issue title: Audit current source/evidence schema and choose the first paid evidence lane.
- Purpose: Verify live/current repo schema and choose the minimum source lane for the $29 loop.
- Allowed files/areas: audit doc, schema inventory doc, read-only scripts if scoped, focused tests if needed.
- Forbidden files/areas: migrations, Supabase mutations, connector expansion, product UI changes.
- Implementation summary: document exact current tables, routes, env assumptions, and gaps for one source lane.
- Proof required: read-only repo inspection; Supabase live inspection only if explicitly authorized; no migration.
- Stop condition: one source lane selected or blocked with exact missing truth.
- Readiness movement: demo-ready planning.

## Rung 3 - Deterministic one-verdict fixture loop

- Issue title: Prove source evidence to Right Now verdict fixture loop.
- Purpose: Prove source evidence -> normalized evidence -> workday state -> trigger -> one verdict or safe silence.
- Allowed files/areas: `lib/workday-presence/**`, `lib/source-readiness/**`, `tests/fixtures/**`, focused tests, maybe `lib/work-packets/**` if issue scopes it.
- Forbidden files/areas: live connectors, Slack live rail, Supabase migrations, landing/dashboard redesign, Stripe.
- Implementation summary: add deterministic fixtures for Do this next, Fix this first, You are clear right now, and no-safe-source.
- Proof required: focused unit/fixture tests plus command/continuity gates.
- Stop condition: before/after fixture receipt proves one selected verdict and rejected unsafe candidates.
- Readiness movement: demo-ready.

## Rung 4 - Action receipt and state mutation proof

- Issue title: Prove one-click response mutates workday state with receipt.
- Purpose: Turn verdict response into durable state mutation and audit receipt.
- Allowed files/areas: Workday Presence action/state modules and focused tests.
- Forbidden files/areas: Slack live, external sends, schema migrations unless a prior schema issue authorizes them.
- Implementation summary: prove Done, Stuck, Break smaller, Snooze or equivalent actions update state.
- Proof required: before state -> verdict -> action -> after state -> receipt tests.
- Stop condition: all action paths have safe receipts.
- Readiness movement: demo-ready.

## Rung 5 - First user journey shell

- Issue title: Implement first user journey shell without unsupported claims.
- Purpose: Make signup/onboarding/source-status/verdict path coherent for one source lane.
- Allowed files/areas: only scoped frontend/app route files named by the future issue.
- Forbidden files/areas: broad redesign, dashboard/task-list drift, Slack live claims, connector breadth, Stripe unless payment issue is active.
- Implementation summary: route user from public promise to account, source readiness, first verdict, and receipt.
- Proof required: Playwright path proof, no unsupported-claim grep, command/continuity gates.
- Stop condition: local/browser proof for first journey shell; no money claim yet.
- Readiness movement: demo-ready to pilot-ready.

## Rung 6 - Minimal persisted state path

- Issue title: Persist one source-backed workday state path.
- Purpose: Ensure state survives refresh/session and is scoped to the user.
- Allowed files/areas: backend/API/database access files named by the issue; migrations only if a prior schema issue authorizes exact changes.
- Forbidden files/areas: unrelated schema cleanup, broad auth rewrite, connector expansion, billing.
- Implementation summary: persist and read current state, source trail, and receipts.
- Proof required: unit/API tests, RLS/user isolation proof if schema changes, browser refresh proof if UI path changes.
- Stop condition: persisted state readback works for one user path.
- Readiness movement: pilot-ready.

## Rung 7 - Trust/privacy/no-send rail

- Issue title: Prove no-send, source-trail, and privacy boundaries.
- Purpose: Make user trust the answer and know nothing was sent without permission.
- Allowed files/areas: privacy copy, receipt/source trail modules, focused tests.
- Forbidden files/areas: external sends, live Slack, broad legal/compliance claims.
- Implementation summary: expose safe source trail and no-send status; block raw private leakage.
- Proof required: tests for redaction, no raw content in receipts, no-send states.
- Stop condition: trust rail passes tests and UI copy stays claim-safe.
- Readiness movement: pilot-ready.

## Rung 8 - Payment / early-access intent path

- Issue title: Add bounded $29/month early-access/payment intent path.
- Purpose: Let user pay or reserve paid access without Brandon manually invoicing or operating service delivery.
- Allowed files/areas: pricing/payment route files scoped by issue, Stripe routes if explicitly assigned, tests.
- Forbidden files/areas: broad billing platform, unsupported revenue claims, enterprise pricing, custom service delivery.
- Implementation summary: clear offer, price/limits, cancellation/account boundary or explicit deferral.
- Proof required: Stripe test-mode or payment-intent proof, route tests, no unsupported claims.
- Stop condition: user can express paid intent or pay in a bounded test/proof path.
- Readiness movement: paid-ready.

## Rung 9 - Money-ready MVP gate

- Issue title: Prove money-ready MVP end to end.
- Purpose: Decide whether Foldera may ask for $29/month.
- Allowed files/areas: proof docs, e2e tests, small fixes only if proven necessary and scoped.
- Forbidden files/areas: adding new scope to pass the gate, fake customer proof, enterprise claims.
- Implementation summary: run full path: signup/account -> source lane -> verdict -> action -> mutation -> receipt -> payment/interest.
- Proof required: browser/API/data proof, source trail proof, no-send proof, safe silence proof, payment/interest proof, PR and ledger receipts.
- Stop condition: either paid-ready threshold met or exact blocker named.
- Readiness movement: paid-ready.

## Rung 10 - First non-owner validation

- Issue title: Prove first non-owner value loop.
- Purpose: Validate value with someone other than Brandon without white-glove manual operation.
- Allowed files/areas: proof docs, support/onboarding docs, small product fixes only if explicitly scoped.
- Forbidden files/areas: manual service treadmill, outreach automation, scraping, fake proof.
- Implementation summary: one real user reaches a source-backed verdict or safe blocker through the product path.
- Proof required: consented non-owner receipt, source trail, bounded support record, no fake claims.
- Stop condition: value proved, rejected, or narrowed.
- Readiness movement: post-paid validation.

# MONEY-READINESS THRESHOLD

Foldera may ask for $29/month only when all are true:

- A real user can understand the offer without a sales call.
- A basic account/workspace path exists.
- One source/evidence lane is real or explicitly controlled and honest.
- The user can get one trusted verdict: Do this next, Fix this first, or You are clear right now.
- The verdict has a safe source trail.
- Nothing is sent externally without explicit permission.
- State mutates after a one-click response.
- Safe silence works and is not treated as failure.
- A receipt proves before state, verdict, response, after state, and source trail.
- The public/pricing promise is bounded to what the product can prove.
- Payment or early-access capture works without Brandon manually operating the workflow.
- Support/onboarding burden is bounded and async.

Not required before $29/month:

- enterprise readiness
- SOC2/HIPAA/procurement claims
- broad connector platform
- Teams/email/calendar breadth
- full live Slack rail
- admin console
- custom service delivery

# CLAIMS ALLOWED AND FORBIDDEN

Allowed after this document only:

- Foldera is a Workday Presence Layer.
- This file is a `REFERENCE_DRAFT` build bible.
- The repo has source-truth controls, Command OS intake, Workday Presence modules, source-backed state artifacts, Slack test-mode proof, Supabase migrations, Vercel config, and GitHub gates.
- The first money path should be self-serve-oriented and proof-driven.

Forbidden until proved by future issues:

- Foldera is pilot-ready.
- Foldera is enterprise-ready.
- Foldera has SOC2, HIPAA, or procurement readiness.
- Foldera supports broad Slack/Teams/email/calendar connector breadth.
- Live Slack button callback proof is complete.
- Non-owner customer proof exists.
- $29/month payment readiness is live.
- The product can send externally without explicit proof for that rail.
- The dashboard is the core product.

# FORBIDDEN WORK

Forbidden in this issue:

- Do not implement product/runtime code.
- Do not run Supabase migrations.
- Do not change Vercel.
- Do not touch Slack / PR #142.
- Do not touch Stripe.
- Do not add connectors.
- Do not touch landing/dashboard/auth/backend.
- Do not do outreach/scraping/paid ads.
- Do not do broad cleanup.
- Do not split this draft into new authority files.
- Do not make this draft implementation authority.
- Do not claim build, demo, pilot, paid, customer, or enterprise readiness beyond what the repo proves.

# STOP CONDITIONS

Document stop condition:

- Stop when this file is upgraded into the build bible as `REFERENCE_DRAFT`, not implementation authority.
- Stop when it answers the required customer, deliverable, user journey, repo inventory, architecture, signal flow, schema, Vercel, GitHub, build ladder, proof, money-readiness, forbidden-work, and stop-condition questions.

Future issue stop condition:

- Each future issue stops after one PR, scoped proof, source-truth closeout, PR receipt, and issue #136 ledger receipt.
- No future issue may start the next rung automatically.
- If required proof fails, stop with exact blocker and do not widen scope.

Agent stop condition:

- Read repo truth first.
- Execute one issue only.
- Touch only allowed files.
- Run the required proof.
- Post GitHub receipts.
- Do not merge unless explicitly authorized and proof/branch protection allow it.
- Do not make Brandon the relay, tester, merger, stale-truth repair person, or product manager for agent drift.
