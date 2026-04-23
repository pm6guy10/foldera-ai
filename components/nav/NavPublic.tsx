'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { ChevronRight, X } from 'lucide-react';
import { FolderaMark } from '@/components/nav/FolderaMark';

export type NavPublicProps = {
  scrolled?: boolean;
  platformHref?: string;
};

const navLinks = [
  { label: 'Platform', href: '/#product' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Blog', href: '/blog' },
];

export function NavPublic({ scrolled = false, platformHref = '/#product' }: NavPublicProps) {
  const { status } = useSession();
  const isLoggedIn = status === 'authenticated';
  const sessionReady = status !== 'loading';
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onEsc);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onEsc);
    };
  }, [menuOpen]);

  const links = navLinks.map((link) =>
    link.label === 'Platform' ? { ...link, href: platformHref } : link,
  );

  const shellClass =
    scrolled || menuOpen
      ? 'bg-bg/95 border-b border-border-subtle backdrop-blur-xl'
      : 'bg-bg/80 border-b border-transparent';

  return (
    <nav className={`fixed inset-x-0 top-0 z-[60] pt-[env(safe-area-inset-top,0px)] transition-colors ${shellClass}`}>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <a
          href="/"
          className="inline-flex min-h-[44px] min-w-[44px] items-center gap-3 rounded-button px-1 text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Foldera"
        >
          <FolderaMark size="sm" decorative />
          <span className="hidden text-sm font-black uppercase tracking-[0.12em] sm:inline">Foldera</span>
        </a>

        <div className="hidden items-center gap-8 md:flex">
          {links.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-xs font-black uppercase tracking-[0.14em] text-text-secondary transition-colors hover:text-text-primary"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-3 sm:flex">
          {!isLoggedIn && (
            <a
              href="/login"
              className={`text-xs font-black uppercase tracking-[0.14em] transition-colors ${sessionReady ? 'text-text-secondary hover:text-text-primary' : 'text-transparent'}`}
            >
              Sign in
            </a>
          )}
          <a
            href={isLoggedIn ? '/dashboard' : '/start'}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-button px-4 text-xs font-black uppercase tracking-[0.14em] transition-colors ${
              sessionReady
                ? 'bg-accent text-bg hover:bg-accent-hover'
                : 'bg-panel text-transparent'
            }`}
          >
            {isLoggedIn ? 'Dashboard' : 'Start free'}
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>

        <button
          type="button"
          data-testid="nav-mobile-menu-toggle"
          onClick={() => setMenuOpen((value) => !value)}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-button border border-border bg-panel text-text-primary md:hidden"
          aria-label={menuOpen ? 'Close menu (toggle)' : 'Open menu'}
          aria-expanded={menuOpen}
        >
          <span className="relative block h-4 w-4">
            <span
              className={`absolute left-0 top-1 h-0.5 w-4 bg-current transition-transform ${menuOpen ? 'translate-y-1.5 rotate-45' : ''}`}
            />
            <span className={`absolute left-0 top-2.5 h-0.5 w-4 bg-current transition-opacity ${menuOpen ? 'opacity-0' : 'opacity-100'}`} />
            <span
              className={`absolute left-0 top-4 h-0.5 w-4 bg-current transition-transform ${menuOpen ? '-translate-y-1 rotate-[-45deg]' : ''}`}
            />
          </span>
        </button>
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-[70] md:hidden" role="dialog" aria-modal="true" aria-label="Site menu">
          <button
            type="button"
            className="absolute inset-0 bg-bg/90 backdrop-blur-sm"
            role="presentation"
            onClick={() => setMenuOpen(false)}
            aria-label="Dismiss overlay"
          />
          <div className="relative mx-4 mt-[calc(4rem+env(safe-area-inset-top,0px))] rounded-card border border-border bg-panel p-6">
            <button
              type="button"
              data-testid="nav-mobile-overlay-close"
              onClick={() => setMenuOpen(false)}
              className="absolute right-4 top-4 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-button border border-border bg-panel-raised text-text-secondary"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>

            <nav className="mt-12 flex flex-col gap-3">
              {links.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="inline-flex min-h-[48px] items-center rounded-button px-3 text-sm font-bold text-text-primary"
                >
                  {link.label}
                </a>
              ))}

              {!isLoggedIn && (
                <a
                  href="/login"
                  onClick={() => setMenuOpen(false)}
                  className="inline-flex min-h-[48px] items-center rounded-button px-3 text-sm font-bold text-text-primary"
                >
                  Sign in
                </a>
              )}

              <a
                href={isLoggedIn ? '/dashboard' : '/start'}
                onClick={() => setMenuOpen(false)}
                className="mt-2 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-button bg-accent px-4 text-sm font-black uppercase tracking-[0.12em] text-bg"
              >
                {isLoggedIn ? 'Dashboard' : 'Start free'}
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </nav>
          </div>
        </div>
      )}
    </nav>
  );
}

export function NavAuthMinimal({ variant }: { variant: 'login' | 'start' }) {
  return (
    <nav className="relative z-20 border-b border-border-subtle bg-bg/95 pt-[env(safe-area-inset-top,0px)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <a
          href="/"
          className="inline-flex min-h-[44px] min-w-[44px] items-center gap-3 rounded-button px-1 text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Foldera"
        >
          <FolderaMark size="sm" decorative />
          <span className="text-sm font-black uppercase tracking-[0.12em]">Foldera</span>
        </a>
        <a
          href={variant === 'login' ? '/start' : '/login'}
          className="inline-flex min-h-[44px] items-center rounded-button px-3 text-xs font-black uppercase tracking-[0.14em] text-text-secondary transition-colors hover:text-text-primary"
        >
          {variant === 'login' ? 'Get started free' : 'Sign in'}
        </a>
      </div>
    </nav>
  );
}
