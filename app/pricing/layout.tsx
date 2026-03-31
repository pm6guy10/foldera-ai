import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing — Foldera',
  description: 'Free forever for the daily read. $29/mo unlocks the finished work — drafted emails and documents ready to approve.',
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
