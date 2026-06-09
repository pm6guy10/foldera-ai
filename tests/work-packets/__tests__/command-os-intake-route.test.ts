import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetch = vi.fn();

describe('POST /api/command-os/intake', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
    process.env.GITHUB_TOKEN = 'ghp_mock_command_os_token';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GITHUB_TOKEN;
  });

  it('writes a reference-only capture to GitHub issue #165 without leaking tokens or triggering execution loops', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        id: 4242,
        html_url: 'https://github.com/pm6guy10/foldera-ai/issues/165#issuecomment-4242',
      }),
      text: async () => '',
    });

    const { POST } = await import('@/app/api/command-os/intake/route');
    const response = await POST(
      new NextRequest('http://localhost/api/command-os/intake', {
        method: 'POST',
        body: JSON.stringify({
          rawText: 'ChatGPT/CLI raw capture: Open Threads entry for Issue #165. Route this as reference-only and keep user tokens out of the payload.',
        }),
      }),
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      classification: 'REFERENCE_ONLY',
      routingOutcome: 'reference-only receipt',
      existingGithubTarget: '#165',
      newIssueNeeded: 'NO',
      activeSeamImpact: 'NO',
      executionLoopTriggered: false,
    });
    expect(body.writeBack).toMatchObject({
      issueNumber: 165,
      commentId: 4242,
      commentUrl: 'https://github.com/pm6guy10/foldera-ai/issues/165#issuecomment-4242',
    });
    expect(JSON.stringify(body)).not.toContain(process.env.GITHUB_TOKEN);
    expect(JSON.stringify(body)).not.toContain('user_tokens');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.github.com/repos/pm6guy10/foldera-ai/issues/165/comments');
    expect(init.method).toBe('POST');
    expect(Object.fromEntries(new Headers(init.headers).entries())).toMatchObject({
      accept: 'application/vnd.github+json',
      authorization: 'Bearer ghp_mock_command_os_token',
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
    });
    const payload = JSON.parse(String(init.body)) as { body: string };
    expect(payload.body).toContain('CODEX COMMAND OS WRITE-BACK');
    expect(payload.body).toContain('Target: GitHub Issue #165');
    expect(payload.body).toContain('Classification: REFERENCE_ONLY');
    expect(payload.body).not.toContain('ghp_mock_command_os_token');
  });

  it('writes ACTIVE_SEAM_COMMAND input to Issue #165 (all classifications are captured)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        id: 4243,
        html_url: 'https://github.com/pm6guy10/foldera-ai/issues/165#issuecomment-4243',
      }),
      text: async () => '',
    });

    const { POST } = await import('@/app/api/command-os/intake/route');
    const response = await POST(
      new NextRequest('http://localhost/api/command-os/intake', {
        method: 'POST',
        body: JSON.stringify({
          rawText: 'Run issue #166 only and execute the active seam.',
        }),
      }),
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      classification: 'ACTIVE_SEAM_COMMAND',
      executionLoopTriggered: false,
      existingGithubTarget: '#168',
    });
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/issues/165/comments');
  });
});
