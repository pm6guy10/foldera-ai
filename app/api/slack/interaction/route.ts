import { NextResponse } from 'next/server';
import { deriveSlackSelfLoopWorkPacket } from '@/lib/work-packets/slack-self-loop';
import { redactSlackSecret } from '@/lib/slack/redaction';

export const dynamic = 'force-dynamic';

async function parseSlackInteractionBody(request: Request): Promise<Record<string, unknown> | null> {
  const rawBody = await request.text();
  if (!rawBody.trim()) return null;

  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return JSON.parse(rawBody) as Record<string, unknown>;
  }

  const form = new URLSearchParams(rawBody);
  const payload = form.get('payload');
  if (payload) return JSON.parse(payload) as Record<string, unknown>;

  return Object.fromEntries(form.entries());
}

export async function POST(request: Request) {
  try {
    const payload = await parseSlackInteractionBody(request);
    if (!payload) {
      return NextResponse.json({ error: 'Slack interaction payload is required' }, { status: 400 });
    }

    const packet = deriveSlackSelfLoopWorkPacket({
      ...(payload as Record<string, unknown>),
      actionable_intervention: Boolean(
        payload.actionable_intervention ?? payload.requires_intervention ?? payload.next_move,
      ),
    });

    return NextResponse.json(
      redactSlackSecret({
        acknowledged: true,
        packet,
      }),
      { status: 200 },
    );
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Slack interaction route failed',
      },
      { status: 500 },
    );
  }
}
