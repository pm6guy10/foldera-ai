import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockMessagesCreate = vi.fn();
const mockTrackApiCall = vi.fn();
const mockIsOverDailyLimit = vi.fn();
const mockLogStructuredEvent = vi.fn();
const mockRecoverMicrosoftSignalContent = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      create: mockMessagesCreate,
    };
  },
}));

vi.mock('@/lib/encryption', () => ({
  decryptWithStatus: vi.fn((content: string) => ({
    plaintext: content,
    usedFallback: false,
  })),
  encrypt: vi.fn((content: string) => content),
}));

vi.mock('@/lib/utils/api-tracker', () => ({
  trackApiCall: mockTrackApiCall,
  isOverDailyLimit: mockIsOverDailyLimit,
}));

vi.mock('@/lib/utils/structured-logger', () => ({
  logStructuredEvent: mockLogStructuredEvent,
}));

vi.mock('@/lib/sync/microsoft-sync', () => ({
  recoverMicrosoftSignalContent: mockRecoverMicrosoftSignalContent,
}));

type EntityRow = {
  id: string;
  user_id: string;
  name: string;
  display_name?: string | null;
  emails?: string[] | null;
  primary_email?: string | null;
  total_interactions?: number | null;
  last_interaction?: string | null;
  role?: string | null;
  company?: string | null;
  patterns?: Record<string, unknown> | null;
};

type SignalRow = {
  id: string;
  user_id: string;
  source: string;
  source_id: string | null;
  type: string;
  content: string;
  author: string | null;
  occurred_at: string | null;
  processed: boolean;
  extracted_entities?: string[] | null;
  extracted_commitments?: string[] | null;
  extracted_dates?: Array<Record<string, unknown>> | null;
};

function createSupabaseMock({
  entities,
  signals,
}: {
  entities: EntityRow[];
  signals: SignalRow[];
}) {
  return {
    entities,
    signals,
    from(table: string) {
      if (table === 'tkg_entities') {
        return {
          select(columns: string) {
            const state: {
              filters: Record<string, unknown>;
              ilikeName: string | null;
              containsEmails: string[] | null;
            } = {
              filters: {},
              ilikeName: null,
              containsEmails: null,
            };

            const query = {
              eq(field: string, value: unknown) {
                state.filters[field] = value;
                return query;
              },
              ilike(field: string, value: string) {
                if (field === 'name') {
                  state.ilikeName = value;
                } else {
                  state.filters[field] = value;
                }
                return query;
              },
              contains(field: string, value: string[]) {
                if (field === 'emails') {
                  state.containsEmails = value;
                } else {
                  state.filters[field] = value;
                }
                return Promise.resolve({
                  data: entities.filter((row) =>
                    Object.entries(state.filters).every(([filterField, filterValue]) => row[filterField as keyof EntityRow] === filterValue) &&
                    (state.containsEmails ? state.containsEmails.every((email) => (row.emails ?? []).includes(email)) : true),
                  ),
                  error: null,
                });
              },
              maybeSingle: async () => {
                let rows = entities.filter((row) =>
                  Object.entries(state.filters).every(([field, value]) => row[field as keyof EntityRow] === value),
                );

                if (state.containsEmails) {
                  rows = rows.filter((row) => state.containsEmails?.every((email) => (row.emails ?? []).includes(email)));
                }

                if (state.ilikeName !== null) {
                  rows = rows.filter((row) => row.name.toLowerCase() === state.ilikeName?.toLowerCase());
                }

                const row = rows[0] ?? null;
                if (!row) {
                  return { data: null, error: null };
                }

                if (columns === 'id, patterns') {
                  return {
                    data: {
                      id: row.id,
                      patterns: row.patterns ?? {},
                    },
                    error: null,
                  };
                }

                return { data: row, error: null };
              },
              single: async () => {
                const row = entities.find((entity) =>
                  Object.entries(state.filters).every(([field, value]) => entity[field as keyof EntityRow] === value),
                );
                if (!row) {
                  return { data: null, error: new Error('row not found') };
                }
                return { data: row, error: null };
              },
            };

            return query;
          },
          insert(payload: Partial<EntityRow>) {
            return {
              select(selectColumns: string) {
                return {
                  single: async () => {
                    const row: EntityRow = {
                      id: `entity-${entities.length + 1}`,
                      user_id: String(payload.user_id),
                      name: String(payload.name),
                      display_name: payload.display_name ?? null,
                      emails: payload.emails ?? [],
                      primary_email: payload.primary_email ?? null,
                      total_interactions: payload.total_interactions ?? 0,
                      last_interaction: payload.last_interaction ?? null,
                      role: payload.role ?? null,
                      company: payload.company ?? null,
                      patterns: payload.patterns ?? {},
                    };
                    entities.push(row);

                    if (selectColumns === 'id') {
                      return { data: { id: row.id }, error: null };
                    }

                    return {
                      data: {
                        id: row.id,
                        patterns: row.patterns ?? {},
                      },
                      error: null,
                    };
                  },
                };
              },
            };
          },
          update(payload: Partial<EntityRow>) {
            return {
              eq: async (field: string, value: unknown) => {
                const row = entities.find((entity) => entity[field as keyof EntityRow] === value);
                if (!row) {
                  return { error: new Error('row not found') };
                }
                Object.assign(row, payload);
                return { error: null };
              },
            };
          },
        };
      }

      if (table === 'tkg_signals') {
        return {
          select() {
            const state: {
              filters: Record<string, unknown>;
              sources: string[] | null;
            } = {
              filters: {},
              sources: null,
            };

            const query = {
              eq(field: string, value: unknown) {
                state.filters[field] = value;
                return query;
              },
              in(field: string, values: string[]) {
                if (field === 'source') {
                  state.sources = values;
                } else {
                  state.filters[field] = values;
                }
                return query;
              },
              order() {
                return query;
              },
              gte() {
                return query;
              },
              limit: async (count: number) => {
                let rows = signals.filter((row) =>
                  Object.entries(state.filters).every(([field, value]) => row[field as keyof SignalRow] === value),
                );

                if (state.sources) {
                  rows = rows.filter((row) => state.sources?.includes(row.source));
                }

                return {
                  data: rows.slice(0, count),
                  error: null,
                };
              },
            };

            return query;
          },
          update(payload: Partial<SignalRow>) {
            return {
              eq: async (field: string, value: unknown) => {
                const row = signals.find((signal) => signal[field as keyof SignalRow] === value);
                if (!row) {
                  return { error: new Error('row not found') };
                }
                Object.assign(row, payload);
                return { error: null };
              },
            };
          },
        };
      }

      if (table === 'tkg_commitments') {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      maybeSingle: async () => ({ data: null, error: null }),
                    };
                  },
                };
              },
            };
          },
          insert() {
            return {
              select() {
                return {
                  single: async () => ({ data: { id: 'commitment-1' }, error: null }),
                };
              },
            };
          },
          update() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      not: async () => ({ error: null }),
                    };
                  },
                };
              },
            };
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };
}

