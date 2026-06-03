import type { IntakePacket } from './schema';

export function formatIntakePacket(packet: IntakePacket): string {
  return [
    `Classification: ${packet.classification}`,
    `Bucket: ${packet.bucket}`,
    `Existing GitHub target: ${packet.existingGithubTarget}`,
    `New issue needed: ${packet.newIssueNeeded}`,
    `Active seam impact: ${packet.activeSeamImpact}`,
    `Why: ${packet.why}`,
    `One next move: ${packet.oneNextMove}`,
    `Forbidden work: ${packet.forbiddenWork}`,
    `Proof required: ${packet.proofRequired}`,
    `Stop condition: ${packet.stopCondition}`,
  ].join('\n');
}
