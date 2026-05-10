import type { Metadata } from 'next';
import { LandingPage } from '@/components/foldera/LandingPage';

export const metadata: Metadata = {
  alternates: {
    canonical: '/',
  },
  title: 'Foldera',
  description:
    'Foldera reads connected sources, finds the move that matters, drafts the finished action, shows the source trail, and waits for approval.',
};

export default function HomePage() {
  return <LandingPage />;
}
