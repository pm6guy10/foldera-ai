'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FolderaMark } from '@/components/nav/FolderaMark';
import { DASHBOARD_NAV_ITEMS } from '@/components/foldera/DashboardSidebar';
import { cn } from '@/lib/design-system';

export function ProductShell({
  title,
  subtitle,
  children,
  headerActions,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  headerActions?: React.ReactNode;
}) {
  const pathname = usePathname();
  const activePath = pathname ?? '';
  const [activePanel, setActivePanel] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || activePath !== '/dashboard') {
      setActivePanel(null);
      return;
    }

    setActivePanel(new URLSearchParams(window.location.search).get('panel'));
  }, [activePath]);

  const isNavItemActive = (panel: string) => {
    if (panel === 'briefing') {
      return activePath === '/dashboard' && (activePanel === null || activePanel === 'briefing');
    }

    if (panel === 'account') {
      return (
        activePath === '/dashboard/settings' ||
        (activePath === '/dashboard' && (activePanel === 'account' || activePanel === 'settings'))
      );
    }

    const legacyPanelPath = `/dashboard/${panel}`;
    return activePath === legacyPanelPath || (activePath === '/dashboard' && activePanel === panel);
  };

  return (
    <div className="foldera-app-surface min-h-[100dvh] bg-bg text-text-primary">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-cyan-300/10 bg-[#02070d]/92 pt-[env(safe-area-inset-top,0px)] shadow-[0_1px_0_rgba(34,211,238,0.06)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/dashboard" className="inline-flex min-h-[44px] min-w-[44px] items-center gap-3 foldera-button-radius px-1">
            <FolderaMark size="sm" decorative />
            <span className="text-sm font-black uppercase tracking-[0.12em]">Foldera</span>
          </Link>
          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 overflow-x-auto px-2 md:flex">
            {DASHBOARD_NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'inline-flex min-h-[38px] shrink-0 items-center whitespace-nowrap foldera-button-radius px-2.5 text-[11px] font-black uppercase tracking-[0.12em] transition-colors',
                  isNavItemActive(item.panel)
                    ? 'bg-panel-raised text-text-primary'
                    : 'text-text-secondary hover:text-text-primary',
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex min-h-[44px] items-center">{headerActions}</div>
        </div>
        <nav className="mx-auto flex max-w-[1480px] gap-2 overflow-x-auto px-4 pb-3 sm:px-6 md:hidden lg:px-8" aria-label="Dashboard sections">
          {DASHBOARD_NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'inline-flex min-h-[36px] shrink-0 items-center whitespace-nowrap rounded-[10px] border px-3 text-[10px] font-black uppercase tracking-[0.12em] transition-colors',
                isNavItemActive(item.panel)
                  ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100'
                  : 'border-white/8 bg-white/[0.03] text-text-secondary hover:text-text-primary',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main id="main" className="mx-auto max-w-[1480px] px-4 pb-16 pt-32 sm:px-6 sm:pt-32 lg:px-8">
        <section className="relative overflow-hidden rounded-[28px] border border-cyan-300/10 bg-[#050c14]/90 px-5 py-7 shadow-[0_24px_90px_rgba(0,0,0,0.34)] sm:px-7 lg:px-8">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/55 to-transparent" aria-hidden />
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200/78">Foldera app</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.055em] text-white sm:text-5xl">{title}</h1>
          {subtitle && <p className="mt-4 max-w-3xl text-[15px] leading-7 text-text-secondary">{subtitle}</p>}
        </section>
        <section className="pt-5 sm:pt-6">{children}</section>
      </main>
    </div>
  );
}
