# Foldera Promise-Chain Audit

Date: 2026-05-13
Mode: audit only

Promise audited:

> Foldera reads the noise across connected sources, finds what matters, drafts the next move, shows the source trail, and waits for approval.

## Current Product Truth

Health is non-blocking. `npm run health` returned `RESULT: 0 FAILING` at 2026-05-13 10:58 PT:
- Gmail fresh: 6h ago
- Outlook fresh: 6h ago
- Mail cursors current
- Last generation: `write_document`
- No stale `pending_approval` over 20h
- No repeated directive

Production data confirms real connected owner sources:
- Active Gmail token for `b.kapp1010@gmail.com`, synced at `2026-05-13T11:52:20.437Z`
- Active Microsoft token for `b-kapp@outlook.com`, synced at `2026-05-13T11:52:14.738Z`
- One disconnected synthetic/test Google token for `gate2-test@foldera.ai`

Production signal inventory for the owner:
- `outlook`: 2,207 rows, newest message at `2026-05-13T11:40:53Z`, 0 unprocessed
- `gmail`: 709 rows, newest message at `2026-05-13T08:34:17Z`, 0 unprocessed
- `outlook_calendar`: 219 rows, newest future event at `2026-05-27T00:00:00Z`, 0 unprocessed
- `google_calendar`: 1 row, newest at `2026-05-13T00:00:00Z`, 0 unprocessed
- `drive`: 127 rows, newest at `2026-05-06T20:15:45Z`, 0 unprocessed
- `uploaded_document`, `claude_conversation`, `chatgpt_conversation`, `microsoft_todo`, `user_feedback`, and `artifact` rows exist, but most are not fresh live connector proof.

Current visible artifact truth:
- Production has one active owner `pending_approval` `write_document`: `8aca653a-f0a1-46e9-9af4-323c5cee539b`
- Title: `WorkSourceWA account activity closeout`
- Origin: `selected_move_generate`
- Confidence: `45`
- `/api/conviction/latest` is expected to show it because selected-move rows bypass the normal confidence threshold and still run strict artifact/discrepancy validation.
- `/api/conviction/history` should show it first and hide recent `do_nothing` no-send rows from user-facing history.

Important contradiction:
- `npm run winner:autopsy` exited with a current blocker and reported `current_winner.verdict = no_safe_artifact_today`.
- The same report also listed two Tier 1 WorkSourceWA admin-deadline candidates as `top_viable_candidates` with no missing blockers.
- The same candidates also appeared under `blocked_candidates` with `discrepancy_pattern_memory:noisy_pattern:discrepancy:deadline_staleness` and `discrepancy_pattern_memory:noisy_pattern:discrepancy:exposure`.
- The persisted selected artifact exists, but the current selector truth is no longer internally coherent.

## Rung-by-Rung Audit

### 1. Reads The Noise

What sources are actually connected:
- Gmail and Microsoft/Outlook are the real active OAuth connectors.
- The same Microsoft connector appears to feed Outlook mail and Outlook calendar.
- Google appears connected for Gmail, Google Calendar, and Drive scope support, but production freshness is strongest for Gmail and weak/thin for Google Calendar and Drive.
- `user_feedback` and prior `artifact` rows feed the learning loop as internal signals.
- Claude/ChatGPT/uploaded document rows exist as historical imported sources, not fresh active connector proof.

What fresh data is available:
- Fresh mail from Gmail and Outlook.
- Fresh Outlook calendar data, with future events.
- One Google Calendar row.
- No unprocessed backlog in the main source groups.
- Behavioral graph freshness is mostly current, but `winner:autopsy` flagged one current graph drift finding: Brandon Kapp stored 90-day count `96` vs actual `94`.

What signals were read:
- `winner:autopsy` read 250 recent encrypted/decrypted signal samples with `decrypt_fallback_count = 0`.
- Candidate selection reads `user_tokens`, `tkg_signals`, recent `tkg_actions`, behavioral graph freshness, polluted trusted entities, and scorer output.
- The selected WorkSourceWA artifact is grounded in a saved commitment plus two signal-style evidence lines: active commitment last updated 20 days ago, 0 days remaining, no movement.

Important source types missing or weak:
- Real non-owner connected account proof is still missing.
- Fresh Google Drive/Docs proof is stale relative to mail.
- Google Calendar proof is extremely thin.
- Microsoft To Do is stale and tiny.
- Mail sync appears preview-oriented; `winner-truth.ts` still flags preview-only mail body storage as a future backlog risk.
- There is no evidence here of Slack, browser history, bank/payment source, ATS/job board source, or direct WorkSourceWA connector. The WorkSourceWA signal is inferred from stored commitments and mail/calendar context, not a direct WorkSourceWA read.

