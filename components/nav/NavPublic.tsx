'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { ChevronRight } from 'lucide-react';

export type NavPublicProps = {
  scrolled?: boolean;
  /** On the homepage use `#product`; on other routes use `/#product`. */
  platformHref?: string;
};

export function NavPublic({ scrolled = false, platformHref = '/#product' }: NavPublicProps) {
  const { status } = useSession();
  const isLoggedIn = status === 'authenticated';
  const [menuOpen, setMenuOpen] = useState(false);

  const navLinks = [
    { label: 'Platform', href: platformHref },
    { label: 'Pricing', href: '/pricing' },
    { label: 'Blog', href: '/blog' },
  ];

  return (
    <nav
      className={`fixed top-0 w-full z-50 transition-all duration-500 ${
        scrolled
          ? 'bg-black/90 backdrop-blur-2xl border-b border-white/5 py-4 shadow-2xl'
          : 'bg-transparent py-4 md:py-8'
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between min-w-0">
        <a href="/" className="flex items-center gap-3 group cursor-pointer">
          <img
            src="/foldera-icon.png"
            alt="Foldera"
            className="w-10 h-10 rounded-2xl group-hover:scale-105 transition-transform shadow-[0_0_30px_rgba(255,255,255,0.3)]"
            width={40}
            height={40}
          />
          <span className="hidden sm:inline text-xl font-black tracking-tighter text-white uppercase">Foldera</span>
        </a>

        <div className="hidden md:flex items-center gap-12 text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500">
          {navLinks.map((l) => (
            <a key={l.label} href={l.href} className="hover:text-white transition-colors">
              {l.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
          {!isLoggedIn && (
            <a
              href="/login"
              className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500 hover:text-white transition-colors"
            >
              Sign in
            </a>
          )}
          {isLoggedIn ? (
            <a
              href="/dashboard"
              className="px-5 md:px-7 py-2.5 md:py-3 rounded-full bg-white text-black text-[10px] md:text-[11px] font-black uppercase tracking-[0.2em] hover:bg-zinc-200 transition-all flex items-center gap-2 hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.2)]"
            >
              Dashboard <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </a>
          ) : (
            <>
              <a
                href="/start"
                className="hidden sm:flex px-5 md:px-7 py-2.5 md:py-3 rounded-full bg-white text-black text-[10px] md:text-[11px] font-black uppercase tracking-[0.2em] hover:bg-zinc-200 transition-all items-center gap-2 hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.2)]"
              >
                Get started free <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </a>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="sm:hidden flex flex-col items-center justify-center gap-[5px] w-10 h-10 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={menuOpen}
              >
                <span className={`w-5 h-0.5 bg-white transition-all duration-200 ${menuOpen ? 'rotate-45 translate-y-[7px]' : ''}`} />
                <span className={`w-5 h-0.5 bg-white transition-all duration-200 ${menuOpen ? 'opacity-0' : ''}`} />
                <span className={`w-5 h-0.5 bg-white transition-all duration-200 ${menuOpen ? '-rotate-45 -translate-y-[7px]' : ''}`} />
              </button>
            </>
          )}
        </div>
      </div>

      {menuOpen && !isLoggedIn && (
        <div className="sm:hidden absolute top-full left-0 w-full bg-black/95 backdrop-blur-2xl border-b border-white/10 px-6 py-5 flex flex-col gap-4 shadow-2xl">
          {navLinks.map((l) => (
            <a
              key={l.label}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className="text-[13px] font-black uppercase tracking-[0.2em] text-zinc-400 hover:text-white transition-colors py-1"
            >
              {l.label}
            </a>
          ))}
          <div className="border-t border-white/10 pt-4 flex flex-col gap-3">
            <a
              href="/login"
              onClick={() => setMenuOpen(false)}
              className="text-[13px] font-black uppercase tracking-[0.2em] text-zinc-500 hover:text-white transition-colors py-1"
            >
              Sign in
            </a>
            <a
              href="/start"
              onClick={() => setMenuOpen(false)}
              className="w-full py-3.5 rounded-xl bg-white text-black text-[11px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.15)]"
            >
              Get started free <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}

export function NavAuthMinimal({ variant }: { variant: 'login' | 'start' }) {
  return (
    <nav className="relative z-10 w-full px-6 py-5 flex items-center justify-between max-w-6xl mx-auto border-b border-white/5">
      <a href="/" className="flex items-center gap-3 group">
        <img
          src="/foldera-icon.png"
          alt="Foldera"
          className="w-9 h-9 rounded-xl group-hover:scale-105 transition-transform shadow-[0_0_24px_rgba(255,255,255,0.2)]"
          width={36}
          height={36}
        />
        <span className="text-lg font-black tracking-tighter text-white uppercase">Foldera</span>
      </a>
      {variant === 'login' ? (
        <a
          href="/start"
          className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500 hover:text-white transition-colors"
        >
          Get started free
        </a>
      ) : (
        <a
          href="/login"
          className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500 hover:text-white transition-colors"
        >
          Sign in
        </a>
      )}
    </nav>
  );
}
