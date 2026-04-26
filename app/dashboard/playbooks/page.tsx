'use client';

import Link from 'next/link';
import { ProductShell } from '@/components/dashboard/ProductShell';

export default function PlaybooksPage() {
  return (
    <ProductShell
      title="Playbooks"
      subtitle="Playbooks are being migrated into the dashboard shell. Use Briefings history for now."
    >
      <section className="rounded-card border border-border bg-panel p-6">
        <h2 className="text-2xl font-bold tracking-tight text-text-primary">Playbooks are coming soon</h2>
        <p className="mt-3 text-sm leading-relaxed text-text-secondary">
          This section is reserved for reusable execution playbooks. The current source of truth is still Briefings history.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/dashboard/briefings"
            className="inline-flex min-h-[44px] items-center rounded-button bg-accent px-4 text-xs font-black uppercase tracking-[0.14em] text-bg transition-colors hover:bg-accent-hover"
          >
            Open briefings history
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex min-h-[44px] items-center rounded-button border border-border px-4 text-xs font-black uppercase tracking-[0.14em] text-text-secondary transition-colors hover:text-text-primary"
          >
            Back to executive briefing
          </Link>
        </div>
      </section>
    </ProductShell>
  );
}
