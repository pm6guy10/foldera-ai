import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { LandingPage } from '@/components/foldera/LandingPage';
import { authOptions } from '@/lib/auth/auth-options';

export const metadata: Metadata = {
  alternates: {
    canonical: '/',
  },
  title: 'Foldera',
  description:
    'Foldera reads connected sources, finds the move that matters, drafts the finished action, shows the source trail, and waits for approval.',
};

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  return <LandingPage isAuthenticated={Boolean(session?.user?.id)} />;
}
