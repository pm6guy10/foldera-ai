import { NextRequest, NextResponse } from 'next/server';
import { buildIntakePacket } from '@/lib/repo-intake-governor';
import { appendOpenThreadsComment } from '@/lib/repo-intake-governor/writeback';

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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Command OS intake failed' },
      { status: 500 },
    );
  }
}
