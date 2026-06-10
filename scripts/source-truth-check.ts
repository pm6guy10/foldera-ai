import { fileURLToPath } from 'node:url';
import { runContinuityGate } from './continuity-gate';

// Governance Collapse v1 (issue #240): the old source-truth check hardcoded the
// entire issue history (and pinned a single legal active_issue) as string
// assertions, which made every state change a script edit. It now delegates to
// the continuity gate, which checks structural parity instead of prose.

export function runSourceTruthCheck(root = process.cwd()): string[] {
  return runContinuityGate(root);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const failures = runSourceTruthCheck(process.cwd());
  if (failures.length > 0) {
    console.error('Source truth check failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log('Source truth check passed.');
}
