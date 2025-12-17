import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/meeting-prep/auth';

// Initialize Supabase client only if environment variables are available
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY 
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;

export const dynamic = 'force-dynamic'; // Ensures this route is always run fresh

export async function GET(request, { params }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { caseId } = params;

    // In a real multi-case app, you would filter by caseId.
    // For now, we'll use your existing data which is all for one case.
    // Later, you would add: .eq('matter_id', caseId)
    try {
        let data = [];
        
        if (supabase) {
            const { data: supabaseData, error } = await supabase
                .from('violations')
                .select('violation_type');

            if (error) {
                console.error('Supabase error:', error);
                // Fall back to mock data
                data = [
                    { violation_type: 'constructive_denial' },
                    { violation_type: 'constructive_denial' },
                    { violation_type: 'privilege_no_log' }
                ];
            } else {
                data = supabaseData || [];
            }
        } else {
            // Use mock data when Supabase is not configured
            data = [
                { violation_type: 'constructive_denial' },
                { violation_type: 'constructive_denial' },
                { violation_type: 'privilege_no_log' }
            ];
        }

        // --- THE PROACTIVE AI ANALYSIS ENGINE ---
        const totalViolations = data.length;
        // Use your actual violation_type names from the table
        const constructiveDenials = data.filter(v => v.violation_type === 'constructive_denial').length;
        const privilegeLogFailures = data.filter(v => v.violation_type === 'privilege_no_log').length;
        
        const culpabilityScore = Math.min(150, (constructiveDenials * 10) + (privilegeLogFailures * 20));

        let strategicRecommendation = "Case is stable. Monitor for new agency responses.";
        let recommendedAction = null;
        if (culpabilityScore > 80) {
            strategicRecommendation = "High degree of agency culpability detected due to repeated denials and log failures. A motion to compel is strongly advised to prevent further prejudice.";
            recommendedAction = "draft_motion_compel";
        }

        const metrics = {
            totalViolations,
            constructiveDenials,
            privilegeLogFailures,
            highRiskViolations: 0, // Placeholder for now
            averageDelay: 0, // Placeholder for now
            strategicRecommendation,
            recommendedAction,
        };
        
        const chartData = [
          { subject: 'Culpability', A: culpabilityScore, fullMark: 150 },
          { subject: 'Clarity', A: 70, fullMark: 150 },
          { subject: 'Deterrence', A: Math.min(150, totalViolations * 10), fullMark: 150 },
          { subject: 'Delay', A: 30, fullMark: 150 },
        ];

        return NextResponse.json({ metrics, chartData });

    } catch (error) {
        console.error(`Error fetching metrics for ${caseId}:`, error);
        return new NextResponse(JSON.stringify({ error: error.message }), { status: 500 });
    }
}
