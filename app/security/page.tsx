import type { Metadata } from 'next';
import { NavPublic } from '@/components/nav/NavPublic';
import { BlogFooter } from '@/components/nav/BlogFooter';

export const metadata: Metadata = {
  title: 'Security — Foldera',
  description: 'High-level security posture for Foldera.',
};

const sections = [
  {
    title: 'Access model',
    body: 'Foldera uses Google and Microsoft OAuth for account access and only reads the scopes required for product features.',
  },
  {
    title: 'Encryption',
    body: 'Signal content and OAuth tokens are encrypted separately, and traffic between clients and infrastructure uses TLS.',
  },
  {
    title: 'Infrastructure',
    body: 'Foldera runs on managed infrastructure including Supabase, Vercel, Stripe, and Resend with environment-scoped credentials.',
  },
];

export default function SecurityPage() {
  return (
    <div className="bg-bg text-text-primary">
      <NavPublic scrolled platformHref="/#product" />
      <main id="main" className="pt-24 sm:pt-32">
        <section className="border-b border-border-subtle pb-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-accent">Trust</p>
            <h1 className="mt-6 text-5xl font-black tracking-tight sm:text-6xl">Security</h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-text-secondary">
              Foldera is designed to keep connected context scoped, encrypted, and reviewable before anything moves.
            </p>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <div className="divide-y divide-border-subtle border-y border-border-subtle">
              {sections.map((section) => (
                <article key={section.title} className="py-5 sm:py-6">
                  <h2 className="text-sm font-black uppercase tracking-[0.12em] text-text-primary">
                    {section.title}
                  </h2>
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
