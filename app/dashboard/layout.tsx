import type { Metadata } from 'next';
import { Providers } from '../providers';

export const metadata: Metadata = {
  title: 'Dashboard — Foldera',
  description: 'Your Foldera dashboard. Finished work when it is safe, and the blocker when it is not.',
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Providers>{children}</Providers>;
}

