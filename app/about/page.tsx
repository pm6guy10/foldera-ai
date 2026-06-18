import type { Metadata } from 'next';
import { Compass, Sparkles, Target } from 'lucide-react';
import { NavPublic } from '@/components/nav/NavPublic';
import { BlogFooter } from '@/components/nav/BlogFooter';

export const metadata: Metadata = {
  title: 'About Foldera',
  description: 'What Foldera is building and why it exists.',
};

const points = [
  { icon: Sparkles, title: 'What it does', body: 'Turns your context into one finished move you can approve fast.' },
  { icon: Target, title: 'The bar', body: 'Grounded, timely, materially useful — never a generic reminder.' },
  { icon: Compass, title: 'Why it exists', body: 'You don’t need more dashboards. You need the next move.' },
];

export default function AboutPage() {
  return (
    <div className="foldera-app-surface min-h-[100dvh] text-text-primary">
      <NavPublic scrolled platformHref="/#product" />
      <main id="main" className="relative z-10 pt-28 sm:pt-36">
        <section className="px-5 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-accent">Company</p>
            <h1 className="mt-6 font-display text-[clamp(2.4rem,1.7rem+3vw,4rem)] font-semibold leading-[1.02] tracking-[-0.03em]">
              About Foldera
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-text-secondary">
              An executive assistant that does the hard part — deciding the next move, and preparing it.
            </p>
          </div>
        </section>

        <section className="px-5 py-24 sm:px-6 lg:px-8 lg:py-32">
          <div className="mx-auto grid max-w-5xl gap-x-12 gap-y-14 sm:grid-cols-3">
            {points.map(({ icon: Icon, title, body }) => (
              <div key={title}>
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                  <Icon className="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
                </span>
                <h2 className="mt-5 font-display text-[1.25rem] tracking-[-0.01em] text-text-primary">{title}</h2>
                <p className="mt-2 text-[15px] leading-6 text-text-muted">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <BlogFooter />
      </main>
    </div>
  );
}