Is source freshness truth reliable:
- For Gmail/Outlook mail, yes enough for currentness: health, connector rows, and signal timestamps agree.
- For the whole promise "across connected sources," only partly. Health summarizes Gmail/Outlook freshness and cursors, but it does not make the weakness of Drive, Google Calendar, To Do, stale historical imports, non-owner absence, or graph drift visible in the same product-level truth.

Verdict:
- Reads the noise: working for owner mail and Outlook calendar.
- Weak for broader connected-source breadth and reliability explanation.

### 2. Finds What Matters

What candidates were considered:
- `scoreOpenLoops()` builds candidates from signals, commitments, goals, discrepancies, behavioral patterns, hunt anomalies, suppression history, and recent actions.
- `selectRankedCandidates()` then applies positive-winner/taste/artifactability gates, discrepancy pattern memory, recent-action guardrails, and ranking adjustments.
- `winner:autopsy` currently reports WorkSourceWA admin-deadline candidates, calendar gap candidates, goal drift candidates, and stale support/account follow-up candidates.

What candidates were blocked:
- Goal drift: blocked by `missing_current_artifact_anchor`.
- Calendar gap: blocked by `missing_schedule_resolution_context`, `changes_next_move_required`, and/or `low_value_event_invite_without_dependency`.
- Old support-line/account-change commitment: blocked by `stale_status_without_current_artifact_facts` and `missing_current_artifact_anchor`.
- WorkSourceWA deadline candidates: simultaneously listed as top viable and blocked by noisy discrepancy pattern memory.

What candidates were selected:
- Persisted selected move: WorkSourceWA account activity deadline became a deterministic no-paid `write_document` artifact and is now `pending_approval`.
- Current autopsy selection: no selected current winner; reports `no_safe_artifact_today`.

Why was the winner chosen:
- For the persisted artifact, the chosen move was a Tier 1 admin-deadline decision packet: deadline today, no movement for 20 days, owner/action/deadline can be rendered deterministically without a paid model call.

Why were other candidates rejected:
- Mostly because they lacked enough current artifact/source anchor, schedule-resolution context, or outcome-moving specificity.
- Recent no-send rows show internal failure-shaped artifacts in the DB summary view: `__GENERATION_FAILED__`, no risk, and selected-but-not-sent candidate traces. These are filtered from user-facing history, but they are still part of system truth and candidate memory context.

Are we too strict, too loose, or selecting the wrong class:
- Too strict and internally contradictory at the first broken point. A valid-looking WorkSourceWA class can be both "top viable" and "blocked by noisy pattern memory."
- Too loose in diagnostic storage: recent `do_nothing` rows preserve internal failure markers in `tkg_action_summaries`, even if dashboard history hides them.
- The product is not selecting the wrong general class; admin-deadline/work-source account activity is exactly in the product focus. The failure is consistency and confidence in selection truth.

Verdict:
- First broken rung.
- The product can find mattering candidates, but the winner contract is not stable enough to trust. "No safe artifact today" can coexist with viable Tier 1 candidates and an already-persisted pending artifact.

### 3. Drafts The Next Move

What artifact/current move was produced:
- `WorkSourceWA account activity closeout`, a deterministic document packet.
- It includes final recommendation, owner, next physical step, deadline, consequence, source trail, and approval note.

Is it actually useful:
- Partly. It names the real deadline and action family: complete one WorkSourceWA account activity now.
- It is not merely "remember this"; it tells Brandon the concrete closing action.

Is it specific enough:
- Specific enough for a no-paid deterministic admin-deadline packet.
- Weak in polish and exactness: the directive/title truncates `"creat"` in the claim, and the source trail includes raw JSON text. That makes it feel generated from a system frame rather than from clean product intelligence.

Would Brandon say "holy crap, how did it know?":
- Not yet.
- The strongest moment is recognizing a WorkSourceWA account activity deadline with zero days remaining after 20 stalled days.
- The weaker moment is the output itself: it is useful, but it reads like an execution packet assembled from evidence fields, not a deeply contextual operator move.

Is it only a summary/reminder dressed up as work:
- Not entirely. It tells a concrete action and has a save/approval path.
- But it still leans toward "packet about the action" rather than doing the work or preparing the exact WorkSourceWA completion payload. It does not know which account activity is fastest/highest leverage, whether a saved job/resume update already exists, or what exact form/page should be used.

Verdict:
- Drafting works at a basic deterministic level.
- Quality is below the "holy crap" bar and source formatting leaks raw structure.

### 4. Shows Source Trail

Can the user see exactly what evidence caused the move:
- Partly. The artifact and dashboard frame expose the saved commitment and the "20 days stalled / 0 days remaining" evidence.
- The dashboard builds source trail items from discrepancy evidence and source refs.

