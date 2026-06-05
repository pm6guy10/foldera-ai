import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectSourceBackedRightNowState } from '@/lib/workday-presence/source-backed-state';

type UnknownRecord = Record<string, unknown>;

const forbiddenKeys = [
  'access_token',
  'refresh_token',
  'api_key',
  'secret',
  'token',
  'password',
  'raw_body',
  'message_body',
  'content',
];

export type PrivacyRailViolation = {
  path: string;
  key: string;
};

function isPlainObject(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function collectPrivacyRailViolations(value: unknown, path = 'state'): PrivacyRailViolation[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectPrivacyRailViolations(entry, `${path}[${index}]`));
  }

  if (!isPlainObject(value)) return [];

  const violations: PrivacyRailViolation[] = [];
  for (const [key, nested] of Object.entries(value)) {
    if (forbiddenKeys.includes(key)) {
      violations.push({ path, key });
    }
    violations.push(...collectPrivacyRailViolations(nested, `${path}.${key}`));
  }
  return violations;
}

function buildPrivacyRailProofState() {
  return selectSourceBackedRightNowState({
    nowIso: '2026-06-05T23:00:00.000Z',
    signals: [
      {
        id: 'sig_privacy_rail_1',
        source: 'gmail',
        source_id: 'gmail-thread-privacy-rail',
        type: 'reply_needed',
        occurred_at: '2026-06-05T22:30:00.000Z',
        redacted_summary: 'Marcus approval summary stored without raw message text.',
        approval_received: 'Marcus approved the estimate.',
      },
    ],
    commitments: [
      {
        id: 'commitment_privacy_rail_1',
        source: 'gmail',
        source_id: 'gmail-thread-privacy-rail-commitment',
        type: 'promise',
        status: 'open',
        due_at: '2026-06-05T23:30:00.000Z',
        owner_name: 'Marcus',
        project: 'Close Marcus estimate loop',
        approval_received: 'Marcus approved the estimate.',
        commitment_text: 'Send Estimate after approval.',
      },
    ],
  });
}

export function runPrivacyRailCheck(): { ok: true; state: UnknownRecord } | { ok: false; violations: PrivacyRailViolation[] } {
  const state = buildPrivacyRailProofState();
  if (!state) {
    throw new Error('privacy rail proof requires a source-backed state');
  }

  const serialized = JSON.stringify(state);
  const violations = collectPrivacyRailViolations(state);
  const forbiddenSubstrings = ['access_token', 'refresh_token', 'api_key', 'secret', 'token', 'password', 'raw_body', 'message_body', 'content'];
  const substringViolations = forbiddenSubstrings
    .filter((needle) => serialized.includes(needle))
    .map((key) => ({ path: 'serialized_state', key }));

  const allViolations = [...violations, ...substringViolations];
  if (allViolations.length > 0) {
    return { ok: false, violations: allViolations };
  }

  return { ok: true, state };
}

const isMainModule =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
  const result = runPrivacyRailCheck();
  if (!result.ok) {
    console.error('Privacy rail check failed.');
    for (const violation of result.violations) {
      console.error(`- ${violation.path}.${violation.key}`);
    }
    process.exitCode = 1;
  } else {
    console.log('Privacy rail check passed.');
  }
}
