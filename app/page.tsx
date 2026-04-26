import type { Metadata } from 'next';
import { LandingPage } from '@/components/foldera/LandingPage';

export const metadata: Metadata = {
  alternates: {
    canonical: '/',
  },
};

export default function HomePage() {
  return <LandingPage />;
}
