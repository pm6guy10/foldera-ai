import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

interface MockResponse {
  content: Array<{ type: string; text?: string }>;
  usage: { input_tokens: number; output_tokens: number };
  stop_reason: string;
}

let responseQueue: MockResponse[] = [];
let createCallCount = 0;
const createRequests: Array<Record<string, unknown>> = [];

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      create: async (request: Record<string, unknown>) => {
        createCallCount++;
        createRequests.push(request);
        const next = responseQueue.shift();
        if (!next) throw new Error('mock: no queued response');
        return next;
      },
    };
  },
}));

vi.mock('@/lib/utils/api-tracker', () => ({
  trackApiCall: async () => {},
}));

// Stage 2 web search + Stage 1 Drive RAG are exercised through their own tests;
// here we stub them so the loop's orchestration/gating is what's under test.
const searchWebForEnrichment = vi.fn();
const retrieveDriveContext = vi.fn();
vi.mock('@/lib/scout/web-search', () => ({
  searchWebForEnrichment: (...args: unknown[]) => searchWebForEnrichment(...args),
}));
vi.mock('@/lib/scout/retrieval', () => ({
  retrieveDriveContext: (...args: unknown[]) => retrieveDriveContext(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER_ID = '44444444-4444-4444-4444-444444444444';
const GOAL = { text: 'Land a senior backend engineering role', category: 'career', priority: 1 };

function writerResponse(payload: Record<string, unknown>): MockResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    usage: { input_tokens: 200, output_tokens: 120 },
    stop_reason: 'end_turn',
  };
}

function enableScout(): void {
  process.env.SCOUT_ENABLED = 'true';
  process.env.ALLOW_PAID_LLM = 'true';
}

function disableScout(): void {
  delete process.env.SCOUT_ENABLED;
  delete process.env.ALLOW_PAID_LLM;
}

const GOOD_ARTIFACT = {
  worth_surfacing: true,
  headline: 'Acme is hiring a Senior Backend Engineer (closes Friday)',
  rationale: 'Direct match to your goal and the posting closes this week.',
  artifact_title: 'Cover letter — Acme Senior Backend Engineer',
  artifact_body: 'Dear Acme team, with eight years building distributed systems...',
  confidence: 82,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runScoutLoop', () => {
  beforeEach(() => {
    responseQueue = [];
    createCallCount = 0;
    createRequests.length = 0;
    searchWebForEnrichment.mockReset();
    retrieveDriveContext.mockReset();
    searchWebForEnrichment.mockResolvedValue(null);
    retrieveDriveContext.mockResolvedValue([]);
    disableScout();
    vi.resetModules();
  });

  afterEach(() => {
    disableScout();
  });

  it('no-ops (returns [], no API call) when the Scout lane is off', async () => {
    searchWebForEnrichment.mockResolvedValue('some web context');
    const { runScoutLoop } = await import('../scout-loop');

    const result = await runScoutLoop(USER_ID, { goal: GOAL });

    expect(result).toEqual([]);
    expect(createCallCount).toBe(0);
    expect(searchWebForEnrichment).not.toHaveBeenCalled();
  });

  it('stays silent (no writer call) when there is neither web nor Drive context', async () => {
    enableScout();
    searchWebForEnrichment.mockResolvedValue(null);
    retrieveDriveContext.mockResolvedValue([]);
    const { runScoutLoop } = await import('../scout-loop');

    const result = await runScoutLoop(USER_ID, { goal: GOAL });

    expect(result).toEqual([]);
    expect(createCallCount).toBe(0); // safe silence: never spends on empty context
  });

  it('produces a finished proposal from web + Drive context on Sonnet 4.6', async () => {
    enableScout();
    searchWebForEnrichment.mockResolvedValue('Acme posted a Senior Backend Engineer role (source: acme.com/careers).');
    retrieveDriveContext.mockResolvedValue([
      { fileId: 'f1', fileName: 'resume.docx', webViewLink: 'http://x/1', modifiedTime: null, content: '8 years distributed systems', similarity: 0.9 },
    ]);
    responseQueue = [writerResponse(GOOD_ARTIFACT)];
    const { runScoutLoop } = await import('../scout-loop');

    const [proposal, ...rest] = await runScoutLoop(USER_ID, { goal: GOAL });

    expect(rest).toHaveLength(0);
    expect(createCallCount).toBe(1);
    expect(createRequests[0]?.model).toBe('claude-sonnet-4-6');
    expect(proposal.headline).toContain('Acme');
    expect(proposal.artifactBody).toContain('Acme team');
    expect(proposal.confidence).toBe(82);
    expect(proposal.webContext).toContain('acme.com');
    expect(proposal.driveSources).toEqual([{ fileName: 'resume.docx', webViewLink: 'http://x/1' }]);
  });

  it('runs the writer when only Drive context exists (web lane off)', async () => {
    enableScout();
    searchWebForEnrichment.mockResolvedValue(null);
    retrieveDriveContext.mockResolvedValue([
      { fileId: 'f1', fileName: 'notes.md', webViewLink: null, modifiedTime: null, content: 'past project notes', similarity: 0.7 },
    ]);
    responseQueue = [writerResponse({ ...GOOD_ARTIFACT, confidence: 70 })];
    const { runScoutLoop } = await import('../scout-loop');

    const result = await runScoutLoop(USER_ID, { goal: GOAL });

    expect(createCallCount).toBe(1);
    expect(result).toHaveLength(1);
    expect(result[0].webContext).toBeNull();
  });

  it('stays silent when the writer judges nothing worth surfacing', async () => {
    enableScout();
    searchWebForEnrichment.mockResolvedValue('some web context');
    responseQueue = [writerResponse({ worth_surfacing: false })];
    const { runScoutLoop } = await import('../scout-loop');

    expect(await runScoutLoop(USER_ID, { goal: GOAL })).toEqual([]);
    expect(createCallCount).toBe(1);
  });

  it('drops a low-confidence artifact below the floor', async () => {
    enableScout();
    searchWebForEnrichment.mockResolvedValue('some web context');
    responseQueue = [writerResponse({ ...GOOD_ARTIFACT, confidence: 40 })];
    const { runScoutLoop } = await import('../scout-loop');

    expect(await runScoutLoop(USER_ID, { goal: GOAL })).toEqual([]);
  });

  it('drops an artifact that leaks internal-systems copy', async () => {
    enableScout();
    searchWebForEnrichment.mockResolvedValue('some web context');
    responseQueue = [writerResponse({ ...GOOD_ARTIFACT, artifact_body: 'Per the foldera data pipeline sync error, apply now.' })];
    const { runScoutLoop } = await import('../scout-loop');

    expect(await runScoutLoop(USER_ID, { goal: GOAL })).toEqual([]);
  });

  it('returns [] (non-fatal) when the writer call throws', async () => {
    enableScout();
    searchWebForEnrichment.mockResolvedValue('some web context');
    responseQueue = []; // mock throws when no response queued
    const { runScoutLoop } = await import('../scout-loop');

    expect(await runScoutLoop(USER_ID, { goal: GOAL })).toEqual([]);
  });

  it('returns [] when the model returns unparseable JSON', async () => {
    enableScout();
    searchWebForEnrichment.mockResolvedValue('some web context');
    responseQueue = [
      { content: [{ type: 'text', text: 'not json at all' }], usage: { input_tokens: 10, output_tokens: 5 }, stop_reason: 'end_turn' },
    ];
    const { runScoutLoop } = await import('../scout-loop');

    expect(await runScoutLoop(USER_ID, { goal: GOAL })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// loadScoutGoals — exercised against a mocked Supabase client
// ---------------------------------------------------------------------------

const goalQuery = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn(),
};
vi.mock('@/lib/db/client', () => ({
  createServerClient: () => ({ from: () => goalQuery }),
}));

describe('loadScoutGoals', () => {
  beforeEach(() => {
    goalQuery.select.mockClear().mockReturnThis();
    goalQuery.eq.mockClear().mockReturnThis();
    goalQuery.order.mockClear().mockReturnThis();
    goalQuery.limit.mockReset();
    vi.resetModules();
  });

  it('maps active goals, dropping blank rows', async () => {
    goalQuery.limit.mockResolvedValue({
      data: [
        { goal_text: 'Land a senior backend role', goal_category: 'career', priority: 1 },
        { goal_text: '   ', goal_category: 'career', priority: 2 },
        { goal_text: 'Refinance the mortgage', goal_category: null, priority: null },
      ],
      error: null,
    });
    const { loadScoutGoals } = await import('../scout-loop');

    const goals = await loadScoutGoals(USER_ID);

    expect(goals).toEqual([
      { text: 'Land a senior backend role', category: 'career', priority: 1 },
      { text: 'Refinance the mortgage', category: 'general', priority: 99 },
    ]);
  });

  it('returns [] on query error', async () => {
    goalQuery.limit.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const { loadScoutGoals } = await import('../scout-loop');

    expect(await loadScoutGoals(USER_ID)).toEqual([]);
  });
});
