# Frontend Product Truth Gate

This gate protects dashboard/frontend proof. It is regression prevention, not visual polish.

The dashboard money shot must read as one focused executive surface: one current move or honest held-back state, one visible artifact state, a source trail, and safe controls. The visual reference is the dark Foldera command-center direction: compact hierarchy, **warm amber/gold accent on warm near-black** (per `DESIGN_SYSTEM.md` — the cyan/emerald era is retired as of #382), restrained support rail, and no debug/admin language.

## Today's Answer Source-Coverage Law

Today's answer is governed by `source_coverage`, not inbox quiet or hopeful copy.

- `thin` / `not_ready` coverage must show `Fix this first`; it may not show a clear-state or magical-state claim.
- `obligation_only` may support a narrow source-backed obligation answer, but it may not claim deep context or that Foldera "knows you."
- `context_ready` may make a stronger source-backed read once docs/files add real project context.
- `operator_ready` requires proven source diversity; copy alone cannot create it.
- The dashboard may show exactly one next connector at a time. No long connector list.
- Gmail-only low-signal states may not overclaim magic. Gmail-only high-signal states may become obligation-only, never deeper than that without cross-source evidence.
- If the recommended connector is not actually connectable in-product yet, the visible control must read as a `Next unlock`, not a fake-working connector action.

Learning-loop contract for future work:

- Today’s answer must stay compatible with the existing source trail, save, skip, approve, copy, edit, repeat-ignore, freshness, source-diversity, and successful source-backed-answer signals.
- This gate does not create a new learning system; it protects the approval/history path so those outcomes remain learnable when the later loop is built.

## Command

```bash
npm run gate:frontend
```

## Required Proof

Codex may not say DONE, PROVEN, or next blocker is GATE_9 for dashboard/frontend work unless `npm run gate:frontend` passes.

The gate requires:

- screenshot baselines for finished, requirements-needed, and no-safe states on desktop and mobile
- real-user surface checks for Today, Recent Work, Sources, and Account on desktop and mobile
- interaction audit coverage for visible dashboard controls
- banned-copy audit for backend/internal phrases in visible dashboard UI
- dashboard performance timing proof for first non-loading state, main content, and current action
- frontend receipt proof in `ACTIVE_HANDOFF.md` and `SESSION_HISTORY.md`
- production current screenshots attached or referenced when the frontend claim is about the live app
- proof that API-only or backend-only proof is not a frontend pass

The fixture screenshots are deterministic mocked-auth proof only. They must not use production owner data, write fake DB rows, or be called beta proof.

## Snapshot Matrix

Frontend/dashboard work is not done without screenshot proof for:

- production current desktop 1440x900
- production current mobile 390x844
- finished-artifact-ready fixture desktop 1440x900
- finished-artifact-ready fixture mobile 390x844
- requirements-needed fixture desktop 1440x900
- requirements-needed fixture mobile 390x844
- no-safe-artifact fixture desktop 1440x900
- no-safe-artifact fixture mobile 390x844

Committed Playwright baselines must cover the deterministic fixture states:

- finished-artifact-ready desktop 1440x900
- finished-artifact-ready mobile 390x844
- requirements-needed desktop 1440x900
- requirements-needed mobile 390x844
- no-safe-artifact desktop 1440x900
- no-safe-artifact mobile 390x844
- Today panel desktop 1440x900
- Today panel mobile 390x844
- Recent Work panel desktop 1440x900
- Recent Work panel mobile 390x844
- Sources panel desktop 1440x900
- Sources panel mobile 390x844
- Account panel desktop 1440x900
- Account panel mobile 390x844

Each state must prove:

- no text behind sticky footer
- no clipped text
- no horizontal overflow
- source trail visible where applicable
- controls visible and safe
- no backend/internal copy
- state label visible
- main action obvious
- support rail may not contain generic support filler
- Recent Work rows may not show raw artifact or generated body text
- fake upload/drop cards may not appear active
- fake notification controls may not appear active
- source and account panels must show useful real-user state
- no-safe/readiness states must show checked sources, source freshness, signal totals, processed/unprocessed counts, the plain-language hold reason, the next safe step, and explicit no-send safety without exposing private source contents
- no-safe/readiness states must obey source coverage: thin graphs show exactly one next connector and cannot masquerade as clear or magical
- common viewport density must hold at 1366x768, 1440x900, 1920x1080, and 390x844

Production-current screenshots may use mocked auth and intercepted deterministic API responses only to prove deployed frontend rendering without exposing private owner data. They must be labeled as frontend/runtime proof, not beta proof or production-data proof.

## Interaction Matrix

Every visible dashboard control must be classified as one of:

- `WORKING_ACTION`
- `NAVIGATION`
- `DISABLED_WITH_REASON`
- `PLACEHOLDER_HIDDEN`

Current required coverage:

| Control | Classification | Required proof |
| --- | --- | --- |
| Today nav | `NAVIGATION` | Selects Today in-shell |
| Recent Work nav | `NAVIGATION` | Selects Recent Work in-shell |
| Sources nav | `NAVIGATION` | Selects Sources in-shell |
| Account nav | `NAVIGATION` | Selects Account in-shell |
| Notification bell | `DISABLED_WITH_REASON` | Non-button disabled status or hidden until live alerts exist |
| Today/Account pill | `DISABLED_WITH_REASON` | Status-only with accessible current-section label |
| Learn more | `NAVIGATION` | Has a destination |
| Upgrade to Pro | `NAVIGATION` | Has a destination; no Stripe call in the gate |
| Profile dropdown | `WORKING_ACTION` | Opens menu with Account and Sign out |
| Copy read | `WORKING_ACTION` | Copies and shows success feedback |
| Copy draft | `WORKING_ACTION` | Copies and shows success feedback |
| Open requirements packet | `WORKING_ACTION` | Loads packet detail |
| Skip | `WORKING_ACTION` | Posts skip and shows feedback |
| Save | `WORKING_ACTION` | Posts approve/save and shows feedback |
| Save packet | `WORKING_ACTION` | Posts approve/save and shows feedback |
| Approve | `WORKING_ACTION` | Posts approve and shows no-send feedback |
| Sign out | `WORKING_ACTION` | Calls sign-out endpoint |
| Source trail cards | `DISABLED_WITH_REASON` | Not clickable-looking unless wired |
| Support/upload card | `DISABLED_WITH_REASON` | Says uploads are coming later, or is hidden; never active-looking unless wired |
| Account controls | `WORKING_ACTION` | Account panel controls are reachable |
| Icon-only buttons | `WORKING_ACTION` or `DISABLED_WITH_REASON` | Every visible icon button has an accessible label |

## Banned Copy

These phrases may not appear in visible dashboard UI:

- `NO REAL PRESSURE`
- `stale_selected_move_artifact`
- `selected move`
- `receipt explains`
- `safety bar`
- `mock room`
- `backend`
- `GATE_9`
- `no-safe artifact`
- `graph stale`
- `source freshness`
- `blocker packet`
- `owner/test user`
- `deterministic fixture`
- `stored winner fingerprint`
- `current receipt`
- `Recent Work support`
- `Sources support`
- `Account support`
- `Foldera keeps this panel inside the same app shell`
- `Drop a folder or document`
- `Foldera will get to work instantly`
- `Same-place controls`
- `legacy rooms`

Internal mentions are allowed only in docs, tests, comments, or backend logs. They are not allowed as visible user-facing dashboard copy.

Allowed human copy examples:

- "Foldera held back because the evidence was not strong enough."
- "No finished action today."
- "Checked sources."
- "Found X signals."
- "Processed Y / X."
- "No safe move yet."
- "Why: [plain-English reason]."
- "Next: [specific safe step]."
- "Nothing was sent."
- "This needs more input before Foldera can finish it."
- "Ready to save."
- "Inputs needed."
- "Checked today."
- "Why Foldera held back."
- "Source trail."
- "What you can do next."
- "Uploads coming later."
- "Evidence readiness."
- "Connected sources."
- "Foldera does not have enough live signal yet to reduce the pile intelligently."
- "Foldera checked your connected sources. Nothing cleared the action bar, so you do not need to sort through this pile right now."

## Layout Contract

These are hard failures for dashboard/frontend work:

- text hidden behind footer controls
- clipped source trail
- mobile cramping title, reason, action, or source
- loading skeleton after latest/readback resolves
- horizontal overflow
- right rail fighting the main card
- desktop reading like stacked debug cards
- finished state lacking visible source, control, or action
- requirements state hiding missing inputs
- no-safe state feeling like a fallback/debug dump
- common viewport density failing at 1366x768, 1440x900, 1920x1080, or 390x844
- dashboard content reaching first non-loading state, main content, or current action too slowly in mocked-auth frontend proof

The main card may scroll internally when content is long, but footer controls must remain visually separate from the body text. The source trail rail may scroll internally, but it may not clip or cover the support/upload panel.

## Real-User Surface Checks

`npm run gate:frontend` must fail when the dashboard exposes shell/filler UI that looks like an unfinished product surface.

Hard failures:

- support rail may not contain generic support filler such as "Recent Work support", "Sources support", or app-shell explanation copy
- Recent Work rows may not show raw artifact or generated body text; show title, status, date, type, and safe outcome only
- fake upload/drop cards may not appear active
- fake notification controls may not appear active
- Sources must show connected sources, last checked state, evidence readiness, and what Foldera is waiting for
- Account must show signed-in identity, connected source summary, no-outbound default, and sign out
- dashboard performance timing proof must report first non-loading state, main content visible, and current action visible
- common viewport density must be exercised at 1366x768, 1440x900, 1920x1080, and 390x844

## Receipt Rule

For dashboard/frontend work, the latest receipt must reference:

- `npm run gate:frontend`
- screenshot matrix result
- interaction matrix result
- banned-copy audit result
- layout contract result
- production current screenshots when live frontend proof is claimed
- whether production-current screenshots used mocked auth/intercepted data and therefore are not beta proof

If any item is missing, the frontend claim is incomplete.

API-only or backend-only proof is not a frontend pass. A final dashboard/frontend report may not say DONE, PROVEN, or next blocker is GATE_9 unless screenshot, interaction, copy, layout, and production-current receipt proof all pass.
