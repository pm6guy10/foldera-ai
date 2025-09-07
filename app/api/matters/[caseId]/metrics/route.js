import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export const dynamic = 'force-dynamic'; // Ensures this route is always run fresh

export async function GET(request, { params }) {
    const { caseId } = params;

    // In a real multi-case app, you would filter by caseId.
    // For now, we'll use your existing data which is all for one case.
    // Later, you would add: .eq('matter_id', caseId)
    try {
        const { data, error } = await supabase
            .from('violations')
            .select('violation_type');

        if (error) {
            console.error('Supabase error:', error);
            throw new Error(error.message);
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
