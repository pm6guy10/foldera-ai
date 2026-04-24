'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import { useSession } from 'next-auth/react';
import {
  Bell,
  CloudUpload,
  FileText,
  Inbox,
  Layers3,
  Search,
  Send,
  TriangleAlert,
  TrendingUp,
} from 'lucide-react';
import type { ConvictionAction } from '@/lib/briefing/types';
import { DailyBriefCard } from '@/components/foldera/DailyBriefCard';
import { DashboardSidebar } from '@/components/foldera/DashboardSidebar';
import { FolderaLogo } from '@/components/foldera/FolderaLogo';

type ArtifactWithDraftedEmail = {
  type: string;
  to?: string;
  recipient?: string;
  subject?: string;
  body?: string;
  text?: string;
  content?: string;
  title?: string;
  options?: Array<{ option: string; weight: number; rationale: string }>;
  recommendation?: string;
  context?: string;
  evidence?: string;
  tripwires?: string[];
  check_date?: string;
};

function shouldReconcileExecuteFailure(res: Response | null, errorMessage: string): boolean {
  if (res && res.status === 404) return true;
  const message = errorMessage.toLowerCase();
  return message.includes('already claimed') || message.includes('not found');
}

function artifactPrimaryText(artifact: ArtifactWithDraftedEmail | null | undefined): string | null {
  if (!artifact) return null;
  const raw = artifact.body ?? artifact.text ?? artifact.content;
  if (typeof raw === 'string' && raw.trim().length > 0) return raw;
  return null;
}

type ActionWithDomain = ConvictionAction & { domain?: string; generatedAt?: string };

const DOCUMENT_MARKDOWN_COMPONENTS = {
  h1: ({ children }: { children?: ReactNode }) => (
    <h1 className="mb-3 text-base font-semibold text-text-primary first:mt-0">{children}</h1>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className="mb-3 mt-4 text-sm font-semibold uppercase tracking-[0.14em] text-text-secondary first:mt-0">{children}</h2>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="mb-2 mt-4 text-sm font-semibold text-text-primary first:mt-0">{children}</h3>
  ),
  p: ({ children }: { children?: ReactNode }) => (
    <p className="mb-3 text-[15px] leading-7 text-text-primary last:mb-0">{children}</p>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="mb-3 list-disc space-y-2 pl-6 text-[15px] leading-7 text-text-primary marker:text-accent">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="mb-3 list-decimal space-y-2 pl-6 text-[15px] leading-7 text-text-primary marker:text-accent">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => <li>{children}</li>,
  strong: ({ children }: { children?: ReactNode }) => <strong className="font-semibold text-text-primary">{children}</strong>,
  a: ({ children, href }: { children?: ReactNode; href?: string }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">
      {children}
    </a>
  ),
  code: ({ children }: { children?: ReactNode }) => (
    <code className="rounded-[10px] border border-border bg-panel px-1.5 py-0.5 font-mono text-[13px] text-text-primary">{children}</code>
  ),
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="my-3 border-l border-accent pl-4 italic text-text-secondary">{children}</blockquote>
  ),
  hr: () => <hr className="my-4 border-border" />,
};

const demoDraft = `Hi Alex —

Following up on the update from yesterday.
I pulled the latest status and can send the finalized version by noon unless you want one adjustment first.

Best,
Brandon`;

const DEMO_DIRECTIVE = 'Send the follow-up to Alex Morgan before noon.';
const DEMO_WHY =
  'You have an open thread with no reply, the ask is time-bound, and the current hold on your calendar makes this the cleanest unblocker today.';
const DEMO_SOURCE_PILLS = ['Email thread', 'Calendar hold', 'Last draft', 'Connected inbox'];

const briefHowRows = [
  {
    title: 'Directive',
    body: 'The single move that matters most right now.',
  },
  {
    title: 'Draft',
    body: 'Ready-to-send wording when writing is the bottleneck.',
  },
  {
    title: 'Source trail',
    body: 'The evidence behind the recommendation.',
  },
];

function getDateLabel(): string {
  return new Date()
    .toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })
    .toUpperCase();
}

