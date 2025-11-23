// =====================================================
// THE NARRATOR - Briefing Generator
// Phase 4: Monday Morning Briefing
// Queries the Knowledge Graph and generates Markdown briefing
// =====================================================

import OpenAI from 'openai';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

interface Conflict {
  id: string;
  sourceSignal: {
    id: string;
    signal_id: string;
    source: string;
    author: string;
    content: string;
    context_tags: string[];
  };
  targetSignal: {
    id: string;
    signal_id: string;
    source: string;
    author: string;
    content: string;
    context_tags: string[];
  };
  relationship_type: string;
  reason: string;
  created_at: string;
}

/**
 * Generate Briefing
 * 
 * Queries the Knowledge Graph for conflicts and generates a Markdown briefing
 * 
 * @param userId - User ID to generate briefing for
 * @param supabaseClient - Supabase client (with service role key)
 * @param openaiClient - OpenAI client
 * @returns Markdown briefing text
 */
export async function generateBriefing(
  userId: string,
  supabaseClient: SupabaseClient,
  openaiClient: OpenAI
): Promise<string> {
  try {
    // STEP 1: Query conflicts from last 24 hours
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
    const twentyFourHoursAgoISO = twentyFourHoursAgo.toISOString();

    console.log(`[Narrator] Querying conflicts for user ${userId} from last 24 hours...`);

    // Query signal_relationships for conflicts (contradicts or blocks)
    // First get all conflicts in last 24 hours
    const { data: relationships, error: relationshipsError } = await supabaseClient
      .from('signal_relationships')
      .select(`
        id,
        relationship_type,
        reason,
        created_at,
        source_signal_id,
        target_signal_id
      `)
      .in('relationship_type', ['contradicts', 'blocks'])
      .gte('created_at', twentyFourHoursAgoISO)
      .order('created_at', { ascending: false });

    if (relationshipsError) {
      throw new Error(`Failed to query conflicts: ${relationshipsError.message}`);
    }

    if (!relationships || relationships.length === 0) {
      console.log(`[Narrator] No conflicts found in last 24 hours`);
      return `# Monday Morning Briefing

## 📊 Status: All Clear

No conflicts or blocking issues detected in the last 24 hours.

Your Knowledge Graph is clean! 🎉

---
*Generated at ${new Date().toLocaleString()}*`;
    }

    // Get unique signal IDs that need to be fetched
    const signalIds = new Set<string>();
    relationships.forEach((rel: any) => {
      if (rel.source_signal_id) signalIds.add(rel.source_signal_id);
      if (rel.target_signal_id) signalIds.add(rel.target_signal_id);
    });

    if (signalIds.size === 0) {
      console.log(`[Narrator] No signal IDs found in relationships`);
      return `# Monday Morning Briefing

## 📊 Status: All Clear

No conflicts or blocking issues detected in the last 24 hours.

Your Knowledge Graph is clean! 🎉

---
*Generated at ${new Date().toLocaleString()}*`;
    }

    // Fetch all signals at once (filtered by user_id)
    const { data: allSignals, error: signalsError } = await supabaseClient
      .from('work_signals')
      .select('id, signal_id, source, author, content, context_tags, user_id')
      .in('id', Array.from(signalIds))
      .eq('user_id', userId);

    if (signalsError) {
      throw new Error(`Failed to fetch signals: ${signalsError.message}`);
    }

    if (!allSignals || allSignals.length === 0) {
      console.log(`[Narrator] No signals found for conflicts (user: ${userId})`);
      return `# Monday Morning Briefing

## 📊 Status: All Clear

No conflicts or blocking issues detected in the last 24 hours.

Your Knowledge Graph is clean! 🎉

---
*Generated at ${new Date().toLocaleString()}*`;
    }

    // Create a map of signal ID to signal data
    const signalMap = new Map<string, any>();
    allSignals.forEach((signal: any) => {
      signalMap.set(signal.id, signal);
    });

    // Build conflicts array with hydrated signals
    const userConflicts: Conflict[] = [];

    for (const rel of relationships) {
      const sourceSignal = signalMap.get(rel.source_signal_id);
      const targetSignal = signalMap.get(rel.target_signal_id);

      if (!sourceSignal || !targetSignal) continue;

      // Verify both signals belong to the user (already filtered by user_id in query)
      userConflicts.push({
        id: rel.id,
        sourceSignal: {
          id: sourceSignal.id,
          signal_id: sourceSignal.signal_id,
          source: sourceSignal.source,
          author: sourceSignal.author,
          content: sourceSignal.content,
          context_tags: sourceSignal.context_tags || [],
        },
        targetSignal: {
          id: targetSignal.id,
          signal_id: targetSignal.signal_id,
          source: targetSignal.source,
          author: targetSignal.author,
          content: targetSignal.content,
          context_tags: targetSignal.context_tags || [],
        },
        relationship_type: rel.relationship_type,
        reason: rel.reason,
        created_at: rel.created_at,
      });
    }

    console.log(`[Narrator] Found ${userConflicts.length} conflict(s) in last 24 hours`);

    // Format conflicts for AI
    const conflictsText = userConflicts.map((conflict, index) => {
      const sourcePreview = conflict.sourceSignal.content.substring(0, 200);
      const targetPreview = conflict.targetSignal.content.substring(0, 200);
      
      return `CONFLICT ${index + 1}:
Type: ${conflict.relationship_type.toUpperCase()}
Reason: ${conflict.reason}

SOURCE (${conflict.sourceSignal.source.toUpperCase()}):
Author: ${conflict.sourceSignal.author}
Signal ID: ${conflict.sourceSignal.signal_id}
Content: ${sourcePreview}...
Tags: [${conflict.sourceSignal.context_tags.join(', ')}]

TARGET (${conflict.targetSignal.source.toUpperCase()}):
Author: ${conflict.targetSignal.author}
Signal ID: ${conflict.targetSignal.signal_id}
Content: ${targetPreview}...
Tags: [${conflict.targetSignal.context_tags.join(', ')}]

---
`;
    }).join('\n');

    // Generate briefing with GPT-4o
    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an elite Chief of Staff preparing a Monday Morning Briefing.

Your job is to:
1. Summarize critical conflicts and risks
2. Explain why they matter (The Context)
3. Propose concrete actions to resolve each conflict

Be concise, actionable, and professional. Write in Markdown format.

STRUCTURE:
# Monday Morning Briefing

## 🔥 Critical Alerts (The Fires)
[List urgent conflicts that need immediate attention]

## 📋 The Context (Why It Matters)
[Explain the business impact and why these conflicts are important]

## ✅ Proposed Actions
[Specific, actionable steps to resolve each conflict]

Be direct and helpful. The user needs to understand what's wrong and how to fix it.`
        },
        {
          role: 'user',
          content: `Analyze these ${userConflicts.length} conflict(s) detected in the last 24 hours:\n\n${conflictsText}`
        }
      ],
      temperature: 0.4, // Lower temperature for more structured briefing
      max_tokens: 2000,
    });

    const briefing = completion.choices[0]?.message?.content || '# Monday Morning Briefing\n\nNo briefing available.';

    // Add footer
    const footer = `\n\n---\n*Generated at ${new Date().toLocaleString()} | ${userConflicts.length} conflict(s) detected*`;

    return briefing + footer;

  } catch (error: any) {
    console.error('[Narrator] Error generating briefing:', error);
    throw new Error(`Failed to generate briefing: ${error.message}`);
  }
}

