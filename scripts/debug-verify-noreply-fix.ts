/**
 * Verify that the noreply fix correctly blocks the two winning signals
 * by running the hunt detection locally against the actual signals.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { isBulkOrMarketingSender, runHuntAnomalies } from '../lib/briefing/hunt-anomalies';

// Simulate the two signals that were winning before the fix
const signal1 = {
  id: '08b906c3-3e54-4981-b541-1ad868bfd43e',
  content: '[Email received: 2026-03-27]\nFrom: noreply@notificationmycredit-guide.americanexpress.com\nTo: b-kapp@outlook.com\nSubject: Your American Express Statement is Ready\nBody preview: Your statement is ready to view.',
  source: 'outlook',
  type: 'email_received',
  occurred_at: '2026-03-27T21:44:15+00:00',
  author: 'noreply@notificationmycredit-guide.americanexpress.com',
};

const signal2 = {
  id: '5b851583-cc47-4c89-9ca5-9accd2d36b29',
  content: '[Email received: 2026-03-27]\nFrom: notifications@notifications.creditkarma.com\nTo: b-kapp@outlook.com\nSubject: Your Credit Karma Score Update\nBody preview: Your score changed.',
  source: 'outlook',
  type: 'email_received',
  occurred_at: '2026-03-27T22:14:40+00:00',
  author: 'notifications@notifications.creditkarma.com',
};

// Check isBulkOrMarketingSender directly
console.log('=== isBulkOrMarketingSender checks ===');
console.log('signal1 sender:', signal1.author, '->', isBulkOrMarketingSender(signal1.author));
console.log('signal2 sender:', signal2.author, '->', isBulkOrMarketingSender(signal2.author));

// Run hunt anomalies with these signals
const { findings, countsByKind } = runHuntAnomalies({
  signals: [signal1, signal2],
  commitments: [],
  selfEmails: new Set(['b-kapp@outlook.com']),
});

console.log('\n=== Hunt results ===');
console.log('unreplied_inbound count:', countsByKind.unreplied_inbound);
console.log('findings count:', findings.length);
console.log('hunt_unreplied findings:', findings.filter(f => f.kind === 'unreplied_inbound').map(f => f.id));

if (countsByKind.unreplied_inbound === 0) {
  console.log('\n✅ FIX VERIFIED: noreply/notification senders correctly blocked from unreplied_inbound');
} else {
  console.log('\n❌ FIX FAILED: noreply senders still appearing as unreplied_inbound candidates');
  for (const f of findings.filter(f => f.kind === 'unreplied_inbound')) {
    console.log('  -', f.id, '|', f.entityName, '|', f.summary.slice(0, 100));
  }
}

// Now add a real human email to verify real signals still work
const realHumanSignal = {
  id: 'aabbccdd-0000-0000-0000-000000000001',
  content: '[Email received: 2026-03-27]\nFrom: Yadira Clapper <yadira.clapper@hca.wa.gov>\nTo: b-kapp@outlook.com\nSubject: DSHS contract renewal\nBody preview: Hi Brandon, can you review and sign off on the renewal contract?',
  source: 'outlook',
  type: 'email_received',
  occurred_at: '2026-03-27T10:00:00+00:00',
  author: 'yadira.clapper@hca.wa.gov',
};

const { findings: findings2, countsByKind: counts2 } = runHuntAnomalies({
  signals: [signal1, signal2, realHumanSignal],
  commitments: [],
  selfEmails: new Set(['b-kapp@outlook.com']),
});

console.log('\n=== With real human signal added ===');
console.log('unreplied_inbound count:', counts2.unreplied_inbound);
const unrepliedFindings = findings2.filter(f => f.kind === 'unreplied_inbound');
console.log('unreplied_inbound findings:', unrepliedFindings.map(f => ({ id: f.id, entity: f.entityName })));
if (unrepliedFindings.length === 1 && unrepliedFindings[0].id.includes('aabbccdd')) {
  console.log('\n✅ Real human email (Yadira) still correctly flagged as unreplied_inbound');
} else {
  console.log('\n❌ Unexpected: real human signal not correctly handled');
}
