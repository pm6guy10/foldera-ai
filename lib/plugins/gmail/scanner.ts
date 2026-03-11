/**
 * lib/plugins/gmail/scanner — Gmail payload body extractor.
 *
 * Walks a Gmail message payload tree and returns the plain-text and HTML
 * bodies as decoded strings.
 */

import { gmail_v1 } from 'googleapis';

export interface ExtractedBody {
  text: string;
  html: string;
}

/**
 * Recursively extracts text/plain and text/html from a Gmail message payload.
 */
export function extractBody(payload: gmail_v1.Schema$MessagePart): ExtractedBody {
  const result: ExtractedBody = { text: '', html: '' };

  function walk(part: gmail_v1.Schema$MessagePart): void {
    const mimeType = part.mimeType || '';

    if (mimeType === 'text/plain' && part.body?.data) {
      result.text += Buffer.from(part.body.data, 'base64url').toString('utf-8');
      return;
    }

    if (mimeType === 'text/html' && part.body?.data) {
      result.html += Buffer.from(part.body.data, 'base64url').toString('utf-8');
      return;
    }

    if (part.parts) {
      for (const child of part.parts) {
        walk(child);
      }
    }
  }

  walk(payload);
  return result;
}
