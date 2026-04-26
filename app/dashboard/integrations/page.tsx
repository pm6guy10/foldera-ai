'use client';

import Link from 'next/link';
import { ProductShell } from '@/components/dashboard/ProductShell';

export default function IntegrationsPage() {
  return (
    <ProductShell
      title="Integrations"
      subtitle="Manage connected accounts from a dedicated dashboard route."
    >
      <section className="rounded-card border border-border bg-panel p-6">
        <h2 className="text-2xl font-bold tracking-tight text-text-primary">Connected accounts live in Settings</h2>
        <p className="mt-3 text-sm leading-relaxed text-text-secondary">
          Integrations is now a first-class dashboard section. The current account controls are in Settings and remain the source of truth.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/dashboard/settings#connected-accounts"
            className="inline-flex min-h-[44px] items-center rounded-button bg-accent px-4 text-xs font-black uppercase tracking-[0.14em] text-bg transition-colors hover:bg-accent-hover"
          >
            Open connected accounts
          </Link>
          <Link
            href="/dashboard/settings"
            className="inline-flex min-h-[44px] items-center rounded-button border border-border px-4 text-xs font-black uppercase tracking-[0.14em] text-text-secondary transition-colors hover:text-text-primary"
          >
            Open settings
          </Link>
        </div>
      </section>
    </ProductShell>
  );
}
