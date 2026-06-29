# CONTEXT.md — Foldera from inception to now

---

# 🟢 NEW SESSION — START HERE

> ⚠️ **SUPERSEDED SNAPSHOT BELOW (2026-06-22).** Current truth lives in `ACTIVE_HANDOFF.md` (read it first, always). As of **2026-06-29** the active seam is **#567** (fire the R1 "finish-what-I-started" card), and the one blocker is **the dead keystone: goal inference.** `tkg_goals` is 50–83d stale + garbage n-grams → the engine can't climb the R1–R6 cascade → it serves homework reminders. **Next move = rebuild goal inference from recent real activity** (start: `lib/cron/goal-refresh.ts`). Foldera is the PROACTIVE value cascade, NOT an inbox/reply bot (reply-drafting is only R2). The 2026-06-22 snapshot below is kept for historical depth only.

**Boot order:** `ACTIVE_HANDOFF.md` → `AGENTS.md` → `ACTIVE_SEAM_STATE.json`. Then read the rest of this file for depth.

---

## (historical snapshot 2026-06-22, identity + dark-verdict session)

## One-paragraph state
The big discovery this session: the daily verdict had been **DARK since 2026-03-16**. `pipeline_runs` (owner `2cbc1bab`, 45d) showed **77 `generation_failed_sentinel` days** — the engine found **~45 real candidates/run**, ranked them, picked a winner, then the **`positive_winner_contract` gate blocked the winner ~96% of the time** with `error_class` null (mis-calibration, not a crash). **Root cause (fixed, #516/PR #517):** hunt findings dropped their source date — `huntFindingToScoredLoop` built `sourceSignals` with no `occurredAt` and `HuntFinding` had no date field, so `newestSourceDate()==null` and the currentness/anchor gates (`missing_current_artifact_anchor`, `stale_status_without_current_artifact_facts`) executed every hunt winner. Fix **grounds, doesn't loosen** (carry `HuntFinding.newestSignalAt` → `sourceSignals[].occurredAt`); unit-proven, deployed. **Still UNVERIFIED live** (the cause is fixed but no real verdict has been observed shipping yet — see Open Threads).

## What a GEM is (pin this; Bible Part II-B/II-C, `docs/GEM_SURFACING.md`)
The one **high-consequence** thing the user half-forgot (money / legal_gov / medical / work_transition / a real promise to a real person), at the **right time**, in the **right channel**, with **one act**. **NOT** a broadcast sender (roman@expert.micro1.ai = canonical noise), **NOT** a calendar reminder, **NOT** a $2.71 receipt.

## Shipped to `main` this session
- **#509 (executed on live data)** — consolidated the owner's split-brain accounts: drained Microsoft-login `e40b7cd8` → Google-login `2cbc1bab` (all signals/actions/commitments, both tokens, the paid Stripe sub).
- **#511 identity** — link-guard `findCrossUserTokenConflict` (PR #512); Google sole sign-in + Microsoft demoted to a connectable source, AzureADProvider removed (PR #513).
- **#514 Drive depth** (PR #515) — `syncDrive` enumerates the whole Drive (no `modifiedTime` floor), skip-known by `content_hash`, per-run cap.
- **#516 dark-verdict root cause** (PR #517) — hunt-finding date grounding (above).

## 🔴 OPEN THREADS (in priority order)
1. **#518 — VERIFY the verdict ships live, then calibrate what's left.** The #516 fix is deployed + unit-proven but NOT yet observed producing a real verdict. Live attempts hit the **manual directive cap** (`MAX_MANUAL_DIRECTIVE_CALLS_PER_DAY=3`, `lib/utils/api-tracker.ts`; today's cron blew it). **Verify via the 11:00 UTC `morning-pipeline` cron** (not manual-limited) → expect `pipeline_runs.outcome=generation_returned`. If it still SAFE_SILENCEs, calibrate the remaining gates with test/replay proof (NOT blind loosening, the #452 mistake): `missing_schedule_resolution_context` (too literal), goal-drift `missing_current_artifact_anchor`, and the downstream `discrepancy-card-frame.ts` `weak_risk; reminder_without_risk` gate (`docs/WINNER_TRACE_ROOT_CAUSE.md`).
2. **Owner — Vercel env.** Set `OWNER_USER_ID`/`FOLDERA_SELF_USER_ID` → `2cbc1bab-8e0e-43b0-bf4a-9a0cd6b5d91f` so owner-gated features follow the surviving account.
3. **Operational** — raise/segment the manual directive cap so the dashboard "Auto-detect" can self-test; surface a re-generate affordance once a card already exists (today it's hidden behind Dismiss). Also: branch protection on `main`.
4. **Consequence scoring (prior session, shipped #474/PR #475)** — magnitude-scaled commitment risk landed + backfilled; carry it up into signal-side stakes (`stakes-gate.ts`) next.
5. **Standing** — Scout money-move #494 activation; apply the whole-drive enumeration to OneDrive (#507).

## Operating notes / gotchas for the next agent
- **Consequence, not keywords.** Stakes scale with *magnitude × irreversibility × who-it-affects*, never the presence of a `$`/number. (`commitment-risk.ts` is the reference implementation.)
- **Ground, don't loosen.** When a gate over-blocks, first check whether the candidate is missing real data it should have (the #516 lesson: the date was being dropped). Loosening the gate ships hollow drafts (#452).
- **DON'T FRONT-LOAD. Pick and execute, report after.** The owner does not want a menu before work starts — make the highest-leverage call, do it, bring the result + reasoning. (`LESSONS_LEARNED.md` #20.)
- **Value is the only score.** Green CI / clean repo / merged PRs are hygiene, not value. "Healthy but producing nothing" is still failing — exactly what #516 caught (ingestion looked healthy; output was dark for 3 months).
- **Verify against REAL data via Supabase MCP**, and you can read/repair derived state. `pipeline_runs` is the verdict telemetry; `auth.users.raw_user_meta_data->'workday_presence_state'` is the live card; the manual cap counts `api_usage` rows with `endpoint in (directive, directive_retry)` since UTC midnight.
- **This remote container can't trigger the prod brain** (no `CRON_SECRET`, no user session; foldera.ai returns 403 to the sandbox). Verify via the scheduled cron + `pipeline_runs`, or have the owner tap/curl.
- **Fresh branch per seam**; roll the control plane forward after each merge so the next gate isn't stale.

---

The big picture is: Foldera started as "AI that finds the important work," but it
has matured into a Workday Presence Layer whose real product is one safe
re-entry point, with proof, without Brandon being the router.

## Foldera from inception to now

Foldera began from a real pain: modern work is scattered across Gmail, Slack,
calendar, docs, notes, tasks, screenshots, AI chats, and half-finished
commitments. The original emotional problem was not "I need a dashboard." It
was: I keep losing the thread of my day, and I need something smarter than me to
tell me what actually matters now.

That early instinct was correct. The product value was always in the "brain":
discrepancy detection, context reconstruction, risk detection, and surfacing the
one move the user would otherwise miss. You kept saying the "holy crap" moment
had to be the money shot. That survives in the repo now as doctrine: Foldera is
not a dashboard, task manager, inbox summary, chatbot, surveillance product, or
generic workflow suite; it is a Workday Presence Layer that reads source truth,
preserves state, selects at most one safe intervention, lets the user respond,
updates state, and stays quiet otherwise.

The product promise hardened over time: Foldera should check work sources so the
user does not reopen five tools just to rebuild context. The repo now says the
promise is one timely, grounded re-entry move from real sources, or safe silence
when no move is justified. That is the best version of the idea. Not "AI
productivity." Not "dashboard." Not "task manager." The sharper claim is: Foldera
finds the workday re-entry point before you do.

From inception, the main tension has been that your vision is stronger than the
execution system around it. You think like a founder/product visionary. You
generate high-value product intuition quickly. But the repo, tools, agents, and
chats started creating entropy. Useful findings landed in ChatGPT, Claude Code,
Codex, Cursor, Figma, GitHub issues, PRs, local terminals, and screenshots. That
made you the bridge. And the repo now directly acknowledges the controlling
failure: Foldera is not pilot-ready until Brandon is no longer the router.

That is the real inception-to-now story: the product is trying to solve the same
problem for users that the build process is causing for you. You are overwhelmed
by fragmented work state; Foldera is supposed to end fragmented work state. So
the build process itself became the first dogfood case.

The first major product doctrine was the "Right Now" concept: not seven
sections, not risk radar, not watchlists, not a category dump. One answer. One
card. "Do this," "You're clear right now," or "Fix this first." That was the
emotional breakthrough because relief matters as much as action. Foldera should
not manufacture work. It should tell the truth. Sometimes the most valuable
output is: "Foldera checked your connected sources. You do not need to sort
through this pile right now. Nothing was sent."

Then the build evolved through source-backed state and selectors. The repo
records that the source-backed Right Now selector path landed in issue #151 / PR
#153, bridging existing source-shaped rows into WorkdayPresenceState with safe
source trails. This matters because it moved Foldera away from fake AI summaries
and toward grounded work-state proof.

Then Slack became a major surface because Slack is where a workday intervention
can feel alive. But Slack also became a trap. You kept proving pieces, then
discovering the loop was not actually complete end-to-end. Slack self-loop
implementation exists historically, but owner-path readiness still needed proof.
Current source truth says issue #226 is paused and resumes after #231; its merged
slices include owner-landing honesty and sign-in reliability, but live owner
sign-in proof plus Slack self-loop receipt remain open.

The next major evolution was governance. The repo accumulated many issues, PRs,
contracts, source-truth files, gates, and receipts. This was not useless. It
created discipline. But it also created a new failure mode: too much
authority-management and not enough product closure. You correctly sensed that
agents kept asking "what next?" because the repo technically had rules, but the
launch ladder was buried. The build order now explicitly says the launch ladder
and active issue control sequencing, with one active seam only.

The launch ladder got clearer: first user journey shell, trust/no-send/privacy
rail, payment path, then non-owner validation. Rung 3 issue #208 is complete,
rung 4 issue #216 is complete, rung 5 issue #220 is complete, and rung 6 issue
#231 is active. Payment path being complete does not mean "go sell broadly." It
means one technical rung is proven. The repo is strict that rung 7/non-owner paid
loop remains forbidden until owner-path readiness is proven.

Right now, the active seam is #231: work-state purity. This is not a side quest.
It became active because the memory graph got contaminated. The build order says
the graph trusted weak signals too easily: personal contacts, a spammer, and
Amazon returns rose to the top because trust defaulted from minimal inbound
evidence. That contaminates every downstream confidence score, briefing, and "one
next move," so issue #231 outranks the owner-path seam until fixed.

The repo has a doctrine for raw intake: #165 is capture-only, not a roadmap, not
an implementation seam, and not a PR factory. Raw thoughts must classify, bind to
existing truth, create a new issue only when needed, update source truth only
when command state changes, execute one issue, post receipt, and stop.

What matters from inception is that the vision has not failed. It has gotten
sharper. The product is not too small; it is still too entropic. The right move
is not "build everything." The right move is to finish the purity seam, resume
owner-path proof, then prove one non-owner can understand and use the value
without you narrating it.

## Where we have been stuck 3+ times

1. Calling something proven before the real end-to-end loop is proven.
2. Reopening source-truth/governance instead of closing the active product seam.
3. Letting frontend/design excitement interrupt proof work.
4. Treating raw thoughts as implementation commands instead of intake receipts.
5. Making Brandon manually remember what happened across tools.

## Amendment — Friction Ledger

Foldera's hardest problem has never been vision. The vision kept sharpening. The
friction has been that every attempt to build the vision created more scattered
state: chats, prompts, PRs, issues, local diffs, terminal logs, Figma outputs,
Codex runs, Claude runs, Vercel proofs, Supabase checks, and partial receipts.

The repo now says the same thing in cleaner language: Foldera is not a dashboard,
task manager, inbox summary, chatbot, surveillance product, or broad workflow
suite; it is supposed to read source truth, preserve workday state, choose one
safe intervention, accept a one-click response, update state, and stay quiet.

The friction is that the build process itself kept violating the product promise.

Foldera is meant to prevent a person from reopening five tools to reconstruct
context. But Brandon kept having to reopen ChatGPT, Claude, Codex, GitHub,
Vercel, Supabase, local terminal, screenshots, and stale docs just to answer:
what happened, what is real, and what do we do next?

That is the central friction.

### 1. Brandon became the router

This is the biggest repeated failure.

You kept saying, in different ways: "I want to be Steve Jobs. You be Wozniak."
Meaning: you can see the product, the customer pain, the shape, and the money
moment, but you do not want to manually manage execution order, file truth, issue
truth, proof truth, agent scope, and terminal receipts.

The repo now explicitly agrees: Foldera is not pilot-ready until Brandon is no
longer the router.

You tried to fix this by:

- adding project instructions,
- creating source-truth docs,
- using Codex prompts,
- using Claude Code prompts,
- adding run ledgers,
- adding active handoffs,
- building intake routing,
- making GitHub the authority,
- asking every agent to preserve receipts.

Partial success: repo truth now exists.

Still open friction: every tool does not yet automatically write back. Normal
ChatGPT conversation still does not auto-post unless the Custom GPT Action is
wired. Local uncommitted work still does not automatically capture unless a
hook/script exists. So Brandon still becomes the bridge when work happens outside
the enforced rail.

### 2. Execution memory scattered everywhere

You hit this friction constantly: useful work happened, but it did not become
durable truth.

This happened across:

- ChatGPT threads,
- Claude Code runs,
- Codex runs,
- Cursor prompts,
- Gemini/Fable audits,
- Figma/Lovable frontend outputs,
- local PowerShell tests,
- Vercel deploys,
- GitHub issues,
- PR comments,
- untracked local files,
- screenshots,
- pasted summaries.

The attempted fix was the execution-memory doctrine: every meaningful chat, agent
run, code run, audit, or owner thought should end in a durable receipt. Issue
#165 became raw input capture; issue #136 became ledger/receipt surface. The
doctrine correctly says #165 is capture-only, not roadmap, not implementation
seam, and not PR factory.

Partial success: the intake endpoint now works manually and writes to GitHub.

Still open friction: it is not yet fully automatic from every surface. The
endpoint exists; the capture fabric is incomplete.

### 3. "We proved it" kept meaning different things

This one has burned you repeatedly.

You kept getting told:

- build passed,
- PR merged,
- route exists,
- endpoint exists,
- test passed,
- Vercel deployed,
- source truth updated.

But then you would ask the right founder question: does it actually work end to
end?

Often the answer was: not fully.

This happened with:

- Slack self-loop,
- sign-in reliability,
- owner path,
- durable receipt,
- source-backed Right Now,
- payment path,
- intake endpoint,
- dashboard shell,
- launch ladder,
- non-owner proof.

The repo now tries to discipline this by requiring proof that matches the
affected path; docs, screenshots, and passing build are not product proof by
themselves.

Partial success: proof language got much better.

Still open friction: agents still overstate progress if the proof standard is not
named before execution.

### 4. Slack self-loop became a repeated pain point

Slack is important because it is the natural place for the "one intervention" to
happen.

But it became a recurring friction loop:

- Slack rail work existed.
- Slack self-loop implementation existed historically.
- Test-mode paths existed.
- Owner-path readiness still was not truly proven.
- You kept feeling like "we already did this," but then there was no clean owner
  receipt showing the loop was actually complete.

Current repo truth says #226 is paused but still not closed. It resumes after
#231. Its open proof is reliable owner sign-in, successful Slack self-loop, one
real next move, and durable receipt.

Partial success: slices landed, including owner-landing honesty and sign-in
reliability.

Still open friction: the actual owner-path proof is not closed until the live
loop produces the expected receipt.

### 5. Sign-in reliability kept blocking product truth

This was maddening because sign-in is not the product, but if sign-in breaks, the
product cannot be experienced.

You hit:

- Gmail sign-in weirdness,
- owner session instability,
- app/router auth problems,
- "I can only sign in with Gmail" confusion,
- sign-in failed states,
- dashboard/settings route weirdness,
- uncertainty about whether auth fixes were allowed under the current contract.

Partial success: PR #230 completed sign-in reliability slice, according to source
truth.

Still open friction: sign-in reliability slice is not the same as full owner-path
proof. It removed one blocker but did not close #226.

### 6. Source-truth governance became both solution and drag

You correctly built governance because chaos was killing execution.

But then governance itself became friction.

The repo accumulated:

- ACTIVE_HANDOFF.md,
- FOLDERA_BUILD_ORDER.yaml,
- .foldera-contract.json,
- SOURCE_OF_TRUTH_MAP.md,
- North Star Lock,
- Product Operating System,
- Master Bible,
- Run Ledger,
- Open Threads,
- issue/pr receipts,
- continuity gates,
- source-truth gates,
- contract restrictions.

That helped, but it also created archaeology. Agents saw too many old issues,
completed receipts, superseded docs, and stale directives.

A prior audit correctly diagnosed it: the core problem was not missing code; it
was too much governance without a locked launch sequence.

Partial success: the launch ladder is now much clearer. ACTIVE_HANDOFF says #231
is active, #226 is paused, rungs 3–5 are complete, and one active seam controls
work.

Still open friction: every new agent run still needs to obey the boot sequence,
or it can fall back into stale docs and old issue archaeology.

### 7. Launch ladder was buried too long

For a while, the repo had build order but not a simple launch spine.

That caused repeated confusion:

- Are we doing dashboard shell?
- Slack?
- source-backed selector?
- payment?
- non-owner proof?
- governance?
- intake?
- owner-path?
- frontend?

The product sequence existed, but it was not always visible enough to stop agents
from asking Brandon to route.

The repo now says the current active issue is #231, priority class
WORK_STATE_PURITY, and the next seam is #226 owner-path readiness after #231 is
proven.

Partial success: launch ladder is now explicit.

Still open friction: if the next operator ignores source truth, the old confusion
returns immediately.

### 8. Frontend/design kept tempting drift

This happened a lot.

Figma, Lovable, Google Stitch-style AI builders, screenshots, and premium UI
ideas created excitement. Some outputs looked promising. Some were visually good.
But they also created friction because frontend mocks started competing with
product proof.

You kept trying to make the product feel excellent, premium, "100M," and visually
obvious. That is valid. But the recurring mistake was letting UI quality
interrupt proof quality.

Repo doctrine now rejects dashboard/task-manager drift, inbox summaries,
chatbot-first UI, connector theater, and broad admin panels as the core value
loop.

Partial success: the product identity got sharper.

Still open friction: frontend polish still feels more tangible than backend
proof, so it keeps pulling attention away from the active seam.

### 9. AI design/coding tools did not share context

This was a huge friction source.

Figma AI did not know what Lovable knew. Lovable did not know repo truth. ChatGPT
knew product doctrine but could not directly execute repo patches unless tool
access was present. Claude/Codex could patch but sometimes lacked the latest
emotional/product context. Gemini/Fable could audit, but audit output did not
automatically become repo truth.

You tried to solve this through prompts:

- "panel of experts,"
- "999999x audit,"
- "savage $100M AI,"
- "do the work,"
- "don't just memo,"
- "load GitHub first,"
- "force boot sequence."

Partial success: better prompts helped.

Still open friction: prompts are not enforcement unless backed by source truth,
gates, or writeback.

### 10. Raw thoughts kept becoming implementation pressure

You had many real insights:

- "Foldera should find the re-entry point before I reopen five tools."
- "This needs to be always on."
- "Every road needs to flow to GitHub."
- "I need the Wozniak layer."
- "The dashboard is not the thing."
- "The brain is the money shot."

The friction was that raw thoughts sometimes became immediate build pressure. But
raw thoughts need classification first.

The North Star now defines the command rail: classify input, bind to an issue/PR
when possible, create one issue only if needed, update source truth only when
command state changes, execute one issue, post receipt, stop.

Partial success: intake endpoint now classifies and writes back.

Still open friction: auto-capture and routing discipline are not universal yet.

### 11. Local work and untracked drafts remain dangerous

This is the "we did something and it never made it" problem.

You correctly identified the minimum viable safety net: pull all local
unmerged/untracked changes into some durable draft/receipt before they disappear.

Right now, manual PowerShell POST works. But local work still needs:

- post-commit hook,
- capture-draft script,
- git status/diff receipt,
- untracked file inventory,
- issue #165 writeback,
- clear "not pushed / not merged / draft only" classification.

Partial success: the endpoint is ready.

Still open friction: local capture automation is not yet proven unless it has
actually been implemented and receipts appear.

### 12. Contracts were sometimes too restrictive for the thing you wanted fixed

The contract system helped prevent chaos, but it also caused "why can't we just
fix the obvious thing?" friction.

Current contract forbids live Slack, auth, Stripe/billing, package changes,
schema implementation, source-lane implementation, data mutation, components,
dashboard UI, connector expansion, and broad cleanup while #231 is active.

That is correct for safety. But emotionally it feels dumb when the thing
bothering you is sign-in, Slack, UI, or local automation.

Partial success: the contract protects the active seam.

Still open friction: you need to remember that forbidden work may be correct work
later, just not now.

### 13. Work-state purity was discovered late but is foundational

This is the newest major fire.

The memory graph became contaminated because weak inbound evidence created false
trust. The build order says the graph surfaced personal contacts, a spammer, and
Amazon returns because trust defaulted too easily. That rots confidence,
briefing, and one-next-move quality.

This explains why #231 jumped ahead of #226.

Partial success: the repo correctly reprioritized work-state purity.

Still open friction: this feels like another detour, but it is actually
prerequisite hygiene. If the graph trusts garbage, Foldera's "one move" becomes
garbage.

### 14. Non-owner proof keeps getting prematurely attractive

You want market proof. That is right.

But the repo keeps blocking non-owner/rung 7 until owner path is proven. Current
contract explicitly says non-owner paid loop and rung 7 implementation remain
forbidden until #226 is proven.

Partial success: the product now distinguishes owner proof from non-owner proof.

Still open friction: because you want validation, it is tempting to skip the
boring owner-path receipt. Do not.

### 15. Payment path got proven before value felt proven

Rung 5 payment path is marked complete and proven. ACTIVE_HANDOFF says payment
path was proven end-to-end via live infrastructure checks.

That is good, but it creates weird emotional friction: "Payment works, but the
core owner loop still feels unfinished."

Partial success: payment infrastructure is not the blocker.

Still open friction: payment proof does not equal product proof.

### 16. The "brain" is still the product, but brain quality depends on boring plumbing

The money shot is still:

- source-backed state,
- discrepancy/trigger detection,
- one intervention,
- safe silence,
- source trail,
- user response,
- state mutation,
- durable receipt.

The Product Operating System defines this core loop clearly: read source-shaped
evidence, preserve workday state, detect trigger/blocker/timing shift/next-action
gap, select one intervention, generate Right Now payload, show one trusted move or
safe silence, let user respond, mutate state, preserve audit trail, stay quiet.

Friction: the exciting "brain" depends on unexciting rails:

- auth,
- source truth,
- trust scoring,
- receipts,
- routing,
- gates,
- local capture,
- safe no-send boundaries.

Partial success: the architecture is now right.

Still open friction: it does not yet feel magical because the rails keep
interrupting the magic.

### 17. You kept using more AI to fix AI coordination

This is the meta-friction.

You used:

- ChatGPT for strategy and doctrine,
- Claude/Codex for repo execution,
- Gemini/Fable for audits,
- Figma/Lovable for UI,
- PowerShell for live endpoint proof,
- GitHub for source truth.

That was not stupid. It was a reasonable survival strategy. But without one
durable intake/receipt layer, more tools created more fragmentation.

Partial success: the Command OS intake is the right corrective path.

Still open friction: until every meaningful surface writes back, adding another
tool increases entropy.

### 18. You kept trying hard, but the system kept rewarding partial completion

This is the hardest truth.

You were not lazy. You kept pushing. You ran audits, pasted logs, tested
endpoints, challenged fake proof, demanded source truth, asked for better prompts,
pushed agents to execute, and noticed when "done" was not actually done.

The repeated failure was not effort. It was transaction closure.

A Foldera transaction is not complete unless:

1. work happened,
2. it landed in GitHub,
3. proof exists,
4. source truth was updated or explicitly marked unchanged,
5. the next seam is clear,
6. the user does not have to remember it.

ACTIVE_HANDOFF now encodes this: GitHub writeback before stop is mandatory; chat
memory is not source truth; work done without GitHub writeback is incomplete;
every PR must close source truth before stop.

That is the fix.

## Final amended big picture

Foldera began as an AI work brain. It became a Workday Presence Layer. The product
promise is still excellent: find the one safe re-entry point from real work
sources, with proof, and stay quiet otherwise.

The friction from inception has been that the build process kept recreating the
same disorder the product is supposed to solve.

You hit friction in vision translation, issue routing, source-truth sprawl, stale
docs, PR archaeology, proof inflation, Slack self-loop, sign-in reliability, local
untracked work, ChatGPT auto-capture, AI tool context mismatch, frontend drift,
contract restrictions, contaminated entity trust, premature non-owner proof, and
payment-before-value sequencing.

You tried hard to fix it through prompts, docs, gates, issues, PRs, audits,
ledgers, handoffs, source-truth maps, intake endpoints, and live PowerShell proof.
