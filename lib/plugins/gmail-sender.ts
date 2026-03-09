// =====================================================
// GMAIL SENDER - Briefing Agent
// Sends emails directly (not drafts)
// =====================================================

import { google } from 'googleapis';
import { getGoogleAccessToken } from '../auth/auth-options';

/**
 * Encode Subject Line (RFC 2047)
 * Encodes non-ASCII characters and emojis in email subject lines
 * 
 * @param subject - Subject line to encode
 * @returns RFC 2047 encoded subject line
 */
function encodeSubjectLine(subject: string): string {
  // Check if subject contains non-ASCII characters or emojis
  const hasNonASCII = /[^\x00-\x7F]/.test(subject);
  
  if (!hasNonASCII) {
    // No encoding needed for ASCII-only subjects
    return subject;
  }

  // RFC 2047 encoding: =?charset?encoding?encoded-text?=
  // For UTF-8 with base64 encoding: =?UTF-8?B?encoded-text?=
  
  // Encode the subject as UTF-8 base64
  const encoded = Buffer.from(subject, 'utf-8').toString('base64');
  
  // Split into chunks of 75 characters (RFC 2047 line length limit)
  const chunks: string[] = [];
  for (let i = 0; i < encoded.length; i += 75) {
    chunks.push(encoded.slice(i, i + 75));
  }
  
  // Join chunks with line breaks and wrap each in RFC 2047 format
  return chunks.map(chunk => `=?UTF-8?B?${chunk}?=`).join('\r\n ');
}

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

    // Encode subject line for emojis and non-ASCII characters (RFC 2047)
    const encodedSubject = encodeSubjectLine(subject);

    // Build email message (HTML format)
    // Use Base64 encoding for body to handle emojis and special characters
    // Encode the entire HTML body as UTF-8 Base64
    const htmlBodyBase64 = Buffer.from(htmlBody, 'utf-8').toString('base64');
    
    const emailLines = [
      `To: ${to}`,
      `Subject: ${encodedSubject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=utf-8`,
      `Content-Transfer-Encoding: base64`,
      '',
      htmlBodyBase64
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

