import type { Metadata } from 'next';
import { FolderaMark } from '@/components/nav/FolderaMark';

export const metadata: Metadata = {
  title: 'Privacy Policy — Foldera',
  description: 'How Foldera handles your data.',
};

export default function PrivacyPage() {
  return (
    <main id="main" className="min-h-screen bg-[#07070c] text-white overflow-x-hidden">
      <nav className="border-b border-white/5 py-6 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3 min-w-0">
          <a href="/" className="flex items-center gap-3 min-w-0">
            <FolderaMark />
            <span className="text-lg font-black tracking-tighter uppercase truncate">Foldera</span>
          </a>
          <a
            href="/"
            className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500 hover:text-white transition-colors shrink-0 min-h-[44px] inline-flex items-center"
          >
            Back to home
          </a>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 py-16 sm:py-20 w-full min-w-0">
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight mb-4">Privacy Policy</h1>
        <p className="text-zinc-400 text-sm mb-10 sm:mb-12">Last updated: March 2026</p>

        <div className="prose prose-invert prose-zinc max-w-none prose-headings:font-black prose-headings:tracking-tight prose-headings:text-white prose-p:text-zinc-300 prose-p:leading-relaxed prose-strong:text-white prose-a:text-cyan-400 prose-a:no-underline prose-a:hover:text-cyan-300 space-y-8 sm:space-y-10 text-sm leading-relaxed break-words">
          <section>
            <h2 className="text-white text-lg font-bold mb-3">What we collect</h2>
            <p>
              Foldera processes emails and calendar events from connected accounts (Google, Microsoft)
              to generate actionable briefings. We store encrypted signal metadata, extracted patterns,
              and generated directives. We never store raw email bodies long-term — content is processed
              and discarded.
            </p>
          </section>

          <section>
            <h2 className="text-white text-lg font-bold mb-3">How we use it</h2>
            <p>
              Your data is used solely to generate your daily briefings and maintain relationship context.
              We do not sell, share, or use your data for advertising. Each user&apos;s data is isolated
              and scoped to their account.
            </p>
          </section>

          <section>
            <h2 className="text-white text-lg font-bold mb-3">Encryption</h2>
            <p>
              All signal content is encrypted at rest using AES-256-GCM before storage.
              OAuth tokens are encrypted separately. Data in transit uses TLS 1.2+.
            </p>
          </section>

          <section>
            <h2 className="text-white text-lg font-bold mb-3">Data retention</h2>
            <p>
              Signals older than 180 days are automatically purged. If you disconnect an integration
              or delete your account, associated data is removed within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-white text-lg font-bold mb-3">Third parties</h2>
            <p>
              We use Supabase (database), Vercel (hosting), Anthropic (AI processing),
              Resend (transactional email), and Stripe (payments). Each processes only
              the minimum data required for their service.
            </p>
          </section>

          <section>
            <h2 className="text-white text-lg font-bold mb-3">Your rights</h2>
            <p>
              You can export or delete your data at any time from Dashboard &rarr; Settings.
              For questions, email <span className="text-cyan-400">privacy@foldera.ai</span>.
            </p>
          </section>

        </div>
      </div>
    </main>
  );
}
