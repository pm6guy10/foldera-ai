import type { Metadata } from 'next';
import { NavPublic } from '@/components/nav/NavPublic';
import { BlogFooter } from '@/components/nav/BlogFooter';

export const metadata: Metadata = {
  title: 'About Foldera',
  description: 'What Foldera is building and why it exists.',
};

const sections = [
  {
    title: 'What Foldera does',
    body: 'Foldera turns connected inbox, calendar, and document context into one finished move you can approve fast.',
  },
  {
    title: 'Product bar',
    body: 'The output should feel grounded, timely, and materially useful — not a generic reminder or a pile of notes.',
  },
  {
    title: 'Why it exists',
    body: 'Most people do not need more dashboards. They need one clear recommendation with enough context to act now.',
  },
];

export default function AboutPage() {
  return (
    <div className="bg-bg text-text-primary">
      <NavPublic scrolled platformHref="/#product" />
      <main id="main" className="pt-24 sm:pt-32">
        <section className="border-b border-border-subtle pb-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-accent">Company</p>
            <h1 className="mt-6 text-5xl font-black tracking-tight sm:text-6xl">About Foldera</h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-text-secondary">
              Foldera is building an executive assistant that does the hard part: deciding the next move and preparing it.
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
