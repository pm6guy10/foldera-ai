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
    'Foldera reconnects the message, meeting, draft, file, and blocker, then hands back the ready next move.',
};

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  return <LandingPage isAuthenticated={Boolean(session?.user?.id)} />;
}
