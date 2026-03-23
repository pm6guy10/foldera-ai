import Link from 'next/link';
import { ArrowRight, FileText, Sparkles } from 'lucide-react';

export default function BriefingsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-[2rem] border border-white/8 bg-white/[0.03] p-8 text-center sm:p-10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-cyan-400/10 text-cyan-300">
          <FileText className="h-6 w-6" />
        </div>
        <p className="mt-5 text-sm font-semibold uppercase tracking-[0.18em] text-cyan-300">Briefings</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-white">Your past morning reads will live here.</h1>
        <p className="mt-4 text-sm leading-7 text-zinc-400">
          Foldera is opinionated on purpose. The live decision stays on the dashboard and in the morning email. This page becomes useful once you&apos;ve built a few days of history.
        </p>
        <div className="mt-6 inline-flex items-start gap-3 rounded-2xl border border-white/8 bg-zinc-950/60 px-4 py-3 text-left">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
          <p className="text-sm text-zinc-300">Nothing is wrong here. You just need a few runs before the archive becomes interesting.</p>
        </div>
        <Link
          href="/dashboard"
          className="mt-7 inline-flex items-center gap-2 text-sm font-medium text-zinc-400 transition hover:text-white"
        >
          Back to today&apos;s directive
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
