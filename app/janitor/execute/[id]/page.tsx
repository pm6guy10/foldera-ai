import dynamic from 'next/dynamic';
import { notFound } from 'next/navigation';

// This tells Next.js: "Do NOT try to render this on the server. Wait for the browser."
const JanitorExecuteClient = dynamic(
  () => import('./JanitorExecuteClient'),
  { ssr: false }
);

interface PageProps {
  params: {
    id: string;
  };
}

export default function JanitorExecutePage({ params }: PageProps) {
  const { id } = params;

  if (!id) {
    notFound();
  }

  return <JanitorExecuteClient actionId={id} />;
}
