import type { Metadata } from 'next';
import { NavPublic } from '@/components/nav/NavPublic';
import { BlogFooter } from '@/components/nav/BlogFooter';

export const metadata: Metadata = {
  title: 'Privacy Policy — Foldera',
  description: 'How Foldera handles your data.',
};

const sections = [
  {
    title: 'What we collect',
    body: 'Foldera processes connected email and calendar context to generate directives and artifacts. Signal content is encrypted at rest.',
  },
  {
    title: 'How we use it',
    body: 'Your data is used only to generate your outputs. Foldera does not sell personal data or use it for advertising.',
  },
  {
    title: 'Encryption',
    body: 'Signal content and OAuth tokens are encrypted separately. Data in transit uses TLS.',
  },
  {
    title: 'Data retention',
    body: 'Signals older than 180 days are purged automatically. Deleted accounts are removed according to retention policy.',
  },
  {
    title: 'Third parties',
    body: 'Foldera uses Supabase, Vercel, Anthropic, Resend, and Stripe to run core product infrastructure.',
  },
  {
    title: 'Your rights',
    body: 'You can delete your account from settings. Privacy questions: privacy@foldera.ai.',
  },
];

export default function PrivacyPage() {
  return (
    <div className="bg-bg text-text-primary">
      <NavPublic scrolled platformHref="/#product" />
      <main id="main" className="pt-24 sm:pt-32">
        <section className="border-b border-border-subtle pb-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-accent">Legal</p>
            <h1 className="mt-6 text-5xl font-black tracking-tight sm:text-6xl">Privacy Policy</h1>
            <p className="mt-4 text-sm text-text-secondary">Last updated: March 2026</p>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <div className="divide-y divide-border-subtle border-y border-border-subtle">
              {sections.map((section) => (
                <article key={section.title} className="py-5 sm:py-6">
                  <h2 className="text-sm font-black uppercase tracking-[0.12em] text-text-primary">{section.title}</h2>
                  <p className="mt-3 text-sm leading-relaxed text-text-secondary">{section.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <BlogFooter />
      </main>
    </div>
  );
}
