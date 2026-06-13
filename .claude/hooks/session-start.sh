#!/usr/bin/env bash
# SessionStart hook — boots the Foldera ritual into context so no agent can
# forget it. Enforcement for the AGENTS.md boot sequence. Output is injected
# into the session's context (stdout), so keep it short and high-signal.
#
# Runs from repo root. Pure read-only: never edits, never networks.

set -e

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
HANDOFF="$ROOT/ACTIVE_HANDOFF.md"

echo "=== FOLDERA BOOT (AGENTS.md is the contract) ==="
echo "Boot order: ACTIVE_HANDOFF.md -> active issue -> Issue #136 (Run Ledger)."
echo "GitHub source truth beats chat/memory/local state. One seam, one branch, one PR."
echo "Defaults that just happen: auto-merge on green, branch auto-delete, ledger bracketing."
echo ""

if [ -f "$HANDOFF" ]; then
  # Surface the active seam line(s) so the agent starts pointed at the right work.
  SEAM="$(grep -m1 -iE 'Active seam:' "$HANDOFF" 2>/dev/null || true)"
  GATE="$(grep -m1 -iE 'is the active .* seam\.' "$HANDOFF" 2>/dev/null || true)"
  [ -n "$GATE" ] && echo "Active gate: $GATE"
  [ -n "$SEAM" ] && echo "$SEAM"
  echo ""
  echo "Before first edit: check Issue #136 for an INTERRUPT receipt, then post a SESSION START receipt."
else
  echo "WARNING: ACTIVE_HANDOFF.md not found — confirm repo root before editing."
fi
