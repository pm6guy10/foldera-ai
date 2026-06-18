'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type SlackButton = { type: 'button'; text: { type: 'plain_text'; text: string }; action_id: string };
type SlackBlock =
  | { type: 'section'; text: { type: 'mrkdwn'; text: string } }
  | { type: 'actions'; elements: SlackButton[] };

type RightNowResponse = {
  slack_test_mode: { channel: 'test_dm'; blocks: SlackBlock[] };
};

type InteractionResponse = RightNowResponse & { action_id: string };

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json' } });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as T;
}

function SlackBubble({ text }: { text: string }) {
  return (
    <div className="rounded-2xl bg-[#0b1220] border border-white/10 px-4 py-3 text-sm leading-5 text-slate-100 whitespace-pre-wrap">
      {text}
    </div>
  );
}

export default function SlackTestModeClient() {
  const [data, setData] = useState<RightNowResponse | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchJson<RightNowResponse>('/api/slack/test-mode/right-now');
      setData(next);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const blocks = useMemo(() => data?.slack_test_mode.blocks ?? [], [data]);
  const sectionText = useMemo(() => {
    const section = blocks.find((b) => b.type === 'section') as { type: 'section'; text: { text: string } } | undefined;
    return section?.text.text ?? '';
  }, [blocks]);
  const actions = useMemo(() => {
    const actionsBlock = blocks.find((b) => b.type === 'actions') as { type: 'actions'; elements: SlackButton[] } | undefined;
    return actionsBlock?.elements ?? [];
  }, [blocks]);

  const onAction = useCallback(
    async (actionId: string) => {
      setLoading(true);
      setError(null);
      try {
        const next = await fetchJson<InteractionResponse>('/api/slack/test-mode/interaction', {
          method: 'POST',
          body: JSON.stringify({ action_id: actionId }),
        });
        setLastAction(next.action_id);
        setData(next);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return (
    <div className="min-h-screen bg-[#050914] text-slate-100">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <div className="rounded-3xl border border-white/10 bg-black/40 p-6 shadow-[0_0_40px_rgba(245,166,35,0.08)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-accent-hover/80">Slack test-mode</div>
              <h1 className="mt-1 text-lg font-semibold text-slate-100">Right Now DM</h1>
            </div>
            <button
              onClick={() => void load()}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 hover:bg-white/10 disabled:opacity-50"
              disabled={loading}
            >
              Refresh
            </button>
          </div>

          <div className="mt-6 space-y-4" data-testid="slack-test-mode-thread">
            {error ? (
              <div className="rounded-2xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            <SlackBubble text={sectionText || (loading ? 'Loading…' : 'No message')} />

            <div className="flex flex-wrap gap-2" data-testid="slack-test-mode-actions">
              {actions.map((a) => (
                <button
                  key={a.action_id}
                  onClick={() => void onAction(a.action_id)}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 hover:bg-white/10 disabled:opacity-50"
                  disabled={loading}
                  data-testid={`action-${a.action_id}`}
                >
                  {a.text.text}
                </button>
              ))}
            </div>

            {lastAction ? (
              <div className="text-xs text-slate-400" data-testid="slack-test-mode-last-action">
                Last interaction: {lastAction}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

