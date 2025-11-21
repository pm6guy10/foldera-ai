import dynamic from 'next/dynamic';

// This tells Next.js: "Do NOT try to render this on the server. Wait for the browser."
const SettingsClient = dynamic(
  () => import('./SettingsClient'),
  { ssr: false }
);

export default function SettingsPage() {
  return <SettingsClient />;
}
