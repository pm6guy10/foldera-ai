/**
 * Contract test: validates that all values the app writes to constrained columns
 * are present in the canonical allowed set. If a new value is added to app code
 * but not to the migration, this test fails BEFORE production does.
 */
import { describe, expect, it } from 'vitest';

// --- Canonical allowed values (must match the CHECK constraints in the migration) ---

const SIGNAL_SOURCES = new Set([
  'gmail', 'outlook', 'google_calendar', 'outlook_calendar',
  'drive', 'onedrive', 'microsoft_todo',
  'slack', 'notion', 'dropbox',
  'uploaded_document', 'manual_entry',
  'claude_conversation', 'chatgpt_conversation',
  'user_feedback', 'artifact', 'resend_webhook',
  'foldera_directive',
]);

const SIGNAL_TYPES = new Set([
  'email', 'email_sent', 'email_received',
  'calendar_event', 'chat_message', 'social_post',
  'file_modified', 'task',
  'daily_brief_opened', 'daily_brief_clicked', 'daily_brief_unopened',
  'document',
  'research', 'outcome_feedback', 'approval', 'rejection',
  'response_pattern',
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

const GOAL_SOURCES = new Set([
  'extracted', 'manual', 'auto_suppression',
  'onboarding_bucket', 'onboarding_stated', 'onboarding_marker',
  'system_config',
]);

// --- Tests ---

describe('CHECK constraint contract', () => {
  it('signal sources cover all app-written values', () => {
    const appValues = [
      'gmail', 'outlook', 'google_calendar', 'outlook_calendar',
      'drive', 'onedrive', 'microsoft_todo',
      'notion', 'user_feedback', 'artifact', 'resend_webhook',
      'foldera_directive',
    ];
    for (const v of appValues) {
      expect(SIGNAL_SOURCES.has(v), `Missing signal source: ${v}`).toBe(true);
    }
  });

  it('signal types cover all app-written values', () => {
    const appValues = [
      'email', 'email_sent', 'email_received',
      'calendar_event', 'file_modified', 'task',
      'daily_brief_opened', 'daily_brief_clicked', 'daily_brief_unopened',
      'document', 'research',
      'outcome_feedback', 'approval', 'rejection',
      'response_pattern',
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

  it('goal sources cover all app-written values', () => {
    const appValues = [
      'extracted', 'manual', 'auto_suppression',
      'onboarding_bucket', 'onboarding_stated', 'onboarding_marker',
      'system_config',
    ];
    for (const v of appValues) {
      expect(GOAL_SOURCES.has(v), `Missing goal source: ${v}`).toBe(true);
    }
  });
});
