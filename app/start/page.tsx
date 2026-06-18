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
import {
  getAccountChoiceAuthorizationParams,
  type FolderaOAuthProvider,
} from '@/lib/auth/oauth-account-choice';
import { OAuthConnectButton } from '@/components/auth/OAuthConnectButton';
import { AuthTrustPills } from '@/components/auth/AuthTrustPills';
const SIGN_IN_TIMEOUT_MS = 7000;



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

  const handleSignIn = async (provider: FolderaOAuthProvider) => {
    setLoadingProvider(provider);
    setError(null);
    const timeout = window.setTimeout(() => {
      setLoadingProvider(null);
      setError('Could not connect. Please try again.');
    }, SIGN_IN_TIMEOUT_MS);

    try {
      await signIn(provider, { callbackUrl: '/dashboard' }, getAccountChoiceAuthorizationParams(provider));
    } catch {
      window.clearTimeout(timeout);
      setLoadingProvider(null);
      setError('Could not connect. Please try again.');
    }
  };

  return (
    <div className="foldera-app-surface min-h-[100dvh] text-text-primary">
      <NavAuthMinimal variant="start" />
      <main id="main" className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-6xl flex-col justify-center px-4 py-10 sm:px-6 sm:py-14">
        <div className="mx-auto w-full max-w-[500px] overflow-hidden rounded-[32px] border border-white/[0.08] bg-[#100d0a]/60 backdrop-blur-xl px-6 py-10 shadow-[0_24px_90px_rgba(245,166,35,0.06),inset_0_1px_0_rgba(255,255,255,0.05)] sm:px-12 sm:py-12">
          <div className="accent-glow -mx-6 -mt-10 mb-8 sm:-mx-12 sm:-mt-12" />
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-accent/80">Finished work when it is safe</p>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white sm:text-4xl">Get started with Foldera</h1>
          <p className="mt-3 text-sm leading-relaxed text-white/60">
            One secure sign-in. Foldera reads your connected context and shows finished work or the exact blocker.
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-white/40">
            Using a different account? Sign out first, then your provider will ask you to choose.
          </p>

          {error && (
            <div role="alert" className="mt-6 rounded-card border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="mt-8 space-y-3">
            <OAuthConnectButton
              label="Continue with Google"
              provider="google"
              loadingProvider={loadingProvider}
              onClick={handleSignIn}
            />
            <OAuthConnectButton
              label="Continue with Microsoft"
              provider="azure-ad"
              loadingProvider={loadingProvider}
              onClick={handleSignIn}
            />
          </div>

          <AuthTrustPills />

          <div className="mt-8 border-t border-white/[0.08] pt-6">
            <p className="mt-2 inline-flex items-center gap-2 text-xs text-white/40">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              Your account uses secure source access. Delete anytime.
            </p>
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


