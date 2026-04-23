'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FolderaMark } from '@/components/nav/FolderaMark';
import { cn } from '@/lib/design-system';

const navItems = [
  { href: '/dashboard', label: 'Today' },
  { href: '/dashboard/briefings', label: 'Briefings' },
  { href: '/dashboard/signals', label: 'Signals' },
  { href: '/dashboard/settings', label: 'Settings' },
];

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

  return (
    <div className="min-h-[100dvh] bg-bg text-text-primary">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border-subtle bg-bg/95 pt-[env(safe-area-inset-top,0px)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/dashboard" className="inline-flex min-h-[44px] min-w-[44px] items-center gap-3 rounded-button px-1">
            <FolderaMark size="sm" decorative />
            <span className="text-sm font-black uppercase tracking-[0.12em]">Foldera</span>
          </Link>
          <nav className="hidden items-center gap-2 md:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'inline-flex min-h-[40px] items-center rounded-button px-3 text-xs font-black uppercase tracking-[0.12em] transition-colors',
                  pathname === item.href
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
