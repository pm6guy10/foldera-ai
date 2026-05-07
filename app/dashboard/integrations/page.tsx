'use client';

import Link from 'next/link';
import { ProductShell } from '@/components/dashboard/ProductShell';

export default function IntegrationsPage() {
  return (
    <ProductShell
      title="Sources"
      subtitle="Legacy integrations links now open the dashboard source controls."
    >
      <section className="rounded-card border border-border bg-panel p-6">
        <h2 className="text-2xl font-bold tracking-tight text-text-primary">Source controls live in the dashboard</h2>
        <p className="mt-3 text-sm leading-relaxed text-text-secondary">
          Foldera now keeps connected account health, source freshness, and account controls inside one dashboard surface.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/dashboard?panel=sources"
            className="inline-flex min-h-[44px] items-center foldera-button-radius bg-accent px-4 text-xs font-black uppercase tracking-[0.14em] text-bg transition-colors hover:bg-accent-hover"
          >
            Open sources
          </Link>
          <Link
            href="/dashboard?panel=account"
            className="inline-flex min-h-[44px] items-center foldera-button-radius border border-border px-4 text-xs font-black uppercase tracking-[0.14em] text-text-secondary transition-colors hover:text-text-primary"
          >
            Open account
          </Link>
        </div>
      </section>
    </ProductShell>
  );
}
