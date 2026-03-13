import dynamic from 'next/dynamic';

// sessionStorage access — must skip SSR to prevent hydration mismatches
const ProcessingClient = dynamic(() => import('./ProcessingClient'), { ssr: false });

export default function ProcessingPage() {
  return <ProcessingClient />;
}
