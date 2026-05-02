'use client';

import { useState } from 'react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import {
  ChevronDown,
  Link2,
  LogOut,
  Mail,
  Radar,
  ScrollText,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { SIGN_OUT_CALLBACK_URL } from '@/lib/auth/constants';
import { FolderaLogo } from '@/components/foldera/FolderaLogo';

export type DashboardPanelKey =
  | 'briefing'
  | 'playbooks'
  | 'signals'
  | 'audit-log'
  | 'integrations'
  | 'settings';

export type DashboardNavItem = {
  panel: DashboardPanelKey;
  label: string;
  href: string;
  icon: LucideIcon;
};

export const DASHBOARD_NAV_ITEMS: DashboardNavItem[] = [
  { panel: 'briefing', label: 'Executive Briefing', href: '/dashboard', icon: Mail },
  { panel: 'signals', label: 'Signals', href: '/dashboard?panel=signals', icon: Radar },
  { panel: 'audit-log', label: 'Audit Log', href: '/dashboard?panel=audit-log', icon: ScrollText },
  { panel: 'integrations', label: 'Integrations', href: '/dashboard?panel=integrations', icon: Link2 },
  { panel: 'settings', label: 'Settings', href: '/dashboard/settings', icon: Settings },
];

type DashboardSidebarProps = {
  activeLabel: string;
  userName: string;
  variant?: 'default' | 'stage';
  preview?: boolean;
  appShell?: boolean;
  activePanel?: DashboardPanelKey;
  onSelectPanel?: (panel: DashboardPanelKey) => void;
};

