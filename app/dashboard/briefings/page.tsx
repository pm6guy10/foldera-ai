import Link from 'next/link';
import { ArrowLeft, FileText, Layers } from 'lucide-react';

export default function BriefingsPage() {
  return (
    <div className="min-h-screen bg-[#07070c] text-white relative overflow-hidden">
      <AmbientBackdrop />

      <header className="relative z-10 border-b border-white/5 bg-black/45 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto h-16 flex items-center justify-between px-4 sm:px-6">
          <Link href="/dashboard" className="text-lg font-black tracking-[0.16em] uppercase text-white">Foldera</Link>
          <Link href="/dashboard" className="text-xs uppercase tracking-[0.18em] text-zinc-500 hover:text-white transition-colors inline-flex items-center gap-2">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to dashboard
          </Link>
        </div>
      </header>

      <main className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-14">
        <div className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] backdrop-blur-2xl overflow-hidden shadow-[0_30px_120px_rgba(0,0,0,0.5)] text-center">
          <div className="p-10 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.12),transparent_58%)]">
            <div className="w-16 h-16 rounded-3xl border border-white/10 bg-white/[0.05] flex items-center justify-center mx-auto text-cyan-300">
              <FileText className="w-7 h-7" />
            </div>
            <h1 className="mt-6 text-4xl font-black tracking-tight text-white">Briefings</h1>
            <p className="mt-4 text-zinc-400 max-w-xl mx-auto leading-relaxed">
              Your daily reads will appear here once Foldera has been running long enough to build a useful history.
            </p>
            <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs uppercase tracking-[0.18em] text-zinc-500 font-black">
              Morning archive
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function AmbientBackdrop() {
  return (
    <>
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808010_1px,transparent_1px),linear-gradient(to_bottom,#80808010_1px,transparent_1px)] bg-[size:44px_44px] opacity-60" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.08),transparent_24%),linear-gradient(180deg,#07070c_0%,#090912_50%,#050508_100%)]" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[70rem] h-[26rem] bg-cyan-500/10 blur-[140px] rounded-full" />
    </>
  );
}
