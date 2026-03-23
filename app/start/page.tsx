'use client';

import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { Lock, Mail, Calendar, ArrowRight } from 'lucide-react';
import { useState } from 'react';

const expectationList = [
  'Connect Google or Microsoft.',
  'Tell Foldera what you care about right now.',
  'Your first morning read arrives at 7am Pacific.',
  'Approve or skip. That feedback makes tomorrow better.',
];

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
      setError('Could not start sign-in. Please try again.');
    }
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
            <Link href="/login" className="hover:text-white">
              Sign in
            </Link>
          </div>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_0.95fr] lg:items-center">
          <section className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-300">
              Step 1 of 2
            </p>
            <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
              Connect the account Foldera should read.
            </h1>
            <p className="mt-5 text-lg leading-8 text-zinc-300">
              This is the only heavy lift. After you connect, Foldera reads your inbox and calendar in the background and sends one prepared move each morning.
            </p>
            <p className="mt-3 text-base leading-7 text-zinc-400">
              No credit card required to start. Foldera never sends anything without your approval.
            </p>

            {error && (
              <div className="mt-6 rounded-2xl border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="mt-8 space-y-3 max-w-md">
              <button
                onClick={() => handleSignIn('google')}
                disabled={!!loading}
                className="flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-5 py-4 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading === 'google' ? <Spinner dark /> : <GoogleIcon />}
                {loading === 'google' ? 'Connecting Google…' : 'Continue with Google'}
              </button>

              <button
                onClick={() => handleSignIn('azure-ad')}
                disabled={!!loading}
                className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[#0a84ff] px-5 py-4 text-sm font-semibold text-white transition hover:bg-[#0075f2] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading === 'azure-ad' ? <Spinner /> : <MicrosoftIcon />}
                {loading === 'azure-ad' ? 'Connecting Microsoft…' : 'Continue with Microsoft'}
              </button>
            </div>

            <div className="mt-6 flex items-center gap-2 text-sm text-zinc-500">
              <Lock className="h-4 w-4" />
              Encrypted at rest. Disconnect any time in Settings.
            </div>
          </section>

          <aside className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 shadow-2xl shadow-black/30">
            <div className="rounded-[1.5rem] border border-cyan-400/20 bg-gradient-to-b from-cyan-400/10 to-white/[0.02] p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-300">
                What happens next
              </p>
              <div className="mt-5 space-y-4">
                {expectationList.map((item, index) => (
                  <div key={item} className="flex gap-4 rounded-2xl border border-white/8 bg-zinc-950/70 p-4">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/6 text-xs font-semibold text-white">
                      {index + 1}
                    </div>
                    <p className="text-sm leading-6 text-zinc-300">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 rounded-[1.5rem] border border-white/8 bg-zinc-950/70 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Tomorrow&apos;s read looks like this
              </p>
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-white/6 p-2">
                    <Mail className="h-4 w-4 text-zinc-300" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">Reply to the client today</p>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">
                      Foldera noticed the thread is aging, saw the calendar gap this afternoon, and prepared the email for approval.
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-3 text-xs text-zinc-500">
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" />
                    drafted email
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    timed for today
                  </span>
                </div>
              </div>

              <Link
                href="/login"
                className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-zinc-400 transition hover:text-white"
              >
                Already have an account?
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </main>
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
