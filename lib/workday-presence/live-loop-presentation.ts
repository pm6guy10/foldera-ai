import type { CommandStateResolution } from './command-state-resolver';
import {
  buildRightNowCard,
  type RightNowCard,
  type WorkdayPresenceState,
} from './model';

function buildVerdictLine(
  state: WorkdayPresenceState | null,
  resolution: CommandStateResolution,
): string {
  switch (resolution.verdict) {
    case 'MERGE_READY':
      return 'Trusted verdict: Ready now. Foldera prepared something reviewable and nothing recorded blocks it.';
    case 'FIX_FIRST':
      return state?.blocker
        ? `Trusted verdict: Fix this first. ${state.blocker}`
        : 'Trusted verdict: Fix this first. A recorded blocker still gates progress.';
    case 'WAIT':
      if (resolution.rule === 'snoozed_state' && state?.snoozed_until) {
        return `Trusted verdict: Hold. Foldera is waiting until ${state.snoozed_until}.`;
      }
      if (state?.waiting_on) {
        return `Trusted verdict: Hold. ${state.waiting_on}`;
      }
      return 'Trusted verdict: Hold. The next real change is not yours yet.';
    case 'CLEAR':
    default:
      if (!state || resolution.rule === 'no_saved_state') {
        return 'Trusted verdict: No justified move yet. Save one focus and Foldera will hold the re-entry point.';
      }
      if (state.state_source === 'manual_anchor') {
        return 'Trusted verdict: Anchor saved. Foldera will hold this until connected work proves a clearer move.';
      }
      return 'Trusted verdict: Clear right now. Foldera checked the current state and nothing is ready for action yet.';
  }
}

function nextMoveForResolution(
  state: WorkdayPresenceState | null,
  resolution: CommandStateResolution,
  fallback: string,
): string {
  if (!state) return fallback;

  if (resolution.verdict === 'WAIT') {
    if (resolution.rule === 'snoozed_state' && state.snoozed_until) {
      return `Next move: Hold here until ${state.snoozed_until}.`;
    }
    if (state.waiting_on) {
      return `Next move: Hold here until ${state.waiting_on}.`;
    }
    return 'Next move: Hold here until something changes.';
  }

  if (resolution.verdict === 'CLEAR' && state.state_source !== 'manual_anchor') {
    return 'Next move: Stay quiet until connected work proves something is ready.';
  }

  return fallback;
}

export function buildRightNowCardForLiveLoop(
  state: WorkdayPresenceState | null,
  resolution: CommandStateResolution,
): RightNowCard {
  const card = buildRightNowCard(state);
  const verdictLine = buildVerdictLine(state, resolution);

  if (card.mode === 'setup') {
    return {
      ...card,
      verdict_line: verdictLine,
    };
  }

  return {
    ...card,
    verdict_line: verdictLine,
    next_move: nextMoveForResolution(state, resolution, card.next_move),
  };
}
