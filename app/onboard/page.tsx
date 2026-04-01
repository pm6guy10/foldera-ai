'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

const FOCUS_PILLS: { label: string; bucket: string }[] = [
  { label: 'Career', bucket: 'Career growth' },
  { label: 'Relationships', bucket: 'Relationships' },
  { label: 'Finances', bucket: 'Financial' },
  { label: 'Health', bucket: 'Health & family' },
];

const DEFAULT_SELECTED = new Set(['Career growth', 'Relationships']);

function OnboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEdit = searchParams.get('edit') === 'true';

  const [selected, setSelected] = useState<Set<string>>(() => new Set(DEFAULT_SELECTED));
  const [saving, setSaving] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEdit) return;
    setLoadError(null);
    fetch('/api/onboard/set-goals')
      .then((r) => r.json())
      .then((data) => {
        const buckets: string[] = Array.isArray(data.buckets) ? data.buckets : [];
        const next = new Set<string>();
        for (const pill of FOCUS_PILLS) {
          if (buckets.includes(pill.bucket)) next.add(pill.bucket);
        }
        setSelected(next.size > 0 ? next : new Set(DEFAULT_SELECTED));
      })
      .catch(() => {
        setLoadError('Could not load your existing focus areas. Try again.');
      })
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
        body: JSON.stringify({
          buckets,
          freeText: null,
          skipped,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const errorMessage =
          payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
            ? payload.error
            : 'Could not save. Try again.';
        setSubmitError(errorMessage);
        return;
      }
      router.push(isEdit ? '/dashboard/settings' : '/dashboard');
    } catch {
      setSubmitError('Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loadingExisting) {
    return (
      <main id="main" className="min-h-[100dvh] bg-[#07070c] flex items-center justify-center relative overflow-x-hidden">
        <div className="absolute inset-0 pointer-events-none z-0">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)]" />
        </div>
        <div className="relative z-10 animate-pulse w-8 h-8 rounded-full bg-cyan-500/30" />
      </main>
    );
  }

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-[#07070c] text-white selection:bg-cyan-500/30 selection:text-white relative pb-[env(safe-area-inset-bottom,0px)]">
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)]" />
      </div>

      <main id="main" className="relative z-10 flex flex-col items-center px-4 sm:px-6 pt-20 sm:pt-24 pb-20 sm:pb-16 w-full min-w-0">
        <div className="w-full max-w-md min-w-0">
          {!isEdit && (
            <>
              <p className="text-center text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600 mb-4">Step 1 — Your focus</p>
              <div className="flex flex-col items-center text-center mb-8 sm:mb-10">
                <div className="flex items-center gap-2 mb-1 max-w-full px-1">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-40" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
                  </span>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400 leading-snug text-left sm:text-center">
                    Connected. Your first read arrives tomorrow morning.
                  </p>
                </div>
              </div>
            </>
          )}

          <h1 className="text-2xl font-black tracking-tighter text-white text-center mb-2">
            {isEdit ? 'Edit your focus' : 'What matters most to you?'}
          </h1>
          {!isEdit && (
            <p className="text-zinc-500 text-sm text-center mb-8">Tap one or more. You can change this anytime in settings.</p>
          )}
          {isEdit && <p className="text-zinc-500 text-sm text-center mb-8">Update anytime.</p>}

          <div className="grid grid-cols-2 gap-3 mb-10">
            {FOCUS_PILLS.map(({ label, bucket }) => {
              const active = selected.has(bucket);
              return (
                <button
                  key={bucket}
                  type="button"
                  onClick={() => toggle(bucket)}
                  className={`rounded-xl py-4 px-4 text-xs font-black uppercase tracking-[0.12em] transition-colors border ${
                    active
                      ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                      : 'bg-zinc-950/80 border-white/10 text-zinc-500 hover:border-white/20'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {!isEdit ? (
            <button
              type="button"
              onClick={() => submit(false)}
              disabled={saving || selected.size === 0}
              className="w-full bg-white text-black font-black uppercase tracking-[0.15em] text-xs rounded-xl py-4 px-8 hover:bg-zinc-200 active:scale-95 shadow-[0_0_40px_rgba(255,255,255,0.2)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : 'Go to dashboard'}
            </button>
          ) : (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => submit(false)}
                disabled={saving}
                className="flex-1 bg-cyan-500 text-black font-black uppercase tracking-widest text-xs rounded-xl py-3.5 shadow-[0_0_20px_rgba(6,182,212,0.22)] disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <Link
                href="/dashboard/settings"
                className="flex-1 flex items-center justify-center bg-zinc-900 border border-white/20 text-zinc-500 font-black uppercase tracking-widest text-xs rounded-xl py-3.5"
              >
                Cancel
              </Link>
            </div>
          )}

          {!isEdit && (
            <button
              type="button"
              onClick={() => submit(true)}
              disabled={saving}
              className="w-full mt-4 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Skip for now
            </button>
          )}

          {loadError && <p className="mt-4 text-xs text-red-400 text-center">{loadError}</p>}
          {submitError && <p className="mt-4 text-xs text-red-400 text-center">{submitError}</p>}
        </div>
      </main>
    </div>
  );
}

export default function OnboardPage() {
  return (
    <Suspense
      fallback={
        <main id="main" className="min-h-[100dvh] bg-[#07070c] flex items-center justify-center overflow-x-hidden">
          <div className="animate-pulse w-8 h-8 rounded-full bg-cyan-500/30" />
        </main>
      }
    >
      <OnboardContent />
    </Suspense>
  );
}
