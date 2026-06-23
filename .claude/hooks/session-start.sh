#!/usr/bin/env bash
# SessionStart hook — loads the Foldera "brain" into context at the START of
# EVERY session, before the first action. The harness injects this stdout into
# the session context, so it CANNOT be skipped the way a doc-you-choose-to-read
# can. This is the locked, fluid contextual continuity: wherever the session
# runs, the brain is already here. Pure read-only — never edits, never networks.
# Keep it short and high-signal. Wired via .claude/settings.json (SessionStart).

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
cd "$ROOT" 2>/dev/null || true

echo "=== FOLDERA BRAIN — auto-loaded, read before acting ==="
echo "Boot order: ACTIVE_HANDOFF.md -> active issue -> Issue #136 (Run Ledger)."
echo "GitHub source truth beats chat/memory. One seam, one branch, one PR. Close loops."
echo ""

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
  echo "# ACTIVE SEAM"
  echo "issue #${ISSUE:-?} - branch ${BRANCH:-?} - PR ${PR:-none}"
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
echo "Full map: ACTIVE_HANDOFF.md + the active issue. Before first edit: check Issue #136, post SESSION START."
