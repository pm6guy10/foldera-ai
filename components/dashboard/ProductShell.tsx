'use client';

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

  return (
    <div className="min-h-[100dvh] bg-bg text-text-primary">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border-subtle bg-bg/95 pt-[env(safe-area-inset-top,0px)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/dashboard" className="inline-flex min-h-[44px] min-w-[44px] items-center gap-3 rounded-button px-1">
            <FolderaMark size="sm" decorative />
            <span className="text-sm font-black uppercase tracking-[0.12em]">Foldera</span>
          </Link>
          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 overflow-x-auto px-2 md:flex">
            {DASHBOARD_NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'inline-flex min-h-[38px] shrink-0 items-center whitespace-nowrap rounded-button px-2.5 text-[11px] font-black uppercase tracking-[0.12em] transition-colors',
                  (item.href === '/dashboard' && activePath === '/dashboard') ||
                    (item.href !== '/dashboard' &&
                      (activePath === item.href || activePath.startsWith(`${item.href}/`)))
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
      </header>

      <main id="main" className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6 sm:pt-28">
        <section className="border-b border-border-subtle pb-8">
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">{title}</h1>
          {subtitle && <p className="mt-4 max-w-3xl text-sm leading-relaxed text-text-secondary">{subtitle}</p>}
        </section>
        <section className="pt-8">{children}</section>
      </main>
    </div>
  );
}
