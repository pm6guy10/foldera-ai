// Supabase Edge Function: Nightly Analysis
// Runs every night at 2 AM to detect conflicts and draft solutions

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')!;

serve(async (req) => {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🧠 Starting nightly conflict analysis...');

    // Get all active users
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, name')
      .eq('status', 'active');

    if (usersError) throw usersError;

    let briefingsCreated = 0;
    let conflictsFound = 0;

    // Analyze each user's data
    for (const user of users || []) {
      try {
        console.log(`🔍 Analyzing data for user ${user.id}`);

        // Get today's changes
        const { data: documents, error: docsError } = await supabase
          .from('user_documents')
          .select('*')
          .eq('user_id', user.id)
          .gte('last_modified', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .order('last_modified', { ascending: false });

        if (docsError) throw docsError;

        if (!documents || documents.length === 0) {
          console.log(`⏭️  No changes for user ${user.id}`);
          continue;
        }

        // Detect conflicts across all documents
        const conflicts = await detectCrossSourceConflicts(documents);

        if (conflicts.length === 0) {
          console.log(`✅ No conflicts found for user ${user.id}`);
          // Still create a briefing showing "all clear"
          await createBriefing(user.id, [], documents.length, supabase);
          briefingsCreated++;
          continue;
        }

        // Draft solutions for each conflict
        const solutions = await draftSolutions(conflicts, documents);

        // Store briefing
        await createBriefing(user.id, solutions, documents.length, supabase);

        conflictsFound += conflicts.length;
        briefingsCreated++;

        console.log(`✅ Found ${conflicts.length} conflicts for user ${user.id}`);

      } catch (error) {
        console.error(`❌ Analysis failed for user ${user.id}:`, error);
      }
    }

    console.log(`✅ Analysis complete: ${briefingsCreated} briefings, ${conflictsFound} conflicts`);

    return new Response(
      JSON.stringify({
        success: true,
        briefings_created: briefingsCreated,
        conflicts_found: conflictsFound,
        timestamp: new Date().toISOString()
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Nightly analysis failed:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

// CONFLICT DETECTION
async function detectCrossSourceConflicts(documents: any[]): Promise<any[]> {
  const conflicts: any[] = [];

  // 1. CALENDAR + EMAIL CONFLICTS
  const calendarEvents = documents.filter(d => d.source === 'google_calendar');
  const emails = documents.filter(d => d.source === 'gmail');

  // Check for double bookings
  for (let i = 0; i < calendarEvents.length; i++) {
    for (let j = i + 1; j < calendarEvents.length; j++) {
      const event1 = JSON.parse(calendarEvents[i].content);
      const event2 = JSON.parse(calendarEvents[j].content);

      if (eventsOverlap(event1, event2)) {
        conflicts.push({
          type: 'double_booking',
          severity: 'critical',
          title: 'Calendar Conflict',
          description: `Double-booked: ${event1.summary} vs ${event2.summary}`,
          sources: [calendarEvents[i].source_id, calendarEvents[j].source_id],
          evidence: {
            event1: event1.summary,
            event2: event2.summary,
            time: event1.start.dateTime
          }
        });
      }
    }
  }

  // 2. DRIVE + CALENDAR CONFLICTS
  const driveFiles = documents.filter(d => d.source === 'google_drive');
  
  // Check for deadline vs meeting conflicts
  for (const file of driveFiles) {
    const fileName = file.title.toLowerCase();
    
    // Extract deadlines from file names
    if (fileName.includes('due') || fileName.includes('deadline')) {
      // Find calendar events near this deadline
      const nearbyMeetings = calendarEvents.filter(event => {
        const eventDate = new Date(JSON.parse(event.content).start.dateTime);
        const fileDate = new Date(file.last_modified);
        const daysDiff = Math.abs((eventDate.getTime() - fileDate.getTime()) / (1000 * 60 * 60 * 24));
        return daysDiff <= 2; // Within 2 days
      });

      if (nearbyMeetings.length > 3) {
        conflicts.push({
          type: 'deadline_risk',
          severity: 'high',
          title: 'Deadline at Risk',
          description: `${file.title} deadline with ${nearbyMeetings.length} nearby meetings`,
          sources: [file.source_id, ...nearbyMeetings.map(m => m.source_id)],
          evidence: {
            file: file.title,
            meetings: nearbyMeetings.length,
            riskLevel: 'high'
          }
        });
      }
    }
  }

  // 3. EMAIL + DRIVE CONFLICTS
  // Check for version mismatches, contradictions, etc.
  for (const email of emails) {
    const emailMeta = email.metadata;
    const snippet = emailMeta?.snippet?.toLowerCase() || '';

    // Look for financial discrepancies
    const amounts = extractAmounts(snippet);
    
    for (const file of driveFiles) {
      const fileAmounts = extractAmounts(file.title.toLowerCase());
      
      // Check if different amounts mentioned for same context
      if (amounts.length > 0 && fileAmounts.length > 0) {
        const mismatch = amounts.find(a => 
          fileAmounts.some(f => Math.abs(a - f) > a * 0.1) // 10% difference
        );

        if (mismatch) {
          conflicts.push({
            type: 'financial_mismatch',
            severity: 'critical',
            title: 'Financial Discrepancy',
            description: `Amount mismatch between email and ${file.title}`,
            sources: [email.source_id, file.source_id],
            evidence: {
              email: emailMeta?.subject,
              file: file.title,
              emailAmount: amounts[0],
              fileAmount: fileAmounts[0]
            }
          });
        }
      }
    }
  }

  return conflicts;
}

// SOLUTION DRAFTING
async function draftSolutions(conflicts: any[], documents: any[]): Promise<any[]> {
  const solutions: any[] = [];

  for (const conflict of conflicts) {
    let solution;

    switch (conflict.type) {
      case 'double_booking':
        solution = {
          conflict: conflict,
          action: 'reschedule',
          details: `Move ${conflict.evidence.event2} to next available slot`,
          executable: true,
          draft: `Draft email to attendees:\n\n"Due to a scheduling conflict, I need to reschedule our meeting. Would [next available time] work for everyone?"`
        };
        break;

      case 'deadline_risk':
        solution = {
          conflict: conflict,
          action: 'block_time',
          details: `Block ${conflict.evidence.meetings} hours for ${conflict.evidence.file} preparation`,
          executable: true,
          draft: `Calendar block created: "${conflict.evidence.file} Preparation" - ${conflict.evidence.meetings} hours`
        };
        break;

      case 'financial_mismatch':
        solution = {
          conflict: conflict,
          action: 'verify_and_correct',
          details: `Verify actual amount and update ${conflict.evidence.file}`,
          executable: true,
          draft: `Draft email to stakeholders:\n\n"I've noticed a discrepancy in our financial figures. Email mentions $${conflict.evidence.emailAmount}, but ${conflict.evidence.file} shows $${conflict.evidence.fileAmount}. Please advise which is correct so I can update our records."`
        };
        break;

      default:
        solution = {
          conflict: conflict,
          action: 'review',
          details: `Manual review recommended`,
          executable: false,
          draft: `Please review this conflict and determine the appropriate action.`
        };
    }

    solutions.push(solution);
  }

  return solutions;
}

// BRIEFING CREATION
async function createBriefing(userId: string, solutions: any[], documentsAnalyzed: number, supabase: any) {
  const briefing = {
    user_id: userId,
    date: new Date().toISOString().split('T')[0],
    conflicts_found: solutions.length,
    documents_analyzed: documentsAnalyzed,
    solutions: solutions,
    status: 'pending',
    created_at: new Date().toISOString()
  };

  await supabase
    .from('daily_briefings')
    .upsert(briefing, { onConflict: 'user_id,date' });
}

// HELPERS
function eventsOverlap(event1: any, event2: any): boolean {
  const start1 = new Date(event1.start.dateTime || event1.start.date);
  const end1 = new Date(event1.end.dateTime || event1.end.date);
  const start2 = new Date(event2.start.dateTime || event2.start.date);
  const end2 = new Date(event2.end.dateTime || event2.end.date);

  return start1 < end2 && start2 < end1;
}

function extractAmounts(text: string): number[] {
  const amounts: number[] = [];
  const regex = /\$\s*([0-9,]+(?:\.[0-9]{2})?)\s*(k|m|million|thousand)?/gi;
  let match;

  while ((match = regex.exec(text)) !== null) {
    let amount = parseFloat(match[1].replace(/,/g, ''));
    const unit = match[2]?.toLowerCase();

    if (unit === 'k' || unit === 'thousand') amount *= 1000;
    if (unit === 'm' || unit === 'million') amount *= 1000000;

    amounts.push(amount);
  }

  return amounts;
}
