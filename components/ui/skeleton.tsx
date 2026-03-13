'use client';

import { cn } from '@/lib/design-system';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
}

export function Skeleton({
  className,
  variant = 'text',
  width,
  height,
}: SkeletonProps) {
  const baseStyles = 'animate-pulse bg-zinc-800';

  const variantStyles = {
    text:        'rounded h-4',
    circular:    'rounded-full',
    rectangular: 'rounded-xl',
  };

  const style = {
    width:  width  ? (typeof width  === 'number' ? `${width}px`  : width)  : undefined,
    height: height ? (typeof height === 'number' ? `${height}px` : height) : undefined,
  };

  return (
    <div
      className={cn(baseStyles, variantStyles[variant], className)}
      style={style}
    />
  );
}

// ─── Generic patterns ──────────────────────────────────────────────────────

export function SkeletonCard() {
  return (
    <div className="p-5 space-y-4 bg-zinc-900 rounded-xl border border-zinc-800">
      <div className="flex items-center gap-3">
        <Skeleton variant="circular" width={40} height={40} />
        <div className="space-y-2 flex-1">
          <Skeleton width="60%" />
          <Skeleton width="40%" className="h-3" />
        </div>
      </div>
      <Skeleton className="h-20" variant="rectangular" />
      <div className="flex gap-2">
        <Skeleton width={80} className="h-8" variant="rectangular" />
        <Skeleton width={80} className="h-8" variant="rectangular" />
      </div>
    </div>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4 bg-zinc-900 rounded-xl border border-zinc-800">
          <Skeleton variant="circular" width={32} height={32} />
          <div className="flex-1 space-y-2">
            <Skeleton width="70%" />
            <Skeleton width="50%" className="h-3" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Dashboard-specific skeletons — zero layout shift ────────────────────

/** Matches the 3-column stats strip in signals/relationships pages */
export function SkeletonStatStrip() {
  return (
    <div className="grid grid-cols-3 gap-3 mb-8">
      {[0, 1, 2].map(i => (
        <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <Skeleton className="h-7 w-16 mb-1" variant="rectangular" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

/** Matches the signals/activity page layout */
export function SkeletonSignalsPage() {
  return (
    <div className="max-w-3xl mx-auto animate-pulse">
      {/* Header */}
      <div className="mb-8 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-zinc-800" />
        <div className="space-y-2">
          <div className="h-6 w-32 bg-zinc-800 rounded" />
          <div className="h-3 w-64 bg-zinc-800 rounded" />
        </div>
      </div>

      {/* Stats strip */}
      <SkeletonStatStrip />

      {/* Content block */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <div className="h-3 w-24 bg-zinc-800 rounded mb-6" />
        <div className="space-y-5">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-lg bg-zinc-800 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-24 bg-zinc-800 rounded" />
                <div className="h-1.5 bg-zinc-800 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Matches the relationships page layout */
export function SkeletonRelationshipsPage() {
  return (
    <div className="max-w-3xl mx-auto animate-pulse">
      {/* Header */}
      <div className="mb-8 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-zinc-800" />
        <div className="space-y-2">
          <div className="h-6 w-40 bg-zinc-800 rounded" />
          <div className="h-3 w-72 bg-zinc-800 rounded" />
        </div>
      </div>

      {/* Relationship rows */}
      <div className="space-y-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-zinc-800 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 bg-zinc-800 rounded" />
              <div className="h-3 w-48 bg-zinc-800 rounded" />
            </div>
            <div className="h-4 w-10 bg-zinc-800 rounded shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Matches the settings page while integrations are loading */
export function SkeletonSettingsPage() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Header */}
      <div className="space-y-2">
        <div className="h-8 w-32 bg-zinc-800 rounded" />
        <div className="h-4 w-48 bg-zinc-800 rounded" />
      </div>

      {/* Connector cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[0, 1].map(i => (
          <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-zinc-800 rounded-lg" />
                <div className="space-y-2">
                  <div className="h-4 w-20 bg-zinc-800 rounded" />
                  <div className="h-3 w-28 bg-zinc-800 rounded" />
                </div>
              </div>
              <div className="h-6 w-20 bg-zinc-800 rounded-full" />
            </div>
            <div className="h-10 bg-zinc-800 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
