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

# Active seam — machine truth from the control plane.
if [ -f ACTIVE_SEAM_STATE.json ]; then
  ISSUE=$(grep -oE '"active_issue"[: ]+[0-9]+' ACTIVE_SEAM_STATE.json | grep -oE '[0-9]+' | head -1)
  BRANCH=$(grep -oE '"active_branch"[: ]+"[^"]*"' ACTIVE_SEAM_STATE.json | sed -E 's/.*"active_branch"[: ]+"([^"]*)".*/\1/')
  PR=$(grep -oE '"active_pr"[: ]+[^,}]*' ACTIVE_SEAM_STATE.json | sed -E 's/.*"active_pr"[: ]+//')
  CRON_OUTCOME=$(grep -oE '"last_cron_outcome"[: ]+"[^"]*"' ACTIVE_SEAM_STATE.json | sed -E 's/.*"last_cron_outcome"[: ]+"([^"]*)".*/\1/')
  CRON_RUN=$(grep -oE '"last_cron_run"[: ]+"[^"]*"' ACTIVE_SEAM_STATE.json | sed -E 's/.*"last_cron_run"[: ]+"([^"]*)".*/\1/')
  echo "# ACTIVE SEAM"
  echo "issue #${ISSUE:-?} - branch ${BRANCH:-?} - PR ${PR:-none}"
  echo "cron: ${CRON_OUTCOME:-?} @ ${CRON_RUN:-?}"
  echo ""
fi

# Next exact move.
if [ -f ACTIVE_HANDOFF.md ]; then
  echo "# NEXT EXACT MOVE"
  awk '/^## Next exact move/{f=1;next} /^## /{if(f)exit} f' ACTIVE_HANDOFF.md | sed '/^[[:space:]]*$/d' | head -8
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
