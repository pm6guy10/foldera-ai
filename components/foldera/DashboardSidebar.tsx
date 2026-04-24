'use client';

import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { BadgeHelp, BookCopy, ChevronDown, Link2, LogOut, Radar, ScrollText, Settings, Sparkles } from 'lucide-react';
import { SIGN_OUT_CALLBACK_URL } from '@/lib/auth/constants';
import { FolderaLogo } from '@/components/foldera/FolderaLogo';

const navItems = [
  { label: 'Executive Briefing', href: '/dashboard', icon: Sparkles },
  { label: 'Playbooks', href: '/dashboard/briefings', icon: BookCopy },
  { label: 'Signals', href: '/dashboard/signals', icon: Radar },
  { label: 'Audit Log', href: '/dashboard/briefings', icon: ScrollText },
  { label: 'Integrations', href: '/dashboard/settings', icon: Link2 },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
];

type DashboardSidebarProps = {
  activeLabel: string;
  userName: string;
};

export function DashboardSidebar({ activeLabel, userName }: DashboardSidebarProps) {
  return (
    <aside className="foldera-panel hidden min-h-[calc(100vh-3rem)] flex-col p-5 lg:flex">
      <FolderaLogo href="/dashboard" markSize="sm" />

      <nav className="mt-8 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.label === activeLabel;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex min-h-[52px] items-center gap-3 rounded-[16px] px-4 text-sm transition-colors ${
                isActive
                  ? 'border border-cyan-400/25 bg-white/[0.04] text-text-primary shadow-[inset_0_0_0_1px_rgba(34,211,238,0.12)]'
                  : 'text-text-secondary hover:bg-white/[0.03] hover:text-text-primary'
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? 'text-accent' : 'text-text-muted'}`} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-4">
        <div className="foldera-subpanel px-4 py-4">
          <div className="flex items-center gap-2 text-accent">
            <BadgeHelp className="h-4 w-4" />
            <p className="text-sm font-semibold">Upgrade to Pro</p>
          </div>
          <p className="mt-3 text-sm leading-7 text-text-muted">
            Unlock team features, custom playbooks, and enterprise integrations.
          </p>
          <Link href="/pricing" className="mt-4 inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary">
            Explore plans →
          </Link>
        </div>

        <div className="flex items-center justify-between rounded-[18px] border border-border bg-white/[0.02] px-3 py-3">
          <div>
            <p className="text-sm font-medium text-text-primary">{userName}</p>
            <p className="mt-1 text-xs text-text-muted">Workspace Owner</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: SIGN_OUT_CALLBACK_URL })}
              className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] border border-border bg-panel text-text-secondary hover:text-text-primary"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
            <ChevronDown className="h-4 w-4 text-text-muted" />
          </div>
        </div>
      </div>
    </aside>
  );
}
