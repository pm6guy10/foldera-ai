// =====================================================
// FOLDERA MEETING PREP - AI Brief Generator
// Generates intelligent meeting briefs using Claude API
// =====================================================

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { getRelevantEmailsForMeeting } from './gmail';
import { getMeetingById, markBriefGenerated } from './google-calendar';
import type { Meeting, Brief, BriefContent, EmailCache } from '@/types/meeting-prep';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Initialize Anthropic client (lazy)
let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || 'dummy-key-for-build',
    });
  }
  return anthropicClient;
}

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';

/**
 * Generate Brief
 * Main function that orchestrates brief generation
 * 
 * @param meetingId - Meeting ID to generate brief for
 * @returns Generated brief
 */
export async function generateBrief(meetingId: string): Promise<Brief> {
  const startTime = Date.now();
  
  try {
    console.log(`[Brief] Generating brief for meeting ${meetingId}`);
    
    // 1. Fetch meeting details
    const meeting = await getMeetingById(meetingId);
    if (!meeting) {
      throw new Error('Meeting not found');
    }
    
    // 2. Get relevant emails from cache
    const attendeeEmails = meeting.attendees.map(a => a.email);
    const emails = await getRelevantEmailsForMeeting(
      meeting.user_id,
      attendeeEmails,
      90, // 90 days back
      20 // max 20 emails
    );
    
    console.log(`[Brief] Found ${emails.length} relevant emails for context`);
    
    // 3. Construct prompt for Claude
    const prompt = buildPrompt(meeting, emails);
    
    // 4. Call Claude API
    const anthropic = getAnthropicClient();
    
    console.log(`[Brief] Calling Claude API with model ${DEFAULT_MODEL}`);
    const response = await anthropic.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 4096,
      temperature: 0.7,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });
    
    // 5. Parse response
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }
    
    const briefContent = parseBriefResponse(content.text);
    
    // 6. Save brief to database
    const brief = await saveBrief({
      meeting_id: meetingId,
      user_id: meeting.user_id,
      content: briefContent,
      raw_context: {
        emails: emails.map(e => ({
          id: e.id,
          from: e.from_email,
          to: e.to_emails,
          subject: e.subject || '',
          snippet: e.snippet || '',
          date: e.received_at,
        })),
        meeting_data: {
          title: meeting.title,
          attendees: meeting.attendees,
          description: meeting.description,
        },
      },
      ai_model: DEFAULT_MODEL,
      ai_tokens_used: response.usage.input_tokens + response.usage.output_tokens,
      generation_time_ms: Date.now() - startTime,
    });
    
    // 7. Mark meeting as brief generated
    await markBriefGenerated(meetingId, true);
    
    console.log(`[Brief] Brief generated successfully in ${Date.now() - startTime}ms`);
    
    return brief;
  } catch (error: any) {
    console.error('[Brief] Generation failed:', error);
    
    // Mark meeting as failed
    await markBriefGenerated(meetingId, false, error.message);
    
    throw new Error(`Failed to generate brief: ${error.message}`);
  }
}

/**
 * Build Prompt for Claude
 * Constructs the detailed prompt with meeting and email context
 */
function buildPrompt(meeting: Meeting, emails: EmailCache[]): string {
  // Format attendees
  const attendeesList = meeting.attendees
    .map(a => `- ${a.name || a.email} (${a.email})`)
    .join('\n');
  
  // Format meeting time
  const meetingDate = new Date(meeting.start_time);
  const timeStr = meetingDate.toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  
  // Format emails (most recent first)
  const emailsContext = emails
    .slice(0, 15) // Limit to 15 most relevant
    .map((email, idx) => {
      const date = new Date(email.received_at).toLocaleDateString();
      const preview = email.body_text 
        ? email.body_text.slice(0, 500) // First 500 chars
        : email.snippet || 'No content';
      
      return `
EMAIL ${idx + 1}:
From: ${email.from_name || email.from_email}
To: ${email.to_emails.join(', ')}
Date: ${date}
Subject: ${email.subject || 'No subject'}

${preview}
${email.body_text && email.body_text.length > 500 ? '...' : ''}
---
`;
    })
    .join('\n');
  
  return `You are an AI executive assistant preparing a meeting brief for a busy professional.

MEETING DETAILS:
Title: ${meeting.title}
Time: ${timeStr}
Location: ${meeting.location || 'Not specified'}
${meeting.description ? `Description: ${meeting.description}` : ''}

ATTENDEES:
${attendeesList}

RECENT EMAIL CONTEXT:
${emailsContext || 'No recent emails found with these attendees.'}

YOUR TASK:
Generate a concise, actionable meeting brief in JSON format. Be specific and reference actual details from the emails when possible.

IMPORTANT GUIDELINES:
1. **Key Context**: Surface the most important information from recent emails - things the user might have forgotten
2. **What To Say**: Suggest 2-4 specific talking points based on email history and commitments
3. **What To Avoid**: Flag any sensitive topics, recent frustrations, or topics that might be contentious based on email tone
4. **Open Threads**: Identify any pending items, promises made, or commitments from past emails that are still relevant
5. **Be Specific**: Reference actual dates, specific topics from emails, and concrete details
6. **Be Concise**: Each bullet should be 1-2 sentences max
7. **Be Helpful**: Focus on intelligence that will make the user look prepared and thoughtful

OUTPUT FORMAT (JSON):
{
  "key_context": [
    "Specific fact from email on [date] with context about why it matters",
    "Another important detail the user should remember"
  ],
  "what_to_say": [
    "Suggested talking point based on email history",
    "Another useful thing to mention"
  ],
  "what_to_avoid": [
    "Topic to avoid based on email tone/recent issues",
    "Another sensitive area"
  ],
  "open_threads": [
    "You promised [X] in email from [date] - check if still pending",
    "They asked about [Y] on [date] - may still be waiting for response"
  ],
  "relationship_notes": "Brief assessment of relationship tone from emails (collaborative, tense, friendly, formal, etc.)"
}

Only include information that is actually present in the context provided. If there are no relevant emails, focus on what you can infer from the meeting title and description.

Generate the brief now in valid JSON format:`;
}

