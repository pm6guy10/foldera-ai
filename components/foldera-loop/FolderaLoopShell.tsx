import { CheckCircle2, Clock3, FileText, MessageSquare, Sparkles } from 'lucide-react';

const sourceTrail = [
  {
    label: 'Slack',
    title: 'Marcus approved the estimate.',
    detail: 'Redacted fixture content contains approval only; no raw private message body is stored.',
  },
  {
    label: 'Calendar',
    title: 'A review block starts at 3 PM PT.',
    detail: 'The window leaves one focused slot for the renewal note.',
  },
];

const evidenceRows = [
  { label: 'Focus', value: 'Finalize revised estimate for Marcus' },
  { label: 'Waiting on', value: 'Marcus approval' },
  { label: 'Blocker', value: 'Waiting on Marcus' },
  { label: 'Last step', value: 'None yet' },
];

function LoopPanel({ done }: { done: boolean }) {
  return (
    <div
      data-testid={done ? 'loop-panel-complete' : 'loop-panel-active'}
      className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
    >
      <header className="flex flex-col gap-4 border-b border-white/10 pb-5 md:flex-row md:items-end md:justify-between">
        <div className="max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-cyan-200/80">
            Foldera loop
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">
            Marcus estimate loop
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
            Queue Task 013 renders the current state, the source-backed evidence, one next move,
            and one Done action.
          </p>
        </div>

        <div className="inline-flex items-center gap-2 self-start rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-200">
          <span
            className={`h-2.5 w-2.5 rounded-full ${done ? 'bg-emerald-300' : 'bg-cyan-300'} shadow-[0_0_16px_rgba(34,211,238,0.55)]`}
            aria-hidden="true"
          />
          {done ? 'Completed' : 'Waiting on Marcus'}
        </div>
      </header>

      <div className="mt-8 grid flex-1 gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.045] p-5 shadow-[0_32px_100px_rgba(0,0,0,0.35)] sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/8 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-100">
              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
              Current state
            </div>
            <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-medium text-slate-400">
              Deterministic fixture only
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {evidenceRows.map((row) => (
              <div key={row.label} className="rounded-2xl border border-white/10 bg-[#08111b]/75 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                  {row.label}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-100">
                  {row.label === 'Last step' && done ? 'Send Estimate' : row.value}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] p-5 sm:p-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              One next move
            </div>
            <p className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-[2.6rem]">
              {done ? 'Stay quiet until a new source-backed trigger appears.' : 'Send Estimate'}
            </p>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              Approved source evidence resolves the blocker and keeps the loop quiet until the
              next trigger appears.
            </p>
          </div>

          {!done ? (
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              <label
                htmlFor="done-toggle"
                className="inline-flex min-h-[48px] cursor-pointer items-center justify-center gap-2 rounded-full bg-cyan-300 px-5 text-sm font-semibold text-slate-950 shadow-[0_0_26px_rgba(34,211,238,0.2)] transition hover:bg-cyan-200"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Done
              </label>
              <p className="max-w-xl text-sm leading-6 text-slate-400">
                Click Done after the human decision. No live send runs.
              </p>
            </div>
          ) : (
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-300/12 px-5 text-sm font-semibold text-emerald-100">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Done recorded
              </div>
              <p role="status" aria-live="polite" className="max-w-xl text-sm leading-6 text-slate-300">
                State updated. The loop is quiet again.
              </p>
            </div>
          )}
        </section>

        <aside className="grid gap-5">
          <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 sm:p-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
              Source trail
            </div>
            <div className="mt-5 space-y-4">
              {sourceTrail.map((item) => (
                <article key={item.title} className="rounded-2xl border border-white/10 bg-[#071019]/80 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                    {item.label}
                  </p>
                  <p className="mt-2 text-base font-medium leading-6 text-white">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{item.detail}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 sm:p-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">
              <FileText className="h-4 w-4" aria-hidden="true" />
              Why this is safe
            </div>
            <ul className="mt-5 space-y-3 text-sm leading-6 text-slate-300">
              <li className="rounded-2xl border border-white/10 bg-[#071019]/80 p-4">
                One deterministic verdict. No competing action pile.
              </li>
              <li className="rounded-2xl border border-white/10 bg-[#071019]/80 p-4">
                The loop stays quiet after Done. No live send or connector call.
              </li>
              <li className="rounded-2xl border border-white/10 bg-[#071019]/80 p-4">
                Source-backed evidence stays attached to the human decision.
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

export function FolderaLoopShell() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#05070b] text-slate-50">
      <input id="done-toggle" type="checkbox" className="peer sr-only" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.14),_transparent_28%),radial-gradient(circle_at_85%_20%,_rgba(14,165,233,0.10),_transparent_24%),linear-gradient(180deg,_rgba(255,255,255,0.02),_transparent_30%)]" />
      <div className="pointer-events-none absolute left-[-8rem] top-[-7rem] h-[24rem] w-[24rem] rounded-full bg-cyan-500/12 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-10rem] right-[-6rem] h-[28rem] w-[28rem] rounded-full bg-sky-500/10 blur-3xl" />
      <div className="peer-checked:hidden">
        <LoopPanel done={false} />
      </div>
      <div className="hidden peer-checked:block">
        <LoopPanel done />
      </div>
    </main>
  );
}
