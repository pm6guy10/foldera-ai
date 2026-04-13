'use client';

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';

import { SIGN_OUT_CALLBACK_URL } from '@/lib/auth/constants';
import { cn } from '@/lib/design-system';
import { spacing } from '@/lib/design-system/spacing';
import { TrialBanner } from '@/components/dashboard/trial-banner';

interface DashboardShellProps {
  children: React.ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const { data: session, status } = useSession();
  const showChrome = status === 'authenticated';

  return (
    <div className="min-h-screen bg-[#000] text-zinc-50">
      {showChrome ? (
        <div className="flex flex-col min-h-screen">
          <TrialBanner />
          {/* Minimal header: logo + sign out */}
          <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-xl">
            <div className="flex items-center justify-between h-14 px-6 max-w-3xl mx-auto w-full">
              <Link href="/dashboard" className="flex items-center gap-3">
                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center">
                  <span className="text-white font-bold text-xs">F</span>
                </div>
                <span className="text-zinc-50 font-semibold text-sm tracking-tight">Foldera</span>
              </Link>
              <div className="flex items-center gap-4">
                <Link
                  href="/dashboard/settings"
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Settings
                </Link>
                <button
                  onClick={() => signOut({ callbackUrl: SIGN_OUT_CALLBACK_URL })}
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Sign out
                </button>
              </div>
            </div>
          </header>

          <main className={cn(spacing.page.padding, 'max-w-3xl mx-auto w-full py-8')}>
            {children}
          </main>
        </div>
      ) : (
        <main className={cn(spacing.page.padding, spacing.page.maxWidth, 'pb-10')}>
          {children}
        </main>
      )}
    </div>
  );
}

