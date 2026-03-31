import type { Metadata } from 'next';
import { LoginInner } from './login-inner';

export const metadata: Metadata = {
  title: 'Sign in — Foldera',
  description: 'Sign in to Foldera. Finished work, every morning.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const { error, callbackUrl } = await searchParams;
  return <LoginInner errorParam={error ?? null} callbackUrl={callbackUrl} />;
}
