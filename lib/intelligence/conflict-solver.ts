// =====================================================
// THE SOLVER - Conflict Resolution Draft Generator
// Phase 4.5: Generate Gmail Drafts for Conflicts
// Creates actionable email drafts to resolve conflicts
// =====================================================

import OpenAI from 'openai';
import { SupabaseClient } from '@supabase/supabase-js';
import { createGmailDraft } from '../plugins/gmail-draft';

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

interface DraftSolution {
  conflictId: string;
  draftId: string | null;
  draftUrl: string | null;
  to: string;
  subject: string;
  body: string;
  error?: string;
}

/**
 * Extract Email Addresses from Text
 * Extracts email addresses from author names and content
 */
function extractEmailAddresses(text: string): string[] {
  const emailRegex = /[\w\.-]+@[\w\.-]+\.\w+/g;
  const matches = text.match(emailRegex);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Get Primary Recipient for Conflict
 * Determines who should receive the resolution email
 */
function getPrimaryRecipient(conflict: Conflict): string | null {
  // Extract emails from both signals
  const sourceEmails = extractEmailAddresses(conflict.sourceSignal.author + ' ' + conflict.sourceSignal.content);
  const targetEmails = extractEmailAddresses(conflict.targetSignal.author + ' ' + conflict.targetSignal.content);
  
  // Prioritize: target signal author (usually the one being contradicted/blocked)
  if (targetEmails.length > 0) {
    return targetEmails[0];
  }
  
  // Fallback: source signal author
  if (sourceEmails.length > 0) {
    return sourceEmails[0];
  }
  
  return null;
}

/**
 * Solve Conflicts (Generate Drafts)
 * 
 * For each conflict, generates a resolution email draft using GPT-4o
 * 
 * @param userId - User ID
 * @param conflicts - Array of conflicts to solve
 * @param supabaseClient - Supabase client
 * @param openaiClient - OpenAI client
 * @param userEmail - User's email address (for 'from' field)
 * @returns Array of draft solutions with URLs
 */
export async function solveConflicts(
  userId: string,
  conflicts: Conflict[],
  supabaseClient: SupabaseClient,
  openaiClient: OpenAI,
  userEmail: string
): Promise<DraftSolution[]> {
  const solutions: DraftSolution[] = [];

  console.log(`[Solver] Generating drafts for ${conflicts.length} conflict(s)...`);

  for (const conflict of conflicts) {
    try {
      // Get primary recipient
      const recipient = getPrimaryRecipient(conflict);
      
      if (!recipient) {
        console.warn(`[Solver] No email address found for conflict ${conflict.id}, skipping...`);
        solutions.push({
          conflictId: conflict.id,
          draftId: null,
          draftUrl: null,
          to: 'unknown',
          subject: '',
          body: '',
          error: 'No email address found for conflict',
        });
        continue;
      }

      // Extract context tags for deep work awareness
      const contextTags = [
        ...(conflict.sourceSignal.context_tags || []),
        ...(conflict.targetSignal.context_tags || [])
      ];
      const uniqueTags = [...new Set(contextTags)];
      
      // Format conflict for AI (include full context for deep work)
      const conflictText = `CONFLICT DETECTED:
Type: ${conflict.relationship_type.toUpperCase()}
Reason: ${conflict.reason}

SOURCE (${conflict.sourceSignal.source.toUpperCase()}):
Author: ${conflict.sourceSignal.author}
Content: ${conflict.sourceSignal.content}
Tags: [${uniqueTags.join(', ')}]

TARGET (${conflict.targetSignal.source.toUpperCase()}):
Author: ${conflict.targetSignal.author}
Content: ${conflict.targetSignal.content}
Tags: [${uniqueTags.join(', ')}]`;

      // Generate context-aware email draft using GPT-4o
      const completion = await openaiClient.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a "Deep Work" executive assistant. You write emails that make your boss look like they remember everything.

Your job:
1. Write a context-aware email that references specific project details (e.g., "Project Phoenix", dates, deliverables)
2. Show that you've read both signals and understand the full context
3. Be diplomatic and solution-focused
4. Add value beyond just acknowledging the conflict (e.g., "Quick check: Does this impact the design review we planned?")
5. Reference specific details from the conflict (project names, dates, deliverables)

DEEP WORK REQUIREMENTS:
- Reference specific project names, dates, or deliverables mentioned in the signals
- Acknowledge the specific change (e.g., "Moving the Project Phoenix kickoff to Tuesday works")
- Ask a follow-up question that shows you understand the context (e.g., "Does this impact the designs mentioned?")
- Make the recipient feel heard and understood

Format:
- Write ONLY clean HTML (no markdown code blocks, no triple backticks)
- Professional email format with greeting and signature
- Use inline styles for formatting
- Reference specific details from the conflict (project names, dates, deliverables)

Structure:
- Greeting (use recipient's name from author field)
- Acknowledge the specific change with context (reference project/details)
- Add value (ask a relevant question or suggest next step)
- Professional closing

Keep it concise (under 200 words). Make it feel like the user remembers everything.`
          },
          {
            role: 'user',
            content: `Write a context-aware email to ${recipient} (from: ${conflict.targetSignal.author}) to resolve this conflict.\n\nShow that you understand the full context and reference specific project details:\n\n${conflictText}\n\nFrom: ${userEmail}`
          }
        ],
        temperature: 0.5,
        max_tokens: 600,
      });

      const emailBody = completion.choices[0]?.message?.content || '';
      
      // Strip markdown code blocks if present
      const cleanBody = emailBody
        .replace(/```html\s*/gi, '')
        .replace(/```markdown\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();

      // Generate context-aware subject line
      const conflictType = conflict.relationship_type === 'blocks' ? 'Urgent' : 'Re:';
      const subjectCompletion = await openaiClient.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'Generate a context-aware email subject line that references the specific project or topic (e.g., "Re: Project Phoenix Kickoff" or "Re: Tuesday Meeting - Project Phoenix"). Keep it under 60 chars and make it look like a natural reply.'
          },
          {
            role: 'user',
            content: `Generate a context-aware subject line for this conflict. Reference the project/topic mentioned:\n\n${conflict.reason}\n\nProject/Tags: ${uniqueTags.join(', ')}\n\nMake it look like a natural reply (use "Re:" format).`
          }
        ],
        temperature: 0.3,
        max_tokens: 30,
      });

      let subject = (completion.choices[0]?.message?.content || conflictType + ' ' + uniqueTags[0] || 'Action Required').trim().replace(/['"]/g, '');
      
      // Ensure subject doesn't exceed reasonable length
      if (subject.length > 80) {
        subject = subject.substring(0, 77) + '...';
      }

      // Create Gmail draft
      const draft = await createGmailDraft(
        userId,
        recipient,
        subject,
        cleanBody
      );

      if (draft) {
        solutions.push({
          conflictId: conflict.id,
          draftId: draft.draftId,
          draftUrl: draft.draftUrl,
          to: recipient,
          subject,
          body: cleanBody,
        });
        console.log(`[Solver] ✅ Draft created for conflict ${conflict.id} → ${recipient}`);
      } else {
        solutions.push({
          conflictId: conflict.id,
          draftId: null,
          draftUrl: null,
          to: recipient,
          subject,
          body: cleanBody,
          error: 'Failed to create draft',
        });
      }

    } catch (error: any) {
      console.error(`[Solver] Error solving conflict ${conflict.id}:`, error);
      solutions.push({
        conflictId: conflict.id,
        draftId: null,
        draftUrl: null,
        to: 'unknown',
        subject: '',
        body: '',
        error: error.message,
      });
    }
  }

  return solutions;
}

