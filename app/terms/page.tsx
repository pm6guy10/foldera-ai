import type { Metadata } from 'next';
import { NavPublic } from '@/components/nav/NavPublic';
import { BlogFooter } from '@/components/nav/BlogFooter';

export const metadata: Metadata = {
  title: 'Terms of Service — Foldera',
  description: 'Terms governing use of Foldera.',
};

const sections = [
  {
    title: 'Service',
    body: 'Foldera is an AI-powered briefing assistant that processes connected email and calendar data to produce daily actionable directives.',
  },
  {
    title: 'Accounts',
    body: 'You authenticate with Google or Microsoft OAuth. You are responsible for securing your connected accounts.',
  },
  {
    title: 'Acceptable use',
    body: 'Do not use Foldera on data you do not have rights to access, and do not abuse the API endpoints.',
  },
  {
    title: 'Billing',
    body: 'Free includes daily directives and your first three finished artifacts. Pro is $29/month and can be canceled anytime.',
  },
  {
    title: 'AI-generated content',
    body: 'You are responsible for reviewing generated directives and artifacts before execution.',
  },
  {
    title: 'Contact',
    body: 'Questions about these terms: support@foldera.ai.',
  },
];

export default function TermsPage() {
  return (
    <div className="bg-bg text-text-primary">
      <NavPublic scrolled platformHref="/#product" />
      <main id="main" className="pt-24 sm:pt-32">
        <section className="border-b border-border-subtle pb-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-accent">Legal</p>
            <h1 className="mt-6 text-5xl font-black tracking-tight sm:text-6xl">Terms of Service</h1>
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
