import Link from 'next/link';
import { NavPublic } from '@/components/nav/NavPublic';

export default function NotFound() {
  return (
    <div className="min-h-[100dvh] bg-[#07070c] text-white antialiased selection:bg-cyan-500/30 selection:text-white">
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)]" />
      </div>

      <NavPublic scrolled platformHref="/#product" />

      <main id="main" className="relative z-10 pt-28 pb-20 px-6 flex flex-col items-center text-center">
        <div className="mb-10 flex items-center justify-center gap-3">
          <img
            src="/foldera-icon.png"
            alt="Foldera"
            className="w-12 h-12 rounded-2xl shadow-[0_0_30px_rgba(255,255,255,0.25)]"
            width={48}
            height={48}
          />
          <span className="text-2xl font-black tracking-tighter uppercase">Foldera</span>
        </div>

        <h1 className="text-4xl font-black tracking-tighter text-white mb-4">Page not found.</h1>
        <p className="text-zinc-400 max-w-md mb-10 leading-relaxed">The page you&apos;re looking for doesn&apos;t exist.</p>

        <Link
          href="/"
          className="inline-flex items-center justify-center bg-white text-black font-black uppercase tracking-[0.15em] text-xs rounded-xl py-4 px-8 hover:bg-zinc-200 active:scale-95 shadow-[0_0_40px_rgba(255,255,255,0.2)] transition-all"
        >
          Back to home
        </Link>
      </main>
    </div>
  );
}
