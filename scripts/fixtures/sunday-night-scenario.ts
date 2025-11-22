// =====================================================
// SUNDAY NIGHT SCENARIO - Test Fixture
// Simulates a classic conflict: Slack message contradicts Calendar event
// =====================================================

import type { WorkSignal } from '../../lib/types/universal-graph';

/**
 * Get Sunday Night Signals
 * 
 * Returns 3 mock signals that create a conflict scenario:
 * - Signal A (Calendar): Project Phoenix Kickoff, Monday 9:00 AM
 * - Signal B (Slack): From Sarah Chen, Sunday 8:00 PM - "Designs aren't ready. We need to push the kickoff to Tuesday."
 * - Signal C (Gmail): From Client, Friday - "Excited for Monday's kickoff."
 * 
 * Expected result: Signal B should have a "contradicts" relationship with Signal A
 */
export function getSundayNightSignals(): WorkSignal[] {
  // Signal A: Calendar Event - Project Phoenix Kickoff, Monday 9:00 AM
  const signalA: WorkSignal = {
    id: 'calendar:phoenix-kickoff-2024-01-15',
    source: 'calendar',
    author: 'Calendar System',
    timestamp: '2024-01-15T09:00:00Z', // Monday 9:00 AM
    content: 'Project Phoenix Kickoff\n\nTime: Monday, January 15, 2024 at 9:00 AM\nLocation: Conference Room A\nAttendees: Team, Client\n\nAgenda:\n- Project overview\n- Timeline review\n- Q&A session',
    context_tags: [],
    relationships: [],
  };

  // Signal B: Slack Message - Sarah Chen, Sunday 8:00 PM
  const signalB: WorkSignal = {
    id: 'slack:msg_sarah_2024-01-14-20-00',
    source: 'slack',
    author: 'Sarah Chen',
    timestamp: '2024-01-14T20:00:00Z', // Sunday 8:00 PM
    content: 'Hey team, I need to let you know that the designs aren\'t ready yet. We\'re going to need to push the Project Phoenix kickoff to Tuesday instead of Monday. Sorry for the short notice, but we want to make sure we have everything ready before we present to the client.',
    context_tags: [],
    relationships: [],
  };

  // Signal C: Gmail - From Client, Friday
  const signalC: WorkSignal = {
    id: 'gmail:msg_client_2024-01-12',
    source: 'gmail',
    author: 'client@example.com',
    timestamp: '2024-01-12T14:30:00Z', // Friday afternoon
    content: 'Subject: Excited for Monday\'s kickoff\n\nHi team,\n\nJust wanted to reach out and say how excited we are for Monday\'s Project Phoenix kickoff meeting. We\'ve been looking forward to seeing the designs and getting started on this project.\n\nSee you Monday at 9 AM!\n\nBest regards,\nClient Team',
    context_tags: [],
    relationships: [],
  };

  return [signalA, signalB, signalC];
}

