# Frontend Product Truth Gate

This gate protects dashboard/frontend proof. It is regression prevention, not visual polish.

The dashboard money shot must read as one focused executive surface: one current move or honest held-back state, one visible artifact state, a source trail, and safe controls. The visual reference is the dark Foldera command-center direction: compact hierarchy, cyan/emerald accents, restrained support rail, and no debug/admin language.

## Command

```bash
npm run gate:frontend
```

## Required Proof

Codex may not say DONE, PROVEN, or next blocker is GATE_9 for dashboard/frontend work unless `npm run gate:frontend` passes.

The gate requires:

- screenshot baselines for finished, requirements-needed, and no-safe states on desktop and mobile
- interaction audit coverage for visible dashboard controls
- banned-copy audit for backend/internal phrases in visible dashboard UI
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

Each state must prove:

- no text behind sticky footer
- no clipped text
- no horizontal overflow
- source trail visible where applicable
- controls visible and safe
- no backend/internal copy
- state label visible
- main action obvious

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
| Notification bell | `DISABLED_WITH_REASON` | Disabled with accessible reason |
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
| Support/upload card | `DISABLED_WITH_REASON` | Not clickable-looking unless wired |
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

Internal mentions are allowed only in docs, tests, comments, or backend logs. They are not allowed as visible user-facing dashboard copy.

Allowed human copy examples:

- "Foldera held back because the evidence was not strong enough."
- "No finished action today."
- "This needs more input before Foldera can finish it."
- "Ready to save."
- "Inputs needed."
- "Checked today."
- "Why Foldera held back."
- "Source trail."
- "What you can do next."

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

The main card may scroll internally when content is long, but footer controls must remain visually separate from the body text. The source trail rail may scroll internally, but it may not clip or cover the support/upload panel.

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
