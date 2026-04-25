'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useSession } from 'next-auth/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type DashboardArtifact = {
  type?: string;
  to?: string;
  recipient?: string;
  subject?: string;
  body?: string;
  text?: string;
  content?: string;
  [key: string]: unknown;
};

type DashboardAction = {
  id: string;
  directive?: string;
  action_type?: string;
  artifact?: DashboardArtifact | null;
};

type DashboardStatusNotice = {
  id: string;
  message: string;
};

type IntegrationStatusPayload = {
  integrations?: Array<{
    is_active?: boolean;
  }>;
};

type ImageRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type HotspotRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type HotspotButton = {
  kind: 'button';
  label: string;
  rect: HotspotRect;
  onClick: () => void;
  disabled?: boolean;
  visible?: boolean;
  testId?: string;
};

type HotspotLink = {
  kind: 'link';
  label: string;
  rect: HotspotRect;
  href: string;
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

function artifactClipboardText(action: DashboardAction | null): string {
  if (!action?.artifact || typeof action.artifact !== 'object') return '';
  const artifact = action.artifact;
  const lines: string[] = [];
  const to = asTrimmedString(artifact.to ?? artifact.recipient);
  const subject = asTrimmedString(artifact.subject);
  const body =
    asTrimmedString(artifact.body) ??
    asTrimmedString(artifact.text) ??
    asTrimmedString(artifact.content) ??
    '';

  if (to) lines.push(`To: ${to}`);
  if (subject) lines.push(`Subject: ${subject}`);
  if (lines.length > 0 && body) lines.push('');
  if (body) lines.push(body);

  if (lines.length > 0) return lines.join('\n');

  try {
    return JSON.stringify(artifact, null, 2);
  } catch {
    return '';
  }
}

function getArtifactBody(artifact: DashboardArtifact | null | undefined): string {
  return (
    asTrimmedString(artifact?.body) ??
    asTrimmedString(artifact?.text) ??
    asTrimmedString(artifact?.content) ??
    ''
  );
}

function isWriteDocumentAction(action: DashboardAction | null): boolean {
  return action?.action_type === 'write_document' || action?.artifact?.type === 'document';
}

function buildDecisionSuccessNotice(action: DashboardAction | null, decision: 'approve' | 'skip'): DashboardStatusNotice {
  if (decision === 'skip') {
    return {
      id: 'skip_snoozed',
      message: isWriteDocumentAction(action)
        ? 'Skipped. Foldera will adjust the next document.'
        : 'Snoozed. Foldera will adjust the next directive.',
    };
  }

  return isWriteDocumentAction(action)
    ? {
        id: 'approve_saved_document',
        message: 'Saved. Your document is in Foldera Signals.',
      }
    : {
        id: 'approve_sent',
        message: 'Sent. Check your outbox.',
      };
}

function toAbsoluteRect(rect: HotspotRect, frame: ImageRect): CSSProperties {
  return {
    position: 'absolute',
    left: `${(rect.left / 100) * frame.width}px`,
    top: `${(rect.top / 100) * frame.height}px`,
    width: `${(rect.width / 100) * frame.width}px`,
    height: `${(rect.height / 100) * frame.height}px`,
  };
}

export default function DashboardPage() {
  const { status } = useSession();

  const [action, setAction] = useState<DashboardAction | null>(null);
  const [loadingLatest, setLoadingLatest] = useState(true);
  const [hasActiveIntegration, setHasActiveIntegration] = useState(false);
  const [artifactPaywallLocked, setArtifactPaywallLocked] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [firstReadRunning, setFirstReadRunning] = useState(false);
  const [statusNotice, setStatusNotice] = useState<DashboardStatusNotice | null>(null);
  const [outcomeSubmitting, setOutcomeSubmitting] = useState<null | 'worked' | 'didnt_work'>(null);
  const [frame, setFrame] = useState<ImageRect>({ left: 0, top: 0, width: 0, height: 0 });

  const loadAbortRef = useRef<AbortController | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const hasWarnedResolutionRef = useRef(false);

  const load = useCallback(async () => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    setLoadingLatest(true);

    try {
      const latestRes = await fetch('/api/conviction/latest', { signal: controller.signal });

      if (controller.signal.aborted) return;

      if (!latestRes.ok) {
        setAction(null);
        setArtifactPaywallLocked(false);
        return;
      }

      const latest = await latestRes.json().catch(() => ({}));
      if (controller.signal.aborted) return;
      setAction(latest?.id ? (latest as DashboardAction) : null);
      setArtifactPaywallLocked(latest?.artifact_paywall_locked === true);
    } catch {
      if (controller.signal.aborted) return;
      setAction(null);
      setArtifactPaywallLocked(false);
    } finally {
      if (!controller.signal.aborted) {
        setLoadingLatest(false);
      }
    }
  }, []);

  const syncFrameAndResolution = useCallback(() => {
    const image = imageRef.current;
    if (!image) return;

    const naturalWidth = image.naturalWidth;
    const naturalHeight = image.naturalHeight;
    if (!naturalWidth || !naturalHeight) return;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const viewportRatio = viewportWidth / viewportHeight;
    const imageRatio = naturalWidth / naturalHeight;

    let width = viewportWidth;
    let height = viewportHeight;
    let left = 0;
    let top = 0;

    if (viewportRatio > imageRatio) {
      height = viewportHeight;
      width = height * imageRatio;
      left = (viewportWidth - width) / 2;
    } else {
      width = viewportWidth;
      height = width / imageRatio;
      top = (viewportHeight - height) / 2;
    }

    setFrame({ left, top, width, height });

    if (process.env.NODE_ENV !== 'production') {
      const requiredDisplayWidth = viewportWidth * window.devicePixelRatio;
      if (requiredDisplayWidth > naturalWidth) {
        if (!hasWarnedResolutionRef.current) {
          console.warn(
            'Dashboard PNG is below required resolution for this display. Export/generate a 3840px or 5120px version.',
          );
          hasWarnedResolutionRef.current = true;
        }
      } else {
        hasWarnedResolutionRef.current = false;
      }
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      void load();
    }

    return () => {
      loadAbortRef.current?.abort();
    };
  }, [load, status]);

  useEffect(() => {
    if (status !== 'authenticated') {
      setHasActiveIntegration(false);
      return;
    }

    let cancelled = false;
    void fetch('/api/integrations/status', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: IntegrationStatusPayload | null) => {
        if (cancelled) return;
        const integrations = Array.isArray(payload?.integrations) ? payload.integrations : [];
        setHasActiveIntegration(integrations.some((integration) => integration?.is_active === true));
      })
      .catch(() => {
        if (!cancelled) {
          setHasActiveIntegration(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [status]);

  useEffect(() => {
    const onResize = () => syncFrameAndResolution();
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [syncFrameAndResolution]);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('__next') ?? document.body.firstElementChild;

    const previousHtmlStyle = html.getAttribute('style');
    const previousBodyStyle = body.getAttribute('style');
    const previousRootStyle = root?.getAttribute('style') ?? null;

    html.style.margin = '0';
    html.style.width = '100%';
    html.style.height = '100%';
    html.style.overflow = 'hidden';
    html.style.background = '#02070d';

    body.style.margin = '0';
    body.style.width = '100%';
    body.style.height = '100%';
    body.style.overflow = 'hidden';
    body.style.background = '#02070d';

    if (root instanceof HTMLElement) {
      root.style.margin = '0';
      root.style.width = '100%';
      root.style.height = '100%';
      root.style.overflow = 'hidden';
      root.style.background = '#02070d';
    }

    return () => {
      if (previousHtmlStyle === null) html.removeAttribute('style');
      else html.setAttribute('style', previousHtmlStyle);

      if (previousBodyStyle === null) body.removeAttribute('style');
      else body.setAttribute('style', previousBodyStyle);

      if (root instanceof HTMLElement) {
        if (previousRootStyle === null) root.removeAttribute('style');
        else root.setAttribute('style', previousRootStyle);
      }
    };
  }, []);

  const runDecision = useCallback(
    async (decision: 'approve' | 'skip') => {
      if (!action || executing) return;
      setExecuting(true);

      try {
        const response = await fetch('/api/conviction/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action_id: action.id, decision }),
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          const message = (data as { error?: string }).error ?? `${decision} failed`;
          if (shouldReconcileExecuteFailure(response, message)) {
            await load();
            setStatusNotice({
              id: 'reconciled_stale_action',
              message: 'This directive was already handled or replaced. Foldera loaded the latest one.',
            });
            return;
          }
          console.error(message);
          return;
        }

        setStatusNotice(buildDecisionSuccessNotice(action, decision));
        await load();
      } catch (error) {
        const message = error instanceof Error ? error.message : `${decision} failed`;
        if (shouldReconcileExecuteFailure(null, message)) {
          await load();
          setStatusNotice({
            id: 'reconciled_stale_action',
            message: 'This directive was already handled or replaced. Foldera loaded the latest one.',
          });
          return;
        }
        console.error(message);
      } finally {
        setExecuting(false);
      }
    },
    [action, executing, load],
  );

  const submitOutcome = useCallback(
    async (outcome: 'worked' | 'didnt_work') => {
      if (!action?.id || outcomeSubmitting) return;
      setOutcomeSubmitting(outcome);
      try {
        await fetch('/api/conviction/outcome', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action_id: action.id, outcome }),
        });
      } catch (error) {
        console.error(error);
      } finally {
        setOutcomeSubmitting(null);
      }
    },
    [action?.id, outcomeSubmitting],
  );

  const startStripeCheckout = useCallback(async () => {
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => ({}));
      if (typeof payload?.url === 'string') {
        window.location.href = payload.url;
      }
    } catch (error) {
      console.error(error);
    }
  }, []);

  const copyDraft = useCallback(async () => {
    const text = artifactClipboardText(action);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error(error);
    }
  }, [action]);

  const runFirstReadNow = useCallback(async () => {
    if (firstReadRunning) return;
    setFirstReadRunning(true);
    setStatusNotice(null);

    try {
      const response = await fetch('/api/settings/run-brief?force=true&use_llm=true', {
        method: 'POST',
      });
      const payload = await response.json().catch(() => ({}));
      const spend = payload?.spend_policy as
        | { paid_llm_requested?: boolean; pipeline_dry_run?: boolean }
        | undefined;

      if (spend?.paid_llm_requested && spend?.pipeline_dry_run) {
        setStatusNotice({
          id: 'first_read_dry_run_disabled',
          message: 'First read is unavailable on this deployment right now.',
        });
        return;
      }

      if (!response.ok && !payload?.stages) {
        throw new Error(
          typeof payload?.error === 'string'
            ? payload.error
            : 'Could not run your first read right now.',
        );
      }

      await load();
      setStatusNotice({
        id: payload?.ok === true ? 'first_read_generated' : 'first_read_started',
        message:
          payload?.ok === true
            ? 'First read generated.'
            : 'First read ran. Foldera will surface the result as soon as it clears the bar.',
      });
    } catch (error) {
      setStatusNotice({
        id: 'first_read_failed',
        message:
          error instanceof Error ? error.message : 'Could not run your first read right now.',
      });
    } finally {
      setFirstReadRunning(false);
    }
  }, [firstReadRunning, load]);

  const writeDocument = isWriteDocumentAction(action);
  const showArtifactBlur = Boolean(action?.artifact) && artifactPaywallLocked;
  const actionControlsVisible = Boolean(action?.id);
  const artifactTitle =
    asTrimmedString(action?.directive) ??
    asTrimmedString(action?.artifact?.title) ??
    asTrimmedString(action?.artifact?.subject) ??
    asTrimmedString(action?.artifact?.type) ??
    '';
  const artifactBody = getArtifactBody(action?.artifact);
  const artifactTypeLabel = writeDocument
    ? 'FINISHED DOCUMENT'
    : action?.action_type === 'send_message'
      ? 'FOLLOW-UP EMAIL'
      : asTrimmedString(action?.artifact?.type)?.replace(/_/g, ' ').toUpperCase() ?? 'ARTIFACT';
  const copyActionLabel = writeDocument ? 'Copy full text' : 'Copy draft';
  const skipActionLabel = writeDocument ? 'Skip and adjust' : 'Snooze 24h';
  const primaryActionLabel = writeDocument ? 'Save document' : 'Approve & send';
  const showOutcomeActions = statusNotice?.id === 'approve_saved_document' || statusNotice?.id === 'approve_sent';

  const hotspots = useCallback((): Array<HotspotButton | HotspotLink> => {
    const shared: Array<HotspotButton | HotspotLink> = [
      { kind: 'link', label: 'Open Executive Briefing', href: '/dashboard', rect: { left: 1.2, top: 11.8, width: 13.6, height: 6.0 } },
      { kind: 'link', label: 'Open Playbooks', href: '/dashboard/briefings', rect: { left: 1.3, top: 18.5, width: 13.4, height: 5.2 } },
      { kind: 'link', label: 'Open Signals', href: '/dashboard/signals', rect: { left: 1.3, top: 24.8, width: 13.4, height: 5.2 } },
      { kind: 'link', label: 'Open Audit Log', href: '/dashboard/briefings', rect: { left: 1.3, top: 31.0, width: 13.4, height: 5.2 } },
      { kind: 'link', label: 'Open Integrations', href: '/dashboard/settings', rect: { left: 1.3, top: 37.2, width: 13.4, height: 5.2 } },
      { kind: 'link', label: 'Open Settings', href: '/dashboard/settings', rect: { left: 1.3, top: 43.4, width: 13.4, height: 5.2 } },
      { kind: 'link', label: 'Open profile settings', href: '/dashboard/settings', rect: { left: 1.2, top: 84.0, width: 14.0, height: 11.2 } },
      { kind: 'button', label: 'Search', rect: { left: 71.5, top: 3.1, width: 21.4, height: 4.8 }, onClick: () => {} },
      { kind: 'button', label: 'Notifications', rect: { left: 94.6, top: 3.1, width: 2.9, height: 4.8 }, onClick: () => {} },
      {
        kind: 'button',
        label: copyActionLabel,
        rect: { left: 40.8, top: 85.9, width: 11.4, height: 5.3 },
        onClick: () => void copyDraft(),
        disabled: !action?.id,
        visible: actionControlsVisible,
      },
      {
        kind: 'button',
        label: skipActionLabel,
        rect: { left: 53.2, top: 85.9, width: 9.9, height: 5.3 },
        onClick: () => void runDecision('skip'),
        disabled: !action?.id || executing,
        visible: actionControlsVisible,
      },
      {
        kind: 'button',
        label: primaryActionLabel,
        rect: { left: 63.6, top: 85.7, width: 13.8, height: 5.6 },
        onClick: () => void runDecision('approve'),
        disabled: !action?.id || executing,
        visible: actionControlsVisible,
        testId: 'dashboard-primary-action',
      },
      { kind: 'button', label: 'Drop document', rect: { left: 80.3, top: 66.0, width: 14.3, height: 17.5 }, onClick: () => {} },
    ];

    if (showArtifactBlur) {
      shared.push({
        kind: 'button',
        label: 'Upgrade to Pro',
        rect: { left: 1.4, top: 56.2, width: 13.1, height: 17.0 },
        onClick: () => void startStripeCheckout(),
      });
    }

    return shared;
  }, [
    action?.id,
    actionControlsVisible,
    copyActionLabel,
    copyDraft,
    executing,
    primaryActionLabel,
    runDecision,
    showArtifactBlur,
    skipActionLabel,
    startStripeCheckout,
  ]);

  return (
    <main
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        margin: 0,
        overflow: 'hidden',
        background: '#02070d',
      }}
      data-testid="pixel-lock-frame"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- Pixel-lock dashboard requires exact PNG shell fidelity */}
      <img
        ref={imageRef}
        src="/Dashboard.png"
        alt="Foldera dashboard"
        onLoad={syncFrameAndResolution}
        draggable={false}
        style={{
          width: '100vw',
          height: '100vh',
          objectFit: 'contain',
          objectPosition: 'center',
          display: 'block',
          userSelect: 'none',
          background: '#02070d',
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: `${frame.left}px`,
          top: `${frame.top}px`,
          width: `${frame.width}px`,
          height: `${frame.height}px`,
          pointerEvents: 'none',
        }}
        aria-hidden={false}
      >
        {hotspots().map((hotspot) => {
          if (hotspot.kind === 'link') {
            return (
              <a
                key={hotspot.label}
                href={hotspot.href}
                aria-label={hotspot.label}
                title={hotspot.label}
                style={{
                  ...toAbsoluteRect(hotspot.rect, frame),
                  pointerEvents: 'auto',
                  background: 'transparent',
                  border: 'none',
                  opacity: 0,
                }}
              />
            );
          }

          return (
            <button
              key={hotspot.label}
              type="button"
              aria-label={hotspot.label}
              title={hotspot.label}
              onClick={hotspot.onClick}
              disabled={hotspot.disabled}
              data-testid={hotspot.testId}
              aria-hidden={hotspot.visible ? undefined : true}
              style={{
                ...toAbsoluteRect(hotspot.rect, frame),
                pointerEvents: 'auto',
                display: hotspot.visible ? 'flex' : 'block',
                alignItems: hotspot.visible ? 'center' : undefined,
                justifyContent: hotspot.visible ? 'center' : undefined,
                background: hotspot.visible
                  ? 'linear-gradient(180deg, rgba(20,34,45,0.96) 0%, rgba(10,18,24,0.98) 100%)'
                  : 'transparent',
                border: hotspot.visible ? '1px solid rgba(57, 227, 237, 0.28)' : 'none',
                borderRadius: hotspot.visible ? '12px' : undefined,
                boxShadow: hotspot.visible ? '0 14px 30px rgba(0,0,0,0.32)' : undefined,
                color: hotspot.visible ? '#e6faff' : 'transparent',
                fontSize: hotspot.visible ? '13px' : 0,
                fontWeight: hotspot.visible ? 600 : 400,
                letterSpacing: hotspot.visible ? '0.01em' : undefined,
                opacity: hotspot.visible ? 1 : 0,
                whiteSpace: hotspot.visible ? 'nowrap' : undefined,
                cursor: hotspot.disabled ? 'not-allowed' : 'pointer',
              }}
            >
              {hotspot.visible ? hotspot.label : null}
            </button>
          );
        })}
      </div>

      {action ? (
        <section
          style={{
            position: 'absolute',
            left: `${frame.left + frame.width * 0.325}px`,
            top: `${frame.top + frame.height * 0.435}px`,
            width: `${frame.width * 0.452}px`,
            height: `${frame.height * 0.395}px`,
            padding: '18px 18px 14px',
            borderRadius: '22px',
            border: '1px solid rgba(57, 227, 237, 0.16)',
            background: 'rgba(8, 14, 20, 0.82)',
            boxShadow: '0 22px 48px rgba(0,0,0,0.45)',
            overflow: 'hidden',
            pointerEvents: 'none',
            opacity: showArtifactBlur ? 0.18 : 1,
          }}
        >
          <p
            style={{
              margin: 0,
              color: '#54dae9',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
            }}
          >
            {artifactTypeLabel}
          </p>
          {artifactTitle ? (
            <h1
              style={{
                margin: '8px 0 0',
                color: '#f3fbff',
                fontSize: '22px',
                lineHeight: 1.28,
                fontWeight: 650,
              }}
            >
              {artifactTitle}
            </h1>
          ) : null}
          <div
            data-testid="dashboard-document-body"
            style={{
              marginTop: '14px',
              maxHeight: 'calc(100% - 88px)',
              overflowY: 'auto',
              paddingRight: '8px',
              color: '#d6e6ee',
              fontSize: '13px',
              lineHeight: 1.55,
            }}
          >
            {writeDocument ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h2: ({ children }) => (
                    <h2
                      style={{
                        margin: '14px 0 6px',
                        color: '#f0fbff',
                        fontSize: '14px',
                        fontWeight: 700,
                      }}
                    >
                      {children}
                    </h2>
                  ),
                  p: ({ children }) => <p style={{ margin: '0 0 10px' }}>{children}</p>,
                  ul: ({ children }) => <ul style={{ margin: '0 0 10px', paddingLeft: '20px' }}>{children}</ul>,
                  li: ({ children }) => <li style={{ marginBottom: '6px' }}>{children}</li>,
                }}
              >
                {artifactBody}
              </ReactMarkdown>
            ) : (
              <div style={{ whiteSpace: 'pre-line' }}>{artifactBody}</div>
            )}
          </div>
        </section>
      ) : null}

      {!loadingLatest && !action ? (
        <section
          data-testid="dashboard-empty-state"
          style={{
            position: 'absolute',
            left: `${frame.left + frame.width * 0.353}px`,
            top: `${frame.top + frame.height * 0.474}px`,
            width: `${frame.width * 0.395}px`,
            minHeight: `${frame.height * 0.215}px`,
            padding: '20px 22px',
            borderRadius: '24px',
            border: '1px solid rgba(84, 218, 233, 0.16)',
            background: 'rgba(8, 14, 20, 0.9)',
            boxShadow: '0 22px 48px rgba(0,0,0,0.45)',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '999px',
              margin: '0 auto 14px',
              background: '#54dae9',
              boxShadow: '0 0 18px rgba(84, 218, 233, 0.4)',
            }}
          />
          <p
            style={{
              margin: 0,
              color: '#f3fbff',
              fontSize: '18px',
              fontWeight: 600,
              lineHeight: 1.35,
            }}
          >
            You&apos;re set until tomorrow morning.
          </p>
          <p
            style={{
              margin: '10px 0 0',
              color: '#9eb0b8',
              fontSize: '13px',
              lineHeight: 1.55,
            }}
          >
            No directive is queued in the app right now. Your next read still lands in email.
            {!hasActiveIntegration ? ' Connect accounts in Settings if you want deeper context.' : ''}
          </p>
          {hasActiveIntegration ? (
            <button
              type="button"
              onClick={() => void runFirstReadNow()}
              disabled={firstReadRunning}
              data-testid="dashboard-run-first-read"
              style={{
                marginTop: '16px',
                minWidth: '208px',
                minHeight: '46px',
                padding: '0 16px',
                borderRadius: '14px',
                border: 'none',
                background: '#f4fbff',
                color: '#031019',
                fontSize: '11px',
                fontWeight: 800,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                cursor: firstReadRunning ? 'wait' : 'pointer',
                opacity: firstReadRunning ? 0.65 : 1,
              }}
            >
              {firstReadRunning ? 'Running first read' : 'Run first read now'}
            </button>
          ) : null}
        </section>
      ) : null}

      {showArtifactBlur ? (
        <div
          data-testid="dashboard-pro-blur"
          style={{
            position: 'absolute',
            left: `${frame.left + frame.width * 0.5}px`,
            top: `${frame.top + frame.height * 0.56}px`,
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
          }}
        >
          <p
            style={{
              margin: 0,
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 500,
              textShadow: '0 1px 2px rgba(0,0,0,0.85)',
            }}
          >
            Upgrade to Pro to keep receiving finished work.
          </p>
          <button
            type="button"
            onClick={() => void startStripeCheckout()}
            style={{
              marginTop: '10px',
              pointerEvents: 'auto',
              minWidth: '132px',
              padding: '10px 14px',
              borderRadius: '12px',
              border: '1px solid rgba(84, 218, 233, 0.24)',
              background: 'linear-gradient(180deg, #67f1ff 0%, #31d6e6 100%)',
              color: '#041118',
              fontSize: '13px',
              fontWeight: 700,
              boxShadow: '0 16px 28px rgba(0,0,0,0.3)',
              cursor: 'pointer',
            }}
          >
            Upgrade to Pro
          </button>
        </div>
      ) : null}

      {statusNotice ? (
        <div
          data-testid="dashboard-status-notice"
          data-status-id={statusNotice.id}
          style={{
            position: 'absolute',
            left: `${frame.left + frame.width * 0.325}px`,
            top: `${frame.top + frame.height * 0.845}px`,
            width: `${frame.width * 0.452}px`,
            padding: '10px 14px',
            borderRadius: '14px',
            border: '1px solid rgba(73, 217, 176, 0.28)',
            background: 'rgba(10, 24, 20, 0.92)',
            color: '#d8fbec',
            fontSize: '13px',
            fontWeight: 500,
            boxShadow: '0 16px 32px rgba(0,0,0,0.28)',
            pointerEvents: 'none',
          }}
        >
          {statusNotice.message}
        </div>
      ) : null}

      {showOutcomeActions && action?.id ? (
        <div
          style={{
            position: 'absolute',
            left: `${frame.left + frame.width * 0.725}px`,
            top: `${frame.top + frame.height * 0.744}px`,
            display: 'flex',
            gap: '8px',
          }}
        >
          <button
            type="button"
            onClick={() => void submitOutcome('worked')}
            disabled={Boolean(outcomeSubmitting)}
            style={{
              minWidth: '94px',
              padding: '8px 12px',
              borderRadius: '12px',
              border: '1px solid rgba(84, 218, 233, 0.22)',
              background: 'rgba(11, 20, 27, 0.94)',
              color: '#f3fbff',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            It worked
          </button>
          <button
            type="button"
            onClick={() => void submitOutcome('didnt_work')}
            disabled={Boolean(outcomeSubmitting)}
            style={{
              minWidth: '112px',
              padding: '8px 12px',
              borderRadius: '12px',
              border: '1px solid rgba(84, 218, 233, 0.22)',
              background: 'rgba(11, 20, 27, 0.94)',
              color: '#f3fbff',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            Didn&apos;t work
          </button>
        </div>
      ) : null}

      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          pointerEvents: 'none',
          opacity: 0,
        }}
      >
        {artifactTitle ? <p data-testid="pixel-lock-artifact-title">{artifactTitle}</p> : null}
        {artifactBody ? <p data-testid="pixel-lock-artifact-body">{artifactBody}</p> : null}
      </div>
    </main>
  );
}
