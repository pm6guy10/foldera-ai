'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, Layers, Sparkles } from 'lucide-react';

function getErrorMessage(error: string | null): string | null {
  if (!error) return null;
  switch (error) {
    case 'OAuthCallback':
    case 'Callback':
      return 'Sign-in failed. Please try again.';
    case 'OAuthAccountNotLinked':
      return 'This email is already linked to another provider.';
    case 'AccessDenied':
      return 'Access denied. Please contact support.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

function LoginInner() {
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const errorParam = searchParams.get('error');
  const errorMessage = getErrorMessage(errorParam);

  async function handleSignIn(provider: 'google' | 'azure-ad') {
    setLoadingProvider(provider);
    const cb = searchParams.get('callbackUrl') ?? '/dashboard';
    await signIn(provider, { callbackUrl: cb });
  }

  return (
    <div className="min-h-[100dvh] bg-[#07070c] text-white relative overflow-hidden">
      <AmbientBackdrop />

      <nav className="relative z-10 w-full px-6 py-6 flex items-center justify-between max-w-6xl mx-auto">
        <a href="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-2xl bg-white text-black flex items-center justify-center group-hover:scale-105 transition-transform shadow-[0_0_30px_rgba(255,255,255,0.2)]">
            <Layers className="w-5 h-5 fill-black" aria-hidden="true" />
          </div>
          <span className="text-xl font-black tracking-[0.18em] text-white uppercase">Foldera</span>
        </a>
        <a
          href="/start"
          className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500 hover:text-white transition-colors"
        >
          Get started
        </a>
      </nav>

      <main className="relative z-10 flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-5xl grid lg:grid-cols-[1fr_430px] gap-10 items-center">
          <section className="max-w-xl hidden lg:block">
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 text-cyan-300 text-[11px] font-black uppercase tracking-[0.18em] mb-6">
              Welcome back
            </div>
            <h1 className="text-5xl xl:text-6xl font-black tracking-tight leading-[1.02] text-white">
              The morning directive stays simple.
            </h1>
            <p className="mt-5 text-lg text-zinc-400 leading-relaxed">
              Foldera is not another inbox, planner, or AI chat tab. It reads the background noise, chooses the thread that matters, and hands you one finished next move.
            </p>
            <div className="mt-8 grid gap-4">
              {[
                'One directive per morning.',
                'One artifact already drafted.',
                'Approve or skip. Then move on.',
              ].map((text) => (
                <div key={text} className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-zinc-300">
                  {text}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] backdrop-blur-2xl shadow-[0_40px_140px_rgba(0,0,0,0.6)] overflow-hidden">
            <div className="p-8 border-b border-white/8 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.12),transparent_55%)] text-center">
              <div className="w-14 h-14 rounded-2xl mx-auto bg-white/10 border border-white/10 flex items-center justify-center mb-5 text-cyan-300">
                <Sparkles className="w-6 h-6" />
              </div>
              <h2 className="text-4xl font-black tracking-tight text-white">Sign in.</h2>
              <p className="text-zinc-400 text-base mt-3 leading-relaxed">
                Pick your provider and return to the same overnight loop.
              </p>
            </div>

            <div className="p-8">
              {errorMessage && (
                <div className="mb-6 px-4 py-3 rounded-2xl bg-red-950/50 border border-red-800/50 text-sm text-red-300">
                  {errorMessage}
                </div>
              )}

              <div className="space-y-3 mb-6">
                <ProviderButton
                  title="Continue with Google"
                  subtitle="Gmail, Calendar, Drive"
                  loading={loadingProvider === 'google'}
                  disabled={!!loadingProvider}
                  onClick={() => handleSignIn('google')}
                  icon={<GoogleIcon />}
                />

                <ProviderButton
                  title="Continue with Microsoft"
                  subtitle="Outlook, Calendar, OneDrive"
                  loading={loadingProvider === 'azure-ad'}
                  disabled={!!loadingProvider}
                  onClick={() => handleSignIn('azure-ad')}
                  icon={<MicrosoftIcon />}
                />
              </div>

              <p className="text-zinc-600 text-xs text-center leading-relaxed">
                New here?{' '}
                <a href="/start" className="text-zinc-400 hover:text-white transition-colors inline-flex items-center gap-1">
                  Start your free trial
                  <ArrowRight className="w-3 h-3" />
                </a>
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function ProviderButton({
  title,
  subtitle,
  loading,
  disabled,
  onClick,
  icon,
}: {
  title: string;
  subtitle: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] hover:border-cyan-400/30 px-5 py-4 transition-all disabled:opacity-60"
    >
      <div className="flex items-center gap-4">
        <div className="w-11 h-11 rounded-2xl bg-black/40 border border-white/8 flex items-center justify-center">{icon}</div>
        <div className="text-left">
          <p className="text-white font-semibold">{loading ? 'Connecting…' : title}</p>
          <p className="text-sm text-zinc-500">{subtitle}</p>
        </div>
      </div>
      <ArrowRight className="w-4 h-4 text-zinc-500" />
    </button>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}

function AmbientBackdrop() {
  return (
    <>
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808010_1px,transparent_1px),linear-gradient(to_bottom,#80808010_1px,transparent_1px)] bg-[size:44px_44px] opacity-60" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.08),transparent_24%),linear-gradient(180deg,#07070c_0%,#090912_50%,#050508_100%)]" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[70rem] h-[26rem] bg-cyan-500/10 blur-[140px] rounded-full" />
    </>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}
