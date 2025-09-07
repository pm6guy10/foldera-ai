// File: app/api/matters/[caseId]/metrics/route.js (V2.0 - Proactive AI)

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export async function GET(request, { params }) {
    const { caseId } = params;

    // In a real app, we'd use the caseId. For now, we'll fetch all.
    // Replace with: .eq('matter_id', caseId) later.
    try {
        const { data, error } = await supabase
            .from('violations')
            .select('violation_type, sender');

        if (error) throw new Error(error.message);

        // --- THE PROACTIVE AI ANALYSIS ENGINE ---
        const totalViolations = data.length;
        const constructiveDenials = data.filter(v => v.violation_type === 'constructive_denial').length;
        const privilegeLogFailures = data.filter(v => v.violation_type === 'privilege_no_log').length;
        
        // Let's create a more advanced "Culpability" score.
        // Each denial is 10 points, each log failure is 20. Max 150.
        const culpabilityScore = Math.min(150, (constructiveDenials * 10) + (privilegeLogFailures * 20));

        // --- Strategic Recommendation Engine ---
        let strategicRecommendation = "Case is stable. Monitor for new agency responses.";
        let recommendedAction = null;
        if (culpabilityScore > 80) { // If the culpability score is high
            strategicRecommendation = "High degree of agency culpability detected due to repeated denials and log failures. A motion to compel is strongly advised to prevent further prejudice.";
            recommendedAction = "draft_motion_compel";
        }

        const metrics = {
            totalViolations,
            constructiveDenials,
            privilegeLogFailures,
            highRiskViolations: 0, // Placeholder
            averageDelay: 0, // Placeholder
            strategicRecommendation,
            recommendedAction,
        };
        
        const chartData = [
          { subject: 'Culpability', A: culpabilityScore, fullMark: 150 },
          { subject: 'Clarity', A: 70, fullMark: 150 }, // Placeholder
          { subject: 'Deterrence', A: Math.min(150, totalViolations * 10), fullMark: 150 },
          { subject: 'Delay', A: 30, fullMark: 150 }, // Placeholder
        ];

        return NextResponse.json({ metrics, chartData });

    } catch (error) {
        console.error(`Error fetching metrics for ${caseId}:`, error);
        return new NextResponse(JSON.stringify({ error: error.message }), { status: 500 });
    }
}
