import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth/auth-options';
import { generateBriefing } from '@/lib/briefing/generator';

export const dynamic = 'force-dynamic';

async function handler(request: NextRequest) {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const brief = await generateBriefing(session.user.id);
    return NextResponse.json({
      topInsight: brief.topInsight,
      confidence: brief.confidence,
      recommendedAction: brief.recommendedAction,
      fullBrief: brief.fullBrief,
      generatedAt: brief.generatedAt,
    });
  } catch (error: any) {
    console.error('[/api/briefing]', error);
    return NextResponse.json(
      { error: error.message || 'Briefing generation failed' },
      { status: 500 }
    );
  }
}

export const GET = handler;
export const POST = handler;
