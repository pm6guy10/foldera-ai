'use client';

import { signIn } from 'next-auth/react';
import { useState, Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Lock } from 'lucide-react';
import { NavAuthMinimal } from '@/components/nav/NavPublic';

const PENDING_CHECKOUT_KEY = 'foldera_pending_checkout';

function StartContent() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (searchParams.get('plan') === 'pro') {
      sessionStorage.setItem(PENDING_CHECKOUT_KEY, 'pro');
    } else {
      sessionStorage.removeItem(PENDING_CHECKOUT_KEY);
    }
  }, [searchParams]);

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
    <div className="min-h-[100dvh] bg-[#07070c] text-white flex flex-col antialiased overflow-x-hidden selection:bg-cyan-500/30 selection:text-white pb-[env(safe-area-inset-bottom,0px)]">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-[radial-gradient(circle_at_50%_50%,rgba(6,182,212,0.10)_0%,transparent_60%)]" />
      </div>

      <NavAuthMinimal variant="start" />

      <main id="main" className="relative z-10 flex-1 flex flex-col justify-center py-10 sm:py-12 px-4 sm:px-6 pb-20 sm:pb-16 w-full min-w-0">
        <div className="w-full max-w-md mx-auto">
          <div className="text-center mb-8 sm:mb-10 px-1">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-3">Finished work, every morning.</p>
            <h1 className="text-3xl sm:text-5xl font-black tracking-tighter text-white leading-tight">Get started with Foldera</h1>
            <p className="mt-4 text-zinc-400 text-base leading-relaxed max-w-sm mx-auto">One secure sign-in. Then Foldera goes to work.</p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-5 px-4 py-3.5 rounded-xl bg-red-950/70 border border-red-500/40 border-l-4 border-l-red-400"
            >
              <p className="text-sm text-red-200 font-medium">{error}</p>
            </div>
          )}

          <div className="space-y-3 mb-6">
            <button
              type="button"
              onClick={() => handleSignIn('google')}
              disabled={!!loading}
              className="w-full min-h-[56px] flex items-center justify-center gap-3 bg-white text-black hover:bg-zinc-200 font-black uppercase tracking-[0.1em] text-xs py-4 px-6 rounded-2xl transition-all duration-150 shadow-[0_0_40px_rgba(255,255,255,0.15)] hover:scale-[1.02] active:scale-95 disabled:opacity-60 disabled:scale-100 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070c]"
            >
              {loading === 'google' ? (
                <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ) : (
                <>
                  <GoogleIcon />
                  Continue with Google
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleSignIn('azure-ad')}
              disabled={!!loading}
              className="w-full min-h-[56px] flex items-center justify-center gap-3 bg-[#00a4ef] text-white hover:bg-[#0090d6] font-black uppercase tracking-[0.1em] text-xs py-4 px-6 rounded-2xl transition-all duration-150 shadow-[0_0_20px_rgba(0,164,239,0.22)] hover:scale-[1.02] active:scale-95 disabled:opacity-60 disabled:scale-100 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070c]"
            >
              {loading === 'azure-ad' ? (
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <MicrosoftIcon />
                  Continue with Microsoft
                </>
              )}
            </button>
          </div>

          <div className="rounded-2xl bg-zinc-950/80 border border-white/10 backdrop-blur-xl p-5 mb-5 space-y-4">
            {[
              { n: '01', text: 'Sign in — one tap with Google or Microsoft' },
              { n: '02', text: 'Focus — tell us what you\u2019re working on' },
              { n: '03', text: 'Rest — your first read arrives tomorrow morning' },
              { n: '04', text: 'Improve — every approve and skip trains the model' },
            ].map(({ n, text }) => (
              <div key={n} className="flex items-start gap-4 min-w-0">
                <span className="text-[11px] text-cyan-400 w-8 shrink-0 font-black tabular-nums pt-0.5">{n}</span>
                <span className="text-xs sm:text-sm text-zinc-400 leading-relaxed font-medium min-w-0">{text}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center gap-1.5">
            <Lock className="w-3 h-3 text-zinc-600" />
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-700">Your data is encrypted. Delete anytime.</p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function StartPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] bg-[#07070c] text-white flex items-center justify-center">
          <span className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
        </div>
      }
    >
      <StartContent />
    </Suspense>
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
