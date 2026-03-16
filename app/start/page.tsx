'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { Layers } from 'lucide-react';

export default function StartPage() {
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);

  async function handleOAuth(provider: 'google' | 'azure-ad') {
    setLoadingProvider(provider);
    await signIn(provider, { callbackUrl: '/start/processing' });
  }

  return (
    <main className="min-h-[100dvh] bg-[#000] text-white flex flex-col items-center justify-center px-6 antialiased" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="max-w-lg w-full text-center">
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-2xl bg-white text-black flex items-center justify-center shadow-[0_0_30px_rgba(255,255,255,0.2)]">
            <Layers className="w-5 h-5 fill-black" aria-hidden="true" />
          </div>
          <span className="text-xl font-black tracking-tighter text-white uppercase">Foldera</span>
        </div>

        <h1 className="text-4xl sm:text-5xl font-black tracking-tighter leading-tight mb-5">
          Finished work,<br />
          every morning.
        </h1>

        <p className="text-zinc-400 text-lg leading-relaxed mb-10 font-medium">
          Connect your history.<br />
          Foldera drafts the work before you wake up.
        </p>

        <div className="space-y-3 mb-6">
          <button
            onClick={() => handleOAuth('google')}
            disabled={!!loadingProvider}
            className="w-full max-w-sm mx-auto flex items-center justify-center gap-3 bg-white text-zinc-900 hover:bg-zinc-100 font-semibold py-4 px-8 rounded-2xl transition-all shadow-lg disabled:opacity-60"
          >
            {loadingProvider === 'google' ? <LoadingSpinner /> : (
              <>
                <GoogleIcon />
                Connect with Google
              </>
            )}
          </button>

          <button
            onClick={() => handleOAuth('azure-ad')}
            disabled={!!loadingProvider}
            className="w-full max-w-sm mx-auto flex items-center justify-center gap-3 bg-[#00a4ef] text-white hover:bg-[#0078d4] font-semibold py-4 px-8 rounded-2xl transition-all shadow-lg disabled:opacity-60"
          >
            {loadingProvider === 'azure-ad' ? <LoadingSpinner /> : (
              <>
                <MicrosoftIcon />
                Connect with Microsoft
              </>
            )}
          </button>
        </div>

        <p className="text-zinc-500 text-sm leading-relaxed">
          We read your last 30 days of sent email.<br />
          Nothing is stored permanently until you subscribe.
        </p>
      </div>
    </main>
  );
}

function LoadingSpinner() {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="w-5 h-5 border-2 border-current/40 border-t-current rounded-full animate-spin" />
      Connecting...
    </span>
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
