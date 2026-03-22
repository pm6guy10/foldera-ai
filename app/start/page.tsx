'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { Lock } from 'lucide-react';

export default function StartPage() {
  const [loading, setLoading] = useState<string | null>(null);

  async function handleSignIn(provider: 'google' | 'azure-ad') {
    setLoading(provider);
    await signIn(provider, { callbackUrl: '/dashboard' });
  }

  return (
    <main className="min-h-screen bg-zinc-950 flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <p className="text-2xl font-bold text-white mb-8">Foldera</p>

        {/* Heading */}
        <h1 className="text-3xl font-bold text-white">Connect your email.</h1>
        <p className="text-zinc-400 mt-2">Your first read arrives tomorrow at 7am.</p>

        {/* OAuth buttons */}
        <div className="mt-8 space-y-3">
          <button
            onClick={() => handleSignIn('google')}
            disabled={!!loading}
            className="w-full flex items-center gap-3 bg-zinc-900 border border-zinc-800 text-white py-3 px-4 rounded-2xl hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            <GoogleIcon />
            {loading === 'google' ? 'Connecting…' : 'Continue with Google'}
          </button>

          <button
            onClick={() => handleSignIn('azure-ad')}
            disabled={!!loading}
            className="w-full flex items-center gap-3 bg-zinc-900 border border-zinc-800 text-white py-3 px-4 rounded-2xl hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            <MicrosoftIcon />
            {loading === 'azure-ad' ? 'Connecting…' : 'Continue with Microsoft'}
          </button>
        </div>

        {/* What to expect */}
        <div className="mt-10 space-y-3">
          {[
            'Day 1 — We scan your last 90 days of email',
            'Day 3 — Patterns start emerging',
            'Day 7 — Your reads get specific',
            'Day 30 — The engine knows you',
          ].map((text, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="text-sm text-zinc-500 w-4 shrink-0">{i + 1}</span>
              <span className="text-sm text-zinc-500">{text}</span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-8 flex items-center justify-center gap-1.5">
          <Lock className="w-3 h-3 text-zinc-600" />
          <p className="text-xs text-zinc-600">Your data is encrypted. Delete anytime.</p>
        </div>
      </div>
    </main>
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
