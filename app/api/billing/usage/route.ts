import { NextResponse } from 'next/server';
import { getUserUsage, getUsageMessage, getUsageWarningLevel } from '@/lib/billing/usage-limits';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }
    
    const usage = await getUserUsage(userId);
    
    if (!usage) {
      return NextResponse.json(
        { error: 'Unable to retrieve usage data' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      usage: {
        documentCount: usage.documentCount,
        limit: usage.limit,
        percentageUsed: Math.round(usage.percentageUsed),
        canProcess: usage.canProcess,
        resetDate: usage.resetDate,
      },
      message: getUsageMessage(usage),
      warningLevel: getUsageWarningLevel(usage.percentageUsed),
    });
    
  } catch (error: any) {
    console.error('Error getting usage:', error);
    return NextResponse.json(
      { error: 'Failed to get usage data', details: error.message },
      { status: 500 }
    );
  }
}
