export function PricingSection() {
  return (
    <section className="space-y-8">
      <div className="text-center space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          Simple, transparent pricing
        </p>
        <h2 className="text-xl font-semibold sm:text-2xl">
          What&apos;s 10 minutes of looking brilliant worth to you?
        </h2>
        <p className="mx-auto max-w-md text-xs text-slate-400">
          Less than one dinner. More valuable than an executive assistant.
        </p>
      </div>

      <div className="mx-auto max-w-md space-y-6">
        {/* Main card */}
        <div className="rounded-2xl border border-cyan-500/40 bg-slate-900/80 p-5 shadow-xl shadow-cyan-500/20">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300">
            🎯 Early Bird · First 100 users
          </div>

          <h3 className="text-sm font-medium text-slate-200">
            Overnight Opportunity Scanner
          </h3>

          <div className="mt-3 flex items-end gap-2">
            <span className="text-xs line-through text-slate-500">$97</span>
            <span className="text-3xl font-semibold text-emerald-300">$47</span>
            <span className="pb-1 text-xs text-slate-400">/month</span>
          </div>

          <p className="mt-1 text-[11px] text-slate-400">
            Lock in $47/mo forever. Regular price $97/mo after first 100 users.
          </p>

          <ul className="mt-4 space-y-1.5 text-xs text-slate-200">
            <li>• Unlimited meeting briefs</li>
            <li>• Email + Calendar + Slack integration</li>
            <li>• 30-minute advance prep notifications</li>
            <li>• Mobile &amp; email alerts</li>
            <li>• AI-powered context analysis</li>
            <li>• Relationship history &amp; &quot;What to say / avoid&quot; guidance</li>
          </ul>

          <a
            href="#waitlist"
            className="mt-5 block w-full rounded-xl bg-cyan-500 px-4 py-2.5 text-center text-sm font-medium text-slate-950 shadow-lg shadow-cyan-500/30 transition hover:bg-cyan-400"
          >
            Join waitlist · Lock in $47/mo
          </a>

          <p className="mt-2 text-center text-[11px] text-slate-400">
            🔒 Your data stays yours. 100% money-back guarantee once you&apos;re in.
          </p>
        </div>

        {/* Quick ROI bullets instead of giant blocks */}
        <div className="grid gap-3 text-xs text-slate-200 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              💼 Replaces
            </div>
            <ul className="mt-2 space-y-1 text-[11px]">
              <li>EA: ~$6,600/mo</li>
              <li>Your prep time: ~$2,000/mo</li>
              <li className="font-medium text-emerald-300">
                Total: ~$8,600/mo saved
              </li>
            </ul>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              ⚡ ROI
            </div>
            <ul className="mt-2 space-y-1 text-[11px]">
              <li>One avoided mistake pays for 12+ months.</li>
              <li>One impressed stakeholder is priceless.</li>
              <li>First week or money back.</li>
            </ul>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              🎯 Compare
            </div>
            <ul className="mt-2 space-y-1 text-[11px]">
              <li>Fireflies: $19/mo (reactive)</li>
              <li>Motion: $34/mo (no intel)</li>
              <li>EA: $6,600/mo</li>
              <li className="font-medium text-emerald-300">
                Foldera: $47/mo
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

