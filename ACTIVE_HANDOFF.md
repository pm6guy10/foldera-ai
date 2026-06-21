# ACTIVE HANDOFF - FOLDERA

## DON'T FORGET — read first, every boot

1. **Value is the only score.** Foldera exists to produce one act the user wouldn't have done. Green CI, audits, clean code, merged PRs are *hygiene* — not value.
2. **Safe silence beats a fake card.** Never manufacture a verdict; quiet on weak evidence. The Scout obeys this too: no opportunity worth surfacing → stay quiet.
3. **No "done" without live product proof.** Build/tests/CI green is necessary, never sufficient.
4. **Don't make Brandon the router/tester/merger.** Pick the highest-leverage move, do it end-to-end, bring the result + reasoning.
5. **Scout is additive and never auto-sends.** It proposes finished, review-gated artifacts. The Workday Presence Layer stays the always-on default; every `SCOUT_*` flag defaults off.
6. **The Guardian looks inward, not outward.** Watch the user's *own* world (the thread they're about to drop, the reply owed, the deadline in their files) and reduce load. Do **not** fish the open web for external "opportunities" — that is tone-deaf. A fixture/sample card must never be posted to a real channel as if real. See issues #492 / #494 / #481.

Keep this cockpit short and value-first. Completed-issue history lives in `SESSION_HISTORY.md` + git, never here.

## Boot

1. Read this file. 2. Read the active issue (#494). 3. Check issue #136 for recent INTERRUPT receipts.

## Active command gate

`ACTIVE_SEAM_STATE.json` is the machine-readable control plane.

Issue #494 is the active SCOUT seam.

Constraint everywhere: NO paid API calls and NO production mutation without explicit owner authorization — prove in the harness.

## Current slice:

**SCOUT §3 (#494) — turn the hands on: ONE real inward loop on REAL data (the money-move).** Promoted from compass #492 at owner request (2026-06-20); supersedes the build umbrella #486. **The build is done and inward:** Stages 0–5 (#487/#488/#490/#491) + the inward retarget (#493) are all merged. The deployed Scout watches the user's *own* world (commitments owed, replies due, deadlines/filings in their own files), never hunts external grants/jobs/RFPs, and never fabricates credentials. It is flag-OFF in prod and **has never gripped real data** (verified live 2026-06-20: `scout_drive_chunks` empty, `tkg_signals` bodies encrypted).

**The remaining move is owner-gated runtime activation — the agent sandbox cannot do it** (no `VOYAGE_API_KEY`, no `CRON_SECRET`, no decrypt key, no Vercel env-write tool). Value bar (#492 §5): a real inward act on real connected data the user didn't have to do, landed in Slack, **≥3×/week**, that they'd genuinely miss if it stopped. No fixtures / hygiene-as-proof. **NOT in scope:** external opportunity-hunting (grants/jobs/customers), any new detector/score/channel without a live runtime consumer in the same change, more "Stage N+1" breadth.

## Next exact move

**Owner-gated activation — `BLOCKED_WITH_EXACT_RECEIPT` (the agent cannot execute these):**

1. **Vercel prod secrets/flags:** set `VOYAGE_API_KEY`; flip `SCOUT_ENABLED=true`, `SCOUT_RAG_ENABLED=true`, `SCOUT_WEB_ENABLED=true`, `ALLOW_PAID_LLM=true`, `SCOUT_DELIVERY_ENABLED=true` (`FOLDERA_SLACK_SELF_CHANNEL_ID` already set). Redeploy.
2. **Decrypt prerequisite (#481):** confirm `ENCRYPTION_KEY_LEGACY` covers all historical keys (~24% of signals fail to decrypt) so the inward loop grounds on the full corpus, not a starved third.
3. **Paid first index:** `GET /api/cron/scout/index-drive` (CRON_SECRET bearer) → populates `scout_drive_chunks`.
4. **One real loop + delivery:** `GET /api/cron/scout/deliver` (CRON_SECRET bearer) → a real, inward, review-gated Slack card grounded in the owner's own data.
5. **Judge by gut, ≥3×/week** (the Bible bar), labeled owner-only.

Full design: issue #494 (+ #486 umbrella, #492 compass, #481 go/no-go).

## Product doctrine

Foldera is a Workday Presence Layer (the always-on default) plus, additively, a flag-gated Proactive Scout lane (Bible Part V). No dashboard / task-manager / inbox-summary / chatbot / surveillance drift; no auto-send. `FOLDERA_MASTER_BIBLE.md` carries doctrine; `AGENTS.md` is the agent contract.

## GitHub writeback contract

- GitHub writeback before stop is mandatory. GitHub source truth beats chat memory; if work isn't written to GitHub, the transaction is incomplete.
- Before stopping, post one terminal receipt: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- Update `ACTIVE_HANDOFF.md` when the seam / proof / next move / blocker changes; `FOLDERA_BUILD_ORDER.yaml` when the active issue changes.
