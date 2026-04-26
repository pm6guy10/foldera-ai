import type { Metadata } from 'next';
import { NavPublic } from '@/components/nav/NavPublic';
import { BlogFooter } from '@/components/nav/BlogFooter';

export const metadata: Metadata = {
  title: 'Status — Foldera',
  description: 'Current public status page for Foldera.',
};

const checks = [
  { label: 'Product app', state: 'Operational' },
  { label: 'Daily brief pipeline', state: 'Operational' },
  { label: 'OAuth connections', state: 'Operational' },
];

export default function StatusPage() {
  return (
    <div className="bg-bg text-text-primary">
      <NavPublic scrolled platformHref="/#product" />
      <main id="main" className="pt-24 sm:pt-32">
        <section className="border-b border-border-subtle pb-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-accent">Operations</p>
            <h1 className="mt-6 text-5xl font-black tracking-tight sm:text-6xl">System Status</h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-text-secondary">
              Public status snapshot for the core Foldera surfaces.
            </p>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <div className="divide-y divide-border-subtle border-y border-border-subtle">
              {checks.map((check) => (
                <article key={check.label} className="flex items-center justify-between gap-4 py-5 sm:py-6">
                  <h2 className="text-sm font-black uppercase tracking-[0.12em] text-text-primary">
                    {check.label}
                  </h2>
                  <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-accent">
                    {check.state}
                  </span>
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