export function DashboardSidebar({
  activeLabel,
  userName,
  variant = 'default',
  preview = false,
  appShell = false,
  activePanel,
  onSelectPanel,
}: DashboardSidebarProps) {
  const [accountOpen, setAccountOpen] = useState(false);
  const initial = userName.trim().charAt(0).toUpperCase() || 'F';
  const sidebarUsesPanelButtons = appShell && typeof onSelectPanel === 'function';

  if (variant === 'stage') {
    return (
      <aside className="foldera-dashboard-stage-sidebar absolute left-0 top-0 h-[1152px] w-[304px]">
        <div className="absolute left-[42px] top-[48px]">
          <FolderaLogo href="/dashboard" markSize="sm" />
        </div>

        <nav className="absolute left-[20px] top-[128px] w-[264px] space-y-1.5">
          {DASHBOARD_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = sidebarUsesPanelButtons
              ? item.panel === activePanel
              : item.label === activeLabel;
            const classes = `foldera-dashboard-nav-item ${isActive ? 'is-active' : ''} flex w-full items-center gap-3 rounded-[14px] px-4 text-[18px] leading-none transition-colors ${
              isActive
                ? 'h-[52px] border border-white/12 bg-white/[0.055] text-text-primary'
                : 'h-[44px] border border-transparent text-text-secondary hover:bg-white/[0.03] hover:text-text-primary'
            }`;

            return preview ? (
              <div key={item.label} className={classes}>
                <Icon className={`h-[16px] w-[16px] ${isActive ? 'text-text-primary' : 'text-text-muted'}`} aria-hidden="true" />
                <span>{item.label}</span>
              </div>
            ) : sidebarUsesPanelButtons ? (
              <button
                key={item.label}
                type="button"
                className={classes}
                data-panel={item.panel}
                data-testid={`dashboard-sidebar-item-${item.panel}`}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onSelectPanel(item.panel)}
              >
                <Icon className={`h-[16px] w-[16px] ${isActive ? 'text-text-primary' : 'text-text-muted'}`} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            ) : (
              <Link key={item.label} href={item.href} className={classes}>
                <Icon className={`h-[16px] w-[16px] ${isActive ? 'text-text-primary' : 'text-text-muted'}`} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="foldera-dashboard-account absolute left-[22px] top-[974px] h-[86px] w-[260px] rounded-[16px] border border-border bg-white/[0.02] px-3 py-3">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-600 to-slate-900 text-sm font-semibold text-white"
              aria-hidden
            >
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text-primary">{userName}</p>
              <p className="mt-0.5 text-xs text-text-muted">Signed in</p>
            </div>
            <button
              type="button"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-border bg-panel text-text-muted hover:text-text-primary"
              aria-expanded={accountOpen}
              aria-haspopup={preview ? undefined : 'menu'}
              aria-label="Account menu"
              onClick={() => {
                if (!preview) setAccountOpen((open) => !open);
              }}
              disabled={preview}
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${accountOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>
          {accountOpen && !preview ? (
            <div
              className="foldera-dashboard-account-menu absolute bottom-full left-0 right-0 z-20 mb-2 rounded-[14px] border border-border bg-panel p-2 shadow-lg"
              role="menu"
            >
              <Link
                href="/dashboard/settings"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-sm text-text-secondary hover:bg-white/[0.04] hover:text-text-primary"
              >
                <Settings className="h-4 w-4" aria-hidden />
                Settings
              </Link>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-sm text-text-secondary hover:bg-white/[0.04] hover:text-text-primary"
                onClick={() => void signOut({ callbackUrl: SIGN_OUT_CALLBACK_URL })}
              >
                <LogOut className="h-4 w-4" aria-hidden />
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </aside>
    );
  }

  return (
    <aside className="foldera-panel foldera-dashboard-sidebar hidden h-[calc(100vh-2rem)] min-h-[calc(100vh-2rem)] flex-col p-4 lg:sticky lg:top-4 lg:flex">
      <FolderaLogo href="/dashboard" markSize="sm" />

      <nav className="foldera-dashboard-nav mt-7 space-y-1">
        {DASHBOARD_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = sidebarUsesPanelButtons
            ? item.panel === activePanel
            : item.label === activeLabel;
          const classes = `foldera-dashboard-nav-item ${isActive ? 'is-active' : ''} flex min-h-[44px] items-center gap-3 rounded-[14px] px-3.5 text-[13px] transition-colors ${
            isActive
              ? 'border border-white/12 bg-white/[0.055] text-text-primary'
              : 'border border-transparent text-text-secondary hover:bg-white/[0.03] hover:text-text-primary'
          }`;

          return preview ? (
            <div key={item.label} className={classes}>
              <Icon className={`h-4 w-4 ${isActive ? 'text-text-primary' : 'text-text-muted'}`} aria-hidden="true" />
              <span>{item.label}</span>
            </div>
          ) : sidebarUsesPanelButtons ? (
            <button
              key={item.label}
              type="button"
              className={classes}
              data-panel={item.panel}
              data-testid={`dashboard-sidebar-item-${item.panel}`}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onSelectPanel(item.panel)}
            >
              <Icon className={`h-4 w-4 ${isActive ? 'text-text-primary' : 'text-text-muted'}`} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          ) : (
            <Link key={item.label} href={item.href} className={classes}>
              <Icon className={`h-4 w-4 ${isActive ? 'text-text-primary' : 'text-text-muted'}`} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-4 pt-6">
        <div className="foldera-dashboard-account relative rounded-[18px] border border-border bg-white/[0.02] px-3 py-3">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-600 to-slate-900 text-sm font-semibold text-white"
              aria-hidden
            >
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text-primary">{userName}</p>
              <p className="mt-0.5 text-xs text-text-muted">Signed in</p>
            </div>
            <button
              type="button"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-border bg-panel text-text-muted hover:text-text-primary"
              aria-expanded={accountOpen}
              aria-haspopup={preview ? undefined : 'menu'}
              aria-label="Account menu"
              onClick={() => {
                if (!preview) setAccountOpen((open) => !open);
              }}
              disabled={preview}
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${accountOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>
          {accountOpen && !preview ? (
            <div
              className="foldera-dashboard-account-menu absolute bottom-full left-0 right-0 z-20 mb-2 rounded-[14px] border border-border bg-panel p-2 shadow-lg"
              role="menu"
            >
              <Link
                href="/dashboard/settings"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-sm text-text-secondary hover:bg-white/[0.04] hover:text-text-primary"
              >
                <Settings className="h-4 w-4" aria-hidden />
                Settings
              </Link>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-sm text-text-secondary hover:bg-white/[0.04] hover:text-text-primary"
                onClick={() => void signOut({ callbackUrl: SIGN_OUT_CALLBACK_URL })}
              >
                <LogOut className="h-4 w-4" aria-hidden />
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
