export default function HomePage() {
  return (
    <div className="bg-black text-white antialiased min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/95 backdrop-blur supports-[backdrop-filter]:bg-black/80">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2" aria-label="Foldera home">
            <img src="/foldera-glyph.svg" alt="" width={28} height={28} />
            <span className="text-lg font-semibold text-white">Foldera</span>
          </a>
          <div className="flex items-center gap-4">
            <a
              href="/api/auth/signin"
              className="text-sm font-medium text-gray-400 hover:text-white transition-colors"
            >
              Login
            </a>
            <a
              href="/instant-audit"
              className="px-4 py-2 bg-white text-black text-sm font-medium rounded-md hover:bg-gray-200 transition-colors"
            >
              Start Free Trial
            </a>
          </div>
        </div>
      </header>

      <main>
        <div className="max-w-5xl mx-auto px-6">
          {/* Hero */}
          <section className="py-24 text-center">
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white tracking-tight max-w-3xl mx-auto">
              No more grant audit surprises.
            </h1>
            <p className="mt-6 text-xl text-gray-300 max-w-2xl mx-auto">
              Foldera connects to Gmail and Drive and flags budget mismatches, narrative conflicts, and funder amendments automatically — before submission.
            </p>
            <p className="mt-10">
              <a
                href="/instant-audit"
                className="inline-block px-8 py-4 bg-white text-black font-semibold rounded-md hover:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-black"
              >
                Start Your Free 14-Day Trial
              </a>
            </p>
          </section>

          {/* Problem */}
          <section className="py-24 border-t border-white/10">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">
              Grant reporting is fragile.
            </h2>
            <div className="space-y-6 text-gray-400 max-w-3xl">
              <p>
                One wrong number can trigger findings. A single misaligned line item between narrative and budget can delay disbursement or invite scrutiny.
              </p>
              <p>
                Narrative and budget must align. Auditors cross-reference every claim. When they don’t match, you spend time in remediation instead of delivery.
              </p>
              <p>
                Manual review is slow and inconsistent. Spreadsheets and Word docs don’t check themselves. Fatigue and turnover make gaps more likely.
              </p>
              <p>
                Audit stress is preventable. Most findings come from drift that could have been caught before submission. The right checks in place reduce last-minute fire drills.
              </p>
            </div>
          </section>

          {/* How it works */}
          <section className="py-24 border-t border-white/10">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-12 text-center">
              How it works
            </h2>
            <div className="grid md:grid-cols-3 gap-8">
              <article className="border border-white/10 rounded-lg p-6 bg-white/[0.02]">
                <h3 className="text-lg font-semibold text-white mb-3">Connect once</h3>
                <p className="text-gray-400 text-sm leading-relaxed">
                  Gmail and Drive via secure, read-only OAuth. Takes 60 seconds.
                </p>
              </article>
              <article className="border border-white/10 rounded-lg p-6 bg-white/[0.02]">
                <h3 className="text-lg font-semibold text-white mb-3">Foldera watches in the background</h3>
                <p className="text-gray-400 text-sm leading-relaxed">
                  Automatically tracks funder emails, amendments, budget sheets, and narrative drafts.
                </p>
              </article>
              <article className="border border-white/10 rounded-lg p-6 bg-white/[0.02]">
                <h3 className="text-lg font-semibold text-white mb-3">Get alerted early</h3>
                <p className="text-gray-400 text-sm leading-relaxed">
                  When something drifts out of alignment, Foldera shows the conflict and suggests a fix.
                </p>
              </article>
            </div>
          </section>

          {/* Credibility */}
          <section className="py-24 border-t border-white/10">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-6">
              Built by someone who’s lived it
            </h2>
            <p className="text-gray-400 max-w-3xl leading-relaxed">
              Created by a program operations professional with 9 years in publicly funded programs, Medicaid-adjacent systems, and audit-driven environments. Foldera mirrors the manual compliance checks teams already perform — faster and consistently.
            </p>
          </section>

          {/* What it does not do */}
          <section className="py-24 border-t border-white/10">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-6">
              What it does not do
            </h2>
            <ul className="text-gray-400 space-y-3 max-w-2xl">
              <li className="flex gap-3">
                <span className="text-gray-500 shrink-0">—</span>
                Does not auto-submit
              </li>
              <li className="flex gap-3">
                <span className="text-gray-500 shrink-0">—</span>
                Does not override human judgment
              </li>
              <li className="flex gap-3">
                <span className="text-gray-500 shrink-0">—</span>
                Does not replace your compliance officer
              </li>
              <li className="flex gap-3">
                <span className="text-gray-500 shrink-0">—</span>
                Reduces blind spots before review
              </li>
            </ul>
          </section>

          {/* Pricing */}
          <section className="py-24 border-t border-white/10">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-12 text-center">
              Pricing
            </h2>
            <div className="max-w-md mx-auto">
              <article className="border border-white/10 rounded-lg p-8 bg-white/[0.02] text-center">
                <p className="text-2xl font-bold text-white">$49</p>
                <p className="text-gray-500 text-sm mt-1">/month</p>
                <p className="text-white font-medium mt-6">14 days free. No credit card required.</p>
              </article>
            </div>
          </section>

          {/* Final CTA */}
          <section id="cta" className="py-24 border-t border-white/10 text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
              Start monitoring free for 14 days.
            </h2>
            <p className="text-gray-400 max-w-xl mx-auto mb-10">
              Connect Gmail and Drive. Foldera handles the rest.
            </p>
            <a
              href="/instant-audit"
              className="inline-block px-8 py-4 bg-white text-black font-semibold rounded-md hover:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-black"
            >
              Start Free Trial
            </a>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <img src="/foldera-glyph.svg" alt="" width={24} height={24} />
            <span className="text-sm font-semibold text-white">Foldera</span>
          </div>
          <div className="text-gray-500 text-sm">© {new Date().getFullYear()} Foldera.</div>
          <div className="flex gap-6 text-sm">
            <a href="#" className="text-gray-500 hover:text-white transition-colors">Privacy</a>
            <a href="#" className="text-gray-500 hover:text-white transition-colors">Terms</a>
            <a href="#" className="text-gray-500 hover:text-white transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
