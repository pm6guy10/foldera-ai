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
}: PixelLockProps) {
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
