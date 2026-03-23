'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { ArrowRight, Lock, Sparkles, Shield, MoonStar, CheckCircle2 } from 'lucide-react';

export default function StartPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn(provider: 'google' | 'azure-ad') {
    setLoading(provider);
    setError(null);
    try {
      await signIn(provider, { callbackUrl: '/dashboard' });
    } catch {
      setLoading(null);
      setError('Could not connect. Please try again.');
    }
  }

  return (
    <main className="min-h-screen bg-[#07070c] text-white overflow-hidden relative">
      <AmbientBackdrop />

      <div className="relative z-10 min-h-screen px-6 py-10">
        <div className="max-w-6xl mx-auto min-h-[calc(100vh-5rem)] grid lg:grid-cols-[1.05fr_0.95fr] gap-10 items-center">
          <section className="max-w-xl">
            <a href="/" className="inline-flex items-center gap-3 mb-8 group">
              <div className="w-11 h-11 rounded-2xl bg-white text-black flex items-center justify-center shadow-[0_0_30px_rgba(255,255,255,0.14)] group-hover:scale-105 transition-transform">
                <Sparkles className="w-5 h-5" />
              </div>
              <span className="text-lg font-black tracking-[0.18em] uppercase">Foldera</span>
            </a>

            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 text-cyan-300 text-[11px] font-black uppercase tracking-[0.18em] mb-6">
              Start the overnight loop
            </div>

            <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-[1.02] text-white">
              Connect once.
              <br />
              Wake up to work
              <span className="text-cyan-300"> already prepared.</span>
            </h1>

            <p className="mt-5 text-base md:text-lg text-zinc-400 leading-relaxed max-w-lg">
              Foldera reads your email and calendar, finds the thread that actually matters, and sends one directive tomorrow morning with the draft already done.
            </p>

            <div className="mt-8 grid sm:grid-cols-3 gap-3 text-sm">
              {[
                ['Connect', 'Link Google or Microsoft'],
                ['Sleep', 'Foldera assembles tomorrow\'s read'],
                ['Approve or skip', 'One decision. Then move on.'],
              ].map(([label, desc], i) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500 font-black">0{i + 1}</p>
                  <p className="mt-2 text-white font-semibold">{label}</p>
                  <p className="mt-1 text-zinc-500 text-sm leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="relative">
            <div className="absolute -inset-6 bg-cyan-500/10 blur-[90px] rounded-full" />
            <div className="relative rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] backdrop-blur-2xl shadow-[0_40px_140px_rgba(0,0,0,0.6)] overflow-hidden">
              <div className="p-7 sm:p-8 border-b border-white/8 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.12),transparent_55%)]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500 font-black">Tomorrow at 7am</p>
                    <h2 className="mt-2 text-2xl font-black tracking-tight text-white">Your first read arrives.</h2>
                  </div>
                  <div className="w-12 h-12 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 flex items-center justify-center text-cyan-300">
                    <MoonStar className="w-5 h-5" />
                  </div>
                </div>
                <p className="mt-3 text-zinc-400 leading-relaxed">
                  No prompt. No dashboard babysitting. Just one prepared next move.
                </p>
              </div>

              <div className="p-7 sm:p-8">
                {error && (
                  <div className="mb-5 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                    {error}
                  </div>
                )}

                <div className="space-y-3">
                  <ProviderButton
                    provider="google"
                    loading={loading === 'google'}
                    disabled={!!loading}
                    onClick={() => handleSignIn('google')}
                    title="Continue with Google"
                    subtitle="Gmail, Calendar, Drive"
                    icon={<GoogleIcon />}
                  />

                  <ProviderButton
                    provider="azure-ad"
                    loading={loading === 'azure-ad'}
                    disabled={!!loading}
                    onClick={() => handleSignIn('azure-ad')}
                    title="Continue with Microsoft"
                    subtitle="Outlook, Calendar, OneDrive"
                    icon={<MicrosoftIcon />}
                  />
                </div>

                <div className="mt-6 rounded-2xl border border-white/8 bg-black/30 p-5">
                  <div className="flex items-center gap-2 text-zinc-300 mb-3">
                    <Shield className="w-4 h-4 text-cyan-300" />
                    <p className="text-sm font-semibold">What happens next</p>
                  </div>
                  <div className="space-y-3">
                    {[
                      'You connect one provider.',
                      'You set what matters to you on the next screen.',
                      'Foldera builds tomorrow\'s morning directive.',
                      'Every approve and skip sharpens the next one.',
                    ].map((text) => (
                      <div key={text} className="flex items-start gap-3 text-sm text-zinc-400">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                        <span>{text}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-center gap-2 text-xs text-zinc-600">
                  <Lock className="w-3 h-3" />
                  <span>Your data is encrypted. Delete anytime.</span>
                </div>

                <div className="mt-4 text-center text-xs text-zinc-600">
                  Already connected?{' '}
                  <a href="/login" className="text-zinc-400 hover:text-white transition-colors inline-flex items-center gap-1">
                    Sign in
                    <ArrowRight className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function ProviderButton({
  loading,
  disabled,
  onClick,
  title,
  subtitle,
  icon,
}: {
  provider: 'google' | 'azure-ad';
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-2xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] hover:border-cyan-400/30 transition-all px-5 py-4 text-left disabled:opacity-50"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-black/40 border border-white/8 flex items-center justify-center shrink-0">
            {icon}
          </div>
          <div>
            <p className="text-white font-semibold">{loading ? 'Connecting…' : title}</p>
            <p className="text-sm text-zinc-500 mt-0.5">{subtitle}</p>
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-zinc-500" />
      </div>
    </button>
  );
}

function AmbientBackdrop() {
  return (
    <>
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800f_1px,transparent_1px),linear-gradient(to_bottom,#8080800f_1px,transparent_1px)] bg-[size:44px_44px] opacity-60" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.13),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.08),transparent_28%),linear-gradient(180deg,#07070c_0%,#090912_50%,#050508_100%)]" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[70rem] h-[28rem] bg-cyan-500/10 blur-[140px] rounded-full" />
    </>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 21 21" aria-hidden="true" className="shrink-0">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}
