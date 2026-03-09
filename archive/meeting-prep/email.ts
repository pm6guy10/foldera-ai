// =====================================================
// FOLDERA MEETING PREP - Email Delivery
// Sends meeting briefs via Resend
// =====================================================

import { Resend } from 'resend';
import { markBriefSent as markBriefSentInDb } from './brief-generator';
import { markBriefSent as markMeetingSent } from './google-calendar';
import type { Meeting, Brief, BriefContent } from '@/types/meeting-prep';

// Initialize Resend client (lazy)
let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY || 'dummy-key-for-build');
  }
  return resendClient;
}

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'briefings@foldera.ai';
const FROM_NAME = process.env.RESEND_FROM_NAME || 'Foldera';

/**
 * Send Brief
 * Main function to send a meeting brief via email
 * 
 * @param userEmail - Recipient email
 * @param userName - Recipient name
 * @param meeting - Meeting data
 * @param brief - Brief data
 * @returns Email message ID
 */
export async function sendBrief(
  userEmail: string,
  userName: string,
  meeting: Meeting,
  brief: Brief
): Promise<string> {
  try {
    console.log(`[Email] Sending brief to ${userEmail} for meeting "${meeting.title}"`);
    
    const resend = getResendClient();
    
    // Format meeting time
    const meetingTime = new Date(meeting.start_time);
    const timeStr = meetingTime.toLocaleString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
    
    // Get time until meeting
    const minutesUntil = Math.floor((meetingTime.getTime() - Date.now()) / (1000 * 60));
    const timeUntilStr = minutesUntil > 60 
      ? `in ${Math.floor(minutesUntil / 60)} hours ${minutesUntil % 60} minutes`
      : `in ${minutesUntil} minutes`;
    
    // Generate email HTML and text
    const htmlBody = generateEmailHTML(userName, meeting, brief, timeStr, timeUntilStr);
    const textBody = generateEmailText(userName, meeting, brief, timeStr, timeUntilStr);
    
    // Send email
    const { data, error } = await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: userEmail,
      subject: `Meeting Brief: ${meeting.title}`,
      html: htmlBody,
      text: textBody,
    });
    
    if (error) {
      throw new Error(`Resend API error: ${error.message}`);
    }
    
    const messageId = data?.id || 'unknown';
    
    // Update database
    await markBriefSentInDb(brief.id, messageId);
    await markMeetingSent(meeting.id);
    
    console.log(`[Email] Brief sent successfully. Message ID: ${messageId}`);
    
    return messageId;
  } catch (error: any) {
    console.error('[Email] Failed to send brief:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

/**
 * Generate Email HTML
 * Creates a nicely formatted HTML email
 */
function generateEmailHTML(
  userName: string,
  meeting: Meeting,
  brief: Brief,
  timeStr: string,
  timeUntilStr: string
): string {
  const content = brief.content;
  
  // Format attendees
  const attendeesList = meeting.attendees
    .filter(a => !a.self)
    .map(a => `<li>${a.name || a.email}</li>`)
    .join('');
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Meeting Brief: ${meeting.title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      background: white;
      border-radius: 8px;
      padding: 32px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .header {
      border-bottom: 3px solid #7C3AED;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .meeting-title {
      font-size: 24px;
      font-weight: 600;
      color: #1a1a1a;
      margin: 0 0 8px 0;
    }
    .meeting-time {
      font-size: 16px;
      color: #666;
      margin: 0;
    }
    .time-badge {
      display: inline-block;
      background: #FEF3C7;
      color: #92400E;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 500;
      margin-top: 8px;
    }
    .section {
      margin: 24px 0;
    }
    .section-title {
      font-size: 14px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 12px;
    }
    .section-title.context {
      color: #F59E0B;
    }
    .section-title.say {
      color: #10B981;
    }
    .section-title.avoid {
      color: #EF4444;
    }
    .section-title.threads {
      color: #6366F1;
    }
    ul {
      margin: 0;
      padding-left: 20px;
    }
    li {
      margin-bottom: 8px;
      color: #444;
    }
    .attendees {
      background: #F9FAFB;
      padding: 16px;
      border-radius: 6px;
      margin: 16px 0;
    }
    .attendees-title {
      font-weight: 600;
      margin-bottom: 8px;
      color: #1a1a1a;
    }
    .relationship-note {
      background: #EDE9FE;
      border-left: 4px solid #7C3AED;
      padding: 12px 16px;
      margin: 16px 0;
      border-radius: 4px;
      font-style: italic;
      color: #5B21B6;
    }
    .footer {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid #E5E7EB;
      text-align: center;
      color: #6B7280;
      font-size: 14px;
    }
    .footer a {
      color: #7C3AED;
      text-decoration: none;
    }
    .cta-button {
      display: inline-block;
      background: #7C3AED;
      color: white !important;
      padding: 12px 24px;
      border-radius: 6px;
      text-decoration: none;
      font-weight: 500;
      margin: 16px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="meeting-title">${meeting.title}</div>
      <div class="meeting-time">📅 ${timeStr}</div>
      <span class="time-badge">⏰ ${timeUntilStr}</span>
    </div>
    
    ${meeting.location ? `<p><strong>Location:</strong> ${meeting.location}</p>` : ''}
    
    <div class="attendees">
      <div class="attendees-title">👥 Meeting With:</div>
      <ul>
        ${attendeesList}
      </ul>
    </div>
    
    ${content.key_context.length > 0 ? `
    <div class="section">
      <div class="section-title context">📌 Key Context</div>
      <ul>
        ${content.key_context.map(item => `<li>${item}</li>`).join('')}
      </ul>
    </div>
    ` : ''}
    
    ${content.what_to_say.length > 0 ? `
    <div class="section">
      <div class="section-title say">💡 What To Say</div>
      <ul>
        ${content.what_to_say.map(item => `<li>${item}</li>`).join('')}
      </ul>
    </div>
    ` : ''}
    
    ${content.what_to_avoid.length > 0 ? `
    <div class="section">
      <div class="section-title avoid">⚠️ What To Avoid</div>
      <ul>
        ${content.what_to_avoid.map(item => `<li>${item}</li>`).join('')}
      </ul>
    </div>
    ` : ''}
    
    ${content.open_threads.length > 0 ? `
    <div class="section">
      <div class="section-title threads">🔄 Open Threads</div>
      <ul>
        ${content.open_threads.map(item => `<li>${item}</li>`).join('')}
      </ul>
    </div>
    ` : ''}
    
    ${content.relationship_notes ? `
    <div class="relationship-note">
      <strong>Relationship Context:</strong> ${content.relationship_notes}
    </div>
    ` : ''}
    
    <div class="footer">
      <p>Powered by <strong>Foldera</strong></p>
      <p style="font-size: 12px; color: #9CA3AF;">
        This brief was generated based on your recent emails and calendar data.
      </p>
    </div>
  </div>
</body>
</html>
`;
}

/**
 * Generate Email Plain Text
 * Creates a plain text version of the email
 */
function generateEmailText(
  userName: string,
  meeting: Meeting,
  brief: Brief,
  timeStr: string,
  timeUntilStr: string
): string {
  const content = brief.content;
  
  const attendeesList = meeting.attendees
    .filter(a => !a.self)
    .map(a => `- ${a.name || a.email}`)
    .join('\n');
  
  let text = `MEETING BRIEF: ${meeting.title}\n\n`;
  text += `📅 ${timeStr}\n`;
  text += `⏰ ${timeUntilStr}\n\n`;
  
  if (meeting.location) {
    text += `Location: ${meeting.location}\n\n`;
  }
  
  text += `👥 MEETING WITH:\n${attendeesList}\n\n`;
  
  if (content.key_context.length > 0) {
    text += `📌 KEY CONTEXT:\n`;
    content.key_context.forEach((item, idx) => {
      text += `${idx + 1}. ${item}\n`;
    });
    text += `\n`;
  }
  
  if (content.what_to_say.length > 0) {
    text += `💡 WHAT TO SAY:\n`;
    content.what_to_say.forEach((item, idx) => {
      text += `${idx + 1}. ${item}\n`;
    });
    text += `\n`;
  }
  
  if (content.what_to_avoid.length > 0) {
    text += `⚠️ WHAT TO AVOID:\n`;
    content.what_to_avoid.forEach((item, idx) => {
      text += `${idx + 1}. ${item}\n`;
    });
    text += `\n`;
  }
  
  if (content.open_threads.length > 0) {
    text += `🔄 OPEN THREADS:\n`;
    content.open_threads.forEach((item, idx) => {
      text += `${idx + 1}. ${item}\n`;
    });
    text += `\n`;
  }
  
  if (content.relationship_notes) {
    text += `RELATIONSHIP CONTEXT:\n${content.relationship_notes}\n\n`;
  }
  
  text += `---\n`;
  text += `Powered by Foldera\n`;
  text += `This brief was generated based on your recent emails and calendar data.\n`;
  
  return text;
}

/**
 * Send Test Email
 * For testing email templates
 */
export async function sendTestEmail(toEmail: string): Promise<string> {
  const resend = getResendClient();
  
  const { data, error } = await resend.emails.send({
    from: `${FROM_NAME} <${FROM_EMAIL}>`,
    to: toEmail,
    subject: 'Test Email from Foldera',
    html: '<p>This is a test email from Foldera Meeting Prep system.</p>',
    text: 'This is a test email from Foldera Meeting Prep system.',
  });
  
  if (error) {
    throw new Error(`Failed to send test email: ${error.message}`);
  }
  
  return data?.id || 'unknown';
}

