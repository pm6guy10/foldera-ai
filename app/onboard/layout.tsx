import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Foldera — See your patterns',
  description: 'Answer three questions. Get your first directive in 60 seconds.',
};

export default function OnboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
