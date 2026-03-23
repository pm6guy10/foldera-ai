'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, CheckCircle2, Lock } from 'lucide-react';

function getErrorMessage(error: string | null): string | null {
  if (!error) return null;
  switch (error) {
    case 'OAuthCallback':
    case 'Callback':
      return 'Sign-in failed. Try that again.';
    case 'OAuthAccountNotLinked':
      return 'That email is already linked to another sign-in method.';
    case 'AccessDenied':
      return 'Access was denied. Try a different account or contact support.';
    default:
      return 'Something went wrong during sign-in.';
  }
}

function LoginInner() {
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const errorMessage = getErrorMessage(searchParams.get('error'));

  async function handleSignIn(provider: 'google' | 'azure-ad') {
    setLoadingProvider(provider);
    const callbackUrl = searchParams.get('callbackUrl') ?? '/dashboard';
    await signIn(provider, { callbackUrl });
  }

  return (
    <main className="min-h-screen bg-[#07080d] px-6 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-xl font-black tracking-tight">
            Foldera
          </Link>
          <div className="flex items-center gap-5 text-sm text-zinc-400">
            <Link href="/pricing" className="hidden hover:text-white sm:inline-flex">
              Pricing
            </Link>
            <Link href="/start" className="hover:text-white">
              Get started
            </Link>
          </div>
        </div>

        <div className="mt-14 grid gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
          <section className="max-w-xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-300">
              Welcome back
            </p>
            <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
              Pick up where your morning read left off.
            </h1>
            <p className="mt-5 text-lg leading-8 text-zinc-300">
              Foldera is built around one decision point. Sign in to review today&apos;s prepared move, adjust your connections, or update what the system should bias toward.
            </p>

            <div className="mt-8 space-y-4">
              {[
                'One directive each morning',
                'Approve or skip in one tap',
                'Nothing sends without your approval',
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
              <h2 className="text-2xl font-semibold tracking-tight text-white">Sign in</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Use the same Google or Microsoft account you connected when you started your trial.
              </p>

              {errorMessage && (
                <div className="mt-5 rounded-2xl border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
                  {errorMessage}
                </div>
              )}

              <div className="mt-6 space-y-3">
                <button
                  onClick={() => handleSignIn('google')}
                  disabled={!!loadingProvider}
                  className="flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-5 py-4 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingProvider === 'google' ? <Spinner dark /> : <GoogleIcon />}
                  {loadingProvider === 'google' ? 'Signing in with Google…' : 'Continue with Google'}
                </button>

                <button
                  onClick={() => handleSignIn('azure-ad')}
                  disabled={!!loadingProvider}
                  className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[#0a84ff] px-5 py-4 text-sm font-semibold text-white transition hover:bg-[#0075f2] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingProvider === 'azure-ad' ? <Spinner /> : <MicrosoftIcon />}
                  {loadingProvider === 'azure-ad' ? 'Signing in with Microsoft…' : 'Continue with Microsoft'}
                </button>
              </div>

              <div className="mt-6 flex items-center gap-2 text-sm text-zinc-500">
                <Lock className="h-4 w-4" />
                Your connections stay encrypted at rest.
              </div>
            </div>

            <div className="mt-5 rounded-[1.5rem] border border-cyan-400/20 bg-gradient-to-b from-cyan-400/10 to-white/[0.02] p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-300">
                New here?
              </p>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                Start with a free trial, connect your account, and set what you care about. Foldera takes it from there.
              </p>
              <Link
                href="/start"
                className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-white transition hover:text-cyan-200"
              >
                Start free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}

function Spinner({ dark = false }: { dark?: boolean }) {
  return (
    <span className={`h-5 w-5 rounded-full border-2 ${dark ? 'border-zinc-400 border-t-zinc-900' : 'border-white/40 border-t-white'} animate-spin`} />
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
