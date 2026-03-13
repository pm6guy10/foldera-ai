'use client';

import { cn } from '@/lib/design-system';
import { spacing } from '@/lib/design-system/spacing';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';
import { MobileNav } from './mobile-nav';
import { TrialBanner } from '@/components/dashboard/trial-banner';

interface DashboardShellProps {
  children: React.ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  return (
    <div className="min-h-screen bg-[#000] text-zinc-50">
      {/* Subtle grid pattern */}
      <div
        className="fixed inset-0 -z-10"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />
      
      <div className="flex">
        {/* Sidebar — hidden on mobile, visible on lg+ */}
        <Sidebar />

        {/* Main content — full width on mobile, offset by sidebar on lg+ */}
        <div className="flex-1 ml-0 lg:ml-64">
          <TrialBanner />
          <TopBar />
          {/* pb-20 on mobile = room for the fixed bottom tab bar */}
          <main className={cn(spacing.page.padding, spacing.page.maxWidth, 'pb-20 lg:pb-6')}>
            {children}
          </main>
        </div>
      </div>

      {/* Mobile bottom nav — only renders on < lg */}
      <MobileNav />
    </div>
  );
}

