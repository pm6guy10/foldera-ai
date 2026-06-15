'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { NavAuthMinimal } from '@/components/nav/NavPublic';
import {
  getAccountChoiceAuthorizationParams,
  type FolderaOAuthProvider,
} from '@/lib/auth/oauth-account-choice';
import { OAuthConnectButton } from '@/components/auth/OAuthConnectButton';
import { AuthTrustPills } from '@/components/auth/AuthTrustPills';

const SIGN_IN_TIMEOUT_MS = 7000;

export function LoginInner({ errorParam, callbackUrl }: { errorParam: string | null; callbackUrl?: string }) {
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const oauthError = errorParam ? 'Sign-in failed. Please try again or use a different account.' : null;
  const errorMessage = actionError ?? oauthError;

  async function handleSignIn(provider: FolderaOAuthProvider) {
    setActionError(null);
    setLoadingProvider(provider);
    const timeout = window.setTimeout(() => {
      setLoadingProvider(null);
      setActionError('Could not connect. Please try again.');
    }, SIGN_IN_TIMEOUT_MS);

    try {
      await signIn(
        provider,
        { callbackUrl: callbackUrl ?? '/dashboard' },
        getAccountChoiceAuthorizationParams(provider),
      );
    } catch {
      window.clearTimeout(timeout);
      setLoadingProvider(null);
      setActionError('Could not connect. Please try again.');
    }
  }

  return (
    <div className="foldera-app-surface min-h-[100dvh] text-text-primary">
      <NavAuthMinimal variant="login" />
      <main id="main" className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-6xl flex-col justify-center px-4 py-10 sm:px-6 sm:py-14">
        <div className="mx-auto w-full max-w-[500px] overflow-hidden rounded-[32px] border border-white/[0.08] bg-[#030711]/60 backdrop-blur-xl px-6 py-10 shadow-[0_24px_90px_rgba(34,211,238,0.06),inset_0_1px_0_rgba(255,255,255,0.05)] sm:px-12 sm:py-12">
          <div className="accent-glow -mx-6 -mt-10 mb-8 sm:-mx-12 sm:-mt-12" />
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-400/80">Finished work when it is safe</p>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white sm:text-4xl">Sign in</h1>
          <p className="mt-3 text-sm leading-relaxed text-white/60">
            Continue with Google or Microsoft to open your dashboard.
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-white/40">
            Using a different account? Sign out first, then your provider will ask you to choose.
          </p>

          {errorMessage && (
            <div role="alert" className="mt-6 rounded-card border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {errorMessage}
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
        </div>
      </main>
    </div>
  );
}