describe('processUnextractedSignals entity freshness', () => {
  const USER_ID = '22222222-2222-2222-2222-222222222222';

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockIsOverDailyLimit.mockResolvedValue(false);
    mockTrackApiCall.mockResolvedValue(undefined);
    mockRecoverMicrosoftSignalContent.mockResolvedValue(null);
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  it('updates an existing entity last_interaction to the signal occurred_at when it is newer', async () => {
    const occurredAt = '2026-03-18T16:30:00.000Z';
    const entities: EntityRow[] = [
      {
        id: 'self-1',
        user_id: USER_ID,
        name: 'self',
        display_name: 'You',
        patterns: {},
      },
      {
        id: 'entity-yadira',
        user_id: USER_ID,
        name: 'yadira clapper',
        display_name: 'Yadira Clapper',
        emails: ['yadira@example.com'],
        primary_email: 'yadira@example.com',
        total_interactions: 4,
        last_interaction: '2026-03-09T09:00:00.000Z',
        patterns: {},
      },
    ];
    const signals: SignalRow[] = [
      {
        id: 'signal-1',
        user_id: USER_ID,
        source: 'gmail',
        source_id: 'gmail-1',
        type: 'email_sent',
        content: '[Sent email: Tue, 18 Mar 2026 09:30:00 -0700]\nTo: Yadira Clapper <yadira@example.com>\nSubject: Quick follow-up\nPreview: Following up on our March discussion.',
        author: 'self',
        occurred_at: occurredAt,
        processed: false,
      },
    ];
    const supabase = createSupabaseMock({ entities, signals });

    vi.doMock('@/lib/db/client', () => ({
      createServerClient: () => supabase,
    }));

    mockMessagesCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              signal_id: 'signal-1',
              persons: [
                {
                  name: 'Yadira Clapper',
                  email: 'yadira@example.com',
                  role: null,
                  company: null,
                },
              ],
              commitments: [],
              topics: [],
            },
          ]),
        },
      ],
      usage: {
        input_tokens: 10,
        output_tokens: 20,
      },
    });

    const { processUnextractedSignals } = await import('@/lib/signals/signal-processor');
    const result = await processUnextractedSignals(USER_ID, { maxSignals: 1 });

    expect(result.signals_processed).toBe(1);
    expect(entities[1].last_interaction).toBe(occurredAt);
    expect(entities[1].total_interactions).toBe(5);
    expect(signals[0].processed).toBe(true);
    expect(signals[0].extracted_entities).toEqual(['entity-yadira']);
  });

  it('does not move last_interaction backward when an older signal matches an existing entity', async () => {
    const entities: EntityRow[] = [
      {
        id: 'self-1',
        user_id: USER_ID,
        name: 'self',
        display_name: 'You',
        patterns: {},
      },
      {
        id: 'entity-yadira',
        user_id: USER_ID,
        name: 'yadira clapper',
        display_name: 'Yadira Clapper',
        emails: ['yadira@example.com'],
        primary_email: 'yadira@example.com',
        total_interactions: 7,
        last_interaction: '2026-03-22T12:00:00.000Z',
        patterns: {},
      },
    ];
    const signals: SignalRow[] = [
      {
        id: 'signal-older',
        user_id: USER_ID,
        source: 'outlook',
        source_id: 'outlook-1',
        type: 'email_received',
        content: '[Email received: Tue, 18 Mar 2026 08:00:00 -0700]\nFrom: Yadira Clapper <yadira@example.com>\nSubject: Re: follow-up\nBody: Thanks for the note.',
        author: 'Yadira Clapper <yadira@example.com>',
        occurred_at: '2026-03-18T15:00:00.000Z',
        processed: false,
      },
    ];
    const supabase = createSupabaseMock({ entities, signals });

    vi.doMock('@/lib/db/client', () => ({
      createServerClient: () => supabase,
    }));

    mockMessagesCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              signal_id: 'signal-older',
              persons: [
                {
                  name: 'Yadira Clapper',
                  email: 'yadira@example.com',
                  role: null,
                  company: null,
                },
              ],
              commitments: [],
              topics: [],
            },
          ]),
        },
      ],
      usage: {
        input_tokens: 10,
        output_tokens: 20,
      },
    });

    const { processUnextractedSignals } = await import('@/lib/signals/signal-processor');
    await processUnextractedSignals(USER_ID, { maxSignals: 1 });

    expect(entities[1].last_interaction).toBe('2026-03-22T12:00:00.000Z');
    expect(entities[1].total_interactions).toBe(8);
  });

  it('refreshes duplicate same-email aliases so stale relationship rows do not stay old', async () => {
    const occurredAt = '2026-03-18T14:46:09.000Z';
    const entities: EntityRow[] = [
      {
        id: 'self-1',
        user_id: USER_ID,
        name: 'self',
        display_name: 'You',
        patterns: {},
      },
      {
        id: 'entity-stale-alias',
        user_id: USER_ID,
        name: 'clapper, yadira (hca)',
        display_name: 'Clapper, Yadira (HCA)',
        emails: ['yadira@example.com'],
        primary_email: null,
        total_interactions: 2,
        last_interaction: '2026-03-09T21:31:41.732Z',
        patterns: {},
      },
      {
        id: 'entity-canonical',
        user_id: USER_ID,
        name: 'yadira clapper',
        display_name: 'Yadira Clapper',
        emails: ['yadira@example.com'],
        primary_email: 'yadira@example.com',
        total_interactions: 30,
        last_interaction: '2026-03-17T12:00:00.000Z',
        patterns: {},
      },
    ];
    const signals: SignalRow[] = [
      {
        id: 'signal-duplicate-email',
        user_id: USER_ID,
        source: 'outlook',
        source_id: 'outlook-duplicate-email',
        type: 'email_sent',
        content: '[Sent email: Tue, 18 Mar 2026 07:46:09 -0700]\nTo: Yadira Clapper <yadira@example.com>\nSubject: Follow-up\nBody: Checking in.',
        author: 'self',
        occurred_at: occurredAt,
        processed: false,
      },
    ];
    const supabase = createSupabaseMock({ entities, signals });

    vi.doMock('@/lib/db/client', () => ({
      createServerClient: () => supabase,
    }));

    mockMessagesCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              signal_id: 'signal-duplicate-email',
              persons: [
                {
                  name: 'Yadira Clapper',
                  email: 'yadira@example.com',
                  role: null,
                  company: null,
                },
              ],
              commitments: [],
              topics: [],
            },
          ]),
        },
      ],
      usage: {
        input_tokens: 10,
        output_tokens: 20,
      },
    });

    const { processUnextractedSignals } = await import('@/lib/signals/signal-processor');
    const result = await processUnextractedSignals(USER_ID, { maxSignals: 1 });

    expect(result.signals_processed).toBe(1);
    expect(entities[1].last_interaction).toBe(occurredAt);
    expect(entities[1].total_interactions).toBe(2);
    expect(entities[2].last_interaction).toBe(occurredAt);
    expect(entities[2].total_interactions).toBe(31);
    expect(signals[0].extracted_entities).toEqual(['entity-canonical']);
  });
});

