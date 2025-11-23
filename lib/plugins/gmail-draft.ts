// =====================================================
// GMAIL DRAFT CREATOR
// Creates Gmail drafts (not sends)
// =====================================================

import { google } from 'googleapis';
import { getGoogleAccessToken } from '../meeting-prep/auth';

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
 * Create Gmail Draft
 * 
 * Creates a draft email in Gmail (not sends)
 * Supports both plain text and HTML bodies
 * 
 * @param userId - User ID (to get access token)
 * @param to - Recipient email address(es)
 * @param subject - Email subject
 * @param body - Email body (plain text or HTML)
 * @returns Draft ID if successful, null otherwise
 */
export async function createGmailDraft(
  userId: string,
  to: string | string[],
  subject: string,
  body: string
): Promise<{ draftId: string; draftUrl: string } | null> {
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

    // Normalize 'to' field to array
    const toArray = Array.isArray(to) ? to : [to];
    const toHeader = toArray.join(', ');

    // Detect if body is HTML or plain text
    // Simple heuristic: if it contains HTML tags, treat as HTML
    const isHTML = /<[a-z][\s\S]*>/i.test(body);

    // Build email message (HTML or plain text format)
    // Use Base64 encoding for body to handle emojis and special characters
    const bodyBase64 = Buffer.from(body, 'utf-8').toString('base64');
    
    const contentType = isHTML ? 'text/html' : 'text/plain';
    
    const emailLines = [
      `To: ${toHeader}`,
      `Subject: ${encodedSubject}`,
      `MIME-Version: 1.0`,
      `Content-Type: ${contentType}; charset=utf-8`,
      `Content-Transfer-Encoding: base64`,
      '',
      bodyBase64
    ];

    const email = emailLines.join('\r\n');
    const encoded = Buffer.from(email)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // Create draft
    const response = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: {
          raw: encoded,
        },
      },
    });

    const draftId = response.data.id;
    if (!draftId) {
      return null;
    }

    // Generate draft URL
    // Format: https://mail.google.com/mail/u/0/#drafts/{draftId}
    const draftUrl = `https://mail.google.com/mail/u/0/#drafts/${draftId}`;

    return {
      draftId,
      draftUrl,
    };

  } catch (error: any) {
    console.error('[Gmail Draft] Failed to create draft:', error);
    throw new Error(`Failed to create draft: ${error.message}`);
  }
}

