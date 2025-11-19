export function Hero() {
  return (
    <section className="space-y-8">
      {/* Eyebrow */}
      <div className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-slate-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        Foldera · Inbox Guard · Email-only
      </div>

      {/* Text + card stack on mobile */}
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)] lg:items-start">
        {/* Left: core story */}
        <div className="space-y-5">
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
            Your inbox, handled
            <span className="block">while you sleep.</span>
          </h1>

          {/* Shorter mobile paragraph */}
          <p className="text-sm leading-relaxed text-slate-300 sm:hidden">
            Foldera finds the messages you missed, drafts replies, and lets you
            send them with one click—before anything slips.
          </p>
          {/* Full paragraph for ≥sm */}
          <p className="hidden max-w-xl text-base leading-relaxed text-slate-300 sm:block">
            Foldera scans your email, finds the messages you missed, drafts replies,
            and lets you send them with one click.
          </p>

          {/* Pain → promise, compressed */}
          <div className="space-y-2 text-sm leading-relaxed">
            <p className="text-slate-200">AI was supposed to lighten your load.</p>
            <p className="text-slate-400">
              Instead it dumped everything back on you.
            </p>
          </div>

          {/* One-line promise */}
          <p className="text-sm font-semibold text-slate-100">
            Never drop a thread again.
          </p>

          <ul className="text-xs leading-relaxed text-slate-300 space-y-1">
            <li>• Zero missed commitments.</li>
            <li>• Zero contradictions.</li>
            <li>• Zero surprises.</li>
            <li>
              • Scans Gmail, Drive, and Slack in real time to catch mistakes
              before they cost you.
            </li>
          </ul>

          {/* CTA row */}
          <div className="flex flex-wrap items-center gap-4 pt-1">
            <a
              href="#waitlist"
              className="rounded-xl bg-cyan-500 px-5 py-2.5 text-sm font-medium text-slate-950 shadow-lg shadow-cyan-500/30 transition hover:bg-cyan-400"
            >
              Use Inbox Guard
            </a>
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-600 text-[10px]">
                🔒
              </span>
              <span className="max-w-[12rem] sm:max-w-none">
                Your email stays yours. We surface patterns, never resell your data.
              </span>
            </div>
          </div>
        </div>

        {/* Right: condensed card */}
        <div className="lg:pt-2">
          <div className="rounded-2xl border border-cyan-500/30 bg-slate-900/80 p-4 shadow-2xl shadow-cyan-500/20 backdrop-blur">
            <div className="mb-3 flex items-center justify-between text-[11px] text-slate-300">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                Inbox Guard – Today&apos;s missed emails
              </span>
              <span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-400">
                Ready to send
              </span>
            </div>

            <div className="mb-3 flex items-center justify-between text-[10px] text-slate-400">
              <span>Live scan</span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Updating in real time
              </span>
            </div>

            <div className="space-y-3 text-xs">
              {[
                {
                  title: 'Sarah Chen — "Quick question on the proposal"',
                  age: "Unreplied • 2 days",
                  body: "You promised the updated deck last week. She followed up yesterday, still no reply.",
                  draft: 'Draft: "Here\'s the updated proposal and what changed…"',
                },
                {
                  title: 'Finance — "Invoice clarification"',
                  age: "Unreplied • 5 days",
                  body: "They're confused about a few line items from last month's invoice.",
                  draft: 'Draft: "Here\'s a clear breakdown of each item…"',
                },
                {
                  title: 'New lead — "Next steps?"',
                  age: "Unreplied • 5 days",
                  body: "Asked about pricing and timing 5 days ago. No response yet.",
                  draft: 'Draft: "Here\'s how we typically start and what it costs…"',
                },
              ].map((t) => (
                <div
                  key={t.title}
                  className="rounded-xl bg-slate-900/90 p-3 ring-1 ring-slate-700/80"
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-200">
                    <span className="font-medium line-clamp-2">{t.title}</span>
                    <span className="shrink-0 text-[10px] text-slate-500">
                      {t.age}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-3 leading-relaxed text-slate-400">
                    {t.body}
                  </p>
                  <p className="mt-2 font-medium text-emerald-300">{t.draft}</p>
                </div>
              ))}
            </div>

            <button className="mt-4 w-full rounded-xl bg-slate-800 px-4 py-2 text-[11px] font-medium text-slate-100 transition hover:bg-slate-700">
              Approve &amp; send all replies
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

