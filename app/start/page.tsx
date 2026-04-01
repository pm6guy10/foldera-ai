'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { Lock, Layers } from 'lucide-react';

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
    <div className="min-h-[100dvh] bg-[#07070c] text-white flex flex-col antialiased overflow-hidden selection:bg-cyan-500/30 selection:text-white">
      {/* Ambient background glow */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-[radial-gradient(circle_at_50%_50%,rgba(6,182,212,0.10)_0%,transparent_60%)]" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 w-full px-6 py-5 flex items-center justify-between max-w-6xl mx-auto border-b border-white/5">
        <a href="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-xl bg-white text-black flex items-center justify-center group-hover:scale-105 transition-transform shadow-[0_0_24px_rgba(255,255,255,0.2)]">
            <Layers className="w-4 h-4 fill-black" aria-hidden="true" />
          </div>
          <span className="text-lg font-black tracking-tighter text-white uppercase">Foldera</span>
        </a>
        <a
          href="/login"
          className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500 hover:text-white transition-colors"
        >
          Sign in
        </a>
      </nav>

      {/* Main */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-6 pb-16">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-3">Finished work, every morning.</p>
            <h1 className="text-4xl font-black tracking-tighter text-white">Connect your email.</h1>
          </div>

          {error && (
            <div className="mb-5 px-4 py-3 rounded-xl bg-red-950/60 border border-red-800/50">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          <div className="space-y-3 mb-6">
            <button
              onClick={() => handleSignIn('google')}
              disabled={!!loading}
              className="w-full flex items-center justify-center gap-3 bg-white text-black hover:bg-zinc-200 font-black uppercase tracking-[0.1em] text-xs py-4 px-6 rounded-2xl transition-all shadow-[0_0_40px_rgba(255,255,255,0.15)] hover:scale-[1.02] active:scale-95 disabled:opacity-60 disabled:scale-100 disabled:cursor-wait"
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
              onClick={() => handleSignIn('azure-ad')}
              disabled={!!loading}
              className="w-full flex items-center justify-center gap-3 bg-[#00a4ef] text-white hover:bg-[#0090d6] font-black uppercase tracking-[0.1em] text-xs py-4 px-6 rounded-2xl transition-all shadow-[0_0_20px_rgba(0,164,239,0.22)] hover:scale-[1.02] active:scale-95 disabled:opacity-60 disabled:cursor-wait"
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

          {/* What to expect */}
          <div className="rounded-2xl bg-zinc-950/80 border border-white/10 backdrop-blur-xl p-4 mb-5 space-y-2.5">
            {[
              { n: '01', text: 'Connect — Link your email in one click' },
              { n: '02', text: 'Focus — Tell us what you\u2019re working on' },
              { n: '03', text: 'Sleep — Your first read arrives tomorrow at 7am' },
              { n: '04', text: 'Improve — Every approve and skip makes it smarter' },
            ].map(({ n, text }) => (
              <div key={n} className="flex items-start gap-3">
                <span className="text-[10px] text-cyan-400 w-5 shrink-0 font-black uppercase mt-0.5">{n}</span>
                <span className="text-xs text-zinc-400 leading-relaxed">{text}</span>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-center gap-1.5">
            <Lock className="w-3 h-3 text-zinc-600" />
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-700">Your data is encrypted. Delete anytime.</p>
          </div>
        </div>
      </main>
    </div>
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
