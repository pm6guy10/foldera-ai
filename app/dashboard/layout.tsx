import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard — Foldera',
  description: 'Your Foldera dashboard. Finished work, every morning.',
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

