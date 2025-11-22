import dynamic from 'next/dynamic';

// This tells Next.js: "Do NOT try to render this on the server. Wait for the browser."
const BriefingClient = dynamic(
  () => import('./BriefingClient'),
  { ssr: false }
);

export default function BriefingPage() {
  return <BriefingClient />;
}

