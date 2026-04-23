'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

const focusPills: Array<{ label: string; bucket: string }> = [
  { label: 'Career', bucket: 'Career growth' },
  { label: 'Relationships', bucket: 'Relationships' },
  { label: 'Finances', bucket: 'Financial' },
  { label: 'Health', bucket: 'Health & family' },
];

const defaultSelected = new Set(['Career growth', 'Relationships']);

function OnboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { update } = useSession();
  const isEdit = searchParams?.get('edit') === 'true';

  const [selected, setSelected] = useState<Set<string>>(() => new Set(defaultSelected));
  const [saving, setSaving] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEdit) return;
    setLoadError(null);
    fetch('/api/onboard/set-goals')
      .then((response) => response.json())
      .then((data) => {
        const buckets: string[] = Array.isArray(data.buckets) ? data.buckets : [];
        const next = new Set<string>();
        for (const pill of focusPills) {
          if (buckets.includes(pill.bucket)) next.add(pill.bucket);
        }
        setSelected(next.size > 0 ? next : new Set(defaultSelected));
      })
      .catch(() => setLoadError('Could not load your existing focus areas. Try again.'))
      .finally(() => setLoadingExisting(false));
  }, [isEdit]);

  const toggle = (bucket: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(bucket)) next.delete(bucket);
      else next.add(bucket);
      return next;
    });
  };

  const submit = async (skipped: boolean) => {
    setSaving(true);
    setSubmitError(null);
    try {
      const buckets = skipped ? [] : Array.from(selected);
      const response = await fetch('/api/onboard/set-goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buckets, freeText: null, skipped }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setSubmitError(
          payload && typeof payload.error === 'string' ? payload.error : 'Could not save. Try again.',
        );
        return;
      }
      await update();
      router.push(isEdit ? '/dashboard/settings' : '/dashboard');
    } catch {
      setSubmitError('Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loadingExisting) {
    return (
      <div className="min-h-[100dvh] bg-bg text-text-primary">
        <main id="main" className="mx-auto flex max-w-6xl items-center justify-center px-4 py-16 sm:px-6">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-bg text-text-primary">
      <main id="main" className="mx-auto flex max-w-6xl flex-col px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto w-full max-w-3xl rounded-card border border-border bg-panel px-6 py-8 sm:px-10 sm:py-10">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-accent">
            {isEdit ? 'Edit setup' : 'Setup'}
          </p>
          <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl">
            {isEdit ? 'Edit your focus' : 'What matters most to you?'}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-text-secondary">
            {isEdit
              ? 'Update focus areas anytime.'
              : 'Choose focus areas so Foldera can prioritize the right morning move.'}
          </p>

          <div className="mt-8 border-y border-border-subtle py-6">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-text-secondary">Focus areas</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {focusPills.map(({ label, bucket }) => {
              const active = selected.has(bucket);
              return (
                <button
                  key={bucket}
                  type="button"
                  onClick={() => toggle(bucket)}
                  className={`inline-flex min-h-[48px] items-center justify-center rounded-pill border px-4 text-xs font-black uppercase tracking-[0.12em] transition-colors ${
                    active
                      ? 'border-accent-dim bg-accent-dim/20 text-accent-hover'
                      : 'border-border bg-panel-raised text-text-secondary hover:border-border-strong hover:text-text-primary'
                  }`}
                >
                  {label}
                </button>
              );
            })}
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => submit(false)}
              disabled={saving || selected.size === 0}
              className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-button bg-accent px-4 text-xs font-black uppercase tracking-[0.14em] text-bg transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Saving…' : isEdit ? 'Save' : 'Continue to dashboard'}
            </button>
            {isEdit ? (
              <Link
                href="/dashboard/settings"
                className="inline-flex min-h-[48px] items-center justify-center rounded-button border border-border px-6 text-xs font-black uppercase tracking-[0.14em] text-text-secondary transition-colors hover:text-text-primary"
              >
                Cancel
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => submit(true)}
                disabled={saving}
                className="inline-flex min-h-[48px] items-center justify-center rounded-button border border-border px-6 text-xs font-black uppercase tracking-[0.14em] text-text-secondary transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                Skip for now
              </button>
            )}
          </div>

          {loadError && <p className="mt-6 text-sm text-text-secondary">{loadError}</p>}
          {submitError && <p className="mt-2 text-sm text-text-secondary">{submitError}</p>}
        </div>
      </main>
    </div>
  );
}

export default function OnboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] bg-bg text-text-primary">
          <main id="main" className="mx-auto flex max-w-6xl items-center justify-center px-4 py-16 sm:px-6">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </main>
        </div>
      }
    >
      <OnboardContent />
    </Suspense>
  );
}