function getGreetingLabel(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function inferSourcePills(action: ActionWithDomain | null, artifact: ArtifactWithDraftedEmail | null | undefined): string[] {
  if (artifact?.type === 'document') {
    return ['Prepared document', 'Decision basis', 'Connected sources'];
  }
  if (artifact?.type === 'wait_rationale') {
    return ['Current context', 'Source trail'];
  }
  const evidenceText = JSON.stringify(action?.evidence ?? []).toLowerCase();
  const pills = new Set<string>();
  if (artifact?.type === 'email' || artifact?.type === 'drafted_email' || evidenceText.includes('email')) pills.add('Email thread');
  if (evidenceText.includes('calendar')) pills.add('Calendar hold');
  pills.add('Last draft');
  pills.add('Connected inbox');
  return Array.from(pills);
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const [action, setAction] = useState<ActionWithDomain | null>(null);
  const [executing, setExecuting] = useState(false);

  const loadAbortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;

    try {
      const latestRes = await fetch('/api/conviction/latest', { signal: controller.signal });
      if (controller.signal.aborted) return;

      if (!latestRes.ok) {
        setAction(null);
        return;
      }

      const data = await latestRes.json().catch(() => ({}));
      if (controller.signal.aborted) return;
      setAction(data?.id ? data : null);
    } catch {
      if (controller.signal.aborted) return;
      setAction(null);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const deepAction = params.get('action');
    const id = params.get('id');
    if (!deepAction || !id) return;
    window.history.replaceState({}, '', window.location.pathname);
    if (deepAction !== 'approve' && deepAction !== 'skip') return;

    void (async () => {
      try {
        const response = await fetch('/api/conviction/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action_id: id, decision: deepAction }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message = (data as { error?: string }).error ?? 'Could not update that action.';
          if (shouldReconcileExecuteFailure(response, message)) {
            await load();
            return;
          }
          return;
        }

        if (data.status === 'executed' || data.status === 'skipped') {
          await load();
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Could not update that action.';
        if (shouldReconcileExecuteFailure(null, message)) {
          await load();
        }
      }
    })();
  }, [load]);

  useEffect(() => {
    if (status === 'authenticated') {
      void load();
    }
    return () => {
      loadAbortRef.current?.abort();
    };
  }, [load, status]);

  const handleApprove = async () => {
    if (!action || executing) return;
    setExecuting(true);
    try {
      const response = await fetch('/api/conviction/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_id: action.id, decision: 'approve' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = (data as { error?: string }).error ?? 'Approve failed';
        if (shouldReconcileExecuteFailure(response, message)) {
          await load();
          return;
        }
        return;
      }

      if (data.status === 'executed' || data.status === 'skipped') {
        await load();
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Approve failed';
      if (shouldReconcileExecuteFailure(null, message)) {
        await load();
      }
    } finally {
      setExecuting(false);
    }
  };

  const handleSkip = async () => {
    if (!action || executing) return;
    setExecuting(true);
    try {
      const response = await fetch('/api/conviction/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_id: action.id, decision: 'skip' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = (data as { error?: string }).error ?? 'Skip failed';
        if (shouldReconcileExecuteFailure(response, message)) {
          await load();
          return;
        }
        return;
      }
      if (data.status === 'executed' || data.status === 'skipped') {
        await load();
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Skip failed';
      if (shouldReconcileExecuteFailure(null, message)) {
        await load();
      }
    } finally {
      setExecuting(false);
    }
  };

  const handleCopyDraft = useCallback(async () => {
    const artifact = action?.artifact as ArtifactWithDraftedEmail | null | undefined;
    if (!artifact) return;
    const subject = typeof artifact.subject === 'string' ? artifact.subject : '';
    const body = artifactPrimaryText(artifact) ?? '';
    const toLine = artifact?.to || artifact?.recipient || '';
    const block = [`To: ${toLine}`, `Subject: ${subject}`, '', body].join('\n');
    try {
      await navigator.clipboard.writeText(block);
    } catch {
      /* clipboard may be unavailable */
    }
  }, [action]);

  const handleCopyDocument = useCallback(async () => {
    const artifact = action?.artifact as ArtifactWithDraftedEmail | null | undefined;
    if (!artifact) return;
    const title = typeof artifact.title === 'string' ? artifact.title : 'Document';
    const body = artifactPrimaryText(artifact) ?? '';
    const block = [title, '', body].join('\n');
    try {
      await navigator.clipboard.writeText(block);
    } catch {
      /* clipboard may be unavailable */
    }
  }, [action]);

  const handleCopyFallbackDraft = useCallback(async () => {
    const block = ['To: alex.morgan@example.com', 'Subject: Alex Morgan follow-up', '', demoDraft].join('\n');
    try {
      await navigator.clipboard.writeText(block);
    } catch {
      /* ignore */
    }
  }, []);

  const sessionName = session?.user?.name?.trim() || 'Brandon';
  const firstName = sessionName.split(' ')[0] || 'Brandon';
  const currentAction = action;
  const artifact = currentAction?.artifact as ArtifactWithDraftedEmail | null | undefined;
  const artifactBody = artifactPrimaryText(artifact);
  const isDocument = artifact?.type === 'document';
  const isWait = artifact?.type === 'wait_rationale';

  const hasLiveAction = Boolean(currentAction?.id);
  const cardDirective = currentAction?.directive ?? DEMO_DIRECTIVE;
  const cardWhyNow = currentAction?.reason ?? DEMO_WHY;
  const cardSourcePills =
    hasLiveAction && currentAction ? inferSourcePills(currentAction, artifact) : DEMO_SOURCE_PILLS;
  const cardStatusText = isDocument ? 'READY TO FILE' : isWait ? 'READY TO REVIEW' : 'READY TO SEND';
  const cardNextStep = isDocument ? 'Next: Save to record' : 'Next: Await response';
  const draftLabel = isDocument ? 'DOCUMENT' : isWait ? 'RATIONALE' : 'DRAFT';

  const draftBody = isDocument ? (
    artifactBody ? (
      <div
        className="max-h-[380px] overflow-y-auto rounded-[16px] border border-border bg-panel-raised p-4"
        data-testid="dashboard-document-body"
      >
        {artifact?.title ? <p className="mb-3 text-base font-semibold text-text-primary">{artifact.title}</p> : null}
        <ReactMarkdown components={DOCUMENT_MARKDOWN_COMPONENTS}>{artifactBody}</ReactMarkdown>
      </div>
    ) : (
      <p className="text-[15px] leading-7 text-text-secondary">Full text is in your morning email. Save document to file it, or skip to adjust.</p>
    )
  ) : isWait ? (
    <div className="space-y-3">
      {artifact?.context ? <p className="text-[15px] leading-7 text-text-primary">{artifact.context}</p> : null}
      {artifact?.tripwires?.[0] || artifact?.check_date ? (
        <p className="text-[13px] uppercase tracking-[0.12em] text-accent">Resume when: {artifact?.tripwires?.[0] ?? artifact?.check_date}</p>
      ) : null}
    </div>
  ) : (
    <div className="whitespace-pre-line text-[15px] leading-7 text-text-primary">{artifactBody ?? demoDraft}</div>
  );

  const cardActions = isDocument
    ? [
        { label: 'Copy full text', kind: 'secondary' as const, onClick: () => void handleCopyDocument(), disabled: !artifactBody },
        { label: 'Skip and adjust', kind: 'amber' as const, onClick: () => void handleSkip(), disabled: !hasLiveAction || executing },
        {
          label: 'Save document',
          kind: 'primary' as const,
          onClick: () => void handleApprove(),
          disabled: !hasLiveAction || executing,
          dataTestId: 'dashboard-primary-action',
        },
      ]
    : [
        {
          label: 'Copy draft',
          kind: 'secondary' as const,
          onClick: () => void (hasLiveAction ? handleCopyDraft() : handleCopyFallbackDraft()),
          disabled: false,
        },
        { label: 'Snooze 24h', kind: 'amber' as const, onClick: () => void handleSkip(), disabled: !hasLiveAction || executing },
        {
          label: 'Approve & send',
          kind: 'primary' as const,
          onClick: () => void handleApprove(),
          disabled: !hasLiveAction || executing,
          dataTestId: 'dashboard-primary-action',
        },
      ];

  const headerSearch = (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-3 rounded-[16px] border border-border bg-panel px-4 py-3 text-sm text-text-muted">
        <Search className="h-4 w-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">Search Foldera...</span>
        <span className="hidden shrink-0 rounded-[10px] border border-border px-2 py-1 text-[11px] sm:inline">⌘ K</span>
      </div>
      <button
        type="button"
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border border-border bg-panel text-text-secondary"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
      </button>
    </>
  );

  return (
    <div className="foldera-dashboard-page foldera-page min-h-screen bg-bg text-text-primary">
      <div className="mx-auto w-full max-w-[1720px] px-4 py-4 sm:px-5 lg:px-8 lg:py-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(236px,260px)_minmax(0,1fr)] xl:grid-cols-[minmax(236px,260px)_minmax(0,1fr)_300px] xl:gap-8">
          <DashboardSidebar activeLabel="Executive Briefing" userName={firstName} />

          <div className="min-w-0">
            <div className="foldera-panel mb-5 flex items-center justify-between gap-3 px-4 py-3 lg:hidden">
              <FolderaLogo href="/dashboard" markSize="sm" />
              <div className="flex min-w-0 flex-1 items-center justify-end gap-2">{headerSearch}</div>
            </div>

            <div className="hidden items-center justify-between gap-4 lg:flex">
              <p className="foldera-eyebrow">{getDateLabel()}</p>
              <div className="flex max-w-md flex-1 items-center justify-end gap-3">{headerSearch}</div>
            </div>

            <div className="flex items-center justify-between gap-3 pb-1 pt-2 lg:hidden">
              <p className="foldera-eyebrow">{getDateLabel()}</p>
            </div>

            <header className="pb-8 pt-2 lg:pt-0">
              <h1 className="text-[clamp(2rem,4vw,3.25rem)] font-semibold leading-[1.08] tracking-[-0.04em] text-text-primary">
                {getGreetingLabel()}, <strong className="font-semibold text-text-primary">{firstName}.</strong>
              </h1>
              <div className="mt-6 flex flex-wrap gap-x-10 gap-y-4 text-sm text-text-secondary">
                <div className="flex items-center gap-3">
                  <Inbox className="h-4 w-4 text-text-muted" aria-hidden />
                  <span className="text-[28px] font-semibold tracking-[-0.04em] text-text-primary sm:text-[32px]">5</span>
                  <span>open threads</span>
                </div>
                <div className="flex items-center gap-3">
                  <TriangleAlert className="h-4 w-4 text-amber-400" aria-hidden />
                  <span className="text-[28px] font-semibold tracking-[-0.04em] text-amber-400 sm:text-[32px]">2</span>
                  <span>need attention</span>
                </div>
                <div className="flex items-center gap-3">
                  <TrendingUp className="h-4 w-4 text-text-muted" aria-hidden />
                  <span className="text-[28px] font-semibold tracking-[-0.04em] text-text-primary sm:text-[32px]">1</span>
                  <span>ready to move</span>
                </div>
              </div>
            </header>

            <div className="mx-auto w-full max-w-[1008px] pb-10">
              <DailyBriefCard
                className="foldera-dashboard-brief-card w-full"
                dashboardCta
                directive={cardDirective}
                whyNow={cardWhyNow}
                draftLabel={draftLabel}
                draftBody={draftBody}
                sourcePills={cardSourcePills}
                nextStep={cardNextStep}
                statusText={cardStatusText}
                footerText="Grounded in connected sources"
                actions={cardActions}
              />
            </div>
          </div>

          <aside className="hidden min-w-0 space-y-5 xl:block">
            <div className="foldera-panel p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="foldera-eyebrow">How this brief works</p>
                <a href="/#product" className="shrink-0 text-sm text-text-muted hover:text-text-primary">
                  Learn more →
                </a>
              </div>
              <div className="mt-5 space-y-5">
                {briefHowRows.map((row) => (
                  <div
                    key={row.title}
                    className="grid grid-cols-[auto_minmax(0,1fr)] gap-4 border-t border-border pt-5 first:border-t-0 first:pt-0"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-[12px] border border-border bg-panel-raised text-text-secondary">
                      {row.title === 'Directive' ? <Send className="h-4 w-4" /> : row.title === 'Draft' ? <FileText className="h-4 w-4" /> : <Layers3 className="h-4 w-4" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text-primary">{row.title}</p>
                      <p className="mt-2 text-sm leading-7 text-text-muted">{row.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="foldera-panel p-5">
              <div className="flex min-h-[168px] items-center justify-center rounded-[20px] border border-dashed border-border bg-panel-raised px-5 text-center">
                <div>
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-border bg-panel text-text-muted">
                    <CloudUpload className="h-5 w-5" aria-hidden />
                  </div>
                  <p className="mt-4 text-base font-medium leading-snug text-text-primary">Drop a folder or document.</p>
                  <p className="mt-2 text-sm leading-7 text-text-muted">Foldera will get to work instantly.</p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
