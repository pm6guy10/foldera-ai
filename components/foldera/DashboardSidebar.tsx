'use client';

import { useState } from 'react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import {
  Activity,
  ChevronDown,
  History,
  Inbox,
  LayoutGrid,
  Link2,
  LogOut,
  Menu,
  Settings2,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { SIGN_OUT_CALLBACK_URL } from '@/lib/auth/constants';
import { FolderaLogo } from '@/components/foldera/FolderaLogo';

export type DashboardPanelKey =
  | 'today'
  | 'history'
  | 'sources'
  | 'account';

export type DashboardNavItem = {
  panel: DashboardPanelKey;
  label: string;
  href: string;
  icon: LucideIcon;
};

export const DASHBOARD_NAV_ITEMS: DashboardNavItem[] = [
  { panel: 'today', label: 'Today', href: '/dashboard', icon: Inbox },
  { panel: 'history', label: 'Recent Work', href: '/dashboard?panel=history', icon: History },
  { panel: 'sources', label: 'Sources', href: '/dashboard?panel=sources', icon: Link2 },
  { panel: 'account', label: 'Account', href: '/dashboard?panel=account', icon: UserRound },
];

const DASHBOARD_STAGE_NAV_ITEMS: Array<
  | { kind: 'panel'; panel: DashboardPanelKey; label: string; href: string; icon: LucideIcon }
  | { kind: 'link'; label: string; href: string; icon: LucideIcon }
