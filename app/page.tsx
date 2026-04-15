import type { Metadata } from 'next';
import HomePageClient from './HomePageClient';

/**
 * Public marketing route: force dynamic HTML so normal browser tabs re-fetch the document
 * instead of serving an hours-old statically cached shell (distinct from hashed JS/CSS assets).
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  alternates: {
    canonical: '/',
  },
};

export default function HomePage() {
  return <HomePageClient />;
}
