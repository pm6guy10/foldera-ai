// =====================================================
// GMAIL SENDER - Briefing Agent
// Sends emails directly (not drafts)
// =====================================================

import { google } from 'googleapis';
import { getGoogleAccessToken } from '../meeting-prep/auth';

/**
 * Send Email
 * 
 * Sends an HTML email directly via Gmail API
 * 
 * @param userId - User ID (to get access token)
 * @param to - Recipient email address
 * @param subject - Email subject
 * @param htmlBody - HTML email body
 * @returns Message ID if successful, null otherwise
 */
export async function sendEmail(
  userId: string,
  to: string,
  subject: string,
  htmlBody: string
): Promise<string | null> {
  try {
    // Get user's access token (refresh if needed)
    const accessToken = await getGoogleAccessToken(userId);

    // Initialize Gmail client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ access_token: accessToken });
    
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Build email message (HTML format)
    const emailLines = [
      `To: ${to}`,
      `Subject: ${subject}`,
      `Content-Type: text/html; charset=utf-8`,
      `Content-Transfer-Encoding: 7bit`,
      '',
      htmlBody
    ];

    const email = emailLines.join('\r\n');
    const encoded = Buffer.from(email)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // Send email
    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encoded,
      },
    });

    return response.data.id || null;

  } catch (error: any) {
    console.error('[Gmail Sender] Failed to send email:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