Are source labels clear:
- Some labels are clear, such as `Saved commitment` and generic source labels from `source-ref-labels.ts`.
- Current refs like `commitment:1`, `signal:2`, `signal:3` are ordinal placeholders created during deterministic selected-move persistence, not stable source identifiers.
- Raw JSON appears in the evidence/risk fields, which is trustworthy to an engineer but not clean for a user.

Is the trail trustworthy without exposing internal garbage:
- Not fully.
- The dashboard sanitizes labels and filters internal history rows, but the persisted source evidence still contains raw JSON and truncated title text.
- Recent no-send rows in `tkg_action_summaries` still contain `__GENERATION_FAILED__` and internal selected-candidate traces. They are hidden from normal user history but remain misleading system truth.

Verdict:
- The source trail exists and is better than a black box.
- It is not yet product-clean or fully trustworthy because it uses synthetic refs and raw evidence formatting.

### 5. Waits For Approval

Can the user copy/save/skip/approve:
- Yes at the code path level.
- Dashboard has `Copy draft`, `Skip`, and primary action (`Save` for write documents, `Approve`/`Approve & send` for message actions depending on send flag).
- `/api/conviction/execute` delegates to `executeAction()`.

Does history record the result:
- Yes.
- Approve changes status to `executed`, sets `approved_at`/`executed_at`, writes execution result, and inserts an approval feedback signal.
- Skip changes status to `skipped`, sets negative feedback, inserts a skip feedback signal, can suppress commitments after repeated skips, and updates ML/entity attention.
- `/api/conviction/history` returns user-facing pending/approved/executed/skipped rows and filters no-send/internal rows.

Does skipping teach the system:
- Yes, but with risk.
- Skip inserts `user_feedback`, updates feedback weight, reinforces attention, can suppress commitments after 3 skips, and contributes to pattern memory.
- The risk is that pattern memory has already caused over-filtering or contradiction around WorkSourceWA deadline candidates.

Is anything pretending to be approved/persisted when it is not:
- The current WorkSourceWA artifact is truthfully `pending_approval`, not approved.
- Approval-time outbound email is disabled by default; document save can still execute without sending email.
- The misleading area is not approval state; it is no-send/current-winner truth and internal failure rows in summaries.

Verdict:
- Approval control mostly works.
- Learning from skip works mechanically but is a likely source of the first broken rung.

## What Works

- Real owner Gmail and Outlook/Microsoft connectors are active and fresh.
- Mail cursor and unprocessed signal backlog are clean.
- Signal content decrypt sample is clean.
- The system can identify deadline/admin candidates from source trail and commitments.
- Deterministic selected-move persistence exists and avoids paid generation.
- The current WorkSourceWA artifact is a real persisted `pending_approval` row.
- Latest/history readback paths can surface the selected artifact.
- Dashboard can copy/save/skip/approve at the code path level.
- Approve/skip writes feedback and action history.
- Outbound email is locked off by default unless explicitly enabled.

## What Is Fake, Weak, Or Misleading

- "No safe artifact today" is not currently trustworthy because the same autopsy reports Tier 1 viable WorkSourceWA candidates.
- Source freshness truth overstates the whole promise if read as "all useful sources are fresh"; mail is fresh, but Drive/To Do/imported conversation context is stale and non-owner proof is absent.
- Source refs for the selected WorkSourceWA artifact are not stable evidence IDs; they are `commitment:1`, `signal:2`, `signal:3`.
- Raw JSON appears in risk/evidence and source trail material.
- The WorkSourceWA document is useful, but it is not yet "finished work, every morning" quality. It tells Brandon what to do rather than preparing the exact account activity route/content.
- Recent `do_nothing` summary rows contain `__GENERATION_FAILED__` and internal candidate traces. User-facing history filters them, but the DB truth is still dirty.
- Skip/pattern-memory learning is powerful but currently suspect; it can suppress the same class the product later needs to select.

## First Broken Rung

`FINDS WHAT MATTERS`.

The system reads enough fresh data and can produce a persisted artifact, but selection truth is inconsistent:
- `current_winner.verdict = no_safe_artifact_today`
- two Tier 1 admin-deadline candidates are listed as viable with no missing blockers
- those same WorkSourceWA candidates are also blocked by noisy pattern memory
- a real pending WorkSourceWA artifact exists from selected-move persistence

Until that contradiction is resolved, later rungs cannot be trusted. Draft quality and source trail cleanup matter, but they should not be fixed first.

## One Highest-Leverage Fix

Make candidate selection truth single-valued for the current owner-day WorkSourceWA deadline class:

