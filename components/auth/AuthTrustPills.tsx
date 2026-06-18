import React from 'react';

export function AuthTrustPills() {
  return (
    <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
      <div className="flex items-center gap-3 rounded-full border border-white/5 bg-white/[0.02] px-4 py-2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent/80">
          <path d="M2 12C2 12 5 5 12 5C19 5 22 12 22 12C22 12 19 19 12 19C5 19 2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <span className="text-xs font-medium text-white/60">Reads to prepare one move</span>
      </div>
      <div className="flex items-center gap-3 rounded-full border border-white/5 bg-white/[0.02] px-4 py-2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent/80">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
        <span className="text-xs font-medium text-white/60">Never sends without permission</span>
      </div>
    </div>
  );
}
