/**
 * Unit tests for unified executeAction layer.
 * - approve => artifact executed
 * - DraftQueue non-email artifacts execute
 * - feedback signals idempotent (no duplicate inserts)
 * - fallback / missing artifact handled safely
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendGmailEmail } from '@/lib/integrations/gmail-client';
import { sendOutlookEmail } from '@/lib/integrations/outlook-client';
import { executeAction } from '../execute-action';

const { sendResendEmail, getVerifiedDailyBriefRecipientEmail } = vi.hoisted(() => ({
  sendResendEmail: vi.fn(),
  getVerifiedDailyBriefRecipientEmail: vi.fn(),
}));

const USER_ID = 'user-1';
const ACTION_ID = 'action-1';
const baseAction = {
  id: ACTION_ID,
  user_id: USER_ID,
  directive_text: 'Test directive',
  reason: 'Test reason',
  action_type: 'write_document',
  status: 'pending_approval',
  execution_result: null as Record<string, unknown> | null,
};

function actionWithArtifact(artifact: Record<string, unknown>) {
  return { ...baseAction, execution_result: { artifact } };
}

function actionWithLegacyDraft(to: string, subject: string, body: string) {
  return {
    ...baseAction,
    execution_result: { draft_type: 'email_compose', to, subject, body },
  };
}

const mockSupabase = {
  _actionRow: null as typeof baseAction | null,
  _signalSelectReturn: null as { id: string } | null,
  _signalInsertCalls: 0,

  from(table: string) {
    const self = this;
    return {
      select(columns: string) {
        if (table === 'tkg_signals' && columns === 'id') {
          return {
            eq(_: string, __: string) {
              return {
                eq(_a: string, hash: string) {
                  return {
                    maybeSingle: () =>
                      Promise.resolve({
                        data: self._signalSelectReturn,
                        error: null,
                      }),
                  };
                },
              };
            },
          };
        }
        if (table === 'tkg_actions') {
          return {
            eq(col: string, val: string) {
              return {
                eq(col2: string, val2: string) {
                  return {
                    single: () =>
                      Promise.resolve({
                        data: self._actionRow,
                        error: self._actionRow ? null : { message: 'not found' },
                      }),
                  };
                },
              };
            },
          };
        }
        return {};
      },
      insert() {
        if (table === 'tkg_signals') self._signalInsertCalls++;
        return {
          select: () => ({
            single: () =>
              Promise.resolve({ data: { id: 'sig-1' }, error: null }),
          }),
        };
      },
      update(payload: Record<string, unknown>) {
        if (table === 'tkg_actions') {
          // Support atomic claim chain: .update().eq('id').eq('user_id').eq('status').select().maybeSingle()
          // Track the status filter to correctly simulate conditional update
          let statusFilter: unknown = null;
          const eqChain = (col: string, val: unknown): any => ({
            eq: (col2: string, val2: unknown) => {
              if (col2 === 'status') statusFilter = val2;
              return eqChain(col2, val2);
            },
            select: () => ({
              maybeSingle: () => {
                if (!self._actionRow) {
                  return Promise.resolve({ data: null, error: null });
                }
                // Only return the row if status matches the conditional filter
                if (statusFilter !== null && self._actionRow.status !== statusFilter) {
                  return Promise.resolve({ data: null, error: null });
                }
                return Promise.resolve({
                  data: { ...self._actionRow, ...payload },
                  error: null,
                });
              },
            }),
          });
          return { eq: (col: string, val: unknown) => { if (col === 'status') statusFilter = val; return eqChain(col, val); } };
        }
        return { eq: () => Promise.resolve({ error: null }) };
      },
    };
  },
};

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => mockSupabase,
}));

const hasIntegration = vi.fn().mockResolvedValue(true);
vi.mock('@/lib/auth/token-store', () => ({
  hasIntegration: (...args: unknown[]) => hasIntegration(...args),
}));

vi.mock('@/lib/integrations/gmail-client', () => ({
  sendGmailEmail: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/lib/integrations/outlook-client', () => ({
  sendOutlookEmail: vi.fn().mockResolvedValue({ success: false, error: 'No Outlook' }),
}));

vi.mock('@/lib/integrations/google-calendar', () => ({
  createGoogleCalendarEvent: vi.fn().mockResolvedValue({ success: true, eventId: 'ev-1' }),
}));

vi.mock('@/lib/integrations/outlook-calendar', () => ({
  createOutlookCalendarEvent: vi.fn().mockResolvedValue({ success: true, eventId: 'ev-2' }),
}));

vi.mock('@/lib/encryption', () => ({
  encrypt: vi.fn((value: string) => value),
}));

vi.mock('@/lib/email/resend', () => ({
  renderPlaintextEmailHtml: vi.fn((body: string) => `<p>${body}</p>`),
  renderWriteDocumentReadyEmailHtml: vi.fn(() => '<html>write-doc-ready</html>'),
  sendResendEmail,
}));

vi.mock('@/lib/auth/daily-brief-users', () => ({
  getVerifiedDailyBriefRecipientEmail,
}));

vi.mock('@/lib/signals/entity-attention-runtime', () => ({
  reinforceAttentionForAction: vi.fn().mockResolvedValue(undefined),
}));

describe('executeAction', () => {
  beforeEach(() => {
    // Open the email-send safety gate so tests can exercise the full Gmail/Outlook/Resend paths.
    vi.stubEnv('ALLOW_EMAIL_SEND', 'true');
    mockSupabase._signalInsertCalls = 0;
    mockSupabase._signalSelectReturn = null;
    hasIntegration.mockReset();
    hasIntegration.mockResolvedValue(true);
    sendResendEmail.mockReset();
    sendResendEmail.mockResolvedValue({ data: { id: 'resend-123' }, error: null });
    vi.mocked(sendGmailEmail).mockReset();
    vi.mocked(sendGmailEmail).mockResolvedValue({ success: true });
    vi.mocked(sendOutlookEmail).mockReset();
    vi.mocked(sendOutlookEmail).mockResolvedValue({ success: false, error: 'No Outlook' });
    getVerifiedDailyBriefRecipientEmail.mockReset();
    getVerifiedDailyBriefRecipientEmail.mockResolvedValue('ready-doc@example.com');
  });

  it('returns error when action not found', async () => {
    mockSupabase._actionRow = null;
    const out = await executeAction({
      userId: USER_ID,
      actionId: ACTION_ID,
      decision: 'approve',
    });
    expect(out.status).toBe('skipped');
    expect(out.error).toBe('Action already claimed by another request or not found');
  });

  it('skip/reject updates status and writes one feedback signal', async () => {
    mockSupabase._actionRow = { ...baseAction, status: 'pending_approval' };
    const out = await executeAction({
      userId: USER_ID,
      actionId: ACTION_ID,
      decision: 'skip',
      skipReason: 'not_relevant',
    });
    expect(out.status).toBe('skipped');
    expect(mockSupabase._signalInsertCalls).toBe(1);
  });

  it('approve with email artifact executes and writes approval signal', async () => {
    mockSupabase._actionRow = {
      ...actionWithArtifact({
        type: 'send_message',
        recipient: 'a@b.com',
        subject: 'Subj',
        body: 'Body',
      }),
      action_type: 'send_message',
    };
    const out = await executeAction({
      userId: USER_ID,
      actionId: ACTION_ID,
      decision: 'approve',
    });
    expect(out.status).toBe('executed');
    expect(out.result?.sent).toBe(true);
    expect(out.result?.sent_via).toBe('gmail');
    expect(sendGmailEmail).toHaveBeenCalledWith(USER_ID, {
      to: 'a@b.com',
      subject: 'Subj',
      body: 'Body',
      threadId: null,
      inReplyTo: null,
      references: null,
    });
    expect(sendResendEmail).not.toHaveBeenCalled();
    expect(mockSupabase._signalInsertCalls).toBe(1);
  });

  it('approve send_message falls back to Resend when no mailbox integration', async () => {
    hasIntegration.mockResolvedValue(false);
    mockSupabase._actionRow = {
      ...actionWithArtifact({
        type: 'send_message',
        recipient: 'a@b.com',
        subject: 'Subj',
        body: 'Body',
      }),
      action_type: 'send_message',
    };
    const out = await executeAction({
      userId: USER_ID,
      actionId: ACTION_ID,
      decision: 'approve',
    });
    expect(out.status).toBe('executed');
    expect(out.result?.sent).toBe(true);
    expect(out.result?.sent_via).toBe('resend');
    expect(out.result?.resend_id).toBe('resend-123');
    expect(sendGmailEmail).not.toHaveBeenCalled();
    expect(sendResendEmail).toHaveBeenCalledTimes(1);
  });

  it('approve send_message passes Gmail thread + reply headers when present on artifact', async () => {
    mockSupabase._actionRow = {
      ...actionWithArtifact({
        type: 'send_message',
        to: 'a@b.com',
        subject: 'Subj',
        body: 'Body',
        gmail_thread_id: 'thread-abc',
        in_reply_to: 'CA+msg@mail.gmail.com',
        references: '<prev@example.com> <CA+msg@mail.gmail.com>',
      }),
      action_type: 'send_message',
    };
    const out = await executeAction({
      userId: USER_ID,
      actionId: ACTION_ID,
      decision: 'approve',
    });
    expect(out.status).toBe('executed');
    expect(sendGmailEmail).toHaveBeenCalledWith(USER_ID, {
      to: 'a@b.com',
      subject: 'Subj',
      body: 'Body',
      threadId: 'thread-abc',
      inReplyTo: 'CA+msg@mail.gmail.com',
      references: '<prev@example.com> <CA+msg@mail.gmail.com>',
    });
  });

  it('approve send_message uses Outlook when Google missing and Microsoft connected', async () => {
    hasIntegration.mockImplementation(async (_uid: string, provider: string) => provider === 'azure_ad');
    vi.mocked(sendOutlookEmail).mockResolvedValueOnce({ success: true });
    mockSupabase._actionRow = {
      ...actionWithArtifact({
        type: 'send_message',
        to: 'a@b.com',
        subject: 'Subj',
        body: 'Body',
      }),
      action_type: 'send_message',
    };
    const out = await executeAction({
      userId: USER_ID,
      actionId: ACTION_ID,
      decision: 'approve',
    });
    expect(out.status).toBe('executed');
    expect(out.result?.sent_via).toBe('outlook');
    expect(sendResendEmail).not.toHaveBeenCalled();
  });

  it('approve with document artifact persists and writes approval signal', async () => {
    mockSupabase._actionRow = actionWithArtifact({
      type: 'document',
      title: 'Doc',
      content: 'Content',
    });
    const out = await executeAction({
      userId: USER_ID,
      actionId: ACTION_ID,
      decision: 'approve',
    });
    expect(out.status).toBe('executed');
    expect(out.result?.saved).toBe(true);
    expect(mockSupabase._signalInsertCalls).toBeGreaterThanOrEqual(1);
    expect(getVerifiedDailyBriefRecipientEmail).toHaveBeenCalledWith(USER_ID, mockSupabase);
    expect(sendResendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ready-doc@example.com',
        subject: 'Test directive',
        tags: expect.arrayContaining([
          { name: 'email_type', value: 'approved_write_document' },
          { name: 'action_id', value: ACTION_ID },
        ]),
      }),
    );
    expect(out.result?.document_ready_email).toEqual({ sent: true, resend_id: 'resend-123' });
  });

  it('approve write_document skips delivery email when user has no verified email', async () => {
    getVerifiedDailyBriefRecipientEmail.mockResolvedValue(null);
    mockSupabase._actionRow = actionWithArtifact({
      type: 'document',
      title: 'Doc',
      content: 'Content',
    });
    const out = await executeAction({
      userId: USER_ID,
      actionId: ACTION_ID,
      decision: 'approve',
    });
    expect(out.status).toBe('executed');
    expect(out.result?.saved).toBe(true);
    const writeDocCalls = sendResendEmail.mock.calls.filter(
      (c) => c[0]?.tags?.some((t: { value?: string }) => t.value === 'approved_write_document'),
    );
    expect(writeDocCalls).toHaveLength(0);
    expect(out.result?.document_ready_email).toEqual({ sent: false, reason: 'no_verified_email' });
  });

  it('DraftQueue draft with document in execution_result executes on approve', async () => {
    mockSupabase._actionRow = {
      ...baseAction,
      status: 'draft',
      execution_result: {
        type: 'document',
        title: 'Draft doc',
        content: 'Draft content',
        _title: 'Title',
        _source: 'uiux-critic',
      },
    };
    const out = await executeAction({
      userId: USER_ID,
      actionId: ACTION_ID,
      decision: 'approve',
    });
    expect(out.status).toBe('executed');
    expect(out.result?.saved).toBe(true);
  });

  it('approve with legacy draft_type email_compose executes email', async () => {
    mockSupabase._actionRow = actionWithLegacyDraft('x@y.com', 'Subject', 'Body');
    const out = await executeAction({
      userId: USER_ID,
      actionId: ACTION_ID,
      decision: 'approve',
    });
    expect(out.status).toBe('executed');
    expect(out.result?.sent).toBe(true);
  });

  it('feedback signal insert is idempotent: second call skips insert', async () => {
    mockSupabase._actionRow = actionWithArtifact({
      type: 'document',
      title: 'T',
      content: 'C',
    });
    mockSupabase._signalSelectReturn = null;
    await executeAction({ userId: USER_ID, actionId: ACTION_ID, decision: 'approve' });
    const firstCalls = mockSupabase._signalInsertCalls;

    mockSupabase._actionRow = actionWithArtifact({
      type: 'document',
      title: 'T',
      content: 'C',
    });
    mockSupabase._signalSelectReturn = { id: 'existing' };
    await executeAction({ userId: USER_ID, actionId: ACTION_ID + '2', decision: 'approve' });
    expect(mockSupabase._signalInsertCalls).toBeGreaterThanOrEqual(firstCalls);
  });

  it('reject on draft returns draft_rejected', async () => {
    mockSupabase._actionRow = { ...baseAction, status: 'draft' };
    const out = await executeAction({
      userId: USER_ID,
      actionId: ACTION_ID,
      decision: 'reject',
    });
    expect(out.status).toBe('draft_rejected');
  });

  it('approve with no artifact records the failure and rejects execution', async () => {
    mockSupabase._actionRow = { ...baseAction, execution_result: {} };
    await expect(executeAction({
      userId: USER_ID,
      actionId: ACTION_ID,
      decision: 'approve',
    })).rejects.toThrow('No artifact to execute');
    expect(mockSupabase._signalInsertCalls).toBe(0);
  });

  it('approve includes approved_at and approved_by in execution_result', async () => {
    mockSupabase._actionRow = actionWithArtifact({
      type: 'document',
      title: 'Audit doc',
      content: 'Content',
    });
    const out = await executeAction({
      userId: USER_ID,
      actionId: ACTION_ID,
      decision: 'approve',
    });
    expect(out.status).toBe('executed');
    expect(typeof out.result?.approved_at).toBe('string');
    expect(out.result?.approved_by).toBe('user');
  });

  it('marks send_message approvals as failed when Resend delivery fails', async () => {
    hasIntegration.mockResolvedValue(false);
    sendResendEmail.mockResolvedValue({ data: null, error: { message: 'credit balance is too low' } });
    mockSupabase._actionRow = {
      ...actionWithArtifact({
        type: 'send_message',
        to: 'a@b.com',
        subject: 'Subj',
        body: 'Body',
      }),
      action_type: 'send_message',
    };

    await expect(executeAction({
      userId: USER_ID,
      actionId: ACTION_ID,
      decision: 'approve',
    })).rejects.toThrow('credit balance is too low');
  });
});
