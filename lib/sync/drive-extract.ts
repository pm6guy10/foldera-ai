/**
 * Shared Google Drive text extraction (issue #486).
 *
 * Extracted verbatim from google-sync.ts so both the Workday Presence sync
 * (recent-file snippets, capped short) and the Scout full-Drive index (full
 * text for chunking) use ONE extractor. Behavior is identical to the original
 * private helper; the only addition is a configurable character cap so the
 * butler path keeps its 1500-char snippet while the Scout path pulls full text.
 *
 * Supported: Google Docs/Sheets (export to text/csv), .docx (mammoth), .txt/.md
 * (raw). PDFs and other binaries return null (metadata only) — same as before.
 */

import type { drive_v3 } from 'googleapis';
import mammoth from 'mammoth';

export const GOOGLE_NATIVE_MIME_MAP: Record<string, string> = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
};

export const DRIVE_TEXT_EXTENSIONS = new Set(['.txt', '.md']);

/** Snippet cap used by the Workday Presence sync (unchanged behavior). */
export const DEFAULT_DRIVE_SNIPPET_CHARS = 1500;

/** Skip .docx larger than this to avoid mammoth latency (unchanged). */
export const DEFAULT_DOCX_MAX_PARSE_BYTES = 500 * 1024;

/** The mime filter shared by syncDrive and the Scout full-Drive crawl. */
export const DRIVE_MIME_QUERIES = [
  "mimeType = 'application/vnd.google-apps.document'",
  "mimeType = 'application/vnd.google-apps.spreadsheet'",
  "mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'",
  "mimeType = 'text/plain'",
  "mimeType = 'text/markdown'",
  "mimeType = 'application/pdf'",
] as const;

export function getDriveFileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

export interface DownloadDriveTextOptions {
  /** Max characters to return. Defaults to DEFAULT_DRIVE_SNIPPET_CHARS (sync). */
  maxChars?: number;
  /** File size in bytes, used to skip oversized .docx. */
  fileSize?: number;
  /** Override the .docx byte ceiling. */
  maxDocxBytes?: number;
}

/**
 * Download text content for a Google Drive file. Returns null when the file
 * type is unsupported or the download fails (caller falls back to metadata).
 */
export async function downloadDriveFileText(
  drive: drive_v3.Drive,
  fileId: string,
  mimeType: string,
  fileName: string,
  options?: DownloadDriveTextOptions,
): Promise<string | null> {
  const maxChars = options?.maxChars ?? DEFAULT_DRIVE_SNIPPET_CHARS;
  const maxDocxBytes = options?.maxDocxBytes ?? DEFAULT_DOCX_MAX_PARSE_BYTES;

  try {
    // Google native format — export as text
    const exportMime = GOOGLE_NATIVE_MIME_MAP[mimeType];
    if (exportMime) {
      const res = await drive.files.export(
        { fileId, mimeType: exportMime },
        { responseType: 'text' },
      );
      const text = typeof res.data === 'string' ? res.data : String(res.data ?? '');
      return text.slice(0, maxChars);
    }

    const ext = getDriveFileExtension(fileName);

    // Word documents — download binary and extract text with mammoth
    if (ext === '.docx') {
      if (options?.fileSize && options.fileSize > maxDocxBytes) return null;
      const res = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'arraybuffer' },
      );
      const buffer = Buffer.from(res.data as ArrayBuffer);
      const result = await mammoth.extractRawText({ buffer });
      return result.value.trim().slice(0, maxChars);
    }

    // Plain text files stored in Drive — download directly
    if (DRIVE_TEXT_EXTENSIONS.has(ext)) {
      const res = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'text' },
      );
      const text = typeof res.data === 'string' ? res.data : String(res.data ?? '');
      return text.slice(0, maxChars);
    }
  } catch {
    // Content download failed — fall through to metadata-only.
  }

  return null;
}
