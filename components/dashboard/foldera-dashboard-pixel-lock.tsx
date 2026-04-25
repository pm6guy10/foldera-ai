'use client';

import Image from 'next/image';
import Link from 'next/link';

type HotspotRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type PixelLockProps = {
  onCopyDraft?: () => void;
  onSnooze?: () => void;
  onApprove?: () => void;
  onUpgrade?: () => void;
  disableSnooze?: boolean;
  disableApprove?: boolean;
  artifactTitle?: string;
  artifactBody?: string;
  artifactType?: string;
  showArtifactBlur?: boolean;
};

function rectToStyle(rect: HotspotRect) {
  return {
    left: `${rect.left}%`,
    top: `${rect.top}%`,
    width: `${rect.width}%`,
    height: `${rect.height}%`,
  };
}

function HotspotButton({
  label,
  rect,
  onClick,
  disabled,
}: {
  label: string;
  rect: HotspotRect;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="absolute rounded-md bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 disabled:cursor-not-allowed"
      style={rectToStyle(rect)}
    />
  );
}

function HotspotLink({
  label,
  rect,
  href,
}: {
  label: string;
  rect: HotspotRect;
  href: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="absolute rounded-md bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
      style={rectToStyle(rect)}
    />
  );
}

export function FolderaDashboardPixelLock({
  onCopyDraft,
  onSnooze,
  onApprove,
  onUpgrade,
  disableSnooze = false,
  disableApprove = false,
  artifactTitle,
  artifactBody,
  artifactType,
  showArtifactBlur = false,
}: PixelLockProps) {
  const hasArtifactContent = Boolean((artifactTitle && artifactTitle.trim()) || (artifactBody && artifactBody.trim()));
  const artifactTypeLabel = artifactType ? artifactType.replace(/_/g, ' ').toUpperCase() : 'ARTIFACT';

  return (
    <div className="flex h-screen w-screen items-center justify-center overflow-hidden bg-[#04080d]">
      <div
        className="relative aspect-[1672/941] h-auto w-full max-w-[calc(100vh*1672/941)]"
        data-testid="pixel-lock-frame"
      >
        <Image
          src="/dashboard/Dashboard.png"
          alt="Foldera dashboard"
          fill
          priority
          unoptimized
          sizes="100vw"
          className="select-none object-contain"
          draggable={false}
        />

        <div
          className="absolute z-10 overflow-hidden rounded-[18px] border border-[#24323f] bg-[#0b1118e6] p-3 shadow-[0_16px_36px_rgba(0,0,0,0.45)]"
          style={rectToStyle({ left: 32.5, top: 43.5, width: 45.2, height: 39.5 })}
          data-testid="pixel-lock-artifact-overlay"
        >
          {hasArtifactContent ? (
            showArtifactBlur ? (
              <div className="relative h-full overflow-hidden rounded-[12px] border border-[#1f2a35] bg-[#0a0f14]">
                <div className="pointer-events-none h-full p-4 blur-[5px]">
                  {artifactTitle ? (
                    <h2 className="text-[15px] font-semibold tracking-[0.01em] text-white" data-testid="pixel-lock-artifact-title">
                      {artifactTitle}
                    </h2>
                  ) : null}
                  <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-cyan-400">{artifactTypeLabel}</p>
                  {artifactBody ? (
                    <div
                      className="mt-3 max-h-[calc(100%-52px)] overflow-y-auto whitespace-pre-line pr-1 text-[12px] leading-5 text-[#d9e2ea]"
                      data-testid="pixel-lock-artifact-body"
                    >
                      {artifactBody}
                    </div>
                  ) : null}
                </div>
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#07090dcc] px-6 text-center">
                  <p className="text-sm font-medium text-white">Upgrade to Pro to keep receiving finished work.</p>
                  <button
                    type="button"
                    onClick={onUpgrade}
                    className="mt-3 inline-flex min-h-[40px] items-center justify-center rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-black"
                  >
                    Upgrade to Pro
                  </button>
                </div>
              </div>
            ) : (
              <div className="h-full overflow-hidden rounded-[12px] border border-[#1f2a35] bg-[#0a0f14] p-4">
                {artifactTitle ? (
                  <h2 className="text-[15px] font-semibold tracking-[0.01em] text-white" data-testid="pixel-lock-artifact-title">
                    {artifactTitle}
                  </h2>
                ) : null}
                <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-cyan-400">{artifactTypeLabel}</p>
                {artifactBody ? (
                  <div
                    className="mt-3 max-h-[calc(100%-52px)] overflow-y-auto whitespace-pre-line pr-1 text-[12px] leading-5 text-[#d9e2ea]"
                    data-testid="pixel-lock-artifact-body"
                  >
                    {artifactBody}
                  </div>
                ) : null}
              </div>
            )
          ) : (
            <div className="flex h-full items-center justify-center rounded-[12px] border border-dashed border-[#2a3a47] bg-[#0a0f14] px-6 text-center text-[12px] uppercase tracking-[0.12em] text-[#7f8f9d]">
              Awaiting artifact
            </div>
          )}
        </div>

        <HotspotButton label="Search" rect={{ left: 71.5, top: 3.1, width: 21.4, height: 4.8 }} />
        <HotspotButton label="Notifications" rect={{ left: 94.6, top: 3.1, width: 2.9, height: 4.8 }} />

        <HotspotButton label="Copy draft" rect={{ left: 40.8, top: 85.9, width: 11.4, height: 5.3 }} onClick={onCopyDraft} />
        <HotspotButton
          label="Snooze 24h"
          rect={{ left: 53.2, top: 85.9, width: 9.9, height: 5.3 }}
          onClick={onSnooze}
          disabled={disableSnooze}
        />
        <HotspotButton
          label="Approve & send"
          rect={{ left: 63.6, top: 85.7, width: 13.8, height: 5.6 }}
          onClick={onApprove}
          disabled={disableApprove}
        />

        <HotspotButton label="Drop document" rect={{ left: 80.3, top: 66.0, width: 14.3, height: 17.5 }} />
        <HotspotButton label="Upgrade" rect={{ left: 1.4, top: 56.2, width: 13.1, height: 17.0 }} onClick={onUpgrade} />

        <HotspotLink label="Open Executive Briefing" href="/dashboard" rect={{ left: 1.2, top: 11.8, width: 13.6, height: 6.0 }} />
        <HotspotLink label="Open Playbooks" href="/dashboard/briefings" rect={{ left: 1.3, top: 18.5, width: 13.4, height: 5.2 }} />
        <HotspotLink label="Open Signals" href="/dashboard/signals" rect={{ left: 1.3, top: 24.8, width: 13.4, height: 5.2 }} />
        <HotspotLink label="Open Audit Log" href="/dashboard/briefings" rect={{ left: 1.3, top: 31.0, width: 13.4, height: 5.2 }} />
        <HotspotLink label="Open Integrations" href="/dashboard/settings" rect={{ left: 1.3, top: 37.2, width: 13.4, height: 5.2 }} />
        <HotspotLink label="Open Settings" href="/dashboard/settings" rect={{ left: 1.3, top: 43.4, width: 13.4, height: 5.2 }} />

        <HotspotLink label="Open profile settings" href="/dashboard/settings" rect={{ left: 1.2, top: 84.0, width: 14.0, height: 11.2 }} />
      </div>
    </div>
  );
}
