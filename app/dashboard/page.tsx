'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useSession } from 'next-auth/react';

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
  action_type?: string;
  artifact?: DashboardArtifact | null;
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
  const [artifactPaywallLocked, setArtifactPaywallLocked] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [frame, setFrame] = useState<ImageRect>({ left: 0, top: 0, width: 0, height: 0 });

  const loadAbortRef = useRef<AbortController | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const hasWarnedResolutionRef = useRef(false);

  const load = useCallback(async () => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;

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
            return;
          }
          console.error(message);
          return;
        }

        await load();
      } catch (error) {
        const message = error instanceof Error ? error.message : `${decision} failed`;
        if (shouldReconcileExecuteFailure(null, message)) {
          await load();
          return;
        }
        console.error(message);
      } finally {
        setExecuting(false);
      }
    },
    [action, executing, load],
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

  const showArtifactBlur = Boolean(action?.artifact) && artifactPaywallLocked;
  const artifactTitle =
    asTrimmedString(action?.artifact?.title) ??
    asTrimmedString(action?.artifact?.subject) ??
    asTrimmedString(action?.artifact?.type) ??
    '';
  const artifactBody =
    asTrimmedString(action?.artifact?.body) ??
    asTrimmedString(action?.artifact?.text) ??
    asTrimmedString(action?.artifact?.content) ??
    '';

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
      { kind: 'button', label: 'Copy draft', rect: { left: 40.8, top: 85.9, width: 11.4, height: 5.3 }, onClick: () => void copyDraft() },
      {
        kind: 'button',
        label: 'Snooze 24h',
        rect: { left: 53.2, top: 85.9, width: 9.9, height: 5.3 },
        onClick: () => void runDecision('skip'),
        disabled: !action?.id || executing,
      },
      {
        kind: 'button',
        label: 'Approve & send',
        rect: { left: 63.6, top: 85.7, width: 13.8, height: 5.6 },
        onClick: () => void runDecision('approve'),
        disabled: !action?.id || executing,
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
  }, [action?.id, copyDraft, executing, runDecision, showArtifactBlur, startStripeCheckout]);

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
              style={{
                ...toAbsoluteRect(hotspot.rect, frame),
                pointerEvents: 'auto',
                background: 'transparent',
                border: 'none',
                opacity: 0,
                cursor: hotspot.disabled ? 'not-allowed' : 'pointer',
              }}
            />
          );
        })}
      </div>

      {showArtifactBlur ? (
        <div
          style={{
            position: 'absolute',
            left: `${frame.left + frame.width * 0.5}px`,
            top: `${frame.top + frame.height * 0.56}px`,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            color: '#ffffff',
            fontSize: '14px',
            fontWeight: 500,
            textAlign: 'center',
            textShadow: '0 1px 2px rgba(0,0,0,0.85)',
          }}
        >
          Upgrade to Pro to keep receiving finished work.
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
