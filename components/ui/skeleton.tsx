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
    text: 'rounded h-4',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  };
  
  const style = {
    width: width ? (typeof width === 'number' ? `${width}px` : width) : undefined,
    height: height ? (typeof height === 'number' ? `${height}px` : height) : undefined,
  };
  
  return (
    <div 
      className={cn(baseStyles, variantStyles[variant], className)}
      style={style}
    />
  );
}

// Pre-built skeleton patterns
export function SkeletonCard() {
  return (
    <div className="p-6 space-y-4 bg-zinc-900/80 rounded-xl border border-zinc-800">
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
        <div key={i} className="flex items-center gap-3 p-4 bg-zinc-900/50 rounded-lg">
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

