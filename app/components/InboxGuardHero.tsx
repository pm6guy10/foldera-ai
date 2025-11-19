export function InboxGuardHero() {
  return (
    <section className="bg-slate-950">
      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-6 pb-20 lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)] lg:items-start">
        {/* Left column */}
        <div className="max-w-xl space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Foldera · Inbox Guard · Email-only
          </div>

          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            Your inbox, handled
            <span className="block text-slate-100">while you sleep.</span>
          </h1>

          <p className="max-w-xl text-pretty text-base leading-relaxed text-slate-300 sm:text-lg">
            Foldera scans your email, finds the messages you missed, drafts
            replies, and lets you send them with one click.
          </p>

          <div className="space-y-1 text-sm leading-relaxed">
            <p className="text-slate-200">AI was supposed to lighten your load.</p>
            <p className="text-slate-400">
              Instead it dumped everything back on you.
            </p>
          </div>

          <div className="space-y-1 text-sm leading-relaxed text-slate-200">
            <p className="font-semibold text-slate-100">
              Never drop a thread again.
            </p>
            <p>Zero missed commitments. Zero contradictions. Zero surprises.</p>
            <p>
              Foldera scans Gmail, Drive, and Slack in real-time to prevent
              operational mistakes before they cost you.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <a
              href="#waitlist"
              className="rounded-xl bg-cyan-500 px-5 py-2.5 text-sm font-medium text-slate-950 shadow-lg shadow-cyan-500/30 transition hover:bg-cyan-400"
            >
              Use Inbox Guard
            </a>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-600 text-[10px]">
                🔒
              </span>
              <span>
                Your email stays yours. We surface patterns, never resell your
                data.
              </span>
            </div>
          </div>
        </div>

        {/* Right column – card */}
        <div className="lg:pt-4">
          <div className="rounded-2xl border border-cyan-500/30 bg-slate-900/80 p-4 shadow-2xl shadow-cyan-500/20 backdrop-blur">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                Inbox Guard – Today&apos;s missed emails
              </div>
              <span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-400">
                Ready to approve &amp; send
              </span>
            </div>

            <div className="mb-3 flex items-center justify-between text-[11px] text-slate-400">
              <span>Live scan</span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Updating in real-time
              </span>
            </div>

            <div className="space-y-3 text-sm">
              <div className="rounded-xl bg-slate-900/90 p-3 ring-1 ring-slate-700/80">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span className="font-medium">
                    Sarah Chen — &quot;Quick question on the proposal&quot;
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Unreplied • 2 days
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">
                  You promised the updated deck last week. She followed up
                  yesterday, still no reply.
                </p>
                <p className="mt-2 text-xs font-medium text-emerald-300">
                  Draft ready: &quot;Here&apos;s the updated proposal and what
                  changed…&quot;
                </p>
              </div>

              <div className="rounded-xl bg-slate-900/90 p-3 ring-1 ring-slate-700/80">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span className="font-medium">
                    Finance — &quot;Invoice clarification&quot;
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Unreplied • 5 days
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">
                  They&apos;re confused about a few line items from last month&apos;s
                  invoice.
                </p>
                <p className="mt-2 text-xs font-medium text-emerald-300">
                  Draft ready: &quot;Here&apos;s a clear breakdown of each
                  item…&quot;
                </p>
              </div>

              <div className="rounded-xl bg-slate-900/90 p-3 ring-1 ring-slate-700/80">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span className="font-medium">
                    New lead — &quot;Next steps?&quot;
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Unreplied • 5 days
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">
                  Asked about pricing and timing 5 days ago. No response yet.
                </p>
                <p className="mt-2 text-xs font-medium text-emerald-300">
                  Draft ready: &quot;Here&apos;s how we typically start and what
                  it costs…&quot;
                </p>
              </div>
            </div>

            <button className="mt-4 w-full rounded-xl bg-slate-800 px-4 py-2 text-xs font-medium text-slate-100 transition hover:bg-slate-700">
              Approve &amp; send all replies
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
