/**
 * Unit tests for buildEntityConversationState.
 *
 * The function derives SENT_AWAITING_REPLY from signal evidence (already decrypted,
 * pre-fetched per candidate) and supplements with approved tkg_actions.
 *
 * DB calls (tkg_actions query) are mocked via vi.mock so the core logic can be
 * tested without a live database connection.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SignalSnippet } from '../generator';
import { buildEntityConversationState } from '../generator';

// ---------------------------------------------------------------------------
// Mock the supabase client used inside buildEntityConversationState
// ---------------------------------------------------------------------------

const mockLimit = vi.fn<() => Promise<{ data: unknown[]; error: null }>>();

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => ({
    from: () => ({
      select: () => ({
        eq: function () { return this; },
        in: function () { return this; },
        gte: function () { return this; },
        order: function () { return this; },
        limit: mockLimit,
      }),
    }),
  }),
}));

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

const NOW = new Date('2026-04-03T12:00:00Z');

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 24 * 3600 * 1000).toISOString();
}

function makeSnippet(overrides: Partial<SignalSnippet>): SignalSnippet {
  return {
    date: daysAgo(5),
    source: 'email',
    snippet: 'test snippet',
    direction: 'sent',
    author: null,
    subject: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildEntityConversationState', () => {
  beforeEach(() => {
    // Default: no approved tkg_actions (no sync-lag records)
    mockLimit.mockResolvedValue({ data: [], error: null });
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null when no sent signals exist for the entity', async () => {
    const evidence: SignalSnippet[] = [
      makeSnippet({ direction: 'received', author: 'yadira@example.com', subject: 'Hey' }),
    ];
    const result = await buildEntityConversationState('user-1', 'Yadira Clapper', evidence);
    expect(result).toBeNull();
  });

  it('returns null when no signal evidence matches the entity name', async () => {
    // Signal involves "John Smith", not "Yadira Clapper"
    const evidence: SignalSnippet[] = [
      makeSnippet({ direction: 'sent', subject: 'Hi John', snippet: 'john smith project', author: 'john@example.com' }),
    ];
    const result = await buildEntityConversationState('user-1', 'Yadira Clapper', evidence);
    expect(result).toBeNull();
  });

  it('sets SENT_AWAITING_REPLY: true when last sent has no reply', async () => {
    const evidence: SignalSnippet[] = [
      makeSnippet({
        direction: 'sent',
        date: daysAgo(3),
        subject: 'Checking in on the proposal',
        snippet: 'yadira clapper proposal update',
        author: null,
      }),
    ];
    const result = await buildEntityConversationState('user-1', 'Yadira Clapper', evidence);
    expect(result).not.toBeNull();
    expect(result).toContain('SENT_AWAITING_REPLY: true');
    expect(result).toContain('CONVERSATION_STATE with Yadira Clapper');
    expect(result).toContain('Checking in on the proposal');
    expect(result).toContain('No reply in signals');
  });

  it('sets SENT_AWAITING_REPLY: false when a reply arrives after the last sent', async () => {
    const evidence: SignalSnippet[] = [
      makeSnippet({
        direction: 'sent',
        date: daysAgo(5),
        subject: 'Proposal update',
        snippet: 'yadira clapper',
        author: null,
      }),
      makeSnippet({
        direction: 'received',
        date: daysAgo(2),
        subject: 'Re: Proposal update',
        snippet: 'yadira reply',
        author: 'yadira@example.com',
      }),
    ];
    const result = await buildEntityConversationState('user-1', 'Yadira Clapper', evidence);
    expect(result).not.toBeNull();
    expect(result).toContain('SENT_AWAITING_REPLY: false');
    expect(result).toContain('Re: Proposal update');
  });

  it('uses first-name token matching — single token from full name', async () => {
    // Entity "Yadira Clapper" — "yadira" (6 chars ≥ 3) and "clapper" (7 chars ≥ 3) both qualify
    const evidence: SignalSnippet[] = [
      makeSnippet({
        direction: 'sent',
        date: daysAgo(4),
        subject: 'Contract question',
        // Only contains "clapper" not the full name
        snippet: 'Hi Clapper, following up on the contract',
        author: null,
      }),
    ];
    const result = await buildEntityConversationState('user-1', 'Yadira Clapper', evidence);
    expect(result).not.toBeNull();
    expect(result).toContain('SENT_AWAITING_REPLY: true');
  });

  it('supplements with approved tkg_actions when signal evidence has no sent email', async () => {
    // No sent signals in evidence
    const evidence: SignalSnippet[] = [];
    // But tkg_actions has an approved send_message mentioning Yadira
    mockLimit.mockResolvedValue({
      data: [
        {
          directive_text: 'Following up with Yadira Clapper about the contract',
          generated_at: daysAgo(2),
        },
      ],
      error: null,
    });

    const result = await buildEntityConversationState('user-1', 'Yadira Clapper', evidence);
    expect(result).not.toBeNull();
    expect(result).toContain('SENT_AWAITING_REPLY: true');
    // The directive_text first line is used as the subject in the conversation state
    expect(result).toContain('Following up with Yadira Clapper about the contract');
  });

  it('returns null when entity name is too short to produce tokens', async () => {
    // All tokens < 3 chars get filtered out
    const result = await buildEntityConversationState('user-1', 'Al', []);
    expect(result).toBeNull();
  });

  it('ignores sent signals older than 30 days', async () => {
    const evidence: SignalSnippet[] = [
      makeSnippet({
        direction: 'sent',
        date: daysAgo(35), // older than 30-day window
        subject: 'Old email to Yadira',
        snippet: 'yadira clapper old email',
      }),
    ];
    const result = await buildEntityConversationState('user-1', 'Yadira Clapper', evidence);
    expect(result).toBeNull();
  });

  it('reports days since last sent correctly', async () => {
    const evidence: SignalSnippet[] = [
      makeSnippet({
        direction: 'sent',
        date: daysAgo(7),
        subject: 'Meeting request',
        snippet: 'yadira clapper meeting',
      }),
    ];
    const result = await buildEntityConversationState('user-1', 'Yadira Clapper', evidence);
    expect(result).not.toBeNull();
    expect(result).toContain('Days since last sent: 7');
  });
});
