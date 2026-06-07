import type { IntakePacket } from './schema';

export const OPEN_THREADS_ISSUE_NUMBER = 165;
export const FOLDERA_REPOSITORY = 'pm6guy10/foldera-ai';
const GITHUB_API_VERSION = '2022-11-28';

export type OpenThreadsWriteBackResult = {
  issueNumber: number;
  commentId: number | null;
  commentUrl: string;
};

type AppendOpenThreadsCommentOptions = {
  fetchImpl?: typeof fetch;
  githubToken?: string;
  issueNumber?: number;
  repositoryFullName?: string;
};

function requireGitHubToken(override?: string): string {
  const token = override ?? process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN is required for GitHub write-back');
  }
  return token;
}

function normalizePacketSummary(packet: IntakePacket): string {
  return [
    `Classification: ${packet.classification}`,
    `Routing outcome: ${packet.routingOutcome}`,
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

export function buildOpenThreadsWriteBackComment(rawInput: string, packet: IntakePacket): string {
  return [
    'CODEX COMMAND OS WRITE-BACK',
    '',
    `Target: GitHub Issue #${OPEN_THREADS_ISSUE_NUMBER}`,
    `Repository: ${FOLDERA_REPOSITORY}`,
    '',
    'Raw input:',
    `> ${rawInput.replace(/\r?\n/g, ' ')}`,
    '',
    'Intake packet:',
    normalizePacketSummary(packet),
  ].join('\n');
}

export async function appendOpenThreadsComment(
  rawInput: string,
  packet: IntakePacket,
  options: AppendOpenThreadsCommentOptions = {},
): Promise<OpenThreadsWriteBackResult> {
  const repositoryFullName = options.repositoryFullName ?? FOLDERA_REPOSITORY;
  const issueNumber = options.issueNumber ?? OPEN_THREADS_ISSUE_NUMBER;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const token = requireGitHubToken(options.githubToken);
  const comment = buildOpenThreadsWriteBackComment(rawInput, packet);
  const response = await fetchImpl(`https://api.github.com/repos/${repositoryFullName}/issues/${issueNumber}/comments`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    },
    body: JSON.stringify({ body: comment }),
  });

  if (!response.ok) {
    const failureText = await response.text().catch(() => '');
    throw new Error(`GitHub write-back failed with status ${response.status}${failureText ? `: ${failureText}` : ''}`);
  }

  const payload = (await response.json().catch(() => null)) as
    | { id?: number; html_url?: string }
    | null;

  return {
    issueNumber,
    commentId: typeof payload?.id === 'number' ? payload.id : null,
    commentUrl: typeof payload?.html_url === 'string' ? payload.html_url : `https://github.com/${repositoryFullName}/issues/${issueNumber}`,
  };
}
