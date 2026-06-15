import { NextResponse } from 'next/server';
import { verifySlackRequestSignature } from '@/lib/slack/right-now';
import { handleSlackCommand } from '@/lib/slack/command';
import { apiErrorForRoute, badRequest } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';

function requireSlackSigningSecret(): string {
  const signingSecret = process.env.SLACK_SIGNING_SECRET?.trim();
  if (!signingSecret) {
    throw new Error('Missing SLACK_SIGNING_SECRET for Slack command verification');
  }
  return signingSecret;
}

export async function POST(request: Request) {
  try {
    const signingSecret = requireSlackSigningSecret();
    const rawBody = await request.text();
    
    // Verify signature
    const signatureOk = verifySlackRequestSignature({
      signingSecret,
      timestamp: request.headers.get('x-slack-request-timestamp'),
      signature: request.headers.get('x-slack-signature'),
      rawBody,
    });
    
    if (!signatureOk) {
      return NextResponse.json({ error: 'Invalid Slack signature' }, { status: 401 });
    }

    // Parse application/x-www-form-urlencoded
    const form = new URLSearchParams(rawBody);
    const command = form.get('command');
    const text = form.get('text') || '';

    if (command !== '/foldera') {
      return badRequest('Unknown command');
    }

    const responseText = await handleSlackCommand(text);

    // Slack slash commands expect a 200 OK with JSON response
    return NextResponse.json({
      response_type: 'in_channel', // or 'ephemeral' if we don't want others to see
      text: responseText,
    });
  } catch (error: unknown) {
    return apiErrorForRoute(error, 'slack command POST');
  }
}