/**
 * Generate Briefing Content (Email Format)
 * 
 * Queries the Knowledge Graph for conflicts and generates an HTML email briefing
 * 
 * @param userId - User ID to generate briefing for
 * @param supabaseClient - Supabase client (with service role key)
 * @param openaiClient - OpenAI client
 * @param draftLinks - Optional array of draft links to include in briefing
 * @returns Email subject and HTML body
 */
export async function generateBriefingContent(
  userId: string,
  supabaseClient: SupabaseClient,
  openaiClient: OpenAI,
  draftLinks?: Array<{ conflictId: string; draftUrl: string; subject: string }>
): Promise<{ subject: string; htmlBody: string }> {
  try {
    // STEP 1: Query conflicts from last 24 hours
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
    const twentyFourHoursAgoISO = twentyFourHoursAgo.toISOString();

    console.log(`[Narrator] Querying conflicts for user ${userId} from last 24 hours...`);

    // Query signal_relationships for conflicts (contradicts or blocks)
    const { data: relationships, error: relationshipsError } = await supabaseClient
      .from('signal_relationships')
      .select(`
        id,
        relationship_type,
        reason,
        created_at,
        source_signal_id,
        target_signal_id
      `)
      .in('relationship_type', ['contradicts', 'blocks'])
      .gte('created_at', twentyFourHoursAgoISO)
      .order('created_at', { ascending: false });

    if (relationshipsError) {
      throw new Error(`Failed to query conflicts: ${relationshipsError.message}`);
    }

    if (!relationships || relationships.length === 0) {
      console.log(`[Narrator] No conflicts found in last 24 hours`);
      return {
        subject: '⚡ Monday Briefing: All Clear ✅',
        htmlBody: `<div style="font-family: Helvetica, sans-serif; font-size: 16px; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #059669; margin-bottom: 20px;">Good morning. Here is your status check.</h1>
          <h2 style="color: #059669; margin-top: 30px; margin-bottom: 15px;">Status: ✅ ALL CLEAR</h2>
          <p>No conflicts or blocking issues detected in the last 24 hours.</p>
          <p>Your Knowledge Graph is clean! 🎉</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #6b7280; font-size: 14px;">Generated at ${new Date().toLocaleString()}</p>
        </div>`
      };
    }

    // Get unique signal IDs that need to be fetched
    const signalIds = new Set<string>();
    relationships.forEach((rel: any) => {
      if (rel.source_signal_id) signalIds.add(rel.source_signal_id);
      if (rel.target_signal_id) signalIds.add(rel.target_signal_id);
    });

    if (signalIds.size === 0) {
      console.log(`[Narrator] No signal IDs found in relationships`);
      return {
        subject: '⚡ Monday Briefing: All Clear ✅',
        htmlBody: `<div style="font-family: Helvetica, sans-serif; font-size: 16px; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #059669; margin-bottom: 20px;">Good morning. Here is your status check.</h1>
          <h2 style="color: #059669; margin-top: 30px; margin-bottom: 15px;">Status: ✅ ALL CLEAR</h2>
          <p>No conflicts or blocking issues detected in the last 24 hours.</p>
          <p>Your Knowledge Graph is clean! 🎉</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #6b7280; font-size: 14px;">Generated at ${new Date().toLocaleString()}</p>
        </div>`
      };
    }

    // Fetch all signals at once (filtered by user_id)
    const { data: allSignals, error: signalsError } = await supabaseClient
      .from('work_signals')
      .select('id, signal_id, source, author, content, context_tags, user_id')
      .in('id', Array.from(signalIds))
      .eq('user_id', userId);

    if (signalsError) {
      throw new Error(`Failed to fetch signals: ${signalsError.message}`);
    }

    if (!allSignals || allSignals.length === 0) {
      console.log(`[Narrator] No signals found for conflicts (user: ${userId})`);
      return {
        subject: '⚡ Monday Briefing: All Clear ✅',
        htmlBody: `<div style="font-family: Helvetica, sans-serif; font-size: 16px; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #059669; margin-bottom: 20px;">Good morning. Here is your status check.</h1>
          <h2 style="color: #059669; margin-top: 30px; margin-bottom: 15px;">Status: ✅ ALL CLEAR</h2>
          <p>No conflicts or blocking issues detected in the last 24 hours.</p>
          <p>Your Knowledge Graph is clean! 🎉</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #6b7280; font-size: 14px;">Generated at ${new Date().toLocaleString()}</p>
        </div>`
      };
    }

    // Create a map of signal ID to signal data
    const signalMap = new Map<string, any>();
    allSignals.forEach((signal: any) => {
      signalMap.set(signal.id, signal);
    });

    // Build conflicts array with hydrated signals
    const userConflicts: Conflict[] = [];

    for (const rel of relationships) {
      const sourceSignal = signalMap.get(rel.source_signal_id);
      const targetSignal = signalMap.get(rel.target_signal_id);

      if (!sourceSignal || !targetSignal) continue;

      userConflicts.push({
        id: rel.id,
        sourceSignal: {
          id: sourceSignal.id,
          signal_id: sourceSignal.signal_id,
          source: sourceSignal.source,
          author: sourceSignal.author,
          content: sourceSignal.content,
          context_tags: sourceSignal.context_tags || [],
        },
        targetSignal: {
          id: targetSignal.id,
          signal_id: targetSignal.signal_id,
          source: targetSignal.source,
          author: targetSignal.author,
          content: targetSignal.content,
          context_tags: targetSignal.context_tags || [],
        },
        relationship_type: rel.relationship_type,
        reason: rel.reason,
        created_at: rel.created_at,
      });
    }

    console.log(`[Narrator] Found ${userConflicts.length} conflict(s) in last 24 hours`);

    // Limit to max 3 conflicts to reduce overwhelm
    const limitedConflicts = userConflicts.slice(0, 3);
    if (userConflicts.length > 3) {
      console.log(`[Narrator] Limiting to 3 conflicts (found ${userConflicts.length} total)`);
    }

    // Format conflicts for AI
    const conflictsText = limitedConflicts.map((conflict, index) => {
      const sourcePreview = conflict.sourceSignal.content.substring(0, 200);
      const targetPreview = conflict.targetSignal.content.substring(0, 200);
      
      return `CONFLICT ${index + 1}:
Type: ${conflict.relationship_type.toUpperCase()}
Reason: ${conflict.reason}

SOURCE (${conflict.sourceSignal.source.toUpperCase()}):
Author: ${conflict.sourceSignal.author}
Signal ID: ${conflict.sourceSignal.signal_id}
Content: ${sourcePreview}...
Tags: [${conflict.sourceSignal.context_tags.join(', ')}]

TARGET (${conflict.targetSignal.source.toUpperCase()}):
Author: ${conflict.targetSignal.author}
Signal ID: ${conflict.targetSignal.signal_id}
Content: ${targetPreview}...
Tags: [${conflict.targetSignal.context_tags.join(', ')}]

---
`;
    }).join('\n');

    // Generate email content with GPT-4o
    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are the Chief of Staff. Write a high-impact Monday Morning Briefing.

Your job is to:
1. Summarize critical conflicts clearly
2. Explain the context and why it matters
3. Propose concrete actions to resolve each conflict

Be concise, professional, and actionable. Write in clean HTML format (inline styles only).

STRUCTURE (REQUIRED):
- Opening: "Good morning. Here is your status check."
- Header: "Status: 🔴 AT RISK" (if conflicts exist, use this exact format)
- Section: "The Conflicts" (Bullet points of conflicts)
- Section: "Recommended Actions" (Specific, actionable steps)

IMPORTANT FORMATTING RULES:
- Write ONLY clean HTML (no markdown code blocks, no triple backticks)
- For actions involving email, create mailto links: <a href="mailto:person@example.com?subject=Re: Issue&body=Message">Click to email person@example.com</a>
- **CRITICAL FOR DRAFT LINKS**: If draft links are provided, include prominent button-style links to Gmail drafts. Use this exact format:
  <div style="margin: 20px 0;">
    <a href="https://mail.google.com/mail/u/0/#drafts/DRAFT_ID" target="_blank" style="background: #22c55e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">🎯 REVIEW & SEND REPLY: [Subject]</a>
  </div>
- Make draft links prominent and actionable (button style, green background #22c55e)
- For actions involving specific people (from conflict data), extract their email addresses and create mailto links
- If email address is not available, create mailto links with just the name: <a href="mailto:name@example.com">Contact [Name]</a>

Format the HTML with:
- Clean, minimalist styling (inline CSS only)
- Bold headers for sections (use <h2> with inline styles)
- Easy to read font (sans-serif)
- Proper spacing and hierarchy
- Maximum impact, minimal design
- Mailto links for actionable email steps

CRITICAL: Do NOT wrap your output in markdown code blocks (no \`\`\`html or \`\`\`). Output raw HTML only.

The user needs to understand what's wrong and how to fix it immediately.`
        },
        {
          role: 'user',
          content: `Analyze these ${limitedConflicts.length} conflict(s) detected in the last 24 hours${userConflicts.length > 3 ? ` (showing top 3 of ${userConflicts.length} total)` : ''}:\n\n${conflictsText}${draftLinks && draftLinks.length > 0 ? `\n\n⚠️ IMPORTANT: Draft emails have been pre-written for the following conflicts:\n${draftLinks.map((d, idx) => `Draft ${idx + 1}: Subject="${d.subject}" | URL=${d.draftUrl} | Conflict ID=${d.conflictId}`).join('\n')}\n\nFor each draft, include a prominent button-style link using this format:\n<div style="margin: 20px 0;"><a href="${draftLinks[0].draftUrl}" target="_blank" style="background: #22c55e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">🎯 REVIEW & SEND REPLY: ${draftLinks[0].subject}</a></div>\n\nMake these links stand out - they are "one-click" solutions to resolve conflicts. The user clicks the link -> opens Gmail -> hits Send.` : ''}`
        }
      ],
      temperature: 0.4,
      max_tokens: 2000,
    });

    let emailBody = completion.choices[0]?.message?.content || '<p>No briefing available.</p>';

    // Strip markdown code blocks (GPT sometimes wraps HTML in ```html or ```markdown blocks)
    emailBody = emailBody
      .replace(/```html\s*/gi, '')
      .replace(/```markdown\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    // Generate subject line based on conflicts (use full count, not limited)
    const conflictCount = userConflicts.length;
    const criticalCount = userConflicts.filter(c => c.relationship_type === 'blocks').length;
    
    let subject: string;
    if (criticalCount > 0) {
      subject = `⚡ Monday Briefing: ${criticalCount} Critical Conflict${criticalCount > 1 ? 's' : ''}`;
    } else {
      subject = `⚡ Monday Briefing: ${conflictCount} Conflict${conflictCount > 1 ? 's' : ''}`;
    }

    // Wrap body in email-friendly HTML with updated styling
    const htmlBody = `<div style="font-family: Helvetica, sans-serif; font-size: 16px; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
${emailBody}
<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
<p style="color: #6b7280; font-size: 14px;">Generated at ${new Date().toLocaleString()} | ${userConflicts.length} conflict(s) detected${userConflicts.length > 3 ? ' (showing top 3)' : ''}</p>
</div>`;

    return {
      subject,
      htmlBody
    };

  } catch (error: any) {
    console.error('[Narrator] Error generating briefing content:', error);
    throw new Error(`Failed to generate briefing content: ${error.message}`);
  }
}

