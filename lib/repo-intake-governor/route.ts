import { classifyInput } from './classify';
import { DEFAULT_INTAKE_CONTEXT, type IntakeContext, type IntakePacket } from './schema';

function targetRef(issueNumber: number): string {
  return `#${issueNumber}`;
}

function extractNamedTarget(rawInput: string): string | null {
  const prMatch = rawInput.match(/\bPR\s*#\s*(\d+)/i);
  if (prMatch) return `PR #${prMatch[1]}`;
  const issueMatch = rawInput.match(/\bissue\s*#\s*(\d+)/i);
  if (issueMatch) return `#${issueMatch[1]}`;
  return null;
}

function hasLabelOrProjectAuthorityClaim(rawInput: string): boolean {
  const input = rawInput.toLowerCase();
  return input.includes('label') || input.includes('project');
}

export function buildIntakePacket(rawInput: string, context: Partial<IntakeContext> = {}): IntakePacket {
  const resolvedContext = { ...DEFAULT_INTAKE_CONTEXT, ...context };
  const result = classifyInput(rawInput);
  const activeTarget = targetRef(resolvedContext.activeIssue);
  const openThreadsTarget = targetRef(resolvedContext.openThreadsIssue);
  const namedTarget = extractNamedTarget(rawInput);
  const labelsProjectsNote = hasLabelOrProjectAuthorityClaim(rawInput) ? ' Labels and GitHub Projects are visibility, not authority.' : '';

  switch (result.classification) {
    case 'ACTIVE_SEAM_COMMAND':
      return {
        ...result,
        routingOutcome: 'update active seam',
        existingGithubTarget: activeTarget,
        newIssueNeeded: 'NO',
        activeSeamImpact: 'YES',
        why: `The input explicitly commands the current authorized issue #${resolvedContext.activeIssue}.${labelsProjectsNote}`,
        oneNextMove: `Continue issue #${resolvedContext.activeIssue} only and keep every edit inside the authorized Command OS surface.`,
        forbiddenWork: 'No second seam, product/runtime work, Slack / PR #142 work, Supabase, Stripe, connectors, outreach, or broad cleanup.',
        proofRequired: 'Focused Repo Intake Governor tests, source-truth gates, lint, build, and git diff check.',
        stopCondition: 'Stop when one active seam has one draft PR with proof and GitHub receipts.',
      };
    case 'BLOCKER_REPORT':
      return {
        ...result,
        routingOutcome: 'blocked receipt',
        existingGithubTarget: namedTarget ?? activeTarget,
        newIssueNeeded: 'NO',
        activeSeamImpact: namedTarget === activeTarget ? 'YES' : 'NO',
        why: `The input reports a blocker and must be written to the named issue/PR or blocked receipt.${labelsProjectsNote}`,
        oneNextMove: `Post or update the blocker receipt on ${namedTarget ?? activeTarget}; do not patch code until the blocker proves a code-owned failure.`,
        forbiddenWork: 'No speculative product/runtime patches, Slack app setting changes, Vercel setting changes, or provider work without proof.',
        proofRequired: 'Exact blocker evidence: failing check, route/log excerpt, deployment truth, or command output.',
        stopCondition: 'Stop when the blocker is classified with its GitHub receipt or the active issue proves the next code-owned move.',
      };
    case 'AUDIT_FINDING':
      return {
        ...result,
        routingOutcome: 'comment/update existing issue',
        existingGithubTarget: activeTarget,
        newIssueNeeded: 'NO',
        activeSeamImpact: 'YES',
        why: `The audit finding concerns repo/source-truth alignment inside the current Command OS seam.${labelsProjectsNote}`,
        oneNextMove: `Comment/update issue #${resolvedContext.activeIssue} or its PR with the audit finding and required gate.`,
        forbiddenWork: 'No broad cleanup or unrelated stale-doc sweep unless issue #166 explicitly authorizes it.',
        proofRequired: 'Source-truth gate or focused test proving the contradiction is fixed or blocked.',
        stopCondition: 'Stop when the finding is routed to issue #166 and no second active seam is created.',
      };
    case 'BUSINESS_PLAN_UPDATE':
    case 'VISION':
    case 'LESSON_LEARNED':
      return {
        ...result,
        routingOutcome: 'open-thread capture',
        existingGithubTarget: openThreadsTarget,
        newIssueNeeded: 'NO',
        activeSeamImpact: 'NO',
        why: `The input may inform doctrine or future direction, but it is not an implementation command.${labelsProjectsNote}`,
        oneNextMove: `Capture it in Open Threads #${resolvedContext.openThreadsIssue} for later classification by Repo Intake Governor.`,
        forbiddenWork: 'No implementation, public claim expansion, pricing buildout, outreach, or product/runtime change by default.',
        proofRequired: 'Capture receipt and later routing packet if it becomes actionable.',
        stopCondition: 'Stop after capture only; Open Threads is capture only and not implementation authority.',
      };
    case 'ARCHITECTURE_DOCTRINE':
    case 'PRODUCT_PROOF':
      return {
        ...result,
        routingOutcome: 'comment/update existing issue',
        existingGithubTarget: activeTarget,
        newIssueNeeded: 'NO',
        activeSeamImpact: 'YES',
        why: `The input changes or proves command-rail behavior relevant to issue #${resolvedContext.activeIssue}.${labelsProjectsNote}`,
        oneNextMove: `Attach the doctrine/proof to issue #${resolvedContext.activeIssue} or the active PR receipt.`,
        forbiddenWork: 'No second issue, product/runtime implementation, or claim expansion without a new authorized seam.',
        proofRequired: 'Receipt-grade evidence or focused deterministic test tied to the active seam.',
        stopCondition: 'Stop when the doctrine/proof is routed to the active issue or PR and source truth remains single-seam.',
      };
    case 'REPO_HYGIENE':
      return {
        ...result,
        routingOutcome: 'blocked receipt',
        existingGithubTarget: activeTarget,
        newIssueNeeded: 'NO',
        activeSeamImpact: 'NO',
        why: `Repo hygiene is blocked/no-action unless the active seam explicitly authorizes cleanup.${labelsProjectsNote}`,
        oneNextMove: `Post a no-action or blocked receipt against issue #${resolvedContext.activeIssue}; do not start cleanup.`,
        forbiddenWork: 'No broad cleanup, archive sweep, deletion, rename, dependency work, or stale-doc cleanup.',
        proofRequired: 'If later authorized, import/search proof plus the controlling issue proof gate.',
        stopCondition: 'Stop with blocked/no-action receipt; do not create a second active seam.',
      };
    case 'REFERENCE_ONLY':
      return {
        ...result,
        routingOutcome: 'reference-only receipt',
        existingGithubTarget: openThreadsTarget,
        newIssueNeeded: 'NO',
        activeSeamImpact: 'NO',
        why: `The input is already represented or not actionable now.${labelsProjectsNote}`,
        oneNextMove: `Preserve as reference on Open Threads #${resolvedContext.openThreadsIssue}; do not create a duplicate issue.`,
        forbiddenWork: 'No duplicate issue, no active seam update, and no implementation.',
        proofRequired: 'Reference-only receipt if it must be preserved.',
        stopCondition: 'Stop after reference-only routing.',
      };
    case 'UNSAFE_EXPANSION':
      return {
        ...result,
        routingOutcome: 'blocked receipt',
        existingGithubTarget: activeTarget,
        newIssueNeeded: 'NO',
        activeSeamImpact: 'NO',
        why: `The input asks for forbidden expansion outside issue #${resolvedContext.activeIssue}.${labelsProjectsNote}`,
        oneNextMove: `Do not start another seam; post a blocked receipt against issue #${resolvedContext.activeIssue} naming the forbidden work.`,
        forbiddenWork: 'Slack, landing, dashboard, app/runtime code, Supabase, Stripe, connectors, Teams/email/calendar, outreach, scraping, customer data, fake enterprise/compliance claims, and broad cleanup.',
        proofRequired: 'Blocked receipt naming the forbidden work and the controlling source-truth issue.',
        stopCondition: 'Stop with blocked receipt; no more than one active seam is recommended.',
      };
    case 'OPEN_THREAD_CAPTURE':
      return {
        ...result,
        routingOutcome: 'open-thread capture',
        existingGithubTarget: openThreadsTarget,
        newIssueNeeded: 'NO',
        activeSeamImpact: 'NO',
        why: `The input is raw or ambiguous and must be captured before routing.${labelsProjectsNote}`,
        oneNextMove: `Capture it in Open Threads #${resolvedContext.openThreadsIssue}, then route it through Repo Intake Governor when actionable.`,
        forbiddenWork: 'No implementation, no duplicate issue, no active seam change, and no labels/projects authority.',
        proofRequired: 'Open-thread capture receipt plus later routing packet if action is needed.',
        stopCondition: 'Stop after capture only; Open Threads is capture only and not implementation authority.',
      };
    default:
      result.classification satisfies never;
      throw new Error(`Unhandled classification: ${result.classification}`);
  }
}
