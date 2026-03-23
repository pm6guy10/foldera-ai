'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ArrowRight, CheckCircle2, Layers, Sparkles } from 'lucide-react';

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
      .then((r) => r.json())
      .then((data) => {
        if (data.buckets) setSelected(new Set(data.buckets));
        if (data.freeText) setFreeText(data.freeText);
      })
      .catch(() => {})
      .finally(() => setLoadingExisting(false));
  }, [isEdit, status]);

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
      // Best-effort — redirect anyway
    }
    router.push(isEdit ? '/dashboard/settings' : '/dashboard');
  };

  if (status === 'loading' || loadingExisting) {
    return (
      <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="animate-pulse w-8 h-8 rounded-full bg-zinc-800" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#07070c] text-white overflow-hidden relative">
      <AmbientBackdrop />
      <div className="relative z-10 min-h-screen px-6 py-10">
        <div className="max-w-6xl mx-auto min-h-[calc(100vh-5rem)] grid lg:grid-cols-[0.95fr_1.05fr] gap-10 items-center">
          <section className="max-w-xl">
            <a href="/" className="inline-flex items-center gap-3 mb-8 group">
              <div className="w-10 h-10 rounded-2xl bg-white text-black flex items-center justify-center group-hover:scale-105 transition-transform shadow-[0_0_30px_rgba(255,255,255,0.2)]">
                <Layers className="w-5 h-5 fill-black" aria-hidden="true" />
              </div>
              <span className="text-xl font-black tracking-[0.18em] text-white uppercase">Foldera</span>
            </a>

            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 text-cyan-300 text-[11px] font-black uppercase tracking-[0.18em] mb-6">
              Bias tomorrow's read
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-[1.02] text-white">
              {isEdit ? 'Tune what Foldera watches for.' : "What's on your plate?"}
            </h1>
            <p className="mt-5 text-base md:text-lg text-zinc-400 leading-relaxed">
              {isEdit
                ? 'Change these anytime. They help Foldera weight what matters when it builds your morning directive.'
                : 'This is not a setup chore. It just helps Foldera bias the first few reads toward the parts of life you care about most.'}
            </p>

            <div className="mt-8 space-y-3">
              {[
                'Choose the areas that matter right now.',
                'Add one plain-English goal if you want.',
                'Foldera uses this to rank the morning directive, not to create more work for you.',
              ].map((text) => (
                <div key={text} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-zinc-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                  <span className="leading-relaxed">{text}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="relative">
            <div className="absolute -inset-6 bg-cyan-500/10 blur-[90px] rounded-full" />
            <div className="relative rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] backdrop-blur-2xl shadow-[0_40px_140px_rgba(0,0,0,0.6)] overflow-hidden">
              <div className="p-8 border-b border-white/8 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.12),transparent_55%)]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500 font-black">
                      {isEdit ? 'Edit mode' : 'Quick setup'}
                    </p>
                    <h2 className="mt-2 text-2xl font-black tracking-tight text-white">
                      {isEdit ? 'Update your focus areas' : 'Shape the first directive'}
                    </h2>
                  </div>
                  <div className="w-12 h-12 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 flex items-center justify-center text-cyan-300">
                    <Sparkles className="w-5 h-5" />
                  </div>
                </div>
              </div>

              <div className="p-8">
                <div className="grid grid-cols-2 gap-3">
                  {BUCKETS.map((label) => {
                    const active = selected.has(label);
                    return (
                      <button
                        key={label}
                        onClick={() => toggle(label)}
                        className={`rounded-2xl py-3.5 px-4 text-sm font-medium transition-all border text-left ${
                          active
                            ? 'bg-cyan-500/15 border-cyan-400/45 text-cyan-200 shadow-[0_0_30px_rgba(34,211,238,0.12)]'
                            : 'bg-white/[0.03] border-white/10 text-zinc-400 hover:border-white/20 hover:bg-white/[0.05]'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-5">
                  <label className="block text-[11px] uppercase tracking-[0.22em] text-zinc-500 font-black mb-2">
                    Optional goal
                  </label>
                  <input
                    type="text"
                    value={freeText}
                    onChange={(e) => setFreeText(e.target.value)}
                    placeholder="e.g. land the MAS3 role at HCA"
                    className="w-full bg-black/30 border border-white/10 rounded-2xl py-3.5 px-4 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-400/40"
                  />
                </div>

                <div className="mt-6 flex gap-3">
                  <button
                    onClick={() => submit(false)}
                    disabled={saving}
                    className="flex-1 bg-white text-black hover:bg-zinc-200 py-3.5 rounded-2xl font-black uppercase tracking-[0.16em] text-xs transition-all disabled:opacity-50 inline-flex items-center justify-center gap-2"
                  >
                    {saving ? 'Saving…' : 'Continue'}
                    {!saving && <ArrowRight className="w-4 h-4" />}
                  </button>
                  {!isEdit && (
                    <button
                      onClick={() => submit(true)}
                      disabled={saving}
                      className="flex-1 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-zinc-300 py-3.5 rounded-2xl font-medium text-sm transition-colors disabled:opacity-50"
                    >
                      Skip for now
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
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

function AmbientBackdrop() {
  return (
    <>
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808010_1px,transparent_1px),linear-gradient(to_bottom,#80808010_1px,transparent_1px)] bg-[size:44px_44px] opacity-60" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.08),transparent_24%),linear-gradient(180deg,#07070c_0%,#090912_50%,#050508_100%)]" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[70rem] h-[26rem] bg-cyan-500/10 blur-[140px] rounded-full" />
    </>
  );
}
