'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { ChevronRight, X } from 'lucide-react';
import { FolderaMark } from '@/components/nav/FolderaMark';

export type NavPublicProps = {
  scrolled?: boolean;
  /** On the homepage use `#product`; on other routes use `/#product`. */
  platformHref?: string;
};

export function NavPublic({ scrolled = false, platformHref = '/#product' }: NavPublicProps) {
  const { status } = useSession();
  const isLoggedIn = status === 'authenticated';
  const sessionReady = status !== 'loading';
  const [menuOpen, setMenuOpen] = useState(false);

  const navLinks = [
    { label: 'Platform', href: platformHref },
    { label: 'Pricing', href: '/pricing' },
    { label: 'Blog', href: '/blog' },
  ];

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <nav
      className={`fixed top-0 w-full z-[60] overflow-visible transition-all duration-500 ${
        scrolled
          ? 'bg-black/90 backdrop-blur-2xl border-b border-white/5 py-4 shadow-2xl'
          : 'bg-transparent py-4 md:py-8'
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between min-w-0">
        <a
          href="/"
          className="flex items-center gap-3 group cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070c]"
        >
          <FolderaMark className="shadow-[0_0_30px_rgba(255,255,255,0.2)] transition-transform group-hover:scale-105" />
          <span className="hidden sm:inline text-xl font-black tracking-tighter text-white uppercase">Foldera</span>
        </a>

        <div
          className={`hidden md:flex items-center gap-12 text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500 transition-opacity duration-200 ${
            sessionReady ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {navLinks.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="hover:text-white transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070c]"
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3 sm:gap-4 min-h-[2.5rem] shrink-0">
          {/* Tablet/desktop: inline auth CTAs (hidden below sm — menu holds these) */}
          <div
            className={`hidden sm:flex items-center gap-3 sm:gap-4 transition-opacity duration-200 ${
              sessionReady ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            {!isLoggedIn && (
              <a
                href="/login"
                className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500 hover:text-white transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070c]"
              >
                Sign in
              </a>
            )}
            {isLoggedIn ? (
              <a
                href="/dashboard"
                className="px-5 md:px-7 py-2.5 md:py-3 rounded-full bg-white text-black text-[10px] md:text-[11px] font-black uppercase tracking-[0.2em] hover:bg-zinc-200 transition-all duration-150 flex items-center gap-2 hover:scale-[1.02] active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070c]"
              >
                Dashboard <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </a>
            ) : (
              <a
                href="/start"
                className="flex px-5 md:px-7 py-2.5 md:py-3 rounded-full bg-white text-black text-[10px] md:text-[11px] font-black uppercase tracking-[0.2em] hover:bg-zinc-200 transition-all duration-150 items-center gap-2 hover:scale-[1.02] active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070c]"
              >
                Get started free <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </a>
            )}
          </div>

          <button
            type="button"
            data-testid="nav-mobile-menu-toggle"
            onClick={() => setMenuOpen((v) => !v)}
            className="sm:hidden flex flex-col items-center justify-center gap-[5px] w-10 h-10 min-w-[44px] min-h-[44px] rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070c]"
            aria-label={menuOpen ? 'Close menu (toggle)' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            <span className={`w-5 h-0.5 bg-white transition-all duration-200 ${menuOpen ? 'rotate-45 translate-y-[7px]' : ''}`} />
            <span className={`w-5 h-0.5 bg-white transition-all duration-200 ${menuOpen ? 'opacity-0' : ''}`} />
            <span className={`w-5 h-0.5 bg-white transition-all duration-200 ${menuOpen ? '-rotate-45 -translate-y-[7px]' : ''}`} />
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="sm:hidden fixed inset-0 z-[70] flex flex-col" role="dialog" aria-modal="true" aria-label="Site menu">
          <div
            role="presentation"
            className="absolute inset-0 bg-[#07070c] backdrop-blur-xl"
            onClick={closeMenu}
          />
          <button
            type="button"
            data-testid="nav-mobile-overlay-close"
            onClick={closeMenu}
            className="absolute top-4 right-4 z-[72] w-10 h-10 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
          <div className="relative z-[71] flex flex-1 flex-col items-center justify-center px-6 py-24 pointer-events-none">
            <nav
              className="flex flex-col items-center space-y-6 w-full max-w-sm pointer-events-auto"
            >
              {navLinks.map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  onClick={closeMenu}
                  className="text-lg font-bold text-white min-h-[48px] flex items-center justify-center text-center w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 rounded-lg"
                >
                  {l.label}
                </a>
              ))}
              {isLoggedIn ? (
                <a
                  href="/dashboard"
                  onClick={closeMenu}
                  className="text-lg font-bold text-white min-h-[48px] flex items-center justify-center text-center w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 rounded-lg"
                >
                  Dashboard
                </a>
              ) : (
                <>
                  <a
                    href="/login"
                    onClick={closeMenu}
                    className="text-lg font-bold text-white min-h-[48px] flex items-center justify-center text-center w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 rounded-lg"
                  >
                    Sign in
                  </a>
                  <a
                    href="/start"
                    onClick={closeMenu}
                    className="w-full min-h-[48px] py-4 rounded-xl bg-white text-black text-sm font-bold flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.15)]"
                  >
                    Get started free <ChevronRight className="w-4 h-4" aria-hidden="true" />
                  </a>
                </>
              )}
            </nav>
          </div>
        </div>
      )}
    </nav>
  );
}

export function NavAuthMinimal({ variant }: { variant: 'login' | 'start' }) {
  return (
    <nav className="relative z-10 w-full px-4 sm:px-6 py-5 flex items-center justify-between max-w-6xl mx-auto border-b border-white/5 gap-3">
      <a
        href="/"
        className="flex items-center gap-3 group rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070c] min-w-0"
      >
        <FolderaMark
          size="sm"
          className="shadow-[0_0_24px_rgba(255,255,255,0.2)] transition-transform group-hover:scale-105 shrink-0"
        />
        <span className="text-lg font-black tracking-tighter text-white uppercase truncate">Foldera</span>
      </a>
      {variant === 'login' ? (
        <a
          href="/start"
          className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500 hover:text-white transition-colors min-h-[44px] px-2 inline-flex items-center justify-end text-right shrink-0"
        >
          Get started free
        </a>
      ) : (
        <a
          href="/login"
          className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500 hover:text-white transition-colors min-h-[44px] px-2 inline-flex items-center justify-end text-right shrink-0"
        >
          Sign in
        </a>
      )}
    </nav>
  );
}