- If a Tier 1 candidate is artifactable and passes discrepancy-card quality, `winner:autopsy` must return `selected`, not `no_safe_artifact_today`.
- If the candidate is blocked by pattern memory, it must not also appear as top viable with no missing blockers.
- If an already-persisted `pending_approval` selected-move artifact exists for the same candidate, the winner truth should explicitly report "selected move already pending approval" rather than "no safe artifact today."
- Pattern memory should distinguish user rejection, operational no-send, already-persisted duplicate suppression, and true noisy deadline classes.

This is the highest leverage because it fixes the promise's decision point before polishing the artifact or UI.

## Exact Files Involved

Selection and autopsy:
- `scripts/winner-autopsy.ts`
- `lib/system/winner-truth.ts`
- `lib/briefing/generator.ts`
- `lib/briefing/discrepancy-card-frame.ts`
- `lib/briefing/scorer-failure-suppression.ts`
- `lib/briefing/__tests__/positive-winner-contract.test.ts`
- `lib/briefing/__tests__/winner-selection.test.ts`
- `lib/briefing/__tests__/discrepancy-card-frame.test.ts`

Selected-move generation/readback:
- `app/api/conviction/generate/route.ts`
- `lib/conviction/artifact-generator.ts`
- `app/api/conviction/latest/route.ts`
- `app/api/conviction/history/route.ts`
- `app/api/conviction/actions/[id]/route.ts`
- `lib/conviction/action-read-shapes.ts`
- `app/api/conviction/latest/__tests__/selected-move-generate.test.ts`
- `app/api/conviction/latest/__tests__/free-artifact-allowance.test.ts`

Approval/history/learning:
- `app/api/conviction/execute/route.ts`
- `lib/conviction/execute-action.ts`
- `app/api/conviction/outcome/route.ts`
- `lib/signals/entity-attention-runtime.ts`
- `lib/ml/directive-ml-snapshot.ts`
- `lib/conviction/__tests__/execute-action.test.ts`
- `app/api/conviction/execute/__tests__/route.test.ts`
- `app/api/conviction/history/__tests__/route.test.ts`

Dashboard source trail and controls:
- `app/dashboard/page.tsx`
- `app/dashboard/dashboard-page-model.tsx`
- `components/foldera/DailyBriefCard.tsx`
- `components/foldera/RightPanel.tsx`
- `components/dashboard/DashboardDesktopStage.tsx`
- `components/dashboard/DashboardMobileLayout.tsx`
- `tests/e2e/dashboard-navigation.spec.ts`

Source freshness:
- `scripts/health.ts`
- `lib/integrations/connector-health.ts`
- `app/api/integrations/status/route.ts`
- `lib/sync/google-sync.ts`
- `lib/sync/microsoft-sync.ts`
- `lib/signals/signal-processor.ts`

## Proof Required

No paid generation. No outbound email. No Stripe. No schema change.

Minimum proof for the highest-leverage fix:
- `npm run health`
- `npm run winner:autopsy`
- Focused selection tests:
  - `node node_modules/vitest/vitest.mjs run lib/briefing/__tests__/discrepancy-card-frame.test.ts lib/briefing/__tests__/winner-selection.test.ts lib/briefing/__tests__/positive-winner-contract.test.ts --reporter=verbose`
- Read-only Supabase proof:
  - current owner tokens remain fresh
  - selected WorkSourceWA pending action exists or is explicitly treated as already pending
  - recent no-send rows do not train the same Tier 1 class into contradictory viable/blocked state
- If any dashboard-visible behavior changes later, then run:
  - `npm run build`
  - `npm run lint`
  - `npx vitest run tests/config/__tests__/large-file-splits.test.ts --reporter=verbose`
  - `npx playwright test tests/e2e/dashboard-navigation.spec.ts tests/e2e/authenticated-routes.spec.ts --reporter=list`

Proof that would fail a fake fix:
- `winner:autopsy` must not return `no_safe_artifact_today` while also listing unblocked Tier 1 WorkSourceWA candidates.
- `winner:autopsy` must not ask for graph repair if the graph drift is a harmless count-aging discrepancy and not actually blocking the selected candidate.
- `/api/conviction/latest` must still return the real pending artifact only if it passes strict artifact/discrepancy validation.
- History must not expose `__GENERATION_FAILED__` no-send rows as user-facing work.

## Do Not Touch

- Landing page
- UI polish
- Controller/meta improvements
- Paid/model-backed generation
- Outbound email
- Stripe
- Schema or migrations
- Destructive DB action
- Fake demo data
- Golden artifact proof data
- Non-owner fake accounts
- Existing unrelated dirty files in the worktree

## Stop Condition

Stop here.

Do not implement until the first broken rung is accepted as `FINDS WHAT MATTERS` and the next seam is explicitly scoped to selection-truth consistency, not artifact polish or dashboard UI.

