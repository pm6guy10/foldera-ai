import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">

      {/* ── Nav ── */}
      <nav className="max-w-4xl mx-auto px-6 pt-8 flex items-center justify-between">
        <span className="text-base font-bold tracking-tight">Foldera</span>
        <Link href="/login" className="text-zinc-400 hover:text-white text-sm transition-colors">
          Sign in
        </Link>
      </nav>

      {/* ── Hero ── */}
      <section className="max-w-4xl mx-auto px-6 pt-24 pb-0">
        <h1 className="text-5xl md:text-6xl font-bold text-white tracking-tight">
          Finished work, every morning.
        </h1>
        <p className="text-xl text-zinc-400 mt-4 max-w-2xl">
          Foldera reads your email, finds what matters, and does the work before you wake up.
          You just approve or skip.
        </p>
        <Link
          href="/start"
          className="inline-block bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-4 rounded-xl text-lg font-medium mt-8 transition-colors"
        >
          Start free trial
        </Link>
        <p className="text-sm text-zinc-600 mt-3">No credit card required</p>
      </section>

      {/* ── How it works ── */}
      <section className="max-w-4xl mx-auto px-6 mt-32">
        <h2 className="text-3xl font-bold text-white text-center">Three steps. That&apos;s it.</h2>
        <div className="grid md:grid-cols-3 gap-6 mt-12">
          {[
            {
              n: '01',
              title: 'Connect',
              body: 'Link your email. Foldera reads your last 30 days and starts learning what you care about.',
            },
            {
              n: '02',
              title: 'Sleep',
              body: 'Overnight, the engine finds the one thing worth doing tomorrow. It drafts the email, frames the decision, or tells you why to wait.',
            },
            {
              n: '03',
              title: 'Decide',
              body: 'One tap to approve. One tap to skip. Either way, the engine gets smarter. Day 30 is a different product than day 1.',
            },
          ].map(({ n, title, body }) => (
            <div key={n} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <span className="text-emerald-500 text-sm font-mono">{n}</span>
              <h3 className="text-xl font-semibold mt-2">{title}</h3>
              <p className="text-zinc-400 text-sm mt-2">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── What you get ── */}
      <section className="max-w-4xl mx-auto px-6 mt-32">
        <h2 className="text-3xl font-bold text-white text-center">What shows up in your inbox</h2>
        <p className="text-zinc-400 text-center mt-2">One directive. One finished artifact. Ready to approve.</p>

        <div className="max-w-2xl mx-auto mt-12 space-y-4">

          {/* Example 1 — drafted email */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <span className="text-xs uppercase tracking-wide text-emerald-500">Career</span>
            <p className="text-lg text-white font-medium mt-2">
              Send the follow-up email to the hiring manager. The interview was 12 days ago with no response.
            </p>
            <div className="bg-zinc-800 rounded-xl p-4 mt-4">
              <p className="text-sm text-zinc-400">To: hiring.manager@agency.gov</p>
              <p className="text-sm text-white mt-1">Subject: Following up on our March 4 conversation</p>
              <p className="text-sm text-zinc-300 mt-2">Hi Sarah — I wanted to follow up on our conversation earlier this month.</p>
              <p className="text-sm text-zinc-300 mt-1">I remain very interested in the role and would welcome any update you can share.</p>
            </div>
            <div className="flex gap-3 mt-4">
              <button className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm px-4 py-2 rounded-lg transition-colors">
                Approve
              </button>
              <button className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm px-4 py-2 rounded-lg transition-colors">
                Skip
              </button>
            </div>
          </div>

          {/* Example 2 — decision frame */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <span className="text-xs uppercase tracking-wide text-emerald-500">Financial</span>
            <p className="text-lg text-white font-medium mt-2">
              File the hardship waiver before the March 27 deadline. The form is drafted.
            </p>
            <div className="bg-zinc-800 rounded-xl p-4 mt-4 grid grid-cols-2 gap-3">
              <div className="bg-zinc-900 rounded-xl p-3">
                <p className="text-sm font-medium text-white">File now</p>
                <p className="text-xs text-zinc-400 mt-1">Secures the deadline. No downside risk.</p>
              </div>
              <div className="bg-zinc-900 rounded-xl p-3">
                <p className="text-sm font-medium text-white">Wait for response first</p>
                <p className="text-xs text-zinc-400 mt-1">Risks missing the window if no reply arrives.</p>
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm px-4 py-2 rounded-lg transition-colors">
                Approve
              </button>
              <button className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm px-4 py-2 rounded-lg transition-colors">
                Skip
              </button>
            </div>
          </div>

          {/* Example 3 — wait rationale */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <span className="text-xs uppercase tracking-wide text-emerald-500">Family</span>
            <p className="text-lg text-white font-medium mt-2">
              Nothing to do today. Marissa&apos;s appointment is Thursday. Resume planning Wednesday evening.
            </p>
            <div className="bg-zinc-800 rounded-xl p-4 mt-4 space-y-2">
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wide">Why wait</p>
                <p className="text-sm text-zinc-300 mt-1">Acting before Thursday&apos;s appointment adds noise without new information.</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wide">Resume when</p>
                <p className="text-sm text-zinc-300 mt-1">Wednesday evening, after the pre-appointment window closes.</p>
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm px-4 py-2 rounded-lg transition-colors">
                Approve
              </button>
              <button className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm px-4 py-2 rounded-lg transition-colors">
                Skip
              </button>
            </div>
          </div>

        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="max-w-4xl mx-auto px-6 mt-32">
        <h2 className="text-3xl font-bold text-white text-center">One plan. Full power.</h2>
        <p className="text-zinc-400 text-center mt-2">Finished work, every morning.</p>
        <div className="max-w-sm mx-auto mt-12 bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
          <p className="text-5xl font-bold text-white">$29<span className="text-xl text-zinc-500 font-normal">/month</span></p>
          <div className="mt-6 space-y-2">
            {[
              'Email + calendar sync',
              'One directive every morning',
              'Drafted emails, decision frames, wait rationale',
              'Gets smarter every day',
              'Delete your data anytime',
            ].map((f) => (
              <p key={f} className="text-sm text-zinc-400">{f}</p>
            ))}
          </div>
          <Link
            href="/start"
            className="block bg-emerald-600 hover:bg-emerald-500 w-full py-3 rounded-xl text-white font-medium mt-8 transition-colors"
          >
            Start 14-day free trial
          </Link>
          <p className="text-xs text-zinc-600 mt-3">No credit card required</p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="max-w-4xl mx-auto px-6 mt-32 pb-12">
        <p className="text-sm font-bold text-zinc-500">Foldera</p>
        <p className="text-xs text-zinc-600">Finished work, every morning.</p>
        <p className="text-xs text-zinc-700 mt-2">AES-256 encrypted &middot; &copy; {new Date().getFullYear()} Foldera</p>
      </footer>

    </div>
  );
}
