'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Layers, ArrowRight } from 'lucide-react';

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
    <div className="min-h-[100dvh] bg-[#07070c] text-white flex flex-col antialiased" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Nav */}
      <nav className="w-full px-6 py-6 flex items-center justify-between max-w-6xl mx-auto">
        <a href="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-2xl bg-white text-black flex items-center justify-center group-hover:scale-105 transition-transform shadow-[0_0_30px_rgba(255,255,255,0.2)]">
            <Layers className="w-5 h-5 fill-black" aria-hidden="true" />
          </div>
          <span className="text-xl font-black tracking-tighter text-white uppercase">Foldera</span>
        </a>
        <a
          href="/start"
          className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500 hover:text-white transition-colors"
        >
          Get started
        </a>
      </nav>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          <div className="text-center mb-12">
            <h1 className="text-5xl font-black tracking-tighter text-white mb-4">Sign in.</h1>
            <p className="text-zinc-400 text-lg font-medium leading-relaxed">
              Finished work, every morning.
            </p>
          </div>

          {errorMessage && (
            <div className="mb-6 px-4 py-3 rounded-xl bg-red-950/60 border border-red-800/50">
              <p className="text-sm text-red-300">{errorMessage}</p>
            </div>
          )}

          <div className="space-y-3 mb-8">
            <button
              onClick={() => handleSignIn('google')}
              disabled={!!loadingProvider}
              className="w-full flex items-center justify-center gap-3 bg-white text-zinc-900 hover:bg-zinc-100 font-semibold py-4 px-6 rounded-2xl transition-all shadow-lg disabled:opacity-60 text-sm"
            >
              {loadingProvider === 'google' ? (
                <span className="w-5 h-5 border-2 border-zinc-400 border-t-zinc-900 rounded-full animate-spin" />
              ) : (
                <>
                  <GoogleIcon />
                  Continue with Google
                </>
              )}
            </button>

            <button
              onClick={() => handleSignIn('azure-ad')}
              disabled={!!loadingProvider}
              className="w-full flex items-center justify-center gap-3 bg-[#00a4ef] text-white hover:bg-[#0078d4] font-semibold py-4 px-6 rounded-2xl transition-all shadow-lg disabled:opacity-60 text-sm"
            >
              {loadingProvider === 'azure-ad' ? (
                <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <MicrosoftIcon />
                  Continue with Microsoft
                </>
              )}
            </button>
          </div>

          <p className="text-zinc-600 text-xs text-center leading-relaxed">
            New here?{' '}
            <a href="/start" className="text-zinc-400 hover:text-white transition-colors inline-flex items-center gap-1">
              Start your free trial
              <ArrowRight className="w-3 h-3" />
            </a>
          </p>
          <p className="text-zinc-700 text-xs text-center mt-2">
            No credit card required
          </p>
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
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
