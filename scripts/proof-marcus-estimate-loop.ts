import { buildWorkPacketBrainReceipt } from '@/lib/work-packets/receipt';
import { marcusApprovedEstimateSignal, workPacketFixtureSignals } from '@/tests/fixtures/work-packets/source-signals';

function main() {
  const receipt = buildWorkPacketBrainReceipt({
    user_id: 'user_test_005',
    before_state: {
      current_focus: 'Finalize revised estimate for Marcus',
      next_move: 'Wait for Marcus to approve the revised estimate',
      why_it_matters: 'The review window is today and the decision needs one safe next move.',
      blocker: 'Waiting on Marcus',
      do_not_touch: 'Do not send the renewal note automatically',
      waiting_on: 'Marcus approval',
      last_completed_step: null,
      state_source: 'manual_anchor',
      snoozed_until: null,
      interaction_history: [],
      created_at: '2026-06-02T13:00:00.000Z',
      updated_at: '2026-06-02T13:10:00.000Z',
    },
    fixture_signals: [marcusApprovedEstimateSignal, workPacketFixtureSignals[1]],
    action: 'done',
    nowIso: '2026-06-04T16:40:00.000Z',
  });

  console.log(JSON.stringify(receipt, null, 2));

  if (!receipt.done_mutation_applied) {
    console.error('Marcus loop proof failed: Done mutation was not applied.');
    process.exit(1);
  }
  if (receipt.packet_workday_state_after.packet.status !== 'completed') {
    console.error('Marcus loop proof failed: packet did not reach completed status.');
    process.exit(1);
  }
  if (receipt.packet_workday_state_after.workday_state.last_completed_step !== 'Send Estimate') {
    console.error('Marcus loop proof failed: last completed step was not Send Estimate.');
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
