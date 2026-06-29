#!/usr/bin/env bash
# SessionStart hook — loads the Foldera "brain" into context at the START of
# EVERY session, before the first action. The harness injects this stdout into
# the session context, so it CANNOT be skipped the way a doc-you-choose-to-read
# can. This is the locked, fluid contextual continuity: wherever the session
# runs, the brain is already here. Read-only EXCEPT a one-time deps self-heal below
# (runs `npm ci` only when node_modules is absent; fail-soft, idempotent).
# Keep it short and high-signal. Wired via .claude/settings.json (SessionStart).

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
cd "$ROOT" 2>/dev/null || true

# Setup self-heal — a fresh/ephemeral container has no node_modules and `npx` would then
# fetch the wrong tool versions. Install the declared lockfile deps once, so no owner
# web-UI setup script and no manual `npm ci` is ever needed. Idempotent (only when
# node_modules is absent → no-op on warm containers and human machines). Fail soft: a
# failed install warns but never blocks the session; npm output goes to a log, not here.
if [ ! -d node_modules ] && command -v npm >/dev/null 2>&1; then
  echo "# SETUP: node_modules missing — running 'npm ci' once (this can take ~1 min)…"
  if npm ci --no-audit --no-fund >/tmp/foldera-npm-ci.log 2>&1; then
    echo "# SETUP: dependencies installed."
  else
    echo "# SETUP: 'npm ci' failed (see /tmp/foldera-npm-ci.log) — run 'npm ci' manually before tests/lint."
  fi
fi

echo "=== FOLDERA BRAIN — auto-loaded, read before acting ==="
echo "Boot order: ACTIVE_HANDOFF.md -> active issue -> Issue #136 (Run Ledger)."
echo "GitHub source truth beats chat/memory. One seam, one branch, one PR. Close loops."
echo ""

# PRODUCT TRUTH — hardcoded here (not pulled from a doc) so it is injected EVERY
# session and cannot drift or be skipped. The recurring fatal failure is flattening
# Foldera to an inbox/reply bot. This block exists to make that impossible to miss.
echo "# PRODUCT TRUTH — never flatten this (the recurring fatal failure)"
echo "Foldera is a PROACTIVE value cascade, NOT an inbox/reply/summary bot. Reply-drafting is R2 — rung 2 of 6, the most reactive lane; do NOT call it 'the product'. Walk rungs until one clears a REAL bar:"
echo "  R1 advance what you started (drafts/Drive/in-flight work) · R2 owed replies · R3 inbound-ask -> handed-back finished work · R4 goal moves · R5 relationship · R6 Scout: outward opportunity (sign-off-gated)."
echo "Thesis: it lurks/watches/learns and does what you'd never have been smart enough to ask — the 'holy crap, how did it know' moment. Inward over the user's OWN sources only; never web surveillance; never fabricate to fill silence."
echo "KEYSTONE (corrected #567, PR #584): rank against the STATED objective + live evidence, NOT a stored/inferred goal model. The stored tkg_goals table rotted (82d-frozen job-hunting + n-gram garbage) and LOST a live head-to-head to objective-anchored ranking. Do NOT re-propose 'rebuild goal inference / refresh tkg_goals' — that is a settled dead alternative (SETTLED #9). The lever is objective-anchored selection, shipped behind FOLDERA_GOAL_SOURCE=stated (lib/briefing/scorer-goal-source.ts). When output is homework, the cause is the goal ANCHOR, not the flag."
echo "Owner taste authority = docs/BRANDON.md — run its §5 rejection checklist BEFORE ever asking or claiming 'is it good?'. Vision depth = FOLDERA_MASTER_BIBLE.md Part II-A (cascade) + II-B (Guardian Vision Lock)."
echo ""

# Evergreen TL;DR — the always-current cockpit summary, surfaced FIRST so every
# session opens with where-things-stand + the single next move. Kept fresh by the
# Stop write-back ratchet; existence + bound enforced by gate:continuity.
if [ -f ACTIVE_HANDOFF.md ]; then
  echo "# TL;DR"
  awk '/^## TL;DR/{f=1;next} /^## /{if(f)exit} f' ACTIVE_HANDOFF.md | sed '/^[[:space:]]*$/d'
  echo ""
