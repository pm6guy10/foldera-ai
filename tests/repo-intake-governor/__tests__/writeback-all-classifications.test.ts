import { describe, expect, it, vi } from 'vitest';
import { buildIntakePacket } from '@/lib/repo-intake-governor';
import { appendOpenThreadsComment } from '@/lib/repo-intake-governor/writeback';

const context = {
  activeIssue: 168,
  activeIssueTitle: 'Command OS v1 — automatic Open Threads capture from ChatGPT',
  openThreadsIssue: 165,
  ledgerIssue: 136,
};

function makeMockFetch(status = 201) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => '',
    json: async () => ({
      id: 99001,
      html_url: 'https://github.com/pm6guy10/foldera-ai/issues/165#issuecomment-99001',
    }),
  });
}

describe('appendOpenThreadsComment — all classifications write to Issue #165', () => {
  it.each([
    ['VISION', 'vision: Foldera should feel like a re-entry point into the workday.'],
    ['AUDIT_FINDING', 'audit finding: source truth contradicts ACTIVE_HANDOFF.md on the active issue.'],
    ['BLOCKER_REPORT', 'Blocker report: CI failed on the main gate check with a missing env var.'],
    ['OPEN_THREAD_CAPTURE', "What's on my mind: not sure where this belongs yet, capture it first."],
    ['LESSON_LEARNED', 'lesson learned: do not count a green build as product proof.'],
    ['BUSINESS_PLAN_UPDATE', 'pricing: we should move to a $49/month tier for the first 10 pilots.'],
  ])('writes %s input to Issue #165 without returning 409', async (_, rawInput) => {
    const packet = buildIntakePacket(rawInput, context);
    const mockFetch = makeMockFetch(201);

    const result = await appendOpenThreadsComment(rawInput, packet, {
      fetchImpl: mockFetch,
      githubToken: 'mock-token',
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/issues/165/comments');
    expect(init.method).toBe('POST');
    expect(result.issueNumber).toBe(165);
    expect(result.commentId).toBe(99001);
  });

  it('includes routing outcome and classification in the written comment body', async () => {
    const rawInput = 'vision: Foldera should feel like a re-entry point into the workday.';
    const packet = buildIntakePacket(rawInput, context);
    const mockFetch = makeMockFetch(201);

    await appendOpenThreadsComment(rawInput, packet, {
      fetchImpl: mockFetch,
      githubToken: 'mock-token',
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { body: string };
    expect(body.body).toContain('Classification:');
    expect(body.body).toContain('Routing outcome:');
    expect(body.body).toContain('Existing GitHub target:');
    expect(body.body).toContain(rawInput.slice(0, 20));
  });

  it('throws if GITHUB_TOKEN is missing', async () => {
    const rawInput = 'vision: test with no token';
    const packet = buildIntakePacket(rawInput, context);
    const originalToken = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;

    await expect(
      appendOpenThreadsComment(rawInput, packet, { fetchImpl: makeMockFetch() }),
    ).rejects.toThrow('GITHUB_TOKEN is required');

    if (originalToken !== undefined) process.env.GITHUB_TOKEN = originalToken;
  });
});
