'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';

export default function StartPage() {
  const [loading, setLoading] = useState(false);

  async function handleConnect() {
    setLoading(true);
    await signIn('google', { callbackUrl: '/start/processing' });
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center px-6">
      <div className="max-w-lg w-full text-center">
        <p className="text-cyan-400 text-sm font-medium tracking-widest uppercase mb-8">
          Foldera
        </p>

        <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-5">
          Connect your history.<br />
          Get your first read<br />
          in 60 seconds.
        </h1>

        <p className="text-slate-400 text-lg leading-relaxed mb-12">
          Your patterns are already in your email.<br />
          We just make them visible.
        </p>

        <button
          onClick={handleConnect}
          disabled={loading}
          className="w-full max-w-sm mx-auto flex items-center justify-center gap-3 bg-white text-slate-900 hover:bg-slate-100 font-semibold py-4 px-8 rounded-xl text-lg transition-all shadow-lg disabled:opacity-60"
        >
          {loading ? (
            <>
              <span className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <GoogleIcon />
              Connect with Google
            </>
          )}
        </button>

        <p className="text-slate-500 text-sm mt-6 leading-relaxed">
          We read your last 30 days of sent email.<br />
          Nothing is stored permanently until you subscribe.
        </p>
      </div>
    </main>
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
