import { describe, expect, it } from 'vitest';

import { classifyLifecycle } from '../scorer';

describe('classifyLifecycle — interview-class override', () => {
  it('would mark low-urgency high-penalty candidates as trash without override', () => {
    const lifecycle = classifyLifecycle({
      urgency: 0.1,
      stakes: 3,
      tractability: 0.1,
      entityPenalty: -35,
      hasRecentSignal: false,
    });

    expect(lifecycle.state).toBe('trash');
    expect(lifecycle.actionability).toBe('hold_only');
  });

  it('keeps interview-class candidates actionable even under generic trash/non-actionable thresholds', () => {
    const lifecycle = classifyLifecycle({
      urgency: 0.1,
      stakes: 3,
      tractability: 0.1,
      entityPenalty: -35,
      hasRecentSignal: false,
      forceActionableNow: true,
    });

    expect(lifecycle.state).toBe('active_now');
    expect(lifecycle.actionability).toBe('actionable');
    expect(lifecycle.horizon).toBe('near_term');
  });
});
