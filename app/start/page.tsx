'use client';

import { signIn } from 'next-auth/react';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Lock } from 'lucide-react';
import { NavAuthMinimal } from '@/components/nav/NavPublic';
import {
  clearPendingCheckoutPlan,
  writePendingCheckoutPlan,
} from '@/lib/billing/pending-checkout';
const SIGN_IN_TIMEOUT_MS = 7000;

function OAuthButton({
  label,
  provider,
  loadingProvider,
  onClick,
  children,
}: {
  label: string;
  provider: 'google' | 'azure-ad';
  loadingProvider: string | null;
  onClick: (provider: 'google' | 'azure-ad') => void;
  children: React.ReactNode;
}) {
  const loading = loadingProvider === provider;
  return (
    <button
      type="button"
      onClick={() => onClick(provider)}
      disabled={Boolean(loadingProvider)}
      className={`inline-flex min-h-[48px] w-full items-center justify-center gap-3 rounded-button px-4 text-xs font-black uppercase tracking-[0.14em] transition-colors disabled:cursor-wait disabled:opacity-60 ${
        provider === 'google'
          ? 'bg-accent text-bg hover:bg-accent-hover'
          : 'bg-panel-raised text-text-primary hover:bg-panel'
      }`}
      aria-label={label}
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        children
      )}
      <span>{label}</span>
    </button>
  );
}

function StartContent() {
  const searchParams = useSearchParams();
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (searchParams?.get('plan') === 'pro') {
      writePendingCheckoutPlan('pro');
    } else {
      clearPendingCheckoutPlan();
    }
  }, [searchParams]);

  const handleSignIn = async (provider: 'google' | 'azure-ad') => {
    setLoadingProvider(provider);
    setError(null);
    const timeout = window.setTimeout(() => {
      setLoadingProvider(null);
      setError('Could not connect. Please try again.');
    }, SIGN_IN_TIMEOUT_MS);

    try {
      await signIn(provider, { callbackUrl: '/dashboard' });
    } catch {
      window.clearTimeout(timeout);
      setLoadingProvider(null);
      setError('Could not connect. Please try again.');
    }
  };

  return (
    <div className="min-h-[100dvh] bg-bg text-text-primary">
      <NavAuthMinimal variant="start" />
      <main id="main" className="mx-auto flex max-w-6xl flex-col px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto w-full max-w-2xl rounded-card border border-border bg-panel px-6 py-8 sm:px-10 sm:py-10">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-accent">Finished work, every morning</p>
          <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl">Get started with Foldera</h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-text-secondary">
            One secure sign-in. Foldera reads your connected context and prepares one finished move worth approving.
          </p>

          {error && (
            <div role="alert" className="mt-6 rounded-card border border-border-strong bg-panel-raised px-4 py-3 text-sm text-text-secondary">
              {error}
            </div>
          )}

          <div className="mt-7 space-y-3">
            <OAuthButton
              label="Continue with Google"
              provider="google"
              loadingProvider={loadingProvider}
              onClick={handleSignIn}
            >
              <GoogleIcon />
            </OAuthButton>
            <OAuthButton
              label="Continue with Microsoft"
              provider="azure-ad"
              loadingProvider={loadingProvider}
              onClick={handleSignIn}
            >
              <MicrosoftIcon />
            </OAuthButton>
          </div>

          <div className="mt-8 border-y border-border-subtle py-6">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-text-secondary">What happens next</p>
            <ol className="mt-4 space-y-3 text-sm text-text-secondary">
              <li>1. Connect Google or Microsoft.</li>
              <li>2. Choose your focus during setup.</li>
              <li>3. Your first read arrives tomorrow morning.</li>
            </ol>
          </div>

          <p className="mt-6 inline-flex items-center gap-2 text-xs text-text-muted">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            Your data stays encrypted. Delete anytime.
          </p>
        </div>
      </main>
    </div>
  );
}

export default function StartPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] bg-bg text-text-primary">
          <NavAuthMinimal variant="start" />
          <main id="main" className="mx-auto flex max-w-6xl items-center justify-center px-4 py-16 sm:px-6">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </main>
        </div>
      }
    >
      <StartContent />
    </Suspense>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}