/**
 * Parse Brief Response from Claude
 * Extracts and validates the JSON response
 */
function parseBriefResponse(responseText: string): BriefContent {
  try {
    // Try to find JSON in the response (Claude sometimes adds explanation before/after)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    // Validate structure
    const briefContent: BriefContent = {
      key_context: Array.isArray(parsed.key_context) ? parsed.key_context : [],
      what_to_say: Array.isArray(parsed.what_to_say) ? parsed.what_to_say : [],
      what_to_avoid: Array.isArray(parsed.what_to_avoid) ? parsed.what_to_avoid : [],
      open_threads: Array.isArray(parsed.open_threads) ? parsed.open_threads : [],
      relationship_notes: parsed.relationship_notes || undefined,
    };
    
    return briefContent;
  } catch (error: any) {
    console.error('[Brief] Error parsing AI response:', error);
    console.error('[Brief] Raw response:', responseText);
    
    // Return a fallback brief
    return {
      key_context: ['Error parsing AI response. Please try generating again.'],
      what_to_say: [],
      what_to_avoid: [],
      open_threads: [],
      relationship_notes: 'Unable to analyze relationship context.',
    };
  }
}

/**
 * Save Brief to Database
 */
async function saveBrief(briefData: {
  meeting_id: string;
  user_id: string;
  content: BriefContent;
  raw_context: any;
  ai_model: string;
  ai_tokens_used: number;
  generation_time_ms: number;
}): Promise<Brief> {
  const { data, error } = await supabase
    .from('briefs')
    .insert({
      ...briefData,
      generated_at: new Date().toISOString(),
    })
    .select()
    .single();
  
  if (error) {
    throw new Error(`Failed to save brief: ${error.message}`);
  }
  
  return data as Brief;
}

/**
 * Get Brief by Meeting ID
 */
export async function getBriefByMeetingId(meetingId: string): Promise<Brief | null> {
  const { data, error } = await supabase
    .from('briefs')
    .select('*')
    .eq('meeting_id', meetingId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to fetch brief: ${error.message}`);
  }
  
  return data as Brief;
}

/**
 * Get Brief by ID
 */
export async function getBriefById(briefId: string): Promise<Brief | null> {
  const { data, error } = await supabase
    .from('briefs')
    .select('*')
    .eq('id', briefId)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to fetch brief: ${error.message}`);
  }
  
  return data as Brief;
}

/**
 * Get Recent Briefs for User
 */
export async function getRecentBriefs(userId: string, limit: number = 10): Promise<Brief[]> {
  const { data, error } = await supabase
    .from('briefs')
    .select(`
      *,
      meetings:meeting_id (
        title,
        start_time,
        attendees
      )
    `)
    .eq('user_id', userId)
    .order('generated_at', { ascending: false })
    .limit(limit);
  
  if (error) {
    throw new Error(`Failed to fetch recent briefs: ${error.message}`);
  }
  
  return (data || []) as Brief[];
}

/**
 * Mark Brief as Sent
 */
export async function markBriefSent(briefId: string, emailMessageId?: string): Promise<void> {
  const { error } = await supabase
    .from('briefs')
    .update({
      sent_at: new Date().toISOString(),
      email_message_id: emailMessageId,
    })
    .eq('id', briefId);
  
  if (error) {
    throw new Error(`Failed to mark brief as sent: ${error.message}`);
  }
}

/**
 * Regenerate Brief
 * Forces regeneration of a brief even if one already exists
 */
export async function regenerateBrief(meetingId: string): Promise<Brief> {
  console.log(`[Brief] Regenerating brief for meeting ${meetingId}`);
  
  // Reset meeting status
  await markBriefGenerated(meetingId, false);
  
  // Generate new brief
  return await generateBrief(meetingId);
}