> = [
  { kind: 'panel', panel: 'today', label: 'Executive Briefing', href: '/dashboard', icon: Inbox },
  { kind: 'link', label: 'Playbooks', href: '/dashboard/playbooks', icon: LayoutGrid },
  { kind: 'link', label: 'Signals', href: '/dashboard/signals', icon: Activity },
  { kind: 'panel', panel: 'history', label: 'Audit Log', href: '/dashboard?panel=history', icon: History },
  { kind: 'panel', panel: 'sources', label: 'Integrations', href: '/dashboard?panel=sources', icon: Link2 },
  { kind: 'panel', panel: 'account', label: 'Settings', href: '/dashboard?panel=account', icon: Settings2 },
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

type DashboardMobileNavProps = {
  activeLabel: string;
  userName: string;
  activePanel: DashboardPanelKey;
  onSelectPanel: (panel: DashboardPanelKey) => void;
  compact?: boolean;
};

export function DashboardMobileNav({
  activeLabel,
  userName,
  activePanel,
  onSelectPanel,
  compact = false,
}: DashboardMobileNavProps) {
  const [open, setOpen] = useState(false);
  const initial = userName.trim().charAt(0).toUpperCase() || 'F';
  const activeItem = DASHBOARD_NAV_ITEMS.find((item) => item.panel === activePanel);
  const ActiveIcon = activeItem?.icon ?? Inbox;

  const menuContents = (
    <div
      id="dashboard-mobile-menu"
      data-testid="dashboard-mobile-menu"
      className={`rounded-[24px] border border-cyan-200/12 bg-[#050d16]/98 p-3 shadow-[0_18px_60px_rgba(0,0,0,0.38)] ${
        compact ? 'absolute right-0 top-full z-30 mt-3 w-[290px]' : 'mt-4'
      }`}
    >
      <div className="mb-3 flex items-center gap-3 rounded-[18px] border border-cyan-200/10 bg-white/[0.035] px-3 py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-cyan-300/10 text-cyan-200">
          <ActiveIcon className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">
            Current
          </p>
          <p className="truncate text-sm font-semibold text-text-primary">{activeLabel}</p>
        </div>
      </div>

      <nav aria-label="Dashboard sections" className="grid gap-2">
        {DASHBOARD_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = item.panel === activePanel;
          const classes = `flex min-h-[52px] w-full items-center gap-3 rounded-[16px] border px-3 text-left text-sm font-semibold transition-colors ${
            isActive
              ? 'border-cyan-200/20 bg-cyan-300/[0.075] text-text-primary shadow-[inset_3px_0_0_rgba(34,211,238,0.82)]'
              : 'border-transparent text-text-secondary hover:border-cyan-200/10 hover:bg-white/[0.035] hover:text-text-primary'
          }`;

          return (
            <button
              key={item.panel}
              type="button"
              data-panel={item.panel}
              data-testid={`dashboard-mobile-menu-item-${item.panel}`}
              aria-current={isActive ? 'page' : undefined}
              className={classes}
              onClick={() => {
                onSelectPanel(item.panel);
                setOpen(false);
              }}
            >
              <Icon
                className={`h-5 w-5 shrink-0 ${
                  isActive ? 'text-cyan-200' : 'text-text-muted'
                }`}
                aria-hidden
              />
              <span className="min-w-0 truncate">{item.label}</span>
              {isActive ? (
                <span className="ml-auto h-2 w-2 rounded-full bg-cyan-300" aria-hidden />
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="mt-3 flex items-center gap-3 rounded-[18px] border border-cyan-200/10 bg-white/[0.03] px-3 py-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-600 to-slate-950 text-sm font-semibold text-white"
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
          className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-2 rounded-[13px] border border-border bg-panel px-3 text-xs font-semibold text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
          onClick={() => void signOut({ callbackUrl: SIGN_OUT_CALLBACK_URL })}
        >
          <LogOut className="h-4 w-4" aria-hidden />
          Sign out
        </button>
      </div>
    </div>
  );

  if (compact) {
    return (
      <div className="relative">
        <button
          type="button"
          data-testid="dashboard-mobile-menu-button"
          aria-controls="dashboard-mobile-menu"
          aria-expanded={open}
          aria-label={open ? 'Close dashboard menu' : 'Open dashboard menu'}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-white/10 bg-white/[0.04] text-text-primary transition-colors hover:border-cyan-200/28 hover:bg-white/[0.06]"
          onClick={() => setOpen((current) => !current)}
        >
          {open ? (
            <X className="h-4 w-4" aria-hidden />
          ) : (
            <Menu className="h-4 w-4" aria-hidden />
          )}
        </button>

        {open ? menuContents : null}
      </div>
    );
  }

  return (
    <div className="lg:hidden">
      <div className="foldera-dashboard-mobile-chrome rounded-[28px] border border-cyan-200/10 bg-[#030a12]/95 px-4 py-3 shadow-[0_22px_70px_rgba(0,0,0,0.42)]">
        <div className="flex min-h-[44px] items-center gap-3">
          <FolderaLogo href="/" markSize="sm" />

          <div className="ml-auto min-w-0 text-right">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200/55">
              Dashboard
            </p>
            <p className="truncate text-sm font-semibold text-text-primary">{activeLabel}</p>
          </div>

          <button
            type="button"
            data-testid="dashboard-mobile-menu-button"
            aria-controls="dashboard-mobile-menu"
            aria-expanded={open}
            aria-label={open ? 'Close dashboard menu' : 'Open dashboard menu'}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-cyan-200/14 bg-white/[0.035] text-text-primary shadow-[inset_0_0_0_1px_rgba(255,255,255,0.025)] transition-colors hover:border-cyan-200/28 hover:bg-white/[0.06]"
            onClick={() => setOpen((current) => !current)}
          >
            {open ? (
              <X className="h-5 w-5" aria-hidden />
            ) : (
              <Menu className="h-5 w-5" aria-hidden />
            )}
          </button>
        </div>

        {open ? (
          menuContents
        ) : null}
      </div>
    </div>
  );
}

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
      <aside className="foldera-dashboard-stage-sidebar flex h-full flex-col px-5 py-5">
        <div className="px-3 pt-1">
          <FolderaLogo href="/" markSize="sm" />
        </div>

        <nav className="mt-8 space-y-2">
          {DASHBOARD_STAGE_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isPanelItem = item.kind === 'panel';
            const isActive = isPanelItem
              ? sidebarUsesPanelButtons
                ? item.panel === activePanel
                : item.label === activeLabel
              : false;
            const classes = `foldera-dashboard-nav-item ${isActive ? 'is-active' : ''} flex min-h-[52px] w-full items-center gap-4 rounded-[14px] px-4 text-left text-[14px] font-medium tracking-[-0.01em] transition-colors ${
              isActive
                ? 'border border-white/12 bg-white/[0.055] text-text-primary'
                : 'border border-transparent text-text-secondary hover:bg-white/[0.03] hover:text-text-primary'
            }`;

            if (preview) {
              return (
                <div key={item.label} className={classes}>
                  <Icon className={`h-[18px] w-[18px] ${isActive ? 'text-accent' : 'text-text-muted'}`} aria-hidden="true" />
                  <span>{item.label}</span>
                </div>
              );
            }

            if (isPanelItem && sidebarUsesPanelButtons) {
              return (
                <button
                  key={item.label}
                  type="button"
                  className={classes}
                  data-panel={item.panel}
                  data-testid={`dashboard-sidebar-item-${item.panel}`}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => onSelectPanel(item.panel)}
                >
                  <Icon className={`h-[18px] w-[18px] ${isActive ? 'text-accent' : 'text-text-muted'}`} aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            }

            if (isPanelItem) {
              return (
                <Link key={item.label} href={item.href} className={classes}>
                  <Icon className={`h-[18px] w-[18px] ${isActive ? 'text-accent' : 'text-text-muted'}`} aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              );
            }

            return (
              <Link key={item.label} href={item.href} className={classes}>
                <Icon className="h-[18px] w-[18px] text-text-muted" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-4 pt-6">
          <div className="foldera-dashboard-upgrade rounded-[18px] border border-border bg-white/[0.03] px-4 py-4">
            <p className="text-sm font-semibold text-accent">Upgrade to Pro</p>
            <p className="mt-2 text-xs leading-5 text-text-secondary">
              Unlock team features, custom playbooks, and integrations.
            </p>
          </div>

          <div className="foldera-dashboard-account relative rounded-[18px] border border-border bg-white/[0.03] px-3 py-3">
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-600 to-slate-900 text-sm font-semibold text-white"
                aria-hidden
              >
                {initial}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text-primary">{userName}</p>
                <p className="mt-0.5 text-xs text-text-muted">Workspace Owner</p>
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
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${accountOpen ? 'rotate-180' : ''}`}
                />
              </button>
            </div>
            {accountOpen && !preview ? (
              <div
                className="foldera-dashboard-account-menu absolute bottom-full left-0 right-0 z-20 mb-2 rounded-[14px] border border-border bg-panel p-2 shadow-lg"
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-sm text-text-secondary hover:bg-white/[0.04] hover:text-text-primary"
                  onClick={() => {
                    onSelectPanel?.('account');
                    setAccountOpen(false);
                  }}
                >
                  <UserRound className="h-4 w-4" aria-hidden />
                  Account
                </button>
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

  return (
    <aside className="foldera-panel foldera-dashboard-sidebar hidden h-[calc(100vh-2rem)] min-h-[calc(100vh-2rem)] flex-col p-4 lg:sticky lg:top-4 lg:flex">
      <FolderaLogo href="/" markSize="sm" />

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
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-sm text-text-secondary hover:bg-white/[0.04] hover:text-text-primary"
                onClick={() => {
                  onSelectPanel?.('account');
                  setAccountOpen(false);
                }}
              >
                <UserRound className="h-4 w-4" aria-hidden />
                Account
              </button>
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
