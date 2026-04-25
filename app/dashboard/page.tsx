'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import { useSession } from 'next-auth/react';
import type { ConvictionAction } from '@/lib/briefing/types';
import { DailyBriefCard } from '@/components/foldera/DailyBriefCard';
import { FolderaDashboardPixelLock } from '@/components/dashboard/foldera-dashboard-pixel-lock';

type ArtifactWithDraftedEmail = {
  [key: string]: unknown;
  type?: string;
  to?: string;
  recipient?: string;
  subject?: string;
  body?: string;
  text?: string;
  content?: string;
  markdown?: string;
  summary?: string;
  description?: string;
  rationale?: string;
  title?: string;
  options?: Array<{ option?: unknown; weight?: unknown; rationale?: unknown }>;
  recommendation?: string;
  context?: string;
  evidence?: string;
  tripwires?: unknown;
  check_date?: string;
  date?: string;
  time?: string;
  start?: string;
  end?: string;
  attendees?: unknown;
  sources?: unknown;
  findings?: string;
  recommended_action?: string;
};

type DashboardArtifactView = {
  label: string;
  statusText: string;
  nextStep: string;
  meta: string[];
  body: string;
  isMarkdown?: boolean;
};

function shouldReconcileExecuteFailure(res: Response | null, errorMessage: string): boolean {
  if (res && res.status === 404) return true;
  const message = errorMessage.toLowerCase();
  return message.includes('already claimed') || message.includes('not found');
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function appendMeta(meta: string[], label: string, value: unknown): void {
  const parsed = asTrimmedString(value);
  if (!parsed) return;
  meta.push(`${label}: ${parsed}`);
}

function firstMeaningfulString(
  artifact: ArtifactWithDraftedEmail,
  fields: string[],
): string | null {
  for (const field of fields) {
    const parsed = asTrimmedString(artifact[field]);
    if (parsed) return parsed;
  }
  return null;
}

function stringifyArtifactFallback(artifact: ArtifactWithDraftedEmail): string {
  try {
    const serialized = JSON.stringify(artifact, null, 2);
    return typeof serialized === 'string' && serialized.length > 0 ? serialized : 'Artifact captured.';
  } catch {
    return 'Artifact captured.';
  }
}

function fallbackBodyFromArtifact(artifact: ArtifactWithDraftedEmail): string {
  return firstMeaningfulString(artifact, [
    'body',
    'text',
    'content',
    'markdown',
    'summary',
    'recommendation',
    'rationale',
    'description',
    'context',
    'evidence',
    'findings',
    'recommended_action',
  ]) ?? stringifyArtifactFallback(artifact);
}

function collectDecisionOptions(artifact: ArtifactWithDraftedEmail): string {
  if (!Array.isArray(artifact.options) || artifact.options.length === 0) return '';
  const lines = artifact.options
    .map((entry, index) => {
      if (!entry || typeof entry !== 'object') return '';
      const option = asTrimmedString((entry as { option?: unknown }).option) ?? `Option ${index + 1}`;
      const weightRaw = (entry as { weight?: unknown }).weight;
      const weight = typeof weightRaw === 'number' && Number.isFinite(weightRaw) ? `${Math.round(weightRaw * 100)}%` : null;
      const rationale = asTrimmedString((entry as { rationale?: unknown }).rationale);
      const head = `- ${option}${weight ? ` (${weight})` : ''}`;
      return rationale ? `${head}\n  ${rationale}` : head;
    })
    .filter((line) => line.length > 0);
  return lines.join('\n');
}

function humanDate(isoLike: string): string {
  const ms = Date.parse(isoLike);
  if (!Number.isFinite(ms)) return isoLike;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function humanTime(isoLike: string): string {
  const ms = Date.parse(isoLike);
  if (!Number.isFinite(ms)) return isoLike;
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function normalizeArtifactForDashboard(
  artifact: ArtifactWithDraftedEmail | null | undefined,
  actionType?: string,
): DashboardArtifactView {
  const base: DashboardArtifactView = {
    label: 'FINISHED WORK',
    statusText: 'READY TO REVIEW',
    nextStep: 'Next: Review artifact',
    meta: [],
    body: 'Artifact details unavailable for this action.',
  };
  if (!artifact || typeof artifact !== 'object') return base;

  const type = (asTrimmedString(artifact.type) ?? actionType ?? '').toLowerCase();

  if (type === 'email' || type === 'drafted_email' || type === 'send_message') {
    const meta: string[] = [];
    appendMeta(meta, 'To', artifact.to ?? artifact.recipient);
    appendMeta(meta, 'Subject', artifact.subject);
    return {
      label: 'EMAIL DRAFT',
      statusText: 'READY TO SEND',
      nextStep: 'Next: Await response',
      meta,
      body: firstMeaningfulString(artifact, ['body', 'text', 'content']) ?? fallbackBodyFromArtifact(artifact),
    };
  }

  if (type === 'document' || type === 'write_document') {
    const meta: string[] = [];
    appendMeta(meta, 'Title', artifact.title);
    const markdown = firstMeaningfulString(artifact, ['markdown']);
    const body = markdown ?? firstMeaningfulString(artifact, ['body', 'text', 'content']) ?? fallbackBodyFromArtifact(artifact);
    return {
      label: 'FINISHED DOCUMENT',
      statusText: 'READY TO FILE',
      nextStep: 'Next: Save to record',
      meta,
      body,
      isMarkdown: Boolean(markdown || firstMeaningfulString(artifact, ['content'])),
    };
  }

  if (type === 'decision_frame' || type === 'make_decision') {
    const meta: string[] = [];
    appendMeta(meta, 'Recommendation', artifact.recommendation);
    const rationale = asTrimmedString(artifact.rationale);
    const options = collectDecisionOptions(artifact);
    const bodyParts: string[] = [];
    if (rationale) bodyParts.push(`Rationale: ${rationale}`);
    if (options) bodyParts.push(`Options:\n${options}`);
    const body = bodyParts.join('\n\n') || fallbackBodyFromArtifact(artifact);
    return {
      label: 'DECISION FRAME',
      statusText: 'READY TO DECIDE',
      nextStep: 'Next: Make decision',
      meta,
      body,
    };
  }

  if (type === 'wait_rationale') {
    const meta: string[] = [];
    appendMeta(meta, 'Check date', artifact.check_date);
    if (Array.isArray(artifact.tripwires)) {
      const joined = artifact.tripwires.map((item) => asTrimmedString(item)).filter(Boolean).join(' | ');
      if (joined.length > 0) meta.push(`Tripwires: ${joined}`);
    } else {
      appendMeta(meta, 'Tripwires', artifact.tripwires);
    }
    const context = asTrimmedString(artifact.context);
    const evidence = asTrimmedString(artifact.evidence);
    const parts: string[] = [];
    if (context) parts.push(context);
    if (evidence) parts.push(`Evidence: ${evidence}`);
    const body = parts.join('\n\n') || firstMeaningfulString(artifact, ['body', 'content']) || fallbackBodyFromArtifact(artifact);
    return {
      label: 'WAIT RATIONALE',
      statusText: 'READY TO REVIEW',
      nextStep: 'Next: Recheck later',
      meta,
      body,
    };
  }

  if (type === 'calendar_event') {
    const meta: string[] = [];
    appendMeta(meta, 'Title', artifact.title);
    const date = asTrimmedString(artifact.date) ?? (asTrimmedString(artifact.start) ? humanDate(String(artifact.start)) : null);
    if (date) meta.push(`Date: ${date}`);
    const explicitTime = asTrimmedString(artifact.time);
    if (explicitTime) {
      meta.push(`Time: ${explicitTime}`);
    } else {
      const start = asTrimmedString(artifact.start);
      const end = asTrimmedString(artifact.end);
      if (start && end) meta.push(`Time: ${humanTime(start)} - ${humanTime(end)}`);
      else if (start) meta.push(`Time: ${humanTime(start)}`);
    }
    if (Array.isArray(artifact.attendees)) {
      const attendees = artifact.attendees.map((item) => asTrimmedString(item)).filter(Boolean).join(', ');
      if (attendees.length > 0) meta.push(`Attendees: ${attendees}`);
    } else {
      appendMeta(meta, 'Attendees', artifact.attendees);
    }
    return {
      label: 'CALENDAR MOVE',
      statusText: 'READY TO SCHEDULE',
      nextStep: 'Next: Confirm calendar',
      meta,
      body: firstMeaningfulString(artifact, ['body', 'content', 'description']) ?? fallbackBodyFromArtifact(artifact),
    };
  }

  if (type === 'research_brief') {
    const meta: string[] = [];
    appendMeta(meta, 'Title', artifact.title);
    if (Array.isArray(artifact.sources) && artifact.sources.length > 0) {
      meta.push(`Sources: ${artifact.sources.length}`);
    }
    const markdown = firstMeaningfulString(artifact, ['markdown']);
    const body =
      markdown
      ?? firstMeaningfulString(artifact, ['body', 'content', 'summary', 'findings', 'recommended_action'])
      ?? fallbackBodyFromArtifact(artifact);
    return {
      label: 'RESEARCH BRIEF',
      statusText: 'READY TO USE',
      nextStep: 'Next: Use brief',
      meta,
      body,
      isMarkdown: Boolean(markdown),
    };
  }

  const unknownMeta: string[] = [];
  appendMeta(unknownMeta, 'Title', artifact.title);
  appendMeta(unknownMeta, 'Subject', artifact.subject);
  appendMeta(unknownMeta, 'To', artifact.to);
  appendMeta(unknownMeta, 'Recipient', artifact.recipient);
  const unknownBody = firstMeaningfulString(artifact, [
    'body',
    'text',
    'content',
    'markdown',
    'summary',
    'recommendation',
    'rationale',
    'description',
  ]) ?? stringifyArtifactFallback(artifact);
  return {
    label: 'FINISHED WORK',
    statusText: 'READY TO REVIEW',
    nextStep: 'Next: Review artifact',
    meta: unknownMeta,
    body: unknownBody,
  };
}

type ActionWithDomain = ConvictionAction & { domain?: string; generatedAt?: string };
type DashboardNoticeKind =
  | 'approve_sent'
  | 'approve_saved_document'
  | 'skip_snoozed'
  | 'reconciled_stale_action'
  | 'error';
type DashboardNotice = { kind: DashboardNoticeKind; message: string };

function approveSuccessFlash(actionType: string | undefined, result: unknown): DashboardNotice {
  const payload = result && typeof result === 'object' ? (result as Record<string, unknown>) : null;
  if (actionType === 'write_document') {
    const emailResult = payload?.document_ready_email;
    if (emailResult && typeof emailResult === 'object') {
      const output = emailResult as { sent?: boolean; reason?: string; send_error?: string };
      if (output.sent === true) {
        return { kind: 'approve_saved_document', message: 'Saved. We also emailed you the full document.' };
      }
      if (output.reason === 'no_verified_email') {
        return {
          kind: 'approve_saved_document',
          message: 'Saved to your Foldera record. Add a verified email in Settings to receive a copy by email.',
        };
      }
      if (typeof output.send_error === 'string' && output.send_error.length > 0) {
        return {
          kind: 'approve_saved_document',
          message: 'Saved. Email delivery failed - your document is still in Foldera Signals.',
        };
      }
    }
    if (payload?.saved === true) {
      return { kind: 'approve_saved_document', message: 'Saved. Your document is in Foldera Signals.' };
    }
    return { kind: 'approve_saved_document', message: 'Saved.' };
  }

  const sentVia = (payload as { sent_via?: string } | null)?.sent_via;
  if (sentVia === 'gmail') return { kind: 'approve_sent', message: 'Sent from your Gmail.' };
  if (sentVia === 'outlook') return { kind: 'approve_sent', message: 'Sent from your Outlook.' };
  if (sentVia === 'resend') {
    return { kind: 'approve_sent', message: 'Sent via Foldera. Connect Gmail in Settings to send from your own inbox.' };
  }
  return { kind: 'approve_sent', message: 'Sent. Check your outbox.' };
}

const DOCUMENT_MARKDOWN_COMPONENTS = {
  h1: ({ children }: { children?: ReactNode }) => (
    <h1 className="mb-3 text-base font-semibold text-white first:mt-0">{children}</h1>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className="mb-3 mt-4 text-sm font-semibold uppercase tracking-[0.14em] text-gray-300 first:mt-0">{children}</h2>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="mb-2 mt-4 text-sm font-semibold text-white first:mt-0">{children}</h3>
  ),
  p: ({ children }: { children?: ReactNode }) => (
    <p className="mb-3 text-[15px] leading-7 text-gray-100 last:mb-0">{children}</p>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="mb-3 list-disc space-y-2 pl-6 text-[15px] leading-7 text-gray-100 marker:text-cyan-400">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="mb-3 list-decimal space-y-2 pl-6 text-[15px] leading-7 text-gray-100 marker:text-cyan-400">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => <li>{children}</li>,
  strong: ({ children }: { children?: ReactNode }) => <strong className="font-semibold text-white">{children}</strong>,
  a: ({ children, href }: { children?: ReactNode; href?: string }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-cyan-400 underline underline-offset-2">
      {children}
    </a>
  ),
  code: ({ children }: { children?: ReactNode }) => (
    <code className="rounded-[10px] border border-[#1b2530] bg-[#121820] px-1.5 py-0.5 font-mono text-[13px] text-white">{children}</code>
  ),
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="my-3 border-l border-cyan-400 pl-4 italic text-gray-300">{children}</blockquote>
  ),
  hr: () => <hr className="my-4 border-[#1b2530]" />,
};

const demoDraft = `Hi Alex -

Following up on the update from yesterday.
I pulled the latest status and can send the finalized version by noon unless you want one adjustment first.

Best,
Brandon`;

const DEMO_DIRECTIVE = 'Send the follow-up to Alex Morgan before noon.';
const DEMO_WHY =
  'You have an open thread with no reply, the ask is time-bound, and the current hold on your calendar makes this the cleanest unblocker today.';
const DEMO_SOURCE_PILLS = ['Email thread', 'Calendar hold', 'Last draft', 'Connected inbox'];
const DESKTOP_BREAKPOINT = 1024;

function computeIsDesktop(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth >= DESKTOP_BREAKPOINT;
}

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

function pixelLockArtifactTitle(
  artifact: ArtifactWithDraftedEmail | null | undefined,
  actionType?: string,
): string | undefined {
  if (!artifact) return undefined;
  const type = (asTrimmedString(artifact.type) ?? actionType ?? '').toLowerCase();
  if (type === 'document' || type === 'write_document') {
    return firstMeaningfulString(artifact, ['title']) ?? undefined;
  }
  if (type === 'email' || type === 'drafted_email' || type === 'send_message') {
    return firstMeaningfulString(artifact, ['subject']) ?? undefined;
  }
  return firstMeaningfulString(artifact, ['title', 'subject']) ?? undefined;
}

function pixelLockArtifactBody(
  artifact: ArtifactWithDraftedEmail | null | undefined,
): string | undefined {
  if (!artifact) return undefined;
  return firstMeaningfulString(artifact, ['body', 'content', 'text']) ?? undefined;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const [action, setAction] = useState<ActionWithDomain | null>(null);
  const [executing, setExecuting] = useState(false);
  const [notice, setNotice] = useState<DashboardNotice | null>(null);
  const [freeArtifactRemaining, setFreeArtifactRemaining] = useState(true);
  const [subPlan, setSubPlan] = useState<string | null>(null);
  const [subStatus, setSubStatus] = useState<string | null>(null);
  const [lastDecision, setLastDecision] = useState<'approve' | 'skip' | null>(null);
  const [executedActionId, setExecutedActionId] = useState<string | null>(null);
  const [outcomeRecorded, setOutcomeRecorded] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => computeIsDesktop());

  const loadAbortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;

    try {
      const [latestRes, subscriptionRes] = await Promise.all([
        fetch('/api/conviction/latest', { signal: controller.signal }),
        fetch('/api/subscription/status', { signal: controller.signal }),
      ]);
      if (controller.signal.aborted) return;

      if (subscriptionRes.ok) {
        const subscription = await subscriptionRes.json().catch(() => ({}));
        if (controller.signal.aborted) return;
        setSubPlan(typeof subscription.plan === 'string' ? subscription.plan : null);
        setSubStatus(typeof subscription.status === 'string' ? subscription.status : null);
      } else {
        setSubPlan(null);
        setSubStatus(null);
      }

      if (!latestRes.ok) {
        setAction(null);
        setFreeArtifactRemaining(true);
        return;
      }

      const data = await latestRes.json().catch(() => ({}));
      if (controller.signal.aborted) return;
      setFreeArtifactRemaining(typeof data?.free_artifact_remaining === 'boolean' ? data.free_artifact_remaining : true);
      setAction(data?.id ? data : null);
    } catch {
      if (controller.signal.aborted) return;
      setAction(null);
      setFreeArtifactRemaining(true);
      setSubPlan(null);
      setSubStatus(null);
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
            setNotice({
              kind: 'reconciled_stale_action',
              message: 'That directive was already handled or replaced. Showing your current state.',
            });
            return;
          }
          setNotice({ kind: 'error', message });
          return;
        }

        if (data.status === 'executed' || data.status === 'skipped') {
          if (deepAction === 'approve') {
            setLastDecision('approve');
            setExecutedActionId((data.action_id as string | undefined) ?? id);
            setOutcomeRecorded(false);
            setNotice(approveSuccessFlash((data as { action_type?: string }).action_type ?? action?.action_type, data.result));
          } else {
            setLastDecision('skip');
            setExecutedActionId(null);
            setNotice({ kind: 'skip_snoozed', message: 'Snoozed. Foldera will adjust.' });
          }
          await load();
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Could not update that action.';
        if (shouldReconcileExecuteFailure(null, message)) {
          await load();
          setNotice({
            kind: 'reconciled_stale_action',
            message: 'That directive was already handled or replaced. Showing your current state.',
          });
          return;
        }
        setNotice({ kind: 'error', message });
      }
    })();
  }, [action?.action_type, load]);

  useEffect(() => {
    if (status === 'authenticated') {
      void load();
    }
    return () => {
      loadAbortRef.current?.abort();
    };
  }, [load, status]);

  useEffect(() => {
    const onResize = () => setIsDesktop(computeIsDesktop());
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousOverflowX = document.body.style.overflowX;
    const previousOverflowY = document.body.style.overflowY;
    if (isDesktop) {
      document.body.style.overflow = 'hidden';
      document.body.style.overflowX = 'hidden';
      document.body.style.overflowY = 'hidden';
    } else {
      document.body.style.overflow = previousOverflow;
      document.body.style.overflowX = previousOverflowX;
      document.body.style.overflowY = previousOverflowY;
    }
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overflowX = previousOverflowX;
      document.body.style.overflowY = previousOverflowY;
    };
  }, [isDesktop]);

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
          setNotice({
            kind: 'reconciled_stale_action',
            message: 'That directive was already handled or replaced. Showing your current state.',
          });
          await load();
          return;
        }
        setNotice({ kind: 'error', message });
        return;
      }

      if (data.status === 'executed' || data.status === 'skipped') {
        setLastDecision('approve');
        setExecutedActionId((data.action_id as string | undefined) ?? action.id);
        setOutcomeRecorded(false);
        setNotice(approveSuccessFlash((data as { action_type?: string }).action_type ?? action.action_type, data.result));
        await load();
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Approve failed';
      if (shouldReconcileExecuteFailure(null, message)) {
        setNotice({
          kind: 'reconciled_stale_action',
          message: 'That directive was already handled or replaced. Showing your current state.',
        });
        await load();
        return;
      }
      setNotice({ kind: 'error', message });
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
          setNotice({
            kind: 'reconciled_stale_action',
            message: 'That directive was already handled or replaced. Showing your current state.',
          });
          await load();
          return;
        }
        setNotice({ kind: 'error', message });
        return;
      }
      if (data.status === 'executed' || data.status === 'skipped') {
        setLastDecision('skip');
        setExecutedActionId(null);
        setNotice({ kind: 'skip_snoozed', message: 'Snoozed. Foldera will adjust.' });
        await load();
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Skip failed';
      if (shouldReconcileExecuteFailure(null, message)) {
        setNotice({
          kind: 'reconciled_stale_action',
          message: 'That directive was already handled or replaced. Showing your current state.',
        });
        await load();
        return;
      }
      setNotice({ kind: 'error', message });
    } finally {
      setExecuting(false);
    }
  };

  const recordOutcome = useCallback(async (outcome: 'worked' | 'didnt_work') => {
    if (!executedActionId || outcomeRecorded) return;
    setOutcomeRecorded(true);
    try {
      await fetch('/api/conviction/outcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_id: executedActionId, outcome }),
      });
    } catch {
      /* best effort */
    }
  }, [executedActionId, outcomeRecorded]);

  const handleCopyLiveArtifact = useCallback(async () => {
    if (!action?.id) return;
    const artifact = action.artifact as ArtifactWithDraftedEmail | null | undefined;
    const normalized = normalizeArtifactForDashboard(artifact, action.action_type);
    const lines = [...normalized.meta];
    if (normalized.body.trim().length > 0) {
      if (lines.length > 0) lines.push('');
      lines.push(normalized.body);
    }
    const block = lines.join('\n').trim();
    if (block.length === 0) return;
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

  async function startStripeCheckout() {
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json().catch(() => ({}));
      if (data.url) window.location.href = data.url as string;
    } catch {
      setNotice({ kind: 'error', message: 'Could not open checkout right now.' });
    }
  }

  const sessionName = session?.user?.name?.trim() || 'Brandon';
  const firstName = sessionName.split(' ')[0] || 'Brandon';
  const currentAction = action;
  const artifact = currentAction?.artifact as ArtifactWithDraftedEmail | null | undefined;
  const normalizedArtifact = normalizeArtifactForDashboard(artifact, currentAction?.action_type);
  const normalizedBody = normalizedArtifact.body;
  const normalizedMeta = normalizedArtifact.meta;
  const hasNormalizedContent = normalizedMeta.length > 0 || normalizedBody.trim().length > 0;
  const isDocument = normalizedArtifact.label === 'FINISHED DOCUMENT';
  const isProArtifactUnlocked =
    subPlan === 'pro' && (subStatus === 'active' || subStatus === 'past_due' || subStatus === 'active_trial');
  const showArtifactBlur = Boolean(artifact) && !isProArtifactUnlocked && !freeArtifactRemaining;
  const desktopArtifactTitle = pixelLockArtifactTitle(artifact, currentAction?.action_type);
  const desktopArtifactBody = pixelLockArtifactBody(artifact);
  const desktopArtifactType =
    asTrimmedString(artifact?.type) ?? currentAction?.action_type ?? undefined;

  const hasLiveAction = Boolean(currentAction?.id);
  const cardDirective = currentAction?.directive ?? DEMO_DIRECTIVE;
  const cardWhyNow = currentAction?.reason ?? DEMO_WHY;
  const cardSourcePills =
    hasLiveAction && currentAction ? inferSourcePills(currentAction, artifact) : DEMO_SOURCE_PILLS;
  const cardStatusText = hasLiveAction ? normalizedArtifact.statusText : 'READY TO SEND';
  const cardNextStep = hasLiveAction ? normalizedArtifact.nextStep : 'Next: Await response';
  const draftLabel = hasLiveAction ? normalizedArtifact.label : 'DRAFT';

  const draftMetaBlock = normalizedMeta.length > 0 ? (
    <div className="mb-3 space-y-1">
      {normalizedMeta.map((line) => (
        <p key={line} className="text-[12px] uppercase tracking-[0.12em] text-cyan-400">
          {line}
        </p>
      ))}
    </div>
  ) : null;

  const draftBodyContent = (
    <>
      {draftMetaBlock}
      {normalizedBody.trim().length > 0 ? (
        normalizedArtifact.isMarkdown ? (
          <ReactMarkdown components={DOCUMENT_MARKDOWN_COMPONENTS}>{normalizedBody}</ReactMarkdown>
        ) : (
          <div className="whitespace-pre-line text-[15px] leading-7 text-gray-100">{normalizedBody}</div>
        )
      ) : (
        <p className="text-[15px] leading-7 text-gray-300">Artifact captured.</p>
      )}
    </>
  );

  const draftBody = hasLiveAction ? (
    showArtifactBlur ? (
      <div
        className="relative overflow-hidden rounded-[16px] border border-[#1b2530] bg-[#121820] p-4"
        data-testid="dashboard-pro-blur"
      >
        <div className="pointer-events-none select-none blur-[5px]">{draftBodyContent}</div>
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#07090dcc] px-6 text-center">
          <p className="max-w-[280px] text-base font-medium text-white">Upgrade to Pro to keep receiving finished work.</p>
          <button
            type="button"
            onClick={() => void startStripeCheckout()}
            className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-cyan-500 px-4 py-2 font-medium text-black"
          >
            Upgrade to Pro
          </button>
        </div>
      </div>
    ) : (
      <div
        className="max-h-[380px] overflow-y-auto rounded-[16px] border border-[#1b2530] bg-[#121820] p-4"
        data-testid={normalizedArtifact.isMarkdown ? 'dashboard-document-body' : undefined}
      >
        {draftBodyContent}
      </div>
    )
  ) : (
    <div className="whitespace-pre-line text-[15px] leading-7 text-gray-100">{demoDraft}</div>
  );

  const cardActions = isDocument
    ? [
        {
          label: 'Copy full text',
          kind: 'secondary' as const,
          onClick: () => void handleCopyLiveArtifact(),
          disabled: !hasLiveAction || !hasNormalizedContent,
        },
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
          onClick: () => void (hasLiveAction ? handleCopyLiveArtifact() : handleCopyFallbackDraft()),
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

  const noticeBanner = notice ? (
    <div
      className="border-b border-[#1a2530] bg-[#0d1419] px-4 py-3 sm:px-6"
      data-testid="dashboard-status-notice"
      data-status-id={notice.kind}
    >
      <p className="text-sm text-white">{notice.message}</p>
    </div>
  ) : null;

  const outcomeButtons = lastDecision === 'approve' && executedActionId && !outcomeRecorded ? (
    <div className="flex flex-wrap justify-center gap-3">
      <button
        type="button"
        onClick={() => void recordOutcome('worked')}
        className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-black"
      >
        It worked
      </button>
      <button
        type="button"
        onClick={() => void recordOutcome('didnt_work')}
        className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-[#1b2530] bg-[#0d1419] px-4 py-2 text-sm text-white"
      >
        Didn&apos;t work
      </button>
    </div>
  ) : null;

  if (isDesktop) {
    return (
      <div className="relative h-screen w-screen overflow-hidden bg-[#04080d] text-[#f3f7fa]">
        <FolderaDashboardPixelLock
          onCopyDraft={() => void (hasLiveAction ? handleCopyLiveArtifact() : handleCopyFallbackDraft())}
          onSnooze={() => void handleSkip()}
          onApprove={() => void handleApprove()}
          onUpgrade={() => void startStripeCheckout()}
          disableSnooze={!hasLiveAction || executing}
          disableApprove={!hasLiveAction || executing}
          artifactTitle={desktopArtifactTitle}
          artifactBody={desktopArtifactBody}
          artifactType={desktopArtifactType}
          showArtifactBlur={showArtifactBlur}
        />
        {notice ? (
          <div
            className="absolute bottom-6 left-1/2 z-30 w-[min(720px,92vw)] -translate-x-1/2 rounded-lg border border-[#1a2530] bg-[#0d1419f0] px-4 py-3"
            data-testid="dashboard-status-notice"
            data-status-id={notice.kind}
          >
            <p className="text-sm text-white">{notice.message}</p>
          </div>
        ) : null}
        {outcomeButtons ? (
          <div className="absolute bottom-20 left-1/2 z-30 -translate-x-1/2">{outcomeButtons}</div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0f14] text-[#f3f7fa]">
      {noticeBanner}
      <div className="mx-auto w-full max-w-[1140px] px-4 py-6">
        <p className="mb-1 text-sm uppercase tracking-wide text-gray-500">{getDateLabel()}</p>
        <h1 className="text-[clamp(2rem,4vw,2.5rem)] text-white">
          {getGreetingLabel()}, <span className="font-semibold">{firstName}.</span>
        </h1>

        <div className="mb-8 mt-6 flex flex-wrap items-center gap-8 text-sm text-gray-400">
          <span>5 open threads</span>
          <span>2 need attention</span>
          <span>1 ready to move</span>
        </div>

        <DailyBriefCard
          className="w-full"
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
      {outcomeButtons ? <div className="px-4 pb-8">{outcomeButtons}</div> : null}
    </div>
  );
}