fi

# Doctrine — the DON'T FORGET block (the distilled brain).
if [ -f ACTIVE_HANDOFF.md ]; then
  echo "# DON'T FORGET"
  awk '/^## DON.?T FORGET/{f=1;next} /^## /{if(f)exit} f' ACTIVE_HANDOFF.md | sed '/^[[:space:]]*$/d'
  echo ""
fi

# SETTLED decisions — discovered once, never relitigated. Auto-injected so the
# dead alternative (scheduled-cron model, INGEST_USER_ID owner, re-probing the
# pool) can't resurface and burn a session re-deriving it.
if [ -f ACTIVE_HANDOFF.md ]; then
  echo "# SETTLED — do not relitigate"
  awk '/^## SETTLED/{f=1;next} /^## /{if(f)exit} f' ACTIVE_HANDOFF.md | sed '/^[[:space:]]*$/d'
  echo ""
fi

# Active seam — machine truth from the control plane.
if [ -f ACTIVE_SEAM_STATE.json ]; then
  ISSUE=$(grep -oE '"active_issue"[: ]+[0-9]+' ACTIVE_SEAM_STATE.json | grep -oE '[0-9]+' | head -1)
  BRANCH=$(grep -oE '"active_branch"[: ]+"[^"]*"' ACTIVE_SEAM_STATE.json | sed -E 's/.*"active_branch"[: ]+"([^"]*)".*/\1/')
  PR=$(grep -oE '"active_pr"[: ]+[^,}]*' ACTIVE_SEAM_STATE.json | sed -E 's/.*"active_pr"[: ]+//')
  echo "# ACTIVE SEAM"
  echo "issue #${ISSUE:-?} - branch ${BRANCH:-?} - PR ${PR:-none}"
  echo "delivery: event-driven (vercel.json crons = Hobby-throttled trigger only; NOT a daily-brief schedule)"
  echo ""
fi

# Next exact move.
if [ -f ACTIVE_HANDOFF.md ]; then
  echo "# NEXT EXACT MOVE"
  awk '/^## Next exact move/{f=1;next} /^## /{if(f)exit} f' ACTIVE_HANDOFF.md | sed '/^[[:space:]]*$/d' | head -8
  echo ""
fi

# Live-pool probe — kills the per-session ritual of re-guessing schema columns and
# re-deriving the candidate pool. The hook can't run SQL (no creds in sandbox), but the
# agent has the Supabase MCP: paste the canned, schema-correct queries from this doc.
if [ -f docs/LIVE_POOL_PROBE.md ]; then
  echo "# LIVE POOL (verdict-calibration sessions)"
  echo "Before re-diagnosing #518/#537: run the canned probes in docs/LIVE_POOL_PROBE.md"
  echo "(Supabase MCP, project neydszeamsflpghtrhue, owner 2cbc1bab). It carries the exact"
  echo "schema (we keep getting columns wrong) + the 'is silence honest?' health query."
  echo "SAFE_SILENCE is a valid SUCCESS — do NOT loosen a gate to force a card."
  echo ""
fi

echo "# STANDING RULE"
echo "Reduce friction by default; CLOSE loops (don't just open PRs/issues); don't re-derive"
echo "context or end every session with a giant breakdown. Hard safety rails still need"
echo "sign-off (forbidden set, auth, billing, no auto-send, no blind gate-loosening)."
echo ""
echo "# TL;DR MODE (evergreen, enforced)"
echo "Lead every reply with a <=4-line TL;DR; keep replies terse by default; no end-of-"
echo "session wall-of-text — expand only when asked. Keep ACTIVE_HANDOFF.md '## TL;DR'"
echo "current as part of write-back (gate:continuity requires it; max 8 lines)."
echo ""
echo "Full map: ACTIVE_HANDOFF.md + the active issue. Before first edit: check Issue #136, post SESSION START."
