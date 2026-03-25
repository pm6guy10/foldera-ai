'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEdit = searchParams.get('edit') === 'true';

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [freeText, setFreeText] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Pre-populate when editing
  useEffect(() => {
    if (!isEdit) return;
    setLoadError(null);
    fetch('/api/onboard/set-goals')
      .then((r) => r.json())
      .then((data) => {
        if (data.buckets) setSelected(new Set(data.buckets));
        if (data.freeText) setFreeText(data.freeText);
      })
      .catch(() => {
        setLoadError('Could not load your existing focus areas. Try again.');
      })
      .finally(() => setLoadingExisting(false));
  }, [isEdit]);

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
    setSubmitError(null);
    try {
      const response = await fetch('/api/onboard/set-goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buckets: Array.from(selected),
          freeText: freeText.trim() || null,
          skipped,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const errorMessage =
          payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
            ? payload.error
            : 'Could not save focus areas. Try again.';
        setSubmitError(errorMessage);
        return;
      }
      router.push(isEdit ? '/dashboard/settings' : '/dashboard');
    } catch {
      setSubmitError('Could not save focus areas. Try again.');
      return;
    } finally {
      setSaving(false);
    }
  };

  if (loadingExisting) {
    return (
      <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="animate-pulse w-8 h-8 rounded-full bg-zinc-800" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <p className="text-2xl font-bold text-white mb-6">Foldera</p>

        <h1 className="text-2xl font-bold text-white">
          {isEdit ? 'Edit your focus areas' : "What's on your plate?"}
        </h1>
        <p className="text-zinc-500 mt-1 text-sm">
          {isEdit ? 'Update anytime.' : 'Tap any that apply. You can skip this.'}
        </p>

        {/* Bucket chips */}
        <div className="mt-6 grid grid-cols-2 gap-2">
          {BUCKETS.map((label) => {
            const active = selected.has(label);
            return (
              <button
                key={label}
                onClick={() => toggle(label)}
                className={`rounded-xl py-3 px-4 text-sm font-medium transition-colors border ${
                  active
                    ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Free text */}
        <input
          type="text"
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          placeholder='e.g., land the MAS3 role at HCA'
          className="mt-4 w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3 px-4 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50"
        />

        {/* Buttons */}
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => submit(false)}
            disabled={saving}
            className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white py-3 rounded-xl font-medium text-sm transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Continue'}
          </button>
          {!isEdit && (
            <button
              onClick={() => submit(true)}
              disabled={saving}
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-3 rounded-xl font-medium text-sm transition-colors disabled:opacity-50"
            >
              Skip for now
            </button>
          )}
        </div>
        {loadError && (
          <p className="mt-3 text-xs text-red-400">{loadError}</p>
        )}
        {submitError && (
          <p className="mt-2 text-xs text-red-400">{submitError}</p>
        )}
      </div>
    </main>
  );
}

export default function OnboardPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="animate-pulse w-8 h-8 rounded-full bg-zinc-800" />
      </main>
    }>
      <OnboardContent />
    </Suspense>
  );
}
