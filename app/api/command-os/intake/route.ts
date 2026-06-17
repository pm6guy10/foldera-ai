import { NextRequest, NextResponse } from 'next/server';
import { buildIntakePacket } from '@/lib/repo-intake-governor';
import { appendOpenThreadsComment } from '@/lib/repo-intake-governor/writeback';
import { validateCronAuth } from '@/lib/auth/resolve-user';

const COMMAND_OS_CONTEXT = {
  activeIssue: 168,
  activeIssueTitle: 'Command OS v1 — automatic Open Threads capture from ChatGPT',
  openThreadsIssue: 165,
  ledgerIssue: 136,
};

type IntakeBody = {
  rawText?: unknown;
  text?: unknown;
};

function readRawText(body: IntakeBody | null): string | null {
  if (!body) return null;
  if (typeof body.rawText === 'string') return body.rawText;
  if (typeof body.text === 'string') return body.text;
  return null;
}

export async function POST(request: NextRequest) {
  // This route writes to GitHub using a server-side token. It is machine-called
  // (ChatGPT capture action), so gate it with the shared cron secret instead of
  // leaving it open to the internet. Caller must send Authorization: Bearer
  // <CRON_SECRET> (or x-cron-secret).
  const authError = validateCronAuth(request);
  if (authError) return authError;

  try {
    const body = (await request.json().catch(() => null)) as IntakeBody | null;
    const rawText = readRawText(body)?.trim() ?? '';

    if (!rawText) {
      return NextResponse.json({ error: 'rawText is required' }, { status: 400 });
    }

    const packet = buildIntakePacket(rawText, COMMAND_OS_CONTEXT);

    // All classifications write to Issue #165 as the capture inbox.
    // The routing packet inside the comment tells future sessions where to escalate.
    const writeBack = await appendOpenThreadsComment(rawText, packet);

    return NextResponse.json({
      ok: true,
      classification: packet.classification,
      routingOutcome: packet.routingOutcome,
      existingGithubTarget: packet.existingGithubTarget,
      newIssueNeeded: packet.newIssueNeeded,
      activeSeamImpact: packet.activeSeamImpact,
      executionLoopTriggered: false,
      writeBack: {
        issueNumber: writeBack.issueNumber,
        commentId: writeBack.commentId,
        commentUrl: writeBack.commentUrl,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Command OS intake failed';
    const sanitized = message.replace(/ghp_[A-Za-z0-9]+/g, '[REDACTED]').replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
    console.error('[command-os/intake] write-back failure:', sanitized);
    return NextResponse.json(
      { ok: false, error: 'Command OS intake failed', failureStage: 'github_writeback' },
      { status: 500 },
    );
  }
}
