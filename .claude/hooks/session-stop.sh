#!/usr/bin/env bash
# Stop hook — the WRITE-BACK half of contextual continuity. Pairs with the
# SessionStart brain-loader: START reads the brain, STOP enforces rolling it
# forward, so institutional memory COMPOUNDS instead of being one-and-done.
#
# It blocks a silent stop ONCE when this branch changed code but did not roll the
# control plane / capture a lesson. It NEVER loops or traps: it respects
# stop_hook_active (Claude sets it on the retry), so it reminds, then lets go.
#
# Protocol: exit 2 + stderr = "don't stop yet, here's why" (fed back to Claude).
# exit 0 = fine to stop. Pure read-only: never edits, never networks.

INPUT="$(cat 2>/dev/null)"

# Loop guard: if we already blocked once this stop, allow the stop.
case "$INPUT" in
  *'"stop_hook_active": true'*|*'"stop_hook_active":true'*) exit 0 ;;
esac

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$ROOT" || exit 0

BASE="origin/main"
git rev-parse --verify -q "$BASE" >/dev/null 2>&1 || BASE="main"
git rev-parse --verify -q "$BASE" >/dev/null 2>&1 || exit 0

CHANGED="$(git diff --name-only "${BASE}...HEAD" 2>/dev/null)"
UNCOMMITTED="$(git status --porcelain 2>/dev/null)"

# Nothing changed this branch -> nothing to roll forward.
[ -z "$CHANGED" ] && [ -z "$UNCOMMITTED" ] && exit 0

MSG=""
[ -n "$UNCOMMITTED" ] && MSG="${MSG}Uncommitted changes exist — commit & push before stopping. "

CODE_CHANGED="$(printf '%s\n' "$CHANGED" | grep -E '^(lib|app|components|scripts)/' || true)"
STATE_CHANGED="$(printf '%s\n' "$CHANGED" | grep -E '^(ACTIVE_HANDOFF\.md|ACTIVE_SEAM_STATE\.json|LESSONS_LEARNED\.md)$' || true)"
if [ -n "$CODE_CHANGED" ] && [ -z "$STATE_CHANGED" ]; then
  MSG="${MSG}Code changed but ACTIVE_HANDOFF.md / ACTIVE_SEAM_STATE.json / LESSONS_LEARNED.md were not — roll the seam pointer forward AND append what you learned to LESSONS_LEARNED.md so the next session inherits it. This is the continuity ratchet: read enforced at start, write enforced at stop."
fi

if [ -n "$MSG" ]; then
  echo "WRITE-BACK REQUIRED before stop: ${MSG}" >&2
  exit 2
fi

exit 0
