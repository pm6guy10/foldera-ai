'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { resumePendingCheckout } from '@/lib/billing/pending-checkout';

const focusPills: Array<{ label: string; bucket: string }> = [
  { label: 'Career', bucket: 'Career growth' },
  { label: 'Relationships', bucket: 'Relationships' },
  { label: 'Finances', bucket: 'Financial' },
  { label: 'Health', bucket: 'Health & family' },
];

const defaultSelected = new Set(['Career growth', 'Relationships']);

type ConnectionState = 'loading' | 'connected' | 'missing' | 'error';

function hasActiveSource(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const integrations = (payload as { integrations?: unknown }).integrations;
  if (!Array.isArray(integrations)) return false;
  return integrations.some((integration) => {
    if (!integration || typeof integration !== 'object') return false;
    const row = integration as { provider?: unknown; is_active?: unknown };
    return (
      row.is_active === true &&
      (row.provider === 'google' || row.provider === 'azure_ad' || row.provider === 'microsoft')
    );
  });
}

function OnboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { update } = useSession();
  const isEdit = searchParams?.get('edit') === 'true';

  const [selected, setSelected] = useState<Set<string>>(() => new Set(defaultSelected));
  const [saving, setSaving] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(isEdit);
  const [connectionState, setConnectionState] = useState<ConnectionState>(isEdit ? 'connected' : 'loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (isEdit) {
      setConnectionState('connected');
      return;
    }

    let cancelled = false;
    setConnectionState('loading');
    fetch('/api/integrations/status', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load integrations.');
        return response.json();
      })
      .then((payload) => {
        if (cancelled) return;
        setConnectionState(hasActiveSource(payload) ? 'connected' : 'missing');
      })
      .catch(() => {
        if (!cancelled) setConnectionState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [isEdit]);

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
    if (!isEdit && connectionState !== 'connected') {
      setSubmitError('Connect Google or Microsoft before continuing.');
      return;
    }

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
      if (!isEdit) {
        const resumedCheckout = await resumePendingCheckout({
          onError: (message) => setSubmitError(message),
        });
        if (resumedCheckout) {
          return;
        }
      }
      router.push(isEdit ? '/dashboard/settings' : '/dashboard');
    } catch {
      setSubmitError('Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loadingExisting || (!isEdit && connectionState === 'loading')) {
    return (
      <div className="min-h-[100dvh] bg-bg text-text-primary">
        <main id="main" className="mx-auto flex max-w-6xl items-center justify-center px-4 py-16 sm:px-6">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </main>
      </div>
    );
  }

  const connectorReady = isEdit || connectionState === 'connected';

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

          {!isEdit && (
            <section className="mt-8 border-t border-border-subtle pt-6">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-text-secondary">Step 1</p>
              <h2 className="mt-3 text-2xl font-black tracking-tight">Connect one source</h2>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                Foldera needs one connected mailbox or calendar before it can prepare a first read.
              </p>

              {connectorReady ? (
                <p className="mt-4 border-l-2 border-accent-dim pl-3 text-xs font-bold text-accent-hover">
                  Source connected. Finish setup below.
                </p>
              ) : (
                <>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <Link
                      href="/api/google/connect"
                      className="inline-flex min-h-[48px] items-center justify-center rounded-button bg-accent px-4 text-xs font-black uppercase tracking-[0.14em] text-bg transition-colors hover:bg-accent-hover"
                    >
                      Connect Google
                    </Link>
                    <Link
                      href="/api/microsoft/connect"
                      className="inline-flex min-h-[48px] items-center justify-center rounded-button border border-border bg-panel px-4 text-xs font-black uppercase tracking-[0.14em] text-text-primary transition-colors hover:border-border-strong"
                    >
                      Connect Microsoft
                    </Link>
                  </div>
                  {connectionState === 'error' && (
                    <p className="mt-3 text-xs leading-relaxed text-text-secondary">
                      Could not confirm a connected source. Connect a provider or refresh this page after consent.
                    </p>
                  )}
                </>
              )}
            </section>
          )}

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
              disabled={saving || selected.size === 0 || !connectorReady}
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
                disabled={saving || !connectorReady}
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

