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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER_ID = '33333333-3333-3333-3333-333333333333';

function textResponse(text: string, stop_reason = 'end_turn'): MockResponse {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: 100, output_tokens: 40 },
    stop_reason,
  };
}

function enableWebLane(): void {
  process.env.SCOUT_ENABLED = 'true';
  process.env.SCOUT_WEB_ENABLED = 'true';
}

function disableWebLane(): void {
  delete process.env.SCOUT_ENABLED;
  delete process.env.SCOUT_WEB_ENABLED;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('scout web search', () => {
  beforeEach(() => {
    responseQueue = [];
    createCallCount = 0;
    createRequests.length = 0;
    disableWebLane();
    vi.resetModules();
  });

  afterEach(() => {
    disableWebLane();
  });

  it('no-ops (returns null, no API call) when the web lane is off', async () => {
    const { searchWebForEnrichment } = await import('../web-search');

    const result = await searchWebForEnrichment('any query', USER_ID);

    expect(result).toBeNull();
    expect(createCallCount).toBe(0);
  });

  it('no-ops for an empty query even when the lane is on', async () => {
    enableWebLane();
    const { searchWebForEnrichment } = await import('../web-search');

    const result = await searchWebForEnrichment('   ', USER_ID);

    expect(result).toBeNull();
    expect(createCallCount).toBe(0);
  });

  it('returns the synthesized summary and uses the basic web_search tool', async () => {
    enableWebLane();
    responseQueue = [
      textResponse('WAC 357-46 requires benefits enrollment within 30 days (source: leg.wa.gov).'),
    ];
    const { searchWebForEnrichment } = await import('../web-search');

    const result = await searchWebForEnrichment('career situation about state benefits', USER_ID);

    expect(result).toContain('WAC 357-46');
    expect(createCallCount).toBe(1);
    const tools = createRequests[0]?.tools as Array<{ type: string; name: string }>;
    expect(tools[0].type).toBe('web_search_20250305');
    expect(tools[0].name).toBe('web_search');
  });

  it('returns null when the model reports NONE', async () => {
    enableWebLane();
    responseQueue = [textResponse('NONE')];
    const { searchWebForEnrichment } = await import('../web-search');

    const result = await searchWebForEnrichment('query with no public answer', USER_ID);

    expect(result).toBeNull();
  });

  it('resumes after pause_turn and returns the final text', async () => {
    enableWebLane();
    responseQueue = [
      {
        content: [{ type: 'server_tool_use' }],
        usage: { input_tokens: 50, output_tokens: 0 },
        stop_reason: 'pause_turn',
      },
      textResponse('Found it: the deadline is March 31 (source: irs.gov).'),
    ];
    const { searchWebForEnrichment } = await import('../web-search');

    const result = await searchWebForEnrichment('tax deadline question', USER_ID);

    expect(result).toContain('March 31');
    expect(createCallCount).toBe(2);
  });

  it('returns null (non-fatal) when the API throws', async () => {
    enableWebLane();
    responseQueue = []; // mock throws when no response queued
    const { searchWebForEnrichment } = await import('../web-search');

    const result = await searchWebForEnrichment('query that errors', USER_ID);

    expect(result).toBeNull();
  });
});
