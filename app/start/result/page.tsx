import dynamic from 'next/dynamic';

// localStorage + sessionStorage access — must skip SSR to prevent hydration mismatches
const ResultClient = dynamic(() => import('./ResultClient'), { ssr: false });

export default function ResultPage() {
  return <ResultClient />;
}