describe('processUnextractedSignals sensitive data gate', () => {
  const USER_ID = '33333333-3333-3333-3333-333333333333';

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockIsOverDailyLimit.mockResolvedValue(false);
    mockTrackApiCall.mockResolvedValue(undefined);
    mockRecoverMicrosoftSignalContent.mockResolvedValue(null);
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  it('detectSensitiveContent classifies high-risk patterns', async () => {
    const { detectSensitiveContent } = await import('@/lib/signals/signal-processor');
    const content = [
      'SSN: 123-45-6789',
      'Routing number: 021000021',
      'Bank account number: 12345678901',
      'W-2 tax form included',
      'Driver license attached',
    ].join('\n');
    const result = detectSensitiveContent(content);

    expect(result.isSensitive).toBe(true);
    expect(result.types.sort()).toEqual([
      'bank_account',
      'identity_document',
      'routing_number',
      'ssn',
      'tax_document',
    ]);
  });

  it('redacts sensitive signals and blocks downstream extraction', async () => {
    const entities: EntityRow[] = [
      {
        id: 'self-1',
        user_id: USER_ID,
        name: 'self',
        display_name: 'You',
        patterns: {},
      },
    ];
    const signals: SignalRow[] = [
      {
        id: 'signal-sensitive-1',
        user_id: USER_ID,
        source: 'gmail',
        source_id: 'gmail-sensitive-1',
        type: 'email_received',
        content: 'Please process this IRS form. SSN 123-45-6789 and routing number 021000021 are in this message.',
        author: 'Payroll Team <payroll@example.com>',
        occurred_at: '2026-03-29T10:00:00.000Z',
        processed: false,
      },
    ];
    const supabase = createSupabaseMock({ entities, signals });

    vi.doMock('@/lib/db/client', () => ({
      createServerClient: () => supabase,
    }));

    const { processUnextractedSignals, SENSITIVE_REDACTION_TOKEN } = await import('@/lib/signals/signal-processor');
    const result = await processUnextractedSignals(USER_ID, { maxSignals: 1 });

    expect(result.signals_processed).toBe(1);
    expect(result.entities_upserted).toBe(0);
    expect(result.commitments_created).toBe(0);
    expect(mockMessagesCreate).not.toHaveBeenCalled();
    expect(mockTrackApiCall).not.toHaveBeenCalled();
    expect(signals[0].processed).toBe(true);
    expect(signals[0].content).toBe(SENSITIVE_REDACTION_TOKEN);
    expect(signals[0].extracted_entities).toEqual([]);
    expect(signals[0].extracted_commitments).toEqual([]);
    expect(signals[0].extracted_dates).toEqual([{
      sensitive_flag: true,
      sensitive_types: ['ssn', 'routing_number', 'tax_document'],
    }]);
  });

  it('ignores attachment-only sensitive content and keeps non-sensitive extraction path', async () => {
    const entities: EntityRow[] = [
      {
        id: 'self-1',
        user_id: USER_ID,
        name: 'self',
        display_name: 'You',
        patterns: {},
      },
    ];
    const signals: SignalRow[] = [
      {
        id: 'signal-attachment-1',
        user_id: USER_ID,
        source: 'gmail',
        source_id: 'gmail-attachment-1',
        type: 'email_received',
        content: [
          'From: Alex <alex@example.com>',
          'Subject: Meeting follow up',
          '',
          'Can we review the launch plan tomorrow?',
          '[Attachment: tax.pdf]',
          'SSN 123-45-6789',
          'Routing number 021000021',
          '[/Attachment]',
        ].join('\n'),
        author: 'Alex <alex@example.com>',
        occurred_at: '2026-03-29T10:30:00.000Z',
        processed: false,
      },
    ];
    const supabase = createSupabaseMock({ entities, signals });

    vi.doMock('@/lib/db/client', () => ({
      createServerClient: () => supabase,
    }));

    mockMessagesCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              signal_id: 'signal-attachment-1',
              persons: [],
              commitments: [],
              topics: [],
            },
          ]),
        },
      ],
      usage: {
        input_tokens: 10,
        output_tokens: 20,
      },
    });

    const { processUnextractedSignals } = await import('@/lib/signals/signal-processor');
    const result = await processUnextractedSignals(USER_ID, { maxSignals: 1 });

    expect(result.signals_processed).toBe(1);
    expect(mockMessagesCreate).toHaveBeenCalledOnce();
    expect(signals[0].processed).toBe(true);
    expect(signals[0].content).not.toBe('[REDACTED_SENSITIVE]');
    expect(signals[0].extracted_entities).toEqual([]);
    expect(signals[0].extracted_commitments).toEqual([]);
  });
});
