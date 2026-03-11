import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Foldera — Connect your inbox',
  description: 'Answer three questions. Get your first read in 60 seconds.',
};

export default function OnboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Fonts — rendered from server component, hoisted to <head> by Next.js */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@300;400;500&family=Syne:wght@400;500;600&display=swap"
      />
      {children}
    </>
  );
}
