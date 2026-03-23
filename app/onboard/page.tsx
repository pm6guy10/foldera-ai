'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

const BUCKETS = [
  'Job search',
  'Career growth',
  'Side project',
  'Business ops',
  'Health & family',
  'Financial',
  'Relationships',
  'Learning',
];

function OnboardContent() {
  const { status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEdit = searchParams.get('edit') === 'true';

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [freeText, setFreeText] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(isEdit);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login?callbackUrl=/onboard');
    }
  }, [status, router]);

  useEffect(() => {
    if (!isEdit || status !== 'authenticated') return;
    fetch('/api/onboard/set-goals')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.buckets)) setSelected(new Set(data.buckets));
        if (typeof data.freeText === 'string') setFreeText(data.freeText);
      })
      .catch(() => {})
      .finally(() => setLoadingExisting(false));
  }, [isEdit, status]);

  const selectedCount = useMemo(() => selected.size, [selected]);

  const toggle = (label: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const submit = async (skipped: boolean) => {
    setSaving(true);
    try {
      await fetch('/api/onboard/set-goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buckets: Array.from(selected),
          freeText: freeText.trim() || null,
          skipped,
        }),
      });
    } catch {
      // best effort
    }
    router.push(isEdit ? '/dashboard/settings' : '/dashboard');
  };

  if (status === 'loading' || loadingExisting) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#07080d]">
        <div className="h-8 w-8 animate-pulse rounded-full bg-zinc-800" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#07080d] px-6 py-10 text-white">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
        <section className="max-w-xl pt-4 lg:pt-12">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-300">
            {isEdit ? 'Update your focus' : 'Step 2 of 2'}
          </p>
          <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
            Tell Foldera what should matter more.
          </h1>
          <p className="mt-5 text-lg leading-8 text-zinc-300">
            Pick the areas where you want better morning judgment. This does not create tasks. It just helps Foldera bias its read toward the right parts of your life.
          </p>
          <div className="mt-8 space-y-4">
            {[
              'Choose a few focus areas or skip this for now.',
              'Add one sentence if there is a specific goal in motion.',
              'You can change this later in Settings any time.',
            ].map((item) => (
              <div key={item} className="flex items-start gap-3 text-sm text-zinc-400">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 shadow-2xl shadow-black/30 sm:p-8">
          <div className="rounded-[1.5rem] border border-white/8 bg-zinc-950/70 p-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-white">
                  {isEdit ? 'Your focus areas' : 'What is on your plate?'}
                </h2>
                <p className="mt-2 text-sm text-zinc-400">
                  Choose anything that should influence what Foldera surfaces first.
                </p>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-400">
                {selectedCount} selected
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {BUCKETS.map((label) => {
                const active = selected.has(label);
                return (
                  <button
                    key={label}
                    onClick={() => toggle(label)}
                    className={`rounded-2xl border px-4 py-4 text-left text-sm font-medium transition ${
                      active
                        ? 'border-cyan-400/40 bg-cyan-400/12 text-cyan-200'
                        : 'border-white/8 bg-white/[0.03] text-zinc-300 hover:border-white/15 hover:bg-white/[0.05]'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="mt-5">
              <label htmlFor="goal" className="mb-2 block text-sm font-medium text-zinc-300">
                Specific goal or active situation
              </label>
              <textarea
                id="goal"
                rows={4}
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                placeholder="Example: land the operations role, repair the client relationship, and stop missing family logistics."
                className="w-full rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-cyan-400/40 focus:outline-none"
              />
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => submit(false)}
                disabled={saving}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white px-5 py-4 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Continue to dashboard'}
                {!saving && <ArrowRight className="h-4 w-4" />}
              </button>
              {!isEdit && (
                <button
                  onClick={() => submit(true)}
                  disabled={saving}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-sm font-semibold text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Skip for now
                </button>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function OnboardPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#07080d]">
          <div className="h-8 w-8 animate-pulse rounded-full bg-zinc-800" />
        </main>
      }
    >
      <OnboardContent />
    </Suspense>
  );
}
