'use client';

import Link from 'next/link';
import { ProductShell } from '@/components/dashboard/ProductShell';

export default function AuditLogPage() {
  return (
    <ProductShell
      title="Audit Log"
      subtitle="Audit timeline is being folded into one dashboard surface."
    >
      <section className="rounded-card border border-border bg-panel p-6">
        <h2 className="text-2xl font-bold tracking-tight text-text-primary">Recent Work is the audit trail</h2>
        <p className="mt-3 text-sm leading-relaxed text-text-secondary">
          Recent Work now holds finished, skipped, and approved items in the main dashboard instead of splitting them into another operator page.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/dashboard?panel=history"
            className="inline-flex min-h-[44px] items-center foldera-button-radius bg-accent px-4 text-xs font-black uppercase tracking-[0.14em] text-bg transition-colors hover:bg-accent-hover"
          >
            Open Recent Work
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex min-h-[44px] items-center foldera-button-radius border border-border px-4 text-xs font-black uppercase tracking-[0.14em] text-text-secondary transition-colors hover:text-text-primary"
          >
            Back to Today
          </Link>
        </div>
      </section>
    </ProductShell>
  );
}
