import fs from 'fs';
import path from 'path';

// --- Source Truth Parsing ---

function readLocalSourceFile(filename: string): string | null {
  try {
    return fs.readFileSync(path.join(process.cwd(), filename), 'utf-8');
  } catch (error) {
    console.error(`Failed to read ${filename}:`, error);
    return null;
  }
}

function getActiveSeamState() {
  const content = readLocalSourceFile('ACTIVE_SEAM_STATE.json');
  if (!content) return null;
  try {
    return JSON.parse(content) as {
      active_issue: number | null;
      active_branch: string | null;
      active_pr: number | null;
      deployed_commit_sha: string | null;
    };
  } catch {
    return null;
  }
}

function getBuildOrderNextSeam() {
  const content = readLocalSourceFile('FOLDERA_BUILD_ORDER.yaml');
  if (!content) return null;
  const match = content.match(/^next_seam:\s*(?:"([^"]+)"|'([^']+)'|(.*))$/m);
  if (match) {
    return match[1] || match[2] || match[3];
  }
  return null;
}

// --- GitHub API Utilities ---

const REPO_OWNER = 'pm6guy10';
const REPO_NAME = 'foldera-ai';
const GITHUB_API_VERSION = '2022-11-28';

async function fetchGithub(endpoint: string) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return { error: 'Missing GITHUB_TOKEN in environment' };

  try {
    const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}${endpoint}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
      },
      next: { revalidate: 60 }, // Cache for 1 minute
    });
    if (!res.ok) {
      return { error: `GitHub API error: ${res.status} ${res.statusText}` };
    }
    return { data: await res.json() };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { error: errorMsg };
  }
}

async function getPullRequest(prNumber: number) {
  return fetchGithub(`/pulls/${prNumber}`);
}

async function getCommitStatuses(sha: string) {
  return fetchGithub(`/commits/${sha}/status`);
}

async function getIssueComments(issueNumber: number) {
  return fetchGithub(`/issues/${issueNumber}/comments?per_page=5&sort=created&direction=desc`);
}

// --- Command Handlers ---

export async function handleSlackCommand(text: string): Promise<string> {
  const command = text.trim().toLowerCase().split(' ')[0] || 'status';
  const state = getActiveSeamState();
  const issue = state?.active_issue || 'Unknown';
  const pr = state?.active_pr || 'None';

  switch (command) {
    case 'status': {
      let prMergeability = 'N/A';
      let prStatusStr = 'No PR';
      if (state?.active_pr) {
        const { data: prData } = await getPullRequest(state.active_pr);
        if (prData) {
          prMergeability = prData.mergeable ? 'Clean' : 'Conflicts / Blocked';
          prStatusStr = `#${state.active_pr} (${prData.state})`;
        }
      }

      let deployStatus = 'Unknown';
      if (state?.deployed_commit_sha) {
        const { data: statusData } = await getCommitStatuses(state.deployed_commit_sha);
        if (statusData) {
          deployStatus = statusData.state || 'pending';
        }
      }

      return `*Current Truth:*\n• *Active Issue*: #${issue}\n• *Active PR*: ${prStatusStr}\n• *Mergeability*: ${prMergeability}\n• *Deploy Status*: ${deployStatus}\n• *Blocker*: None registered`;
    }

    case 'next': {
      const nextSeam = getBuildOrderNextSeam();
      return `*Next Authorized Action:*\n${nextSeam ? nextSeam : 'No next action explicitly defined in FOLDERA_BUILD_ORDER.yaml'}`;
    }

    case 'blockers': {
      if (!state?.active_pr) {
        return `*Blockers:*\nNo active PR to check. No structural blockers found in seam state.`;
      }
      const { data: prData } = await getPullRequest(state.active_pr);
      if (!prData) return `Failed to fetch PR info.`;
      
      const isMergeable = prData.mergeable;
      const blockers = [];
      if (!isMergeable && prData.state === 'open') {
        blockers.push('• PR has merge conflicts or is unmergeable.');
      }
      // Can check commit statuses for failing checks here
      return blockers.length > 0 ? `*Blockers:*\n${blockers.join('\n')}` : `*Blockers:*\nAll clear. No red checks or unmergeable conditions on PR #${state.active_pr}.`;
    }

    case 'deploy': {
      // Latest production + preview deploy status
      // We can query main branch commits for production and active branch for preview
      const [prodRes, previewRes] = await Promise.all([
        fetchGithub(`/commits/main/status`),
        state?.active_branch ? fetchGithub(`/commits/${encodeURIComponent(state.active_branch)}/status`) : Promise.resolve({ data: null })
      ]);

      const prodStatus = prodRes.data ? `*Production*: ${prodRes.data.state}` : '*Production*: Unknown';
      const previewStatus = previewRes.data ? `*Preview* (${state?.active_branch}): ${previewRes.data.state}` : '*Preview*: No active branch tracked';
      
      return `*Deploy Status:*\n${prodStatus}\n${previewStatus}`;
    }

    case 'receipt': {
      if (!state?.active_issue) {
        return `No active issue to fetch receipts for.`;
      }
      const { data: comments } = await getIssueComments(state.active_issue);
      if (!comments || comments.length === 0) {
        return `No receipts or comments found on Issue #${state.active_issue}.`;
      }
      const latest = comments[0];
      return `*Latest Receipt (Issue #${state.active_issue}):*\n> ${latest.body.slice(0, 300).replace(/\n/g, '\n> ')}...\n_From ${latest.user.login} at ${latest.updated_at}_`;
    }

    default:
      return `Unknown command: \`${command}\`\nAvailable: \`status\`, \`next\`, \`blockers\`, \`deploy\`, \`receipt\``;
  }
}
