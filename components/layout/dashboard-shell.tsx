'use client';

import { cn } from '@/lib/design-system';
import { spacing } from '@/lib/design-system/spacing';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';

interface DashboardShellProps {
  children: React.ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      {/* Gradient background */}
      <div className="fixed inset-0 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 -z-10" />
      
      {/* Subtle grid pattern */}
      <div 
        className="fixed inset-0 -z-10 opacity-[0.02]"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgb(255 255 255 / 0.1) 1px, transparent 1px),
            linear-gradient(to bottom, rgb(255 255 255 / 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '64px 64px',
        }}
      />
      
      <div className="flex">
        {/* Sidebar */}
        <Sidebar />
        
        {/* Main content */}
        <div className="flex-1 ml-64">
          <TopBar />
          <main className={cn(spacing.page.padding, spacing.page.maxWidth)}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

