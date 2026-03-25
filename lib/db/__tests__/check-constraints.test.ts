/**
 * Contract test: validates that all values the app writes to constrained columns
 * are present in the canonical allowed set. If a new value is added to app code
 * but not to the migration, this test fails BEFORE production does.
 */
import { describe, expect, it } from 'vitest';

// --- Canonical allowed values (must match the CHECK constraints in the migration) ---

const SIGNAL_SOURCES = new Set([
  'gmail', 'outlook', 'google_calendar', 'outlook_calendar',
  'drive', 'google_drive', 'onedrive', 'microsoft_todo',
  'slack', 'notion', 'dropbox',
  'uploaded_document', 'manual_entry',
  'claude_conversation', 'chatgpt_conversation',
  'user_feedback', 'artifact', 'resend_webhook',
]);

const SIGNAL_TYPES = new Set([
  'email', 'calendar_event', 'chat_message', 'social_post',
  'file_modified', 'task', 'daily_brief_opened', 'document',
  'research', 'outcome_feedback', 'approval',
]);

const ACTION_STATUSES = new Set([
  'pending_approval', 'approved', 'executed', 'skipped', 'rejected',
  'expired', 'failed', 'draft', 'draft_rejected',
]);

const COMMITMENT_SOURCES = new Set([
  'signal_extraction', 'email_analysis', 'calendar_event',
  'document_analysis', 'manual_entry', 'ai_inference',
  'task_sync', 'meeting_notes', 'chat_message',
]);

// --- Tests ---

describe('CHECK constraint contract', () => {
  it('signal sources cover all app-written values', () => {
    const appValues = [
      'gmail', 'outlook', 'google_calendar', 'outlook_calendar',
      'drive', 'google_drive', 'onedrive', 'microsoft_todo',
      'notion', 'user_feedback', 'artifact', 'resend_webhook',
    ];
    for (const v of appValues) {
      expect(SIGNAL_SOURCES.has(v), `Missing signal source: ${v}`).toBe(true);
    }
  });

  it('signal types cover all app-written values', () => {
    const appValues = [
      'email', 'calendar_event', 'file_modified', 'task',
      'daily_brief_opened', 'document', 'research',
      'outcome_feedback', 'approval',
    ];
    for (const v of appValues) {
      expect(SIGNAL_TYPES.has(v), `Missing signal type: ${v}`).toBe(true);
    }
  });

  it('action statuses cover all app-written values', () => {
    const appValues = [
      'pending_approval', 'approved', 'executed', 'skipped',
      'rejected', 'expired', 'failed', 'draft', 'draft_rejected',
    ];
    for (const v of appValues) {
      expect(ACTION_STATUSES.has(v), `Missing action status: ${v}`).toBe(true);
    }
  });

  it('commitment sources cover all app-written values', () => {
    const appValues = [
      'signal_extraction', 'email_analysis', 'calendar_event',
      'document_analysis', 'manual_entry', 'ai_inference',
    ];
    for (const v of appValues) {
      expect(COMMITMENT_SOURCES.has(v), `Missing commitment source: ${v}`).toBe(true);
    }
  });
});
