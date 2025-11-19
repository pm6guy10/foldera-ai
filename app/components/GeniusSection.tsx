export function GeniusSection() {
  return (
    <section className="space-y-6">
      <div className="text-center space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          Social proof
        </p>
        <h2 className="text-lg font-semibold sm:text-xl">
          The thing that makes you look like a genius
        </h2>
        <p className="mx-auto max-w-md text-xs text-slate-400">
          Real stories of people walking into meetings with perfect recall
          — without doing the prep themselves.
        </p>
      </div>

      <div className="space-y-3">
        {[
          {
            quote:
              "I walked into a client meeting and referenced an email from 6 weeks ago. They were stunned I remembered the detail. I didn't – Foldera did. Closed the deal that afternoon.",
            initials: "SC",
            name: "Sarah Chen",
            title: "VP Product at Apex Systems",
          },
          {
            quote:
              "The brief told me NOT to bring up budget — turned out their CFO had just resigned. Would've killed the conversation.",
            initials: "MW",
            name: "Marcus Webb",
            title: "Founder at BuildCo",
          },
          {
            quote:
              "In a board meeting, someone asked about a promise I'd made in Slack. Foldera's brief had it listed. Looked like I had total command of every detail.",
            initials: "AR",
            name: "Alex Rivera",
            title: "CTO at DataFlow",
          },
        ].map((t) => (
          <figure
            key={t.name}
            className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 text-xs leading-relaxed text-slate-200"
          >
            <p className="mb-3 text-slate-100">&quot;{t.quote}&quot;</p>
            <div className="flex items-center gap-3 text-[11px] text-slate-400">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-[11px] font-semibold">
                {t.initials}
              </div>
              <div>
                <div className="font-medium text-slate-200">{t.name}</div>
                <div>{t.title}</div>
              </div>
            </div>
          </figure>
        ))}
      </div>
    </section>
  );
}

