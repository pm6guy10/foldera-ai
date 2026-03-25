import { LoginInner } from './login-inner';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const { error, callbackUrl } = await searchParams;
  return <LoginInner errorParam={error ?? null} callbackUrl={callbackUrl} />;
}
