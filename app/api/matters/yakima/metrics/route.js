import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/meeting-prep/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Mock data for the Yakima case
    const mockData = {
      metrics: {
        totalViolations: 8,
        highRiskViolations: 2,
        constructiveDenials: 4,
        privilegeLogFailures: 2,
        strategicRecommendation: "The Agency has demonstrated a pattern of non-compliance with multiple constructive denials and privilege log failures. Immediate action is recommended to compel production and seek sanctions.",
        recommendedAction: "draft_motion_compel"
      },
      chartData: [
        { subject: 'Timeliness', A: 2 },
        { subject: 'Completeness', A: 3 },
        { subject: 'Good Faith', A: 1 },
        { subject: 'Privilege Logs', A: 2 },
        { subject: 'Redactions', A: 4 },
        { subject: 'Exemptions', A: 3 }
      ]
    };

    return NextResponse.json(mockData);
  } catch (error) {
    console.error("Error in yakima metrics API:", error);
    return NextResponse.json({ error: "Failed to fetch metrics" }, { status: 500 });
  }
}
